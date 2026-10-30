/* ---------------------------------------------------------------------------
 * The member plan-change log: fetching it and turning entries into copy.
 * Entries come from /api/plan-changes (see backend planChangeService.js);
 * `changedAt` is an ISO timestamp, shown in the device's local time.
 * ------------------------------------------------------------------------- */
import { api } from "./api.js";
import { currency, dateFormatter, displayDate, localDateKey } from "./dates.js";
import { collectionTimingLabel, planLabel } from "./billing.js";

export function fetchPlanChanges(memberId = "") {
  return api("/api/plan-changes" + (memberId ? "?memberId=" + encodeURIComponent(memberId) : ""));
}

/** "3-month package · ₹2,200" */
export function planSummary(plan) {
  return planLabel(plan) + " · " + currency(plan.fee);
}

/** Local YYYY-MM-DD the change was made on, for period filters and grouping. */
export function changeDateKey(change) {
  return localDateKey(new Date(change.changedAt));
}

/** "28 Oct 2026, 4:35 pm" */
export function changeTimestamp(change) {
  const at = new Date(change.changedAt);
  return (
    dateFormatter({ day: "2-digit", month: "short", year: "numeric" }).format(at) +
    ", " +
    dateFormatter({ hour: "numeric", minute: "2-digit" }).format(at)
  );
}

export function changeTime(change) {
  return dateFormatter({ hour: "numeric", minute: "2-digit" }).format(new Date(change.changedAt));
}

// What one month costs on a plan, so a package and a monthly plan compare fairly.
const perMonth = (plan) => Number(plan.fee || 0) / (plan.membershipType === "package" ? Math.max(1, plan.packageMonths) : 1);

/** "upgrade" | "downgrade" | "same" by monthly price. */
export function changeDirection(change) {
  const before = perMonth(change.from);
  const after = perMonth(change.to);
  if (Math.abs(after - before) < 0.5) return "same";
  return after > before ? "upgrade" : "downgrade";
}

/** One line per field that actually changed. */
export function changedFields(change) {
  const { from, to } = change;
  const lines = [];
  if (planLabel(from) !== planLabel(to)) lines.push(`${planLabel(from)} → ${planLabel(to)}`);
  if (from.fee !== to.fee) lines.push(`Fee ${currency(from.fee)} → ${currency(to.fee)}`);
  if (from.collectionTiming !== to.collectionTiming) {
    lines.push(`Collected ${collectionTimingLabel(from.collectionTiming).toLowerCase()} → ${collectionTimingLabel(to.collectionTiming).toLowerCase()}`);
  }
  return lines;
}

/** Money that moved (or was let go) with the change, for the log row. */
export function changeMoneyNotes(change) {
  const notes = [];
  const collected = Number(change.duesCollected || 0) + Number(change.firstTermCollected || 0);
  if (collected > 0) notes.push(`${currency(collected)} collected`);
  if (Number(change.duesWaived || 0) > 0) notes.push(`${currency(change.duesWaived)} dues waived`);
  return notes;
}

export function changedByLabel(change) {
  const who = change.changedBy?.name || "";
  const role = change.changedBy?.role === "staff" ? "staff" : change.changedBy?.role === "gym_admin" ? "owner" : "";
  if (!who) return role ? `by ${role}` : "";
  return role ? `by ${who} (${role})` : `by ${who}`;
}

export function planChangesCsvRows(changes) {
  return [
    ["Changed on", "Time", "Member", "Member ID", "Old plan", "New plan", "Starts", "Collected", "Waived", "Changed by", "Note"],
    ...changes.map((change) => [
      changeDateKey(change),
      changeTime(change),
      change.memberName,
      change.memberCode,
      `${planSummary(change.from)} · ${collectionTimingLabel(change.from.collectionTiming)}`,
      `${planSummary(change.to)} · ${collectionTimingLabel(change.to.collectionTiming)}`,
      displayDate(change.effectiveDate),
      String(Number(change.duesCollected || 0) + Number(change.firstTermCollected || 0)),
      String(Number(change.duesWaived || 0)),
      change.changedBy?.name || "",
      change.note || "",
    ]),
  ];
}
