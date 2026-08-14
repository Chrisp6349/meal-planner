// -----------------------------------------------------------------------
// shopping-list.js
// A shared, live-synced shopping list — either of you can add, check off,
// or remove items and the other sees it update immediately.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, onSnapshot, serverTimestamp
} from "./firebase-init.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "shopping", user, household });

const listCol = collection(db, "households", householdId, "shoppingList");
const listEl = document.getElementById("shopList");

onSnapshot(query(listCol, orderBy("addedAt", "asc")), (snap) => {
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (a.checked === b.checked) ? 0 : (a.checked ? 1 : -1));
  render(items);
}, (err) => {
  console.error(err);
  listEl.innerHTML = `<div class="banner error">Couldn't load the shopping list — ${escapeHtml(err.message)}</div>`;
});

function render(items) {
  if (!items.length) {
    listEl.innerHTML = `<div class="shop-empty">Nothing on the list yet.</div>`;
    return;
  }
  listEl.innerHTML = items.map(item => `
    <li class="shop-item ${item.checked ? "checked" : ""}" data-id="${item.id}">
      <span class="chk">
        ${item.checked ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` : ""}
      </span>
      <span class="txt">${escapeHtml(item.text)}</span>
      <button class="del" data-delete aria-label="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </li>
  `).join("");

  // The whole row is the toggle target — bigger and easier to hit on a
  // phone than a small checkbox alone. Deleting stops the click there so
  // it doesn't also toggle the item on its way out.
  listEl.querySelectorAll("li.shop-item").forEach(li => {
    li.addEventListener("click", () => {
      const checked = li.classList.contains("checked");
      updateDoc(doc(listCol, li.dataset.id), { checked: !checked });
    });
  });
  listEl.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const li = btn.closest("li");
      deleteDoc(doc(listCol, li.dataset.id));
    });
  });
}

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("addInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await addDoc(listCol, { text, checked: false, addedAt: serverTimestamp(), addedBy: user.email });
});

document.getElementById("clearCheckedBtn").addEventListener("click", async () => {
  const checkedItems = Array.from(listEl.querySelectorAll("li.checked"));
  if (!checkedItems.length) return;
  const batch = writeBatch(db);
  checkedItems.forEach(li => batch.delete(doc(listCol, li.dataset.id)));
  await batch.commit();
});
