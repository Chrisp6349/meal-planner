// -----------------------------------------------------------------------
// recipe-import.js
// Fetches a recipe page server-side and pulls the title/ingredients/
// method out of its schema.org Recipe structured data — the same
// JSON-LD block most recipe sites (BBC Good Food included) already embed
// so Google can show a recipe card in search results. This is a general
// schema.org Recipe parser, not scraping any one site's page layout, so
// it keeps working even if a site's visual design changes.
//
// Runs server-side (not in the browser) for two reasons: recipe sites
// don't send CORS headers that would let browser JS fetch their HTML
// directly, and fetching an arbitrary URL from a Cloud Function needs
// its own guardrails against SSRF (a request crafted to make this
// function fetch an internal/cloud-metadata address instead of a real
// recipe page) — see assertPublicHost() below.
// -----------------------------------------------------------------------

const dns = require("dns").promises;
const net = require("net");

const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 5 * 1024 * 1024; // a recipe page's HTML is a few hundred KB at most
const MAX_REDIRECTS = 5;

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  const inRange = (base, bits) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("100.64.0.0", 10) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) || // includes the cloud metadata endpoint
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("198.18.0.0", 15) ||
    inRange("224.0.0.0", 4)
  );
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

async function assertPublicHost(hostname) {
  const ipVersion = net.isIP(hostname);
  if (ipVersion) {
    const bad = ipVersion === 4 ? isPrivateIPv4(hostname) : isPrivateIPv6(hostname);
    if (bad) throw new Error("That address can't be fetched.");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true });
  for (const { address, family } of addresses) {
    const bad = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (bad) throw new Error("That address can't be fetched.");
  }
}

async function fetchHtmlSafely(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http/https links are supported.");
    }
    // Re-checked on every hop, not just the first URL — otherwise a
    // redirect is a straightforward way around the guard above.
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MealPlannerRecipeImport/1.0)" }
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`The page returned an error (${res.status}).`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) {
      throw new Error("That doesn't look like a web page.");
    }
    return readBodyCapped(res);
  }
  throw new Error("Too many redirects.");
}

async function readBodyCapped(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BYTES) break;
    html += decoder.decode(value, { stream: true });
  }
  return html;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // Some pages emit near-JSON (trailing commas, entities). This is a
      // best-effort import, not worth a recovery parser — just skip it.
    }
  }
  return blocks;
}

function flattenNodes(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenNodes(n, out));
    return;
  }
  if (typeof node !== "object") return;
  if (node["@graph"]) flattenNodes(node["@graph"], out);
  out.push(node);
}

function findRecipeNode(blocks) {
  const nodes = [];
  blocks.forEach((b) => flattenNodes(b, nodes));
  return (
    nodes.find((n) => {
      const type = n["@type"];
      if (!type) return false;
      return Array.isArray(type) ? type.includes("Recipe") : type === "Recipe";
    }) || null
  );
}

function textOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.text) return textOf(value.text);
  return "";
}

// recipeInstructions shows up as a plain string, an array of strings, an
// array of HowToStep objects ({ text: "..." }), or HowToSection objects
// (a heading plus its own itemListElement of steps) — sometimes mixed.
function flattenInstructions(value, out) {
  if (!value) return;
  if (typeof value === "string") {
    value.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => flattenInstructions(v, out));
    return;
  }
  if (typeof value === "object") {
    if (value["@type"] === "HowToSection" && value.itemListElement) {
      flattenInstructions(value.itemListElement, out);
      return;
    }
    const text = textOf(value);
    if (text) out.push(text);
  }
}

function extractIngredients(node) {
  const raw = node.recipeIngredient || node.ingredients || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((i) => textOf(i).trim()).filter(Boolean);
}

function extractInstructions(node) {
  const out = [];
  flattenInstructions(node.recipeInstructions, out);
  return out;
}

function buildBody(ingredients, instructions) {
  const parts = [];
  if (ingredients.length) {
    parts.push("Ingredients:");
    ingredients.forEach((i) => parts.push(`- ${i}`));
  }
  if (instructions.length) {
    if (parts.length) parts.push("");
    parts.push("Method:");
    instructions.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  }
  return parts.join("\n");
}

async function importRecipeFromUrl(url) {
  const html = await fetchHtmlSafely(url);
  const node = findRecipeNode(extractJsonLdBlocks(html));
  if (!node) {
    throw new Error("Couldn't find a recipe on that page — try pasting it in manually instead.");
  }

  const title = textOf(node.name) || textOf(node.headline) || "Imported recipe";
  const ingredients = extractIngredients(node);
  const instructions = extractInstructions(node);
  const body = buildBody(ingredients, instructions);

  if (!body.trim()) {
    throw new Error("Found a recipe on that page but couldn't read its ingredients or method — try pasting it in manually instead.");
  }

  return { title, body };
}

module.exports = { importRecipeFromUrl };
