// -----------------------------------------------------------------------
// nav.js
// Renders the shared nav into #navRoot on every signed-in page: a
// compact top bar (brand + who's signed in + sign out) plus the actual
// section links. On phones the links become a fixed bottom tab bar
// (thumb-reachable); on wider screens they show inline in the top bar
// instead — see .topnav .nav-links / .bottom-nav in meals.css.
// -----------------------------------------------------------------------

import { logout, hardResetAndReload } from "./household.js";
import { pushAvailability, notificationPermission, enablePush } from "./push.js";

const ICONS = {
  planner: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  shopping: `<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2l2.3 12.1a2 2 0 002 1.6h8.5a2 2 0 001.95-1.57L21 8H6.2"/>`,
  recipes: `<path d="M4 5.2A2.2 2.2 0 016.2 3H20v15H6.2A2.2 2.2 0 004 15.8V5.2z"/><path d="M4 15.8A2.2 2.2 0 016.2 13.6H20"/>`,
  history: `<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 1.9"/>`,
  bell: `<path d="M12 3a5 5 0 00-5 5v3.2c0 .9-.35 1.77-.98 2.4L4 15.6V17h16v-1.4l-2.02-2.02a3.4 3.4 0 01-.98-2.4V8a5 5 0 00-5-5z"/><path d="M9.5 20a2.5 2.5 0 005 0"/>`,
  reset: `<path d="M21 12a9 9 0 11-3.02-6.7"/><path d="M21 4v6h-6"/>`
};

const LINKS = [
  { key: "planner", label: "This Week", href: "planner.html", icon: "planner" },
  { key: "shopping", label: "Shopping", href: "shopping-list.html", icon: "shopping" },
  { key: "recipes", label: "Recipes", href: "recipes.html", icon: "recipes" },
  { key: "history", label: "History", href: "history.html", icon: "history" }
];

function iconSvg(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
}

export function renderNav({ activePage, user, household, householdId }) {
  const root = document.getElementById("navRoot");
  if (!root) return;

  const topLinksHtml = LINKS.map(l =>
    `<a class="nav-link ${l.key === activePage ? "active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");

  const bottomLinksHtml = LINKS.map(l =>
    `<a class="bn-link ${l.key === activePage ? "active" : ""}" href="${l.href}">${iconSvg(l.icon)}<span>${l.label}</span></a>`
  ).join("");

  const pushAvail = pushAvailability();
  // Hidden only when push genuinely isn't set up yet (no VAPID key) —
  // otherwise shown even when this particular browser/device can't use
  // it right now, so the click can explain why instead of the feature
  // just silently not existing.
  const bellHtml = pushAvail.reason !== "not-configured"
    ? `<button class="icon-btn bell-btn" id="navBellBtn" title="Notifications" aria-label="Notifications">${iconSvg("bell")}</button>`
    : "";

  root.innerHTML = `
    <nav class="topnav">
      <a class="brand" href="planner.html"><span class="mark">🍽️</span>${escapeHtml((household && household.name) || "Meal Planner")}</a>
      <div class="nav-links">${topLinksHtml}</div>
      <div class="nav-right">
        <span class="who">${escapeHtml((user && user.email) || "")}</span>
        ${bellHtml}
        <button class="icon-btn" id="navResetBtn" title="Something not working? Reset the app" aria-label="Reset app">${iconSvg("reset")}</button>
        <button class="btn btn-ghost btn-sm" id="navLogoutBtn">Sign out</button>
      </div>
    </nav>
    <nav class="bottom-nav">${bottomLinksHtml}</nav>`;

  document.getElementById("navLogoutBtn").addEventListener("click", logout);
  document.getElementById("navResetBtn").addEventListener("click", () => {
    if (confirm("Reset the app on this device? This clears anything stuck locally and signs you out — nothing on the server (your plans, list, or recipes) is touched.")) {
      hardResetAndReload();
    }
  });

  const bellBtn = document.getElementById("navBellBtn");
  if (bellBtn) {
    if (pushAvail.available && notificationPermission() === "granted") bellBtn.classList.add("on");
    bellBtn.addEventListener("click", async () => {
      if (pushAvail.reason === "ios-not-installed") {
        alert("On iPhone, notifications only work once this is added to your Home Screen. Tap the Share icon in Safari, then \"Add to Home Screen\" — then open it from that icon and tap the bell again.");
        return;
      }
      if (pushAvail.reason === "unsupported") {
        alert("This browser doesn't support notifications — try Chrome, or on iPhone use Safari with the app added to your Home Screen.");
        return;
      }
      if (notificationPermission() === "denied") {
        alert("Notifications are blocked for this site — check your phone/browser's notification settings to allow them, then tap this again.");
        return;
      }
      bellBtn.disabled = true;
      try {
        await enablePush(householdId, user.email);
        bellBtn.classList.add("on");
      } catch (err) {
        alert(err.message || "Couldn't turn on notifications.");
      } finally {
        bellBtn.disabled = false;
      }
    });
  }
}

export function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Turns bare URLs into clickable links. Must be called on text that's
// already been through escapeHtml() — it only ever matches "http(s)://"
// runs, so it can't reopen any HTML that escaping just closed off, and
// entities like &amp; inside a query string decode back to the right
// character in both the link text and the href.
export function linkify(escapedHtml) {
  return escapedHtml.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    let trailing = "";
    const m = url.match(/[).,!?;:]+$/);
    if (m) {
      trailing = m[0];
      url = url.slice(0, -trailing.length);
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}
