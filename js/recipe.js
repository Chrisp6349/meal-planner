// -----------------------------------------------------------------------
// recipe.js
// Single recipe view — the pasted text, its source link if any, and a
// delete action.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import { getRecipe, deleteRecipe } from "./recipes-data.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "recipes", user, household });

const cardEl = document.getElementById("recipeCard");
const recipeId = new URLSearchParams(window.location.search).get("id");

if (!recipeId) {
  cardEl.innerHTML = `<div class="empty-state">No recipe specified.</div>`;
} else {
  const recipe = await getRecipe(householdId, recipeId);
  if (!recipe) {
    cardEl.innerHTML = `<div class="empty-state">That recipe couldn't be found — it may have been deleted.</div>`;
  } else {
    cardEl.innerHTML = `
      <div class="page-head" style="margin-bottom:14px;">
        <h1 style="font-size:20px;">${escapeHtml(recipe.title)}</h1>
        <button class="btn btn-danger btn-sm" id="deleteBtn">Delete</button>
      </div>
      ${recipe.sourceUrl ? `<p class="sub" style="margin-bottom:14px;"><a href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(recipe.sourceUrl)}</a></p>` : ""}
      <div class="recipe-body">${escapeHtml(recipe.body)}</div>
    `;
    document.getElementById("deleteBtn").addEventListener("click", async () => {
      if (!confirm(`Delete "${recipe.title}"? Any days it's attached to will just lose the link.`)) return;
      await deleteRecipe(householdId, recipeId);
      window.location.href = "recipes.html";
    });
  }
}
