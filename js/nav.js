// -----------------------------------------------------------------------
// nav.js
// Renders the shared nav into #navRoot on every signed-in page: a
// compact top bar (brand + who's signed in + sign out) plus the actual
// section links. On phones the links become a fixed bottom tab bar
// (thumb-reachable); on wider screens they show inline in the top bar
// instead — see .topnav .nav-links / .bottom-nav in meals.css.
// -----------------------------------------------------------------------

import { logout } from "./household.js";

const ICONS = {
  planner: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  shopping: `<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2l2.3 12.1a2 2 0 002 1.6h8.5a2 2 0 001.95-1.57L21 8H6.2"/>`,
  recipes: `<path d="M4 5.2A2.2 2.2 0 016.2 3H20v15H6.2A2.2 2.2 0 004 15.8V5.2z"/><path d="M4 15.8A2.2 2.2 0 016.2 13.6H20"/>`,
  history: `<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 1.9"/>`
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

export function renderNav({ activePage, user, household }) {
  const root = document.getElementById("navRoot");
  if (!root) return;

  const topLinksHtml = LINKS.map(l =>
    `<a class="nav-link ${l.key === activePage ? "active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");

  const bottomLinksHtml = LINKS.map(l =>
    `<a class="bn-link ${l.key === activePage ? "active" : ""}" href="${l.href}">${iconSvg(l.icon)}<span>${l.label}</span></a>`
  ).join("");

  root.innerHTML = `
    <nav class="topnav">
      <a class="brand" href="planner.html"><span class="mark">🍽️</span>${escapeHtml((household && household.name) || "Meal Planner")}</a>
      <div class="nav-links">${topLinksHtml}</div>
      <div class="nav-right">
        <span class="who">${escapeHtml((user && user.email) || "")}</span>
        <button class="btn btn-ghost btn-sm" id="navLogoutBtn">Sign out</button>
      </div>
    </nav>
    <nav class="bottom-nav">${bottomLinksHtml}</nav>`;

  document.getElementById("navLogoutBtn").addEventListener("click", logout);
}

export function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
