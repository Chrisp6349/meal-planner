// -----------------------------------------------------------------------
// dates.js
// Small date helpers shared by planner/history — weeks always run
// Monday to Sunday, and a week's Firestore doc ID is its Monday's date
// as YYYY-MM-DD (in local time, so it matches what the calendar on the
// wall says, not UTC).
// -----------------------------------------------------------------------

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function weekId(mondayDate) {
  const y = mondayDate.getFullYear();
  const m = String(mondayDate.getMonth() + 1).padStart(2, "0");
  const d = String(mondayDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseWeekId(id) {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatWeekLabel(mondayDate) {
  const sunday = addDays(mondayDate, 6);
  const sameMonth = mondayDate.getMonth() === sunday.getMonth();
  const opts = { day: "numeric", month: "short" };
  const start = mondayDate.toLocaleDateString("en-GB", sameMonth ? { day: "numeric" } : opts);
  const end = sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${end}`;
}

export function formatDayDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
