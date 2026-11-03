/**
 * The gym's activity record (Daily Log): every action taken in the admin
 * panel, written right after it succeeds, with who did it and what changed.
 *
 * A failed write here never fails the action itself (the payment or edit has
 * already been saved); it is reported in the server log instead.
 */
const { repo } = require("../models");

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

function planOf(member) {
  return {
    membershipType: member?.membershipType === "package" ? "package" : "monthly",
    packageMonths: Number(member?.packageMonths || 1),
    fee: Number(member?.fee || 0),
    collectionTiming: member?.collectionTiming || "",
  };
}

// One payment row as the log keeps it.
function paymentLine(payment) {
  return {
    kind: payment.billingPeriod === "opening-balance" ? "opening-balance" : payment.kind || "membership",
    period: String(payment.billingPeriod || ""),
    amount: round(payment.amount),
    periodFee: payment.periodFee === null || payment.periodFee === undefined ? null : round(payment.periodFee),
    date: String(payment.date || "").slice(0, 10),
    dateKnown: payment.dateKnown !== false,
    mode: payment.mode || "",
    note: payment.note || "",
  };
}

/** Fields that changed between two versions of a record: [{ field, from, to }]. */
function changes(before, after, fields) {
  return fields
    .filter((field) => String(before?.[field] ?? "") !== String(after?.[field] ?? ""))
    .map((field) => ({ field, from: before?.[field] ?? "", to: after?.[field] ?? "" }));
}

async function record(gymId, user, action, { member = null, amount = null, details = {} } = {}) {
  try {
    await repo().insertActivity(gymId, {
      at: Date.now(),
      action,
      memberId: member?.id || "",
      memberName: member?.name || "",
      memberCode: member?.gymId || "",
      actor: user?.id ? { id: user.id, name: user.name || user.email || "", role: user.role || "" } : null,
      amount: amount === null ? null : round(amount),
      details,
    });
  } catch (error) {
    console.warn(`Activity record not written (${action}):`, error.message);
  }
}

module.exports = { changes, paymentLine, planOf, record };
