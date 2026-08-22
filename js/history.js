// -----------------------------------------------------------------------
// history.js
// Every past week you've planned, newest first, with a quick summary of
// what was on — click through to the full planner view for that week.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import { db, collection, getDocs } from "./firebase-init.js";
import { DAY_KEYS, parseWeekId, formatWeekLabel, mondayOf, weekId } from "./dates.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "history", user, household, householdId });

const listEl = document.getElementById("historyList");
const currentWeekId = weekId(mondayOf(new Date()));

// A promise that never resolves OR rejects (a genuinely hung Firestore
// call — different from a thrown error, and a plain try/catch alone
// can't do anything about it) is exactly what "stuck on Loading..."
// looks like. Racing it against a timeout guarantees the page reaches
// *some* visible outcome either way instead of spinning forever.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

async function load() {
  listEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    const weeksCol = collection(db, "households", householdId, "weeks");
    const snap = await withTimeout(
      getDocs(weeksCol),
      10000,
      "Timed out loading your history — check your connection and try again."
    );

    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(w => w.id <= currentWeekId)
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state">No weeks planned yet — head to This Week to get started.</div>`;
      return;
    }

    listEl.innerHTML = rows.map(week => {
      const meals = DAY_KEYS
        .map(k => (week[k] && week[k].meal) ? week[k].meal.trim() : "")
        .filter(Boolean);
      const summary = meals.length ? meals.join(" · ") : "Nothing recorded";
      const monday = parseWeekId(week.id);
      return `
        <a class="history-row" href="planner.html?week=${week.id}">
          <span class="hr-week">${week.id === currentWeekId ? "This week" : formatWeekLabel(monday)}</span>
          <span class="hr-meals">${escapeHtml(summary)}</span>
        </a>`;
    }).join("");
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `
      <div class="banner error">${escapeHtml(err.message || String(err))}</div>
      <button class="btn btn-ghost btn-sm" id="historyRetryBtn">Try again</button>
    `;
    document.getElementById("historyRetryBtn").addEventListener("click", load);
  }
}

load();
