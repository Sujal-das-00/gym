// Date + number formatting helpers, ported unchanged from the original script.js.
// Every date in this app is a local "YYYY-MM-DD" key, never a UTC timestamp, so
// that a check-in at 11pm never lands on the next day.

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function parseDateKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day);
}

export function todayKey() {
  return localDateKey();
}

export function toDateKey(value) {
  if (!value) return todayKey();
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return localDateKey(value);
  return String(value).slice(0, 10);
}

export function monthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

export function daysBetween(startKey, endKey) {
  const days = [];
  const current = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  while (current <= end) {
    days.push(localDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export function addMonths(date, months) {
  const copy = new Date(date);
  const originalDate = copy.getDate();
  copy.setMonth(copy.getMonth() + months);
  if (copy.getDate() < originalDate) copy.setDate(0);
  return copy;
}

export function monthLabelFromKey(key) {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(parseDateKey(key + "-01"));
}

export function getDefaultHistoryRange() {
  const now = new Date();
  return {
    start: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function displayDate(value) {
  if (!value) return "Not set";
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function timeText(iso) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

export function currentMonthLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}
