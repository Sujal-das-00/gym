const crypto = require("crypto");
const { exec, getPool, query } = require("../config/database");
const { todayKey, toDateKey } = require("../utils/date");
const { ADMISSION_PERIOD_KEY, EXTRA_PERIOD_KEY } = require("../utils/billing");
const { normalizePaymentMode } = require("../utils/member");

function paymentKind(payment) {
  return ["admission", "other"].includes(payment?.kind) ? payment.kind : "membership";
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
    note: String(row.note || ""),
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

// Corrects one payment's amount. Every row of its term is restamped with the
// term's full fee so the term counts as paid only once its rows reach it.
async function updatePaymentAmount(member, paymentId, period, amount, periodFee) {
  await exec("UPDATE payments SET amount = ? WHERE id = ? AND member_id = ?", [amount, paymentId, member.id]);
  await exec("UPDATE payments SET period_fee = ? WHERE member_id = ? AND billing_period = ? AND kind = 'membership'", [
    periodFee,
    member.id,
    period,
  ]);
}

// Corrects the admission fee: its payment row and members.admission_fee
// together, so the profile and the ledger agree. updated_at on the member is
// kept, since this is a payment edit, not a profile edit (Daily Log).
async function updateAdmissionAmount(member, paymentId, amount) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("UPDATE payments SET amount = ? WHERE id = ? AND member_id = ? AND kind = 'admission'", [amount, paymentId, member.id]);
    await connection.execute("UPDATE members SET admission_fee = ?, updated_at = updated_at WHERE id = ?", [amount, member.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

// Sets the day a payment was collected; it counts as recorded from then on.
async function updatePaymentDate(member, paymentId, date) {
  await exec("UPDATE payments SET payment_date = ?, month_key = ?, date_known = 1 WHERE id = ? AND member_id = ?", [
    date,
    date.slice(0, 7),
    paymentId,
    member.id,
  ]);
}

// Extra money taken from a member, with the note saying what it was for. It
// pays no term, so billing is untouched (billing_period is the literal 'other').
async function addOtherPayment(member, { id, date, amount, mode, note }) {
  await exec(
    `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode, note)
     VALUES (?, ?, ?, ?, '', ?, ?, NULL, 'other', ?, ?)`,
    [id || crypto.randomUUID(), member.id, date, date.slice(0, 7), EXTRA_PERIOD_KEY, amount, normalizePaymentMode(mode) || null, note],
  );
}

async function deletePayment(member, paymentId) {
  await exec("DELETE FROM payments WHERE id = ? AND member_id = ? AND kind IN ('membership', 'other')", [paymentId, member.id]);
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
  addOtherPayment,
  addPayments,
  deletePayment,
  updateAdmissionAmount,
  updatePaymentAmount,
  updatePaymentDate,
  importPayment,
  mapPaymentRow,
  syncAdmissionPayment,
};
