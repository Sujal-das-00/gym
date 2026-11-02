const crypto = require("crypto");
const { exec, query } = require("../config/database");
const { todayKey, toDateKey } = require("../utils/date");
const { ADMISSION_PERIOD_KEY } = require("../utils/billing");
const { normalizePaymentMode } = require("../utils/member");

function paymentKind(payment) {
  return payment?.kind === "admission" ? "admission" : "membership";
}

function mapPaymentRow(row) {
  return {
    id: row.id,
    date: toDateKey(row.payment_date),
    month: row.month_key,
    billingMonth: row.billing_month || "",
    billingPeriod: row.billing_period,
    amount: Number(row.amount || 0),
    // The period's full fee when this was taken; null on rows from before part
    // payments, each of which paid its period in full (see getPeriodLedger).
    periodFee: row.period_fee === null || row.period_fee === undefined ? null : Number(row.period_fee),
    kind: paymentKind(row),
    mode: normalizePaymentMode(row.payment_mode),
    // false: entered later without its collection date (date = term start).
    dateKnown: row.date_known === undefined || row.date_known === null ? true : Number(row.date_known) !== 0,
  };
}

async function addPayments(member, payments = []) {
  for (const payment of payments) {
    const billingPeriod = String(payment.billingPeriod || payment.billingMonth || payment.month || todayKey().slice(0, 7));
    await exec(
      `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id || crypto.randomUUID(),
        member.id,
        toDateKey(payment.date || todayKey()),
        String(payment.month || todayKey().slice(0, 7)),
        String(payment.billingMonth || (billingPeriod.length === 7 ? billingPeriod : "")),
        billingPeriod,
        Number(payment.amount ?? member.fee ?? 0),
        Number(payment.periodFee ?? member.fee ?? 0),
        paymentKind(payment),
        normalizePaymentMode(payment.mode) || null,
      ],
    );
  }
}

// Keeps the member's single admission-fee payment row in step with
// members.admission_fee, so editing (or clearing) the fee never leaves a stale
// earning in the ledger. Dated on the member's start date — the day the gym
// collects the joining charge. A fee of 0 simply leaves no row.
async function syncAdmissionPayment(member) {
  if (member.onboardingType === "existing") return syncRecordedAdmission(member);
  await exec("DELETE FROM payments WHERE member_id = ? AND kind = 'admission'", [member.id]);
  const amount = Number(member.admissionFee || 0);
  if (!(amount > 0)) return;
  const date = toDateKey(member.startDate || todayKey());
  await exec(
    `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, kind, payment_mode)
     VALUES (?, ?, ?, ?, '', ?, ?, 'admission', ?)`,
    [
      crypto.randomUUID(),
      member.id,
      date,
      date.slice(0, 7),
      ADMISSION_PERIOD_KEY,
      amount,
      normalizePaymentMode(member.admissionMode) || null,
    ],
  );
}

// An existing member's admission row records when the fee was really collected
// (or that the date wasn't recorded), so profile edits only change its amount
// and mode, never its date. A fee added later has no known collection date.
async function syncRecordedAdmission(member) {
  const amount = Number(member.admissionFee || 0);
  if (!(amount > 0)) {
    await exec("DELETE FROM payments WHERE member_id = ? AND kind = 'admission'", [member.id]);
    return;
  }
  const mode = normalizePaymentMode(member.admissionMode) || null;
  const rows = await query("SELECT id FROM payments WHERE member_id = ? AND kind = 'admission' LIMIT 1", [member.id]);
  if (rows.length) {
    await exec("UPDATE payments SET amount = ?, payment_mode = COALESCE(?, payment_mode) WHERE id = ?", [amount, mode, rows[0].id]);
    return;
  }
  const date = toDateKey(member.startDate || todayKey());
  await exec(
    `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, kind, payment_mode, date_known)
     VALUES (?, ?, ?, ?, '', ?, ?, 'admission', ?, 0)`,
    [crypto.randomUUID(), member.id, date, date.slice(0, 7), ADMISSION_PERIOD_KEY, amount, mode],
  );
}

async function importPayment(member, payment) {
  const billingPeriod = payment.billingPeriod || payment.month || todayKey().slice(0, 7);
  await exec(
    `INSERT IGNORE INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id || crypto.randomUUID(),
      member.id,
      toDateKey(payment.date),
      payment.month || todayKey().slice(0, 7),
      payment.billingMonth || "",
      billingPeriod,
      Number(payment.amount || member.fee || 0),
      payment.periodFee === null || payment.periodFee === undefined ? null : Number(payment.periodFee),
      paymentKind(payment),
      normalizePaymentMode(payment.mode) || null,
    ],
  );
}

module.exports = {
  addPayments,
  importPayment,
  mapPaymentRow,
  syncAdmissionPayment,
};
