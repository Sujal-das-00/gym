const crypto = require("crypto");
const { nowIso, todayKey } = require("../utils/date");
const { normalizePaymentMode, publicMember } = require("../utils/member");
const {
  classifyPlanChange,
  collectionTiming,
  getPaidPeriodSet,
  getPeriodLedger,
  isMembershipExpired,
  periodBalance,
  planChangeProblem,
  termKeyFor,
  unsettledBeforeChange,
} = require("../utils/billing");
const { createHttpError } = require("../utils/http");
const { buildMembershipHistory } = require("../utils/membershipHistory");
const { repo } = require("../models");

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_ID = /^[A-Za-z0-9-]{8,36}$/;
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const round2 = (amount) => Math.round(Number(amount) * 100) / 100;

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

const actor = (user) => ({
  id: String(user?.id || ""),
  name: String(user?.name || user?.email || "").slice(0, 160),
  role: String(user?.role || ""),
});

/**
 * Changes a member's plan from `effectiveDate`, or restarts the same plan on
 * a new cycle after a lapse, and logs who did it and when.
 *
 * payload: { membershipType, packageMonths, fee, collectionTiming, effectiveDate,
 *            oldDues: "collect" | "waive" | "carry", collectFirstTerm, mode, note,
 *            requestId, restart }
 *
 * The member row is locked for the whole read-check-write (as for payments),
 * so a desk payment can't land on a term while it is being collected, waived
 * or kept here; a retried submit (same requestId) returns the first change.
 *
 * Rules (Phase 3): never earlier than the current term, never re-planning a
 * term that has money on it, downgrades only at the next renewal, no
 * proration (an immediate change starts a new cycle at the full new fee).
 * Unpaid old-plan terms before the new start are collected, waived (itemised
 * in the log) or kept as balance due, by an explicit choice.
 */
async function changeMemberPlan(gymId, memberId, payload, user) {
  const settings = await repo().getSettings(gymId);
  const restart = payload.restart === true;
  const requestId = payload.requestId ? String(payload.requestId) : null;
  if (requestId && !REQUEST_ID.test(requestId)) throw createHttpError(400, "Invalid request id.");
  const effectiveDate = String(payload.effectiveDate || "");
  if (!DATE_KEY.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate))) {
    throw createHttpError(400, restart ? "Pick the date the member is starting again." : "Pick the date the new plan starts.");
  }

  const result = await repo().withMemberLock(gymId, memberId, async (conn, member) => {
    if (requestId) {
      const earlier = await repo().findPlanChangeByRequest(conn, gymId, requestId);
      if (earlier) {
        if (earlier.memberId !== member.id) throw createHttpError(409, "This change was already saved for another member.");
        return { changeId: earlier.id, payments: [], repeated: true };
      }
    }

    const current = {
      membershipType: member.membershipType,
      packageMonths: member.packageMonths,
      fee: member.fee,
      // "" means "the gym default" — log what actually applied.
      collectionTiming: collectionTiming(member, settings),
    };
    let next;
    if (restart) {
      if (!isMembershipExpired(member, settings)) {
        throw createHttpError(400, `${member.name}'s membership hasn't lapsed. Restart is for members coming back after a break.`);
      }
      next = { ...current };
    } else {
      next = readPlan(payload);
      if (samePlan(current, next)) {
        throw createHttpError(
          400,
          isMembershipExpired(member, settings)
            ? "That is already this member's plan. To start a new cycle after a lapse, use Restart membership."
            : "That is already this member's plan.",
        );
      }
    }
    const changeType = restart ? "restart" : classifyPlanChange(current, next, settings);

    const problem = planChangeProblem(member, settings, { plan: next, effectiveDate, restart });
    if (problem) throw createHttpError(400, problem);

    const today = todayKey();
    const firstKey = termKeyFor(next, settings, effectiveDate);
    const unsettled = unsettledBeforeChange(member, settings, effectiveDate, firstKey);
    // Part-paid periods only owe what is left on them.
    const ledger = getPeriodLedger(member);
    const periodCharge = (period) => (ledger.has(period) ? ledger.get(period).charge : Number(member.fee || 0));
    const dues = unsettled.map((period) => ({ period, fee: periodCharge(period), balance: periodBalance(member, period, ledger) }));
    const duesAmount = round2(dues.reduce((sum, due) => sum + due.balance, 0));
    const oldDues = ["collect", "waive", "carry"].includes(payload.oldDues) ? payload.oldDues : "";
    if (unsettled.length && !oldDues) {
      throw createHttpError(
        409,
        `${member.name} has ${rupees(duesAmount)} unpaid on the current plan. Choose to collect it, waive it or keep it as balance due.`,
      );
    }

    const mode = normalizePaymentMode(payload.mode) || "cash";
    const payments = [];
    if (unsettled.length && oldDues === "collect") {
      for (const due of dues) {
        payments.push({ date: today, month: today.slice(0, 7), billingPeriod: due.period, amount: due.balance, periodFee: due.fee, mode });
      }
    }
    let firstTermCollected = 0;
    if (payload.collectFirstTerm && next.collectionTiming === "at-join") {
      // Already paid (only possible for an old plan's ₹0 record): don't charge twice.
      const alreadyPaid = getPaidPeriodSet(member).has(firstKey) || payments.some((payment) => payment.billingPeriod === firstKey);
      if (!alreadyPaid) {
        const amount = round2(Math.max(0, next.fee - (ledger.get(firstKey)?.paid || 0)));
        payments.push({ date: today, month: today.slice(0, 7), billingPeriod: firstKey, amount, periodFee: next.fee, mode });
        firstTermCollected = amount;
      }
    }

    const listed = (choice) => (oldDues === choice ? dues : []);
    const change = {
      id: crypto.randomUUID(),
      memberId: member.id,
      memberName: member.name,
      memberCode: member.gymId,
      from: current,
      to: next,
      effectiveDate,
      changeType,
      requestId,
      duesCollected: oldDues === "collect" ? duesAmount : 0,
      duesWaived: oldDues === "waive" ? duesAmount : 0,
      duesCarried: oldDues === "carry" ? duesAmount : 0,
      duesDetail: {
        collected: listed("collect").map((due) => ({ period: due.period, fee: due.fee, amount: due.balance })),
        waived: listed("waive"),
        carried: listed("carry"),
      },
      firstTermCollected,
      note: String(payload.note || "").trim().slice(0, 200),
      changedBy: actor(user),
      changedAt: nowIso(),
    };

    await repo().applyPlanChange(conn, gymId, {
      member: { ...member, ...next, planStartDate: effectiveDate },
      previous: { ...member, collectionTiming: member.collectionTiming || "" },
      payments,
      change,
    });
    return { changeId: change.id, payments, repeated: false };
  });

  return {
    member: publicMember(await repo().getMemberById(gymId, memberId)),
    change: await repo().getPlanChange(gymId, result.changeId),
    payments: result.payments,
    repeated: result.repeated,
  };
}

async function listPlanChanges(gymId, { memberId = "" } = {}) {
  return repo().listPlanChanges(gymId, { memberId: String(memberId || "") });
}

// Joined, renewals, changes and restarts, oldest first (see utils/membershipHistory.js).
async function getMembershipHistory(gymId, memberId) {
  const member = await repo().getMemberById(gymId, memberId);
  if (!member) throw createHttpError(404, "Member not found");
  const settings = await repo().getSettings(gymId);
  const changes = await repo().listPlanChanges(gymId, { memberId: member.id });
  return buildMembershipHistory(member, changes, settings);
}

module.exports = {
  changeMemberPlan,
  getMembershipHistory,
  listPlanChanges,
};
