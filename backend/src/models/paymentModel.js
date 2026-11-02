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
    // The transaction (money received) this row allocates; "" on admission rows.
    transactionId: row.transaction_id || "",
  };
}

const iso = (value) => (value instanceof Date ? value.toISOString() : value ? String(value) : "");

// Oldest debt first: the opening balance, then terms in order. Rows of one
// payment share their date and entry time, so the table order says nothing.
const allocationOrder = (period) => (period === ADMISSION_PERIOD_KEY || period === "opening-balance" ? "" : period);
function sortAllocations(allocations) {
  return [...allocations].sort((a, b) => allocationOrder(a.billingPeriod).localeCompare(allocationOrder(b.billingPeriod)));
}

// A transaction as the admin panel sees it: the money received, how and when,
// who entered it, whether it was reversed or corrected, and what it paid.
function mapTransactionRow(row, allocations = []) {
  return {
    id: row.id,
    amount: Number(row.amount || 0),
    date: toDateKey(row.collected_on),
    dateKnown: Number(row.date_known) !== 0,
    mode: normalizePaymentMode(row.payment_mode),
    reference: row.reference || "",
    note: row.note || "",
    source: row.source,
    status: row.status,
    reversedAt: iso(row.reversed_at),
    reversedBy: row.reversed_by_id ? { id: row.reversed_by_id, name: row.reversed_by_name || "" } : null,
    reversalReason: row.reversal_reason || "",
    replacesId: row.replaces_id || "",
    replacedById: row.replaced_by_id || "",
    enteredBy: row.entered_by_id ? { id: row.entered_by_id, name: row.entered_by_name || "", role: row.entered_by_role || "" } : null,
    createdAt: iso(row.created_at),
    allocations: sortAllocations(allocations).map((allocation) => ({
      billingPeriod: allocation.billingPeriod,
      amount: allocation.amount,
      periodFee: allocation.periodFee,
      date: allocation.date,
    })),
  };
}

/**
 * Writes one transaction and its allocation rows on `conn` (the caller owns
 * the DB transaction). Each allocation becomes a `payments` row for its term,
 * dated with the collection date, or with its own term's start when the date
 * wasn't recorded, so reports file it in that term's month.
 *
 * tx: { id, amount, date, dateKnown, mode, reference, note, requestId, source,
 *       enteredBy: { id, name, role }, replacesId }
 * allocations: [{ billingPeriod, billingMonth, amount, periodFee, date }]
 */
async function insertTransaction(conn, gymId, memberId, tx, allocations) {
  const id = tx.id || crypto.randomUUID();
  await conn.execute(
    `INSERT INTO payment_transactions (id, tenant_id, member_id, amount, collected_on, date_known, payment_mode, reference, note,
       request_id, source, replaces_id, entered_by_id, entered_by_name, entered_by_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      gymId,
      memberId,
      tx.amount,
      tx.date,
      tx.dateKnown ? 1 : 0,
      normalizePaymentMode(tx.mode) || null,
      String(tx.reference || "").slice(0, 80),
      String(tx.note || "").slice(0, 300),
      tx.requestId || null,
      tx.source || "desk",
      tx.replacesId || null,
      tx.enteredBy?.id ? String(tx.enteredBy.id).slice(0, 64) : null,
      tx.enteredBy?.id ? String(tx.enteredBy.name || "").slice(0, 160) : null,
      tx.enteredBy?.id ? String(tx.enteredBy.role || "").slice(0, 32) : null,
    ],
  );
  for (const allocation of allocations) {
    const date = allocation.date || tx.date;
    await conn.execute(
      `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind,
         payment_mode, date_known, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'membership', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        memberId,
        date,
        date.slice(0, 7),
        allocation.billingMonth || "",
        allocation.billingPeriod,
        allocation.amount,
        allocation.periodFee,
        normalizePaymentMode(tx.mode) || null,
        tx.dateKnown ? 1 : 0,
        id,
      ],
    );
  }
  return id;
}

// Locks and reads one of this gym's transactions (with its allocations) on `conn`.
async function findTransaction(conn, gymId, memberId, id) {
  const [rows] = await conn.execute(
    "SELECT * FROM payment_transactions WHERE tenant_id = ? AND member_id = ? AND id = ? FOR UPDATE",
    [gymId, memberId, id],
  );
  if (!rows.length) return null;
  const [allocationRows] = await conn.execute("SELECT * FROM payments WHERE transaction_id = ? ORDER BY billing_period", [id]);
  return mapTransactionRow(rows[0], allocationRows.map(mapPaymentRow));
}

async function findTransactionByRequest(conn, gymId, requestId) {
  const [rows] = await conn.execute("SELECT id, member_id FROM payment_transactions WHERE tenant_id = ? AND request_id = ?", [
    gymId,
    requestId,
  ]);
  return rows[0] ? { id: rows[0].id, memberId: rows[0].member_id } : null;
}

// Marks a transaction reversed (who, when, why) and stops its allocations
// paying their terms. Conditional on it still being active, so two reversals
// racing each other can't both succeed.
async function reverseTransaction(conn, gymId, id, { by, reason, replacedById = null }) {
  const [result] = await conn.execute(
    `UPDATE payment_transactions
       SET status = 'reversed', reversed_at = NOW(), reversed_by_id = ?, reversed_by_name = ?, reversal_reason = ?, replaced_by_id = ?
     WHERE tenant_id = ? AND id = ? AND status = 'active'`,
    [String(by?.id || "").slice(0, 64), String(by?.name || "").slice(0, 160), reason.slice(0, 300), replacedById, gymId, id],
  );
  if (!result.affectedRows) return false;
  await conn.execute("UPDATE payments SET reversed_at = NOW() WHERE transaction_id = ?", [id]);
  return true;
}

// Edits method / reference / note in place, logging each changed field.
async function updateTransactionDetails(conn, gymId, tx, changes, by) {
  const columns = { mode: "payment_mode", reference: "reference", note: "note" };
  for (const [field, value] of Object.entries(changes)) {
    if (!columns[field]) continue;
    await conn.execute(`UPDATE payment_transactions SET ${columns[field]} = ? WHERE tenant_id = ? AND id = ?`, [
      field === "mode" ? value || null : value,
      gymId,
      tx.id,
    ]);
    await conn.execute(
      `INSERT INTO payment_corrections (id, tenant_id, transaction_id, field, old_value, new_value, changed_by_id, changed_by_name, changed_by_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        gymId,
        tx.id,
        field,
        String(tx[field] || ""),
        String(value || ""),
        String(by?.id || "").slice(0, 64),
        String(by?.name || "").slice(0, 160),
        String(by?.role || "").slice(0, 32),
      ],
    );
  }
  // Keep the allocation rows' mode in step: receipts read it from them.
  if ("mode" in changes) await conn.execute("UPDATE payments SET payment_mode = ? WHERE transaction_id = ?", [changes.mode || null, tx.id]);
}

// Fields changed in one edit share a timestamp: they are listed in the form's order.
async function listCorrections(gymId, transactionId) {
  const rows = await query(
    "SELECT * FROM payment_corrections WHERE tenant_id = ? AND transaction_id = ? ORDER BY changed_at, FIELD(field, 'mode', 'reference', 'note')",
    [gymId, transactionId],
  );
  return rows.map((row) => ({
    field: row.field,
    from: row.old_value,
    to: row.new_value,
    changedBy: { id: row.changed_by_id, name: row.changed_by_name, role: row.changed_by_role },
    changedAt: iso(row.changed_at),
  }));
}


// Keeps the member's single admission-fee payment row in step with
// members.admission_fee, so editing (or clearing) the fee never leaves a stale
// earning in the ledger. Dated on the member's start date — the day the gym
// collects the joining charge. A fee of 0 simply leaves no row.
//
// The row is updated in place, and only when the fee, its mode or the joining
// date really changed: an unrelated profile save leaves it exactly as recorded.
async function syncAdmissionPayment(member) {
  if (member.onboardingType === "existing") return syncRecordedAdmission(member);
  const amount = Number(member.admissionFee || 0);
  const rows = await query("SELECT * FROM payments WHERE member_id = ? AND kind = 'admission' ORDER BY created_at", [member.id]);
  if (!(amount > 0)) {
    if (rows.length) await exec("DELETE FROM payments WHERE member_id = ? AND kind = 'admission'", [member.id]);
    return;
  }
  const date = toDateKey(member.startDate || todayKey());
  const mode = normalizePaymentMode(member.admissionMode) || null;
  if (rows.length) {
    const row = rows[0];
    const changed =
      Number(row.amount) !== amount || toDateKey(row.payment_date) !== date || (mode !== null && mode !== row.payment_mode);
    if (changed) {
      await exec("UPDATE payments SET amount = ?, payment_date = ?, month_key = ?, payment_mode = COALESCE(?, payment_mode) WHERE id = ?", [
        amount,
        date,
        date.slice(0, 7),
        mode,
        row.id,
      ]);
    }
    return;
  }
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
  findTransaction,
  findTransactionByRequest,
  importPayment,
  insertTransaction,
  listCorrections,
  mapPaymentRow,
  mapTransactionRow,
  reverseTransaction,
  syncAdmissionPayment,
  updateTransactionDetails,
};
