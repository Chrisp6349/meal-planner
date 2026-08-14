// -----------------------------------------------------------------------
// planner.js
// The weekly Monday-to-Sunday view. One dinner field per day, each
// optionally linked to a saved recipe. Autosaves per day on a short
// debounce so nothing is ever lost to a forgotten "Save" button.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import { db, doc, getDoc, setDoc, serverTimestamp } from "./firebase-init.js";
import { DAY_KEYS, DAY_LABELS, mondayOf, addDays, weekId, formatWeekLabel, formatDayDate, isSameDay } from "./dates.js";
import { listRecipes, addRecipe } from "./recipes-data.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "planner", user, household });

const params = new URLSearchParams(window.location.search);
const requestedWeek = params.get("week");
let currentMonday = requestedWeek ? new Date(requestedWeek + "T00:00:00") : mondayOf(new Date());
if (isNaN(currentMonday.getTime())) currentMonday = mondayOf(new Date());

let weekData = {};
let recipesCache = null;

const weekLabelEl = document.getElementById("weekLabel");
const gridEl = document.getElementById("weekGrid");
const saveStatusEl = document.getElementById("saveStatus");
const modalRoot = document.getElementById("modalRoot");

function weekRef(monday) {
  return doc(db, "households", householdId, "weeks", weekId(monday));
}

async function loadWeek() {
  gridEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  const snap = await getDoc(weekRef(currentMonday));
  weekData = snap.exists() ? snap.data() : {};
  render();
  // Keep the URL shareable/bookmarkable for a given week without adding
  // history entries for every prev/next click.
  const url = new URL(window.location.href);
  url.searchParams.set("week", weekId(currentMonday));
  window.history.replaceState({}, "", url);
}

function render() {
  weekLabelEl.textContent = formatWeekLabel(currentMonday);
  const today = new Date();
  gridEl.innerHTML = "";
  DAY_KEYS.forEach((key, i) => {
    const dayDate = addDays(currentMonday, i);
    const day = weekData[key] || {};
    const card = document.createElement("div");
    card.className = "day-card" + (isSameDay(dayDate, today) ? " is-today" : "");
    card.innerHTML = `
      <div class="day-name">${DAY_LABELS[key]}</div>
      <div class="day-date">${formatDayDate(dayDate)}</div>
      <textarea placeholder="What's for dinner?" data-day="${key}">${escapeHtml(day.meal || "")}</textarea>
      <div data-recipe-slot></div>
    `;
    const slot = card.querySelector("[data-recipe-slot]");
    renderRecipeSlot(slot, key, day);

    const textarea = card.querySelector("textarea");
    let timer = null;
    textarea.addEventListener("input", () => {
      clearTimeout(timer);
      saveStatusEl.textContent = "";
      timer = setTimeout(() => saveDay(key, { ...weekData[key], meal: textarea.value }), 600);
    });

    gridEl.appendChild(card);
  });
}

function renderRecipeSlot(slot, dayKey, day) {
  if (day.recipeId) {
    slot.innerHTML = `
      <button class="recipe-chip" data-open-recipe="${day.recipeId}">📖 ${escapeHtml(day.recipeTitle || "Recipe")}</button>
      <button class="add-recipe-link" data-remove-recipe>Remove recipe</button>
    `;
    slot.querySelector("[data-open-recipe]").addEventListener("click", () => {
      window.location.href = `recipe.html?id=${encodeURIComponent(day.recipeId)}`;
    });
    slot.querySelector("[data-remove-recipe]").addEventListener("click", () => {
      const updated = { ...weekData[dayKey], recipeId: null, recipeTitle: null };
      saveDay(dayKey, updated);
      render();
    });
  } else {
    slot.innerHTML = `<button class="add-recipe-link" data-attach-recipe>+ Attach a recipe</button>`;
    slot.querySelector("[data-attach-recipe]").addEventListener("click", () => openRecipePicker(dayKey));
  }
}

async function saveDay(dayKey, dayObj) {
  weekData[dayKey] = dayObj;
  saveStatusEl.textContent = "Saving…";
  try {
    await setDoc(weekRef(currentMonday), { [dayKey]: dayObj, updatedAt: serverTimestamp() }, { merge: true });
    saveStatusEl.textContent = "Saved";
    setTimeout(() => { if (saveStatusEl.textContent === "Saved") saveStatusEl.textContent = ""; }, 1500);
  } catch (err) {
    saveStatusEl.textContent = "Couldn't save — check your connection";
    console.error(err);
  }
}

async function openRecipePicker(dayKey) {
  if (!recipesCache) recipesCache = await listRecipes(householdId);

  const optionsHtml = recipesCache.map(r => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join("");

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="pickerBackdrop">
      <div class="modal">
        <h2>Attach a recipe</h2>
        ${recipesCache.length ? `
          <div class="field">
            <label for="existingRecipeSelect">Choose an existing recipe</label>
            <select id="existingRecipeSelect">
              <option value="">— Select —</option>
              ${optionsHtml}
            </select>
          </div>
          <div style="text-align:center;color:var(--ink-500);font-size:12.5px;margin:14px 0;">or paste a new one</div>
        ` : `<p class="sub">No saved recipes yet — paste one in below.</p>`}
        <div class="field">
          <label for="newRecipeTitle">Recipe title</label>
          <input type="text" id="newRecipeTitle" placeholder="e.g. Chicken Tikka Masala">
        </div>
        <div class="field">
          <label for="newRecipeBody">Paste the recipe</label>
          <textarea id="newRecipeBody" rows="8" placeholder="Ingredients, method — paste however it's formatted."></textarea>
        </div>
        <div class="banner error" id="pickerError" style="display:none;"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="pickerCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="pickerSaveBtn">Attach</button>
        </div>
      </div>
    </div>
  `;

  const backdrop = document.getElementById("pickerBackdrop");
  const close = () => { modalRoot.innerHTML = ""; };
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.getElementById("pickerCancelBtn").addEventListener("click", close);

  document.getElementById("pickerSaveBtn").addEventListener("click", async () => {
    const errBox = document.getElementById("pickerError");
    errBox.style.display = "none";
    const select = document.getElementById("existingRecipeSelect");
    const selectedId = select ? select.value : "";
    const title = document.getElementById("newRecipeTitle").value.trim();
    const body = document.getElementById("newRecipeBody").value.trim();

    try {
      if (selectedId) {
        const chosen = recipesCache.find(r => r.id === selectedId);
        saveDay(dayKey, { ...weekData[dayKey], recipeId: chosen.id, recipeTitle: chosen.title });
      } else if (title && body) {
        const newId = await addRecipe(householdId, { title, body }, user.email);
        recipesCache = null; // refetch next time so newly-added recipe shows up
        saveDay(dayKey, { ...weekData[dayKey], recipeId: newId, recipeTitle: title });
      } else {
        errBox.textContent = "Pick an existing recipe, or fill in both the title and the recipe text.";
        errBox.style.display = "block";
        return;
      }
      close();
      render();
    } catch (err) {
      errBox.textContent = err.message || "Something went wrong saving that.";
      errBox.style.display = "block";
    }
  });
}

document.getElementById("prevWeekBtn").addEventListener("click", () => {
  currentMonday = addDays(currentMonday, -7);
  loadWeek();
});
document.getElementById("nextWeekBtn").addEventListener("click", () => {
  currentMonday = addDays(currentMonday, 7);
  loadWeek();
});
document.getElementById("todayBtn").addEventListener("click", () => {
  currentMonday = mondayOf(new Date());
  loadWeek();
});

loadWeek();
