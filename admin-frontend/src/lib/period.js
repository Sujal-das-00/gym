/* ---------------------------------------------------------------------------
 * The reporting period the Insights screen works over.
 *
 * Three ways to pick one: a single month (year + month), a whole year, or an
 * arbitrary custom range. All three resolve to the same inclusive
 * { start, end } pair of local date keys, so everything downstream only ever
 * deals with two dates.
 * ------------------------------------------------------------------------- */
import { displayDate, localDateKey, parseDateKey, todayKey } from "./dates.js";

export const PERIOD_MODES = [
  { value: "month", label: "Month" },
  { value: "year", label: "Full year" },
  { value: "custom", label: "Custom dates" },
];

export const MONTH_OPTIONS = Array.from({ length: 12 }, (unused, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date(2000, index, 1)),
}));

/** Last day of the given year/month, so February and 31-day months both work. */
function lastDayOfMonth(year, month) {
  return localDateKey(new Date(Number(year), Number(month), 0));
}

export function resolvePeriod({ mode, year, month, startDate, endDate }) {
  if (mode === "custom") {
    // Tolerate a range entered backwards rather than silently showing nothing.
    if (startDate && endDate && startDate > endDate) return { start: endDate, end: startDate };
    return { start: startDate || "", end: endDate || "" };
  }
  if (mode === "year") return { start: `${year}-01-01`, end: `${year}-12-31` };
  return { start: `${year}-${month}-01`, end: lastDayOfMonth(year, month) };
}

export function describePeriod({ mode, year, month, startDate, endDate }) {
  if (mode === "custom") {
    if (!startDate && !endDate) return "All records";
    return "Custom range";
  }
  if (mode === "year") return String(year);
  const name = MONTH_OPTIONS.find((option) => option.value === month)?.label || "";
  return `${name} ${year}`;
}

/**
 * Years the admin can choose between: every year the gym has a record in, plus
 * the current one, newest first. A brand-new gym still gets this year.
 */
export function availableYears(entries = []) {
  const years = new Set(entries.map((entry) => String(entry.date).slice(0, 4)).filter((year) => /^\d{4}$/.test(year)));
  years.add(todayKey().slice(0, 4));
  return [...years].sort((a, b) => b.localeCompare(a));
}

/**
 * A day row's heading: "Saturday, 01 Aug 2026". Composed from the weekday and
 * displayDate rather than one Intl call, because en-IN's combined format adds a
 * second comma ("Sat, 01 Aug, 2026").
 */
export function dayLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(date);
  return `${weekday}, ${displayDate(dateKey)}`;
}
