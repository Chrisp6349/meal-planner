// -----------------------------------------------------------------------
// history.js
// Every past week you've planned, newest first, with a quick summary of
// what was on — click through to the full planner view for that week.
// -----------------------------------------------------------------------

import { requireHousehold } from "./household.js";
import { renderNav, escapeHtml } from "./nav.js";
import { db, collection, getDocs, query, orderBy, documentId } from "./firebase-init.js";
import { DAY_KEYS, DAY_SHORT, parseWeekId, formatWeekLabel, mondayOf, weekId } from "./dates.js";

const { user, householdId, household } = await requireHousehold();
renderNav({ activePage: "history", user, household });

const listEl = document.getElementById("historyList");
const currentWeekId = weekId(mondayOf(new Date()));

async function load() {
  listEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  const weeksCol = collection(db, "households", householdId, "weeks");
  const snap = await getDocs(query(weeksCol, orderBy(documentId(), "desc")));

  const rows = snap.docs
    .filter(d => d.id <= currentWeekId)
    .map(d => ({ id: d.id, ...d.data() }));

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
}

load();
