// -----------------------------------------------------------------------
// recipes.js
// Recipe box: browse saved recipes, add a new one by pasting it in.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import { listRecipes, addRecipe } from "./recipes-data.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "recipes", user, household });

const gridEl = document.getElementById("recipeGrid");
const modalRoot = document.getElementById("modalRoot");

async function refresh() {
  gridEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  const recipes = await listRecipes(householdId);
  if (!recipes.length) {
    gridEl.innerHTML = `<div class="empty-state">No recipes saved yet. Add one with the button above,
      or attach one straight from a day on the planner.</div>`;
    return;
  }
  gridEl.innerHTML = recipes.map(r => `
    <a class="recipe-card" href="recipe.html?id=${encodeURIComponent(r.id)}">
      <h3>${escapeHtml(r.title)}</h3>
      <p>${escapeHtml((r.body || "").slice(0, 160))}</p>
    </a>
  `).join("");
}

document.getElementById("addRecipeBtn").addEventListener("click", () => {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="addBackdrop">
      <div class="modal">
        <h2>Add a recipe</h2>
        <div class="field">
          <label for="titleInput">Title</label>
          <input type="text" id="titleInput" placeholder="e.g. Chicken Tikka Masala">
        </div>
        <div class="field">
          <label for="sourceInput">Source link (optional)</label>
          <input type="text" id="sourceInput" placeholder="https://…">
        </div>
        <div class="field">
          <label for="bodyInput">Paste the recipe</label>
          <textarea id="bodyInput" rows="10" placeholder="Ingredients, method — paste however it's formatted."></textarea>
        </div>
        <div class="banner error" id="addError" style="display:none;"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="addCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="addSaveBtn">Save recipe</button>
        </div>
      </div>
    </div>
  `;
  const backdrop = document.getElementById("addBackdrop");
  const close = () => { modalRoot.innerHTML = ""; };
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.getElementById("addCancelBtn").addEventListener("click", close);

  document.getElementById("addSaveBtn").addEventListener("click", async () => {
    const errBox = document.getElementById("addError");
    const title = document.getElementById("titleInput").value.trim();
    const body = document.getElementById("bodyInput").value.trim();
    const sourceUrl = document.getElementById("sourceInput").value.trim();
    if (!title || !body) {
      errBox.textContent = "A title and the recipe text are both needed.";
      errBox.style.display = "block";
      return;
    }
    try {
      await addRecipe(householdId, { title, body, sourceUrl }, user.email);
      close();
      refresh();
    } catch (err) {
      errBox.textContent = err.message || "Couldn't save that recipe.";
      errBox.style.display = "block";
    }
  });
});

refresh();
