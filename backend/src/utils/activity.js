/**
 * Activity history (Phase 4): what one row of activity_log says.
 *
 * Every builder here is pure: it takes the record an action produced (a
 * member, a payment transaction, a plan change…) and returns the activity to
 * store. The services call them when an action succeeds; the one-time
 * backfill (services/activityService.js) calls the same ones on records that
 * existed before the log did, so old and new activities read alike.
 *
 * An activity stores structured details, not sentences; the admin panel turns
 * them into words (admin-frontend/src/lib/activity.js). Nothing here is money:
 * income is only ever read from payment_transactions.
 */
const crypto = require("crypto");
const { nowIso } = require("./date");

const CATEGORIES = ["member", "payment", "membership", "balance"];

// Who did it, as stored; null when it wasn't recorded (activities rebuilt from old records).
function actorOf(user) {
  if (!user || !user.id) return null;
  return {
    id: String(user.id).slice(0, 64),
    name: String(user.name || user.email || "").slice(0, 160),
    role: String(user.role || "").slice(0, 32),
  };
}

const planOf = (plan) =>
  plan
    ? {
        membershipType: plan.membershipType === "package" ? "package" : "monthly",
        packageMonths: Number(plan.packageMonths || 1),
        fee: Number(plan.fee || 0),
        collectionTiming: plan.collectionTiming || "",
      }
    : null;

function activity({ action, categories, member, actor, details = {}, sourceKey = null, occurredAt = nowIso(), backfilled = false }) {
  return {
    id: crypto.randomUUID(),
    occurredAt,
    action,
    categories: [...new Set(categories)].filter((category) => CATEGORIES.includes(category)),
    memberId: member?.id || null,
    memberName: String(member?.name || "").slice(0, 160),
    memberCode: String(member?.gymId || member?.memberCode || "").slice(0, 40),
    actor: actorOf(actor),
    details,
    sourceKey,
    backfilled,
  };
}

/* ---- Members -------------------------------------------------------------- */

function memberAdded(member, actor, extra = {}) {
  const existing = member.onboardingType === "existing";
  return activity({
    action: "member_added",
    categories: ["member"],
    member,
    actor,
    sourceKey: `member:${member.id}:added`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: {
      type: existing ? "existing" : "new",
      // An existing member joined before GymBoo: both dates are shown.
      joinedOn: member.startDate,
      addedOn: member.createdAt || "",
      plan: planOf(member),
      admissionFee: Number(member.admissionFee || 0),
      phone: member.phone || "",
    },
  });
}

// Phase 1 "each term" history: the past terms as the gym confirmed them.
function historyConfirmed(member, actor, terms, extra = {}) {
  const paid = terms.filter((term) => term.status === "paid");
  return activity({
    action: "history_confirmed",
    categories: ["balance"],
    member,
    actor,
    sourceKey: `member:${member.id}:history`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: {
      terms,
      paidCount: paid.length,
      unpaidCount: terms.length - paid.length,
      paidTotal: Math.round(paid.reduce((sum, term) => sum + Number(term.amount || 0), 0) * 100) / 100,
    },
  });
}

// Phase 1 opening balance: owed from before GymBoo. Not income.
function openingBalanceAdded(member, actor, extra = {}) {
  return activity({
    action: "opening_balance_added",
    categories: ["balance"],
    member,
    actor,
    sourceKey: `member:${member.id}:opening`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: {
      amount: Number(member.openingBalance || 0),
      admissionPart: Number(member.openingBalanceAdmission || 0),
      billingFrom: member.billingCutover || "",
    },
  });
}

// One field of a member's profile, as it was and as it is now. One activity per field.
function memberFieldChanged(member, actor, field, from, to, extra = {}) {
  const joining = field === "startDate";
  return activity({
    action: joining ? "joining_date_changed" : "member_updated",
    // A corrected joining date moves the membership's terms and end date with it.
    categories: joining ? ["member", "membership"] : field === "admissionFee" ? ["member", "payment"] : ["member"],
    member,
    actor,
    details: { field, from, to, ...extra },
  });
}

function memberArchived(member, actor, extra = {}) {
  return activity({
    action: "member_archived",
    categories: ["member"],
    member,
    actor,
    sourceKey: `member:${member.id}:archived`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: { from: "active", to: "removed" },
  });
}

/* ---- Payments ------------------------------------------------------------- */

const txSummary = (tx) => ({
  transactionId: tx.id,
  amount: Number(tx.amount || 0),
  date: tx.date,
  dateKnown: tx.dateKnown !== false,
  mode: tx.mode || "",
  reference: tx.reference || "",
  note: tx.note || "",
  source: tx.source || "",
  terms: (tx.allocations || []).map((allocation) => ({
    period: allocation.billingPeriod,
    amount: Number(allocation.amount || 0),
    fee: allocation.periodFee === null || allocation.periodFee === undefined ? null : Number(allocation.periodFee),
    // "old" (an earlier due), "current", "ahead" (renewed in advance),
    // "opening" (opening balance) or "kept" (old-plan dues kept as balance).
    ...(allocation.kind ? { kind: allocation.kind } : {}),
  })),
});

/**
 * One payment, however many terms it covered: one activity. It also counts
 * as a membership renewal when it paid the current or next term, and as a
 * balance activity when it cleared old dues.
 */
function paymentRecorded(member, actor, tx, extra = {}) {
  const summary = txSummary(tx);
  const kinds = new Set(summary.terms.map((term) => term.kind).filter(Boolean));
  const renewal = kinds.has("current") || kinds.has("ahead");
  const oldDues = summary.terms
    .filter((term) => ["old", "opening", "kept"].includes(term.kind))
    .reduce((sum, term) => sum + term.amount, 0);
  const categories = ["payment"];
  if (renewal) categories.push("membership");
  if (oldDues > 0) categories.push("balance");
  return activity({
    action: "payment_recorded",
    categories,
    member,
    actor,
    sourceKey: `tx:${tx.id}`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: { ...summary, renewal, renewedAhead: kinds.has("ahead"), oldDuesCleared: Math.round(oldDues * 100) / 100 },
  });
}

function paymentEdited(member, actor, tx, field, from, to, extra = {}) {
  return activity({
    action: "payment_edited",
    categories: ["payment"],
    member,
    actor,
    sourceKey: extra.sourceKey || null,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: { transactionId: tx.id, amount: Number(tx.amount || 0), date: tx.date, field, from, to },
  });
}

/**
 * A wrong payment replaced by the right one: one activity holding both. It
 * "moved" when the replacement pays different terms; it is "historical" when
 * the original was entered as past history (Phase 1).
 */
function paymentCorrected(member, actor, original, replacement, reason, extra = {}) {
  const before = txSummary(original);
  const after = txSummary(replacement);
  const termsOf = (summary) => summary.terms.map((term) => term.period).sort().join(",");
  const historical = original.source === "onboarding";
  return activity({
    action: "payment_corrected",
    categories: historical ? ["payment", "balance"] : ["payment"],
    member,
    actor,
    sourceKey: `corr:${replacement.id}`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: { original: before, replacement: after, reason, moved: termsOf(before) !== termsOf(after), historical },
  });
}

// A payment taken back: it stays on record, but no longer pays anything.
function paymentCancelled(member, actor, tx, reason, extra = {}) {
  return activity({
    action: "payment_cancelled",
    categories: ["payment"],
    member,
    actor,
    sourceKey: `rev:${tx.id}`,
    occurredAt: extra.occurredAt,
    backfilled: extra.backfilled,
    details: { ...txSummary(tx), reason },
  });
}

/* ---- Membership ----------------------------------------------------------- */

/**
 * A plan change or restart: previous and new amount, from when, and when each
 * runs out. Collected money is its own payment activity; waived or kept dues
 * are their own balance activities (duesActivities below).
 */
function planChanged(member, actor, change, extra = {}) {
  const today = extra.today || "";
  return activity({
    action: "plan_changed",
    categories: ["membership"],
    member,
    actor,
    sourceKey: `plan:${change.id}`,
    occurredAt: extra.occurredAt || change.changedAt,
    backfilled: extra.backfilled,
    details: {
      changeId: change.id,
      changeType: change.changeType || "change",
      from: planOf(change.from),
      to: planOf(change.to),
      effectiveDate: change.effectiveDate,
      scheduled: Boolean(today) && change.effectiveDate > today,
      // The current plan's last day, and the new plan's first term's last day.
      previousEnds: extra.previousEnds || "",
      newTermEnds: extra.newTermEnds || "",
      duesCollected: Number(change.duesCollected || 0),
      duesWaived: Number(change.duesWaived || 0),
      duesKept: Number(change.duesCarried || 0),
      firstTermCollected: Number(change.firstTermCollected || 0),
      note: change.note || "",
    },
  });
}

// Waived dues ("not money received") and dues kept as balance, from one change.
function duesActivities(member, actor, change, extra = {}) {
  const out = [];
  const detail = change.duesDetail || {};
  const base = { member, actor, occurredAt: extra.occurredAt || change.changedAt, backfilled: extra.backfilled };
  if (Number(change.duesWaived || 0) > 0) {
    out.push(
      activity({
        ...base,
        action: "dues_waived",
        categories: ["balance"],
        sourceKey: `plan:${change.id}:waived`,
        details: { changeId: change.id, changeType: change.changeType || "change", amount: Number(change.duesWaived), terms: detail.waived || [], note: change.note || "" },
      }),
    );
  }
  if (Number(change.duesCarried || 0) > 0) {
    out.push(
      activity({
        ...base,
        action: "dues_kept",
        categories: ["balance"],
        sourceKey: `plan:${change.id}:kept`,
        details: { changeId: change.id, changeType: change.changeType || "change", amount: Number(change.duesCarried), terms: detail.carried || [] },
      }),
    );
  }
  return out;
}

module.exports = {
  CATEGORIES,
  actorOf,
  duesActivities,
  historyConfirmed,
  memberAdded,
  memberArchived,
  memberFieldChanged,
  openingBalanceAdded,
  paymentCancelled,
  paymentCorrected,
  paymentEdited,
  paymentRecorded,
  planChanged,
};
