/* ---------------------------------------------------------------------------
 * Activity history (Phase 4): fetching it and putting it into words.
 *
 * Activities come from /api/activities (backend utils/activity.js builds
 * them). They hold structured details; everything a person reads is worded
 * here, as one compact card per activity: what happened, one line of the
 * details that matter (old → new, amounts, terms), when and who.
 * `occurredAt` is an ISO UTC time, shown in the device's local time.
 * ------------------------------------------------------------------------- */
import { api } from "./api.js";
import { currency, dateFormatter, displayDate, localDateKey, parseDateKey } from "./dates.js";
import { DATE_NOT_RECORDED, OPENING_PERIOD_KEY, paymentModeLabel, planLabel } from "./billing.js";

export const ACTIVITY_TYPES = [
  { value: "", label: "All activities" },
  { value: "member", label: "Members" },
  { value: "payment", label: "Payments" },
  { value: "membership", label: "Membership" },
  { value: "balance", label: "Balance changes" },
];

/**
 * The Insights period (inclusive YYYY-MM-DD days, "" = open) as ISO instants
 * for the server: local midnights, so a day means the gym's day wherever the
 * server runs. `to` is exclusive.
 */
export function dayRange(startKey, endKey) {
  const midnight = (key, offset = 0) => {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + offset);
    return date.toISOString();
  };
  return { from: startKey ? midnight(startKey) : "", to: endKey ? midnight(endKey, 1) : "" };
}

// Enough for a busy gym's year; the list says so if a period has more.
const MAX_ROWS = 2000;

/** Every activity in the period (newest first), fetched page by page. */
export async function fetchActivities({ startKey = "", endKey = "", category = "", q = "" } = {}) {
  const { from, to } = dayRange(startKey, endKey);
  const rows = [];
  let before = null;
  for (;;) {
    const params = new URLSearchParams({ limit: "500" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    if (before) {
      params.set("before", before.occurredAt);
      params.set("beforeSeq", String(before.seq));
    }
    const page = await api("/api/activities?" + params.toString());
    rows.push(...page.activities);
    if (!page.more || !page.activities.length) return { activities: rows, truncated: false };
    if (rows.length >= MAX_ROWS) return { activities: rows, truncated: true };
    before = page.activities[page.activities.length - 1];
  }
}

/** Local YYYY-MM-DD an activity happened on. */
export const activityDayKey = (activity) => localDateKey(new Date(activity.occurredAt));

/** "10:30 am" */
export const activityTime = (activity) => dateFormatter({ hour: "numeric", minute: "2-digit" }).format(new Date(activity.occurredAt));

/** Newest day first, each day's activities newest first (as the server sends them). */
export function groupActivitiesByDay(activities) {
  const days = [];
  for (const activity of activities) {
    const key = activityDayKey(activity);
    const last = days[days.length - 1];
    if (last && last.date === key) last.rows.push(activity);
    else days.push({ date: key, rows: [activity] });
  }
  return days;
}

const COUNT_WORDS = {
  member: ["member update", "member updates"],
  payment: ["payment", "payments"],
  membership: ["membership change", "membership changes"],
  balance: ["balance change", "balance changes"],
};

/** "3 payments · 1 member update", by each activity's main type, for a day card. */
export function dayBreakdown(rows) {
  const counts = new Map();
  for (const activity of rows) {
    const type = activity.categories?.[0] || "member";
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return Object.keys(COUNT_WORDS)
    .filter((type) => counts.has(type))
    .map((type) => `${counts.get(type)} ${COUNT_WORDS[type][counts.get(type) === 1 ? 0 : 1]}`)
    .join(" · ");
}

const FIELD_LABELS = {
  name: "name",
  phone: "phone number",
  gymId: "member ID",
  address: "address",
  startDate: "joining date",
  admissionFee: "admission fee",
  trainer: "trainer",
  photo: "photo",
  mode: "payment method",
  reference: "reference",
  note: "note",
};

const CHANGE_TITLES = {
  upgrade: "membership upgraded",
  downgrade: "membership amount decreased",
  change: "membership changed",
  restart: "expired membership restarted",
};

const ICONS = {
  member: "person",
  payment: "payments",
  membership: "card_membership",
  balance: "account_balance_wallet",
};

const possessive = (name) => (name ? `${name}'s` : "The member's");
const forName = (name) => (name ? ` for ${name}` : "");

/** One line saying what happened. */
export function activityTitle(activity) {
  const d = activity.details || {};
  const name = activity.memberName;
  switch (activity.action) {
    case "member_added":
      return `${name} added as ${d.type === "existing" ? "an existing" : "a new"} member`;
    case "history_confirmed":
      return `Old payment records confirmed${forName(name)}`;
    case "opening_balance_added":
      return `Old balance added${forName(name)}`;
    case "member_updated":
      return `${possessive(name)} ${FIELD_LABELS[d.field] || d.field} ${d.field === "phone" ? "changed" : "updated"}`;
    case "joining_date_changed":
      return `${possessive(name)} joining date corrected`;
    case "member_archived":
      return `${name} removed from members`;
    case "payment_recorded":
      if (d.renewedAhead) return `Payment${forName(name)} · renewed in advance`;
      if (d.oldDuesCleared > 0 && !d.renewal) return `Payment${forName(name)} · cleared old dues`;
      if (d.renewal) return `Payment${forName(name)} · membership renewed`;
      return `Payment recorded${forName(name)}`;
    case "payment_edited":
      return `Payment ${FIELD_LABELS[d.field] || "details"} edited${forName(name)}`;
    case "payment_corrected":
      if (d.historical) return `Historical payment corrected${forName(name)}`;
      if (d.moved) return `Payment moved to another billing period${forName(name)}`;
      return `Wrong payment corrected${forName(name)}`;
    case "payment_cancelled":
      return `Payment cancelled${forName(name)}`;
    case "plan_changed":
      if (d.scheduled && d.changeType !== "restart") return `Future membership change scheduled${forName(name)}`;
      return `${possessive(name)} ${CHANGE_TITLES[d.changeType] || CHANGE_TITLES.change}`;
    case "dues_waived":
      return `Outstanding dues waived${forName(name)}`;
    case "dues_kept":
      return `Unpaid dues kept as balance${forName(name)}`;
    default:
      return activity.action;
  }
}

/** Who did it, or "" when the record didn't keep it. */
export function actorLabel(activity) {
  const actor = activity.actor;
  if (!actor) return "";
  const role = actor.role === "staff" ? "staff" : actor.role === "gym_admin" ? "owner" : actor.role === "super_admin" ? "support" : "";
  return [actor.name || "Someone", role && `(${role})`].filter(Boolean).join(" ");
}

const termLabel = (domain, member, period) => (period === OPENING_PERIOD_KEY ? "Opening balance" : domain.getBillingPeriodLabel(period, member));
const termsOf = (domain, member, terms) => (terms || []).map((term) => termLabel(domain, member, term.period)).join(", ");
const paidOn = (summary) => (summary?.dateKnown === false ? DATE_NOT_RECORDED : displayDate(summary?.date));
const amountOf = (plan) => (plan ? (plan.membershipType === "package" ? `${planLabel(plan)} ${currency(plan.fee)}` : currency(plan.fee)) : "—");
const valueOf = (field, value) => {
  if (value === "" || value === null || value === undefined) return "none";
  if (field === "startDate") return displayDate(value);
  if (field === "admissionFee") return currency(value);
  if (field === "mode") return paymentModeLabel(value);
  if (field === "photo") return value ? "photo" : "no photo";
  return String(value);
};
const line = (...parts) => parts.filter(Boolean).join(" · ");

/**
 * Everything one card shows:
 *   title  – what happened
 *   detail – one line of what matters (old → new, terms, dates, reason)
 *   meta   – when, and who did it
 *   amount – { text, tone: "in" | "out" | "none" } for money activities, else null
 * `member` (when still in the list) gives package terms their date ranges.
 */
export function activityCard(activity, domain, member = null) {
  const d = activity.details || {};
  let detail = "";
  let amount = null;
  switch (activity.action) {
    case "member_added":
      detail =
        d.type === "existing"
          ? line(`Joined ${displayDate(d.joinedOn)}`, d.addedOn && `added ${displayDate(localDateKey(new Date(d.addedOn)))}`, amountOf(d.plan))
          : line(d.plan && planLabel(d.plan), amountOf(d.plan));
      break;
    case "history_confirmed":
      detail = line(`${d.paidCount} paid (${currency(d.paidTotal)})`, d.unpaidCount === null || d.unpaidCount === undefined ? "" : `${d.unpaidCount} unpaid`, "no money received today");
      break;
    case "opening_balance_added":
      detail = line("Owed, not paid", d.billingFrom && `billing from ${displayDate(d.billingFrom)}`);
      amount = { text: currency(d.amount), tone: "none" };
      break;
    case "member_updated":
      detail = `${valueOf(d.field, d.from)} → ${valueOf(d.field, d.to)}`;
      break;
    case "joining_date_changed":
      detail = line(`${valueOf(d.field, d.from)} → ${valueOf(d.field, d.to)}`, d.renewalAfter && `renews ${displayDate(d.renewalAfter)}`);
      break;
    case "member_archived":
      detail = "Removed from the list; history kept";
      break;
    case "payment_recorded":
      detail = line(termsOf(domain, member, d.terms), d.mode && paymentModeLabel(d.mode), d.dateKnown === false && DATE_NOT_RECORDED, d.reference);
      amount = { text: "+" + currency(d.amount), tone: "in" };
      break;
    case "payment_edited":
      detail = `${FIELD_LABELS[d.field] || d.field}: ${valueOf(d.field, d.from)} → ${valueOf(d.field, d.to)}`;
      break;
    case "payment_corrected":
      detail = line(
        `${currency(d.original?.amount)} → ${currency(d.replacement?.amount)}`,
        d.moved && termsOf(domain, member, d.replacement?.terms),
        d.reason,
      );
      amount = { text: "+" + currency(d.replacement?.amount), tone: "in" };
      break;
    case "payment_cancelled":
      detail = line(termsOf(domain, member, d.terms), `paid ${paidOn(d)}`, d.reason);
      amount = { text: "−" + currency(d.amount), tone: "out" };
      break;
    case "plan_changed":
      detail =
        d.changeType === "restart"
          ? line(amountOf(d.to), `new cycle from ${displayDate(d.effectiveDate)}`)
          : line(`${amountOf(d.from)} → ${amountOf(d.to)}`, `from ${displayDate(d.effectiveDate)}`, d.newTermEnds && `term ends ${displayDate(d.newTermEnds)}`);
      break;
    case "dues_waived":
      detail = line("Not money received", termsOf(domain, member, d.terms));
      amount = { text: currency(d.amount), tone: "none" };
      break;
    case "dues_kept":
      detail = line("Still owed", termsOf(domain, member, d.terms));
      amount = { text: currency(d.amount), tone: "none" };
      break;
    default:
      break;
  }
  const by = actorLabel(activity);
  return {
    title: activityTitle(activity),
    detail,
    meta: line(activityTime(activity), by ? `by ${by}` : activity.backfilled ? "from earlier records" : ""),
    amount,
    icon: ICONS[activity.categories?.[0]] || "history",
    tone: activity.categories?.[0] || "member",
  };
}

/** The period's activities as CSV rows, for the Insights export. */
export function activityCsvRows(activities, domain, members = []) {
  return [
    ["Date", "Time", "Member", "Member ID", "Activity", "Details", "Amount", "Done by"],
    ...activities.map((activity) => {
      const card = activityCard(activity, domain, members.find((item) => item.id === activity.memberId) || null);
      return [
        activityDayKey(activity),
        activityTime(activity),
        activity.memberName,
        activity.memberCode,
        card.title,
        card.detail,
        card.amount?.text || "",
        actorLabel(activity),
      ];
    }),
  ];
}
