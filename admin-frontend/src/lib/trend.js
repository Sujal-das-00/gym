/* ---------------------------------------------------------------------------
 * Money over time, for the Analysis charts: the period's ledger entries bucketed
 * per day (up to ~2 months) or per month (longer), with empty buckets kept so
 * the gaps are as visible as the busy days.
 * ------------------------------------------------------------------------- */
import { dateFormatter, displayDate, localDateKey, parseDateKey, todayKey } from "./dates.js";

const DAY_LIMIT = 62;
const weekdayShort = dateFormatter({ weekday: "short" });
const monthShort = dateFormatter({ month: "short" });
const monthYear = dateFormatter({ month: "short", year: "numeric" });

const emptyPoint = (key, label, title) => ({ key, label, title, earned: 0, spent: 0, count: 0 });

/**
 * { unit: "day" | "month", points: [{ key, label, title, earned, spent, count }] }
 * `period` is { start, end } (either may be "" for an open range); days after
 * today are left off so a running month doesn't end in empty future bars.
 */
export function buildTrend(entries, period, today = todayKey()) {
  const dates = entries.map((entry) => entry.date).sort();
  if (!dates.length) return { unit: "day", points: [] };
  const start = period.start || dates[0];
  let end = period.end || dates[dates.length - 1];
  if (end > today && start <= today) end = today;
  if (end < start) end = start;

  const days = Math.round((parseDateKey(end) - parseDateKey(start)) / 86400000) + 1;
  const unit = days <= DAY_LIMIT ? "day" : "month";
  const points = new Map();

  if (unit === "day") {
    const cursor = parseDateKey(start);
    for (let index = 0; index < days; index += 1) {
      const key = localDateKey(cursor);
      points.set(key, emptyPoint(key, String(cursor.getDate()), `${weekdayShort.format(cursor)}, ${displayDate(key)}`));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = parseDateKey(start);
    cursor.setDate(1);
    const last = parseDateKey(end);
    while (cursor <= last) {
      const key = localDateKey(cursor).slice(0, 7);
      points.set(key, emptyPoint(key, monthShort.format(cursor), monthYear.format(cursor)));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  for (const entry of entries) {
    const point = points.get(unit === "day" ? entry.date : entry.date.slice(0, 7));
    if (!point) continue;
    if (entry.type === "expense") point.spent += entry.amount;
    else {
      point.earned += entry.amount;
      point.count += 1;
    }
  }
  return { unit, points: [...points.values()] };
}

/** A round top for the y axis and the ticks up to it: 0, half, top. */
export function niceScale(max) {
  if (!(max > 0)) return { top: 1, ticks: [0] };
  const power = 10 ** Math.floor(Math.log10(max));
  const fraction = max / power;
  const top = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  return { top, ticks: [0, top / 2, top] };
}
