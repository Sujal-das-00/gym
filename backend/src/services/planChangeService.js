const crypto = require("crypto");
const { nowIso, todayKey } = require("../utils/date");
const { normalizePaymentMode, publicMember } = require("../utils/member");
const {
  billingStartKey,
  collectionTiming,
  getBillingPeriodKeys,
  getPaidPeriodSet,
  getPeriodLedger,
  nextPeriodStartKey,
  periodBalance,
} = require("../utils/billing");
const { createHttpError } = require("../utils/http");
const { repo } = require("../models");

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

// "2026-10" (month-start period) → "2026-10-01"; dated keys pass through.
const periodStartKey = (period) => (String(period).length === 7 ? `${period}-01` : String(period));

function readPlan(payload) {
  const membershipType = payload.membershipType === "package" ? "package" : "monthly";
  const months = Number(payload.packageMonths);
  const fee = Number(payload.fee);
  if (membershipType === "package" && !(Number.isInteger(months) && months >= 1 && months <= 60)) {
    throw createHttpError(400, "Package length must be a whole number of months, 1 to 60.");
  }
  if (!Number.isFinite(fee) || fee <= 0 || fee > 10000000) {
    throw createHttpError(400, "Enter a fee of more than ₹0.");
  }
  if (!["at-join", "fixed-day"].includes(payload.collectionTiming)) {
    throw createHttpError(400, "Choose when the fee is collected.");
  }
  return {
    membershipType,
    packageMonths: membershipType === "package" ? months : 1,
    fee: Math.round(fee * 100) / 100,
    collectionTiming: payload.collectionTiming,
  };
}

const samePlan = (a, b) =>
  a.membershipType === b.membershipType &&
  (a.membershipType !== "package" || a.packageMonths === b.packageMonths) &&
  a.fee === b.fee &&
  a.collectionTiming === b.collectionTiming;

/**
 * Old-plan billing periods that start before the new plan does and are unpaid.
 * Billing restarts from the effective date, so these would silently disappear:
 * the change has to collect them or explicitly waive them. Same rule as
 * unsettledBeforeChange() in admin-frontend/src/lib/billing.js.
 */
function unsettledPeriods(member, settings, effectiveDate) {
  const paid = getPaidPeriodSet(member);
  return getBillingPeriodKeys(member, settings).filter(
    (period) => periodStartKey(period) < effectiveDate && !paid.has(period),
  );
}

// The key the new plan's first period gets, matching getBillingPeriodKeys().
function firstPeriodKey(plan, settings, effectiveDate) {
  if (plan.membershipType !== "package" && settings.billingCycleMode === "month-start") return effectiveDate.slice(0, 7);
  return effectiveDate;
}

/**
 * Changes a member's plan from `effectiveDate` and logs who did it and when.
 *
 * payload: { membershipType, packageMonths, fee, collectionTiming, effectiveDate,
 *            oldDues: "collect" | "waive", collectFirstTerm, mode, note }
 */
async function changeMemberPlan(gymId, memberId, payload, user) {
  const member = await repo().getMemberById(gymId, memberId);
  if (!member) throw createHttpError(404, "Member not found");
  const settings = await repo().getSettings(gymId);

  const next = readPlan(payload);
  const current = {
    membershipType: member.membershipType,
    packageMonths: member.packageMonths,
    fee: member.fee,
    // "" means "the gym default" — log what actually applied.
    collectionTiming: collectionTiming(member, settings),
  };
  if (samePlan(current, next)) throw createHttpError(400, "That is already this member's plan.");

  const today = todayKey();
  const effectiveDate = String(payload.effectiveDate || "");
  if (!DATE_KEY.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate))) {
    throw createHttpError(400, "Pick the date the new plan starts.");
  }
  const earliest = billingStartKey(member);
  const renewal = nextPeriodStartKey(member, settings);
  const latest = renewal > today ? renewal : today;
  if (effectiveDate < earliest) {
    throw createHttpError(400, `The new plan can't start before the current one did (${earliest}).`);
  }
  if (effectiveDate > latest) {
    throw createHttpError(400, `The new plan must start by the next renewal (${latest}).`);
  }

  const unsettled = unsettledPeriods(member, settings, effectiveDate);
  // Part-paid periods only owe what is left on them.
  const ledger = getPeriodLedger(member);
  const periodCharge = (period) => (ledger.has(period) ? ledger.get(period).charge : Number(member.fee || 0));
  const duesAmount = unsettled.reduce((sum, period) => sum + periodBalance(member, period, ledger), 0);
  const oldDues = ["collect", "waive"].includes(payload.oldDues) ? payload.oldDues : "";
  if (unsettled.length && !oldDues) {
    throw createHttpError(
      409,
      `${member.name} has ${rupees(duesAmount)} unpaid on the current plan. Collect it or waive it to change the plan.`,
    );
  }

  const mode = normalizePaymentMode(payload.mode) || "cash";
  const payments = [];
  if (unsettled.length && oldDues === "collect") {
    for (const period of unsettled) {
      payments.push({
        date: today,
        month: today.slice(0, 7),
        billingPeriod: period,
        amount: periodBalance(member, period, ledger),
        periodFee: periodCharge(period),
        mode,
      });
    }
  }
  let firstTermCollected = 0;
  if (payload.collectFirstTerm && next.collectionTiming === "at-join") {
    const key = firstPeriodKey(next, settings, effectiveDate);
    // Already paid (e.g. the same calendar month on a month-start gym): don't charge twice.
    const alreadyPaid = getPaidPeriodSet(member).has(key) || payments.some((payment) => payment.billingPeriod === key);
    if (!alreadyPaid) {
      const amount = Math.max(0, next.fee - (ledger.get(key)?.paid || 0));
      payments.push({ date: today, month: today.slice(0, 7), billingPeriod: key, amount, periodFee: next.fee, mode });
      firstTermCollected = amount;
    }
  }

  const change = {
    id: crypto.randomUUID(),
    memberId: member.id,
    memberName: member.name,
    memberCode: member.gymId,
    from: current,
    to: next,
    effectiveDate,
    duesCollected: oldDues === "collect" ? duesAmount : 0,
    duesWaived: oldDues === "waive" ? duesAmount : 0,
    firstTermCollected,
    note: String(payload.note || "").trim().slice(0, 200),
    changedBy: {
      id: String(user?.id || ""),
      name: String(user?.name || user?.email || "").slice(0, 160),
      role: String(user?.role || ""),
    },
    changedAt: nowIso(),
  };

  await repo().applyPlanChange(gymId, {
    member: { ...member, ...next, planStartDate: effectiveDate },
    previous: { ...member, collectionTiming: member.collectionTiming || "" },
    payments,
    change,
  });

  return {
    member: publicMember(await repo().getMemberById(gymId, member.id)),
    change,
    payments,
  };
}

async function listPlanChanges(gymId, { memberId = "" } = {}) {
  return repo().listPlanChanges(gymId, { memberId: String(memberId || "") });
}

module.exports = {
  changeMemberPlan,
  listPlanChanges,
};
