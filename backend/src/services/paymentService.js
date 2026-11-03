const { normalizePaymentMode } = require("../utils/member");
const {
  EXTRA_PERIOD_KEY,
  OPENING_PERIOD_KEY,
  getBillingPeriodKeys,
  getPeriodLedger,
  openingBalanceDue,
  paymentPeriodKey,
} = require("../utils/billing");
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
 * An existing member's opening balance is paid the same way, with the
 * "opening-balance" key and whatever is left of that balance as its charge.
 */
function preparePeriodPayments(member, payments) {
  if (!payments.length) throw createHttpError(400, "Choose what this payment is for.");
  const ledger = getPeriodLedger(member);
  const left = new Map();
  return payments.map((payment) => {
    if (payment?.kind === "admission") throw createHttpError(400, "The admission fee is set on the member's profile.");
    const period = String(paymentPeriodKey(payment || {}) || "");
    if (!period) throw createHttpError(400, "Choose what this payment is for.");
    const opening = period === OPENING_PERIOD_KEY;
    if (opening && !left.has(period) && !(openingBalanceDue(member) > 0)) {
      throw createHttpError(409, "The opening balance is already cleared. Reload to see the latest.");
    }
    const entry = opening ? null : ledger.get(period);
    if (entry?.settled) throw createHttpError(409, `${period} is already paid in full. Reload to see the latest.`);

    const charge = opening ? Number(member.openingBalance || 0) : entry ? entry.charge : Number(member.fee || 0);
    const owed = opening ? openingBalanceDue(member) : roundRupees(charge - (entry?.paid || 0));
    const remaining = left.has(period) ? left.get(period) : owed;
    const amount = payment.amount === undefined || payment.amount === null || payment.amount === "" ? remaining : roundRupees(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw createHttpError(400, "Enter the amount received.");
    if (amount === 0 && remaining > 0) throw createHttpError(400, "Enter the amount received.");
    if (amount > remaining) {
      const what = opening ? "the opening balance" : period;
      throw createHttpError(400, `${rupees(amount)} is more than the ${rupees(remaining)} left on ${what}.`);
    }
    left.set(period, roundRupees(remaining - amount));

    return {
      ...payment,
      kind: "membership",
      billingPeriod: period,
      billingMonth: opening ? "" : payment.billingMonth,
      amount,
      periodFee: charge,
      mode: normalizePaymentMode(payment.mode) || "cash",
    };
  });
}

// The membership payment being corrected or removed, or an HTTP error saying
// why it can't be. Admission fees are managed on the member's profile, and a
// term from before a plan change or opening-balance cut-over is no longer
// billed, so changing its payment would erase that debt without a trace.
function findEditablePayment(member, paymentId, settings) {
  const payment = (member.payments || []).find((item) => item.id === paymentId);
  if (!payment) throw createHttpError(404, "Payment not found. Reload to see the latest.");
  if (payment.kind === "admission") throw createHttpError(400, "The admission fee is changed on the member's profile.");
  // An extra payment belongs to no term, so a plan change can't close it.
  if (payment.kind === "other") return { payment, period: EXTRA_PERIOD_KEY };
  const period = String(paymentPeriodKey(payment) || "");
  if (period !== OPENING_PERIOD_KEY && !getBillingPeriodKeys(member, settings).includes(period)) {
    throw createHttpError(409, "This payment is for a period closed by a plan change, so it can't be edited or deleted.");
  }
  return { payment, period };
}

/**
 * A corrected amount for one payment. The term keeps its full fee, so paying
 * less than the fee leaves the rest due (a part payment), exactly as when it
 * was first entered. The amount can't push the term past its fee.
 */
function prepareAmountEdit(member, paymentId, rawAmount, settings) {
  const { payment, period } = findEditablePayment(member, paymentId, settings);
  if (payment.kind === "other") {
    throw createHttpError(400, "An extra payment can't be edited. Delete it and record it again.");
  }
  const amount = roundRupees(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw createHttpError(400, "Enter the amount received, or delete the payment.");

  const others = (member.payments || []).filter(
    (item) => item.id !== payment.id && item.kind !== "admission" && String(paymentPeriodKey(item) || "") === period,
  );
  const charge =
    payment.periodFee !== null && payment.periodFee !== undefined
      ? payment.periodFee
      : Math.max(Number(member.fee || 0), payment.amount);
  const room = roundRupees(charge - others.reduce((sum, item) => sum + item.amount, 0));
  if (amount > room) {
    throw createHttpError(400, `${rupees(amount)} is more than the ${rupees(room)} this payment can take (fee ${rupees(charge)}).`);
  }
  return { payment, period, amount, periodFee: charge };
}

/**
 * The day a payment was collected: filled in for a payment entered without
 * one, or corrected (owners only, see the route). Admission fees included: a
 * recorded admission row is never rewritten by profile saves. The date can't
 * be before the member joined or in the future.
 */
function prepareDateEdit(member, paymentId, rawDate, today) {
  const payment = (member.payments || []).find((item) => item.id === paymentId);
  if (!payment) throw createHttpError(404, "Payment not found. Reload to see the latest.");
  const date = String(rawDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw createHttpError(400, "Enter the date this was paid.");
  if (date > today) throw createHttpError(400, "A payment can't be dated in the future.");
  if (date < String(member.startDate).slice(0, 10)) throw createHttpError(400, "A payment can't be dated before the joining date.");
  return { payment, date };
}

const MAX_ADMISSION_FEE = 1000000;

/**
 * A corrected admission fee. It belongs to no term, so only its amount changes
 * (members.admission_fee follows it). It can't be cleared here: a fee that was
 * never collected is simply not recorded.
 */
function prepareAdmissionEdit(member, paymentId, rawAmount) {
  const payment = (member.payments || []).find((item) => item.id === paymentId);
  if (!payment) throw createHttpError(404, "Payment not found. Reload to see the latest.");
  if (payment.kind !== "admission") throw createHttpError(400, "This is not the admission fee.");
  const amount = roundRupees(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw createHttpError(400, "Enter the admission fee received.");
  if (amount > MAX_ADMISSION_FEE) throw createHttpError(400, `${rupees(amount)} looks too large. Check the amount.`);
  return { payment, amount };
}

const NOTE_MIN = 3;
const NOTE_MAX = 160;
const MAX_EXTRA_AMOUNT = 1000000;

/**
 * An extra payment taken from a member: supplements, a part payment while up
 * to date, anything that is not a term or the admission fee. It is dated today
 * and pays no term, so it can't change what the member owes. The note, saying
 * what it was for, is required.
 */
function prepareOtherPayment(body, today) {
  const amount = roundRupees(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw createHttpError(400, "Enter the amount received.");
  if (amount > MAX_EXTRA_AMOUNT) throw createHttpError(400, `${rupees(amount)} looks too large. Check the amount.`);
  const note = String(body?.note ?? "").replace(/\s+/g, " ").trim();
  if (note.length < NOTE_MIN) throw createHttpError(400, "Add a note saying what this payment is for.");
  if (note.length > NOTE_MAX) throw createHttpError(400, `Keep the note under ${NOTE_MAX} characters.`);
  return { date: today, amount, note, mode: normalizePaymentMode(body?.mode) || "cash" };
}

module.exports = {
  findEditablePayment,
  preparePeriodPayments,
  prepareAdmissionEdit,
  prepareAmountEdit,
  prepareDateEdit,
  prepareOtherPayment,
  NOTE_MAX,
  NOTE_MIN,
};
