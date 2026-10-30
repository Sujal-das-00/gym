const { normalizePaymentMode } = require("../utils/member");
const { getPeriodLedger, paymentPeriodKey } = require("../utils/billing");
const { createHttpError } = require("../utils/http");

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const roundRupees = (amount) => Math.round(Number(amount) * 100) / 100;

/**
 * Checks fee payments from the desk against what each period still owes, and
 * stamps every row with the period's full fee (periodFee). That is what lets a
 * period be paid in parts: it counts as paid once its rows add up to the fee.
 *
 * A payment without an amount pays whatever is left on its period. Several
 * rows for the same period in one request are checked against each other.
 */
function preparePeriodPayments(member, payments) {
  if (!payments.length) throw createHttpError(400, "Choose what this payment is for.");
  const ledger = getPeriodLedger(member);
  const left = new Map();
  return payments.map((payment) => {
    if (payment?.kind === "admission") throw createHttpError(400, "The admission fee is set on the member's profile.");
    const period = String(paymentPeriodKey(payment || {}) || "");
    if (!period) throw createHttpError(400, "Choose what this payment is for.");
    const entry = ledger.get(period);
    if (entry?.settled) throw createHttpError(409, `${period} is already paid in full. Reload to see the latest.`);

    const charge = entry ? entry.charge : Number(member.fee || 0);
    const remaining = left.has(period) ? left.get(period) : roundRupees(charge - (entry?.paid || 0));
    const amount = payment.amount === undefined || payment.amount === null || payment.amount === "" ? remaining : roundRupees(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw createHttpError(400, "Enter the amount received.");
    if (amount === 0 && remaining > 0) throw createHttpError(400, "Enter the amount received.");
    if (amount > remaining) {
      throw createHttpError(400, `${rupees(amount)} is more than the ${rupees(remaining)} left on ${period}.`);
    }
    left.set(period, roundRupees(remaining - amount));

    return {
      ...payment,
      kind: "membership",
      billingPeriod: period,
      amount,
      periodFee: charge,
      mode: normalizePaymentMode(payment.mode) || "cash",
    };
  });
}

module.exports = { preparePeriodPayments };
