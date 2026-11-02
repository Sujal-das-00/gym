const crypto = require("crypto");
const { exec, getPool, query } = require("../config/database");
const { toDateKey, todayKey } = require("../utils/date");
const { normalizeMember, normalizePaymentMode, normalizePhone } = require("../utils/member");
const { insertTransaction, mapPaymentRow, mapTransactionRow } = require("./paymentModel");

const CHUNK = 500;
const placeholders = (n) => new Array(n).fill("?").join(",");

// Builds full members from rows with three queries per chunk of members, however many
// members there are (the old per-member version ran three queries each, all at once).
async function hydrateMembers(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const ids = slice.map((row) => row.id);
    const marks = placeholders(ids.length);
    const [attendanceRows, paymentRows, expiredRows, transactionRows, duesRows] = await Promise.all([
      query(`SELECT member_id, attendance_date FROM attendance WHERE member_id IN (${marks}) ORDER BY attendance_date`, ids),
      query(`SELECT * FROM payments WHERE member_id IN (${marks}) ORDER BY payment_date, created_at`, ids),
      query(`SELECT member_id, checkin_date FROM checkins WHERE member_id IN (${marks}) AND expired = 1 ORDER BY checkin_date`, ids),
      query(`SELECT * FROM payment_transactions WHERE member_id IN (${marks}) ORDER BY collected_on, created_at`, ids),
      query(`SELECT id, member_id, dues_detail FROM member_plan_changes WHERE member_id IN (${marks}) AND dues_detail IS NOT NULL`, ids),
    ]);
    const group = (list, map) => {
      const byMember = new Map();
      for (const item of list) {
        if (!byMember.has(item.member_id)) byMember.set(item.member_id, []);
        byMember.get(item.member_id).push(map(item));
      }
      return byMember;
    };
    const attendance = group(attendanceRows, (item) => toDateKey(item.attendance_date));
    const expired = group(expiredRows, (item) => toDateKey(item.checkin_date));
    // A reversed payment's rows stay in the table for the record but no longer
    // pay anything: billing, reports, reminders and the member app all read
    // `payments`, so leaving them out here is what makes a reversal count.
    const payments = group(
      paymentRows.filter((row) => !row.reversed_at),
      mapPaymentRow,
    );
    const allocationsByTransaction = new Map();
    for (const row of paymentRows) {
      if (!row.transaction_id) continue;
      if (!allocationsByTransaction.has(row.transaction_id)) allocationsByTransaction.set(row.transaction_id, []);
      allocationsByTransaction.get(row.transaction_id).push(mapPaymentRow(row));
    }
    const transactions = group(transactionRows, (row) => mapTransactionRow(row, allocationsByTransaction.get(row.id) || []));
    // Old-plan terms plan changes kept as balance due: still owed, so billing needs them.
    const carriedTerms = new Map();
    for (const row of duesRows) {
      for (const term of readDuesDetail(row.dues_detail).carried) {
        if (!carriedTerms.has(row.member_id)) carriedTerms.set(row.member_id, []);
        carriedTerms.get(row.member_id).push({ period: term.period, fee: term.fee, changeId: row.id });
      }
    }
    for (const row of slice) {
      out.push(
        normalizeMember({
          id: row.id,
          gymId: row.gym_id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          fee: row.fee,
          admissionFee: row.admission_fee,
          membershipType: row.membership_type,
          packageMonths: row.package_months,
          collectionTiming: row.collection_timing,
          startDate: row.start_date,
          planStartDate: row.plan_start_date || "",
          onboardingType: row.onboarding_type,
          openingBalance: row.opening_balance,
          openingBalanceAdmission: row.opening_balance_admission,
          billingCutover: row.billing_cutover || "",
          photo: row.photo,
          trainerId: row.trainer_id || "",
          createdAt: row.created_at,
          attendance: attendance.get(row.id) || [],
          expiredCheckins: expired.get(row.id) || [],
          payments: payments.get(row.id) || [],
          transactions: transactions.get(row.id) || [],
          carriedTerms: carriedTerms.get(row.id) || [],
        }),
      );
    }
  }
  return out;
}

async function hydrateMember(row) {
  return row ? (await hydrateMembers([row]))[0] : null;
}

async function getAllMembers(gymId) {
  const rows = await query("SELECT * FROM members WHERE tenant_id = ? AND archived_at IS NULL ORDER BY name", [gymId]);
  return hydrateMembers(rows);
}

async function getMemberById(gymId, id) {
  const rows = await query("SELECT * FROM members WHERE tenant_id = ? AND id = ? AND archived_at IS NULL", [gymId, id]);
  return hydrateMember(rows[0]);
}

async function findMember(gymId, identifier) {
  const value = String(identifier || "").trim();
  const phone = normalizePhone(value) || value;
  const rows = await query(
    "SELECT * FROM members WHERE tenant_id = ? AND archived_at IS NULL AND (LOWER(id) = LOWER(?) OR LOWER(gym_id) = LOWER(?) OR phone = ?) LIMIT 1",
    [gymId, value, value, phone],
  );
  return hydrateMember(rows[0]);
}

// Unlike findMember (OR-match, used by kiosk check-in), login requires BOTH the
// membership code and the phone to match the same member — two factors, not one.
async function findMemberByCredentials(gymId, gymCode, phone) {
  const code = String(gymCode || "").trim();
  const normalizedPhone = normalizePhone(phone);
  if (!code || !normalizedPhone) return null;
  const rows = await query(
    "SELECT * FROM members WHERE tenant_id = ? AND archived_at IS NULL AND LOWER(gym_id) = LOWER(?) AND phone = ? LIMIT 1",
    [gymId, code, normalizedPhone],
  );
  return hydrateMember(rows[0]);
}

async function saveMember(gymId, member) {
  await exec(
    `INSERT INTO members (id, tenant_id, gym_id, name, phone, address, fee, admission_fee, membership_type, package_months, collection_timing, start_date, plan_start_date, photo, trainer_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gym_id = VALUES(gym_id), name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
       fee = VALUES(fee), admission_fee = VALUES(admission_fee), membership_type = VALUES(membership_type),
       package_months = VALUES(package_months), collection_timing = VALUES(collection_timing),
       start_date = VALUES(start_date), plan_start_date = VALUES(plan_start_date), photo = VALUES(photo), trainer_id = VALUES(trainer_id)`,
    [member.id, gymId, member.gymId, member.name, member.phone, member.address, member.fee, member.admissionFee, member.membershipType, member.packageMonths, member.collectionTiming || "", member.startDate, member.planStartDate || null, member.photo, member.trainerId || "", member.createdAt],
  );
  return getMemberById(gymId, member.id);
}

/**
 * Adds an existing member together with their reconciled history (past term
 * payments and an optional admission row) in one transaction. A duplicate
 * phone or gym code fails the member INSERT and rolls everything back, so a
 * double submit can never leave a second member or extra payments behind.
 */
async function createMemberWithHistory(gymId, member, payments, enteredBy = null) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO members (id, tenant_id, gym_id, name, phone, address, fee, admission_fee, membership_type, package_months,
         collection_timing, start_date, plan_start_date, onboarding_type, opening_balance, opening_balance_admission,
         billing_cutover, photo, trainer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'existing', ?, ?, ?, ?, ?, ?)`,
      [
        member.id,
        gymId,
        member.gymId,
        member.name,
        member.phone,
        member.address,
        member.fee,
        member.admissionFee,
        member.membershipType,
        member.packageMonths,
        member.collectionTiming || "",
        member.startDate,
        member.openingBalance,
        member.openingBalanceAdmission,
        member.billingCutover || null,
        member.photo,
        member.trainerId || "",
        member.createdAt,
      ],
    );
    for (const payment of payments) {
      if (payment.kind !== "admission") {
        // Each past term the admin marked paid was its own collection.
        await insertTransaction(
          connection,
          gymId,
          member.id,
          { ...payment, source: "onboarding", enteredBy },
          [{ ...payment, date: payment.date }],
        );
        continue;
      }
      await connection.execute(
        `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode, date_known)
         VALUES (?, ?, ?, ?, '', ?, ?, NULL, 'admission', ?, ?)`,
        [
          crypto.randomUUID(),
          member.id,
          payment.date,
          payment.date.slice(0, 7),
          payment.billingPeriod,
          payment.amount,
          normalizePaymentMode(payment.mode) || null,
          payment.dateKnown ? 1 : 0,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  return getMemberById(gymId, member.id);
}

/**
 * Runs `work` with this member's row locked (SELECT … FOR UPDATE) inside one
 * DB transaction, so two payments, corrections or reversals for the same
 * member can never interleave: the second waits, then reads what the first
 * committed. Balances are read from `member` (loaded after the lock); every
 * write goes through `conn`, and all of it commits or rolls back together.
 */
async function withMemberLock(gymId, memberId, work) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [locked] = await conn.execute(
      "SELECT id FROM members WHERE tenant_id = ? AND id = ? AND archived_at IS NULL FOR UPDATE",
      [gymId, memberId],
    );
    if (!locked.length) {
      const error = new Error("Member not found");
      error.status = 404;
      throw error;
    }
    const member = await getMemberById(gymId, memberId);
    const result = await work(conn, member);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// One transaction written on its own (a new member's first term at joining).
async function addTransaction(gymId, memberId, tx, allocations) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const id = await insertTransaction(conn, gymId, memberId, tx, allocations);
    await conn.commit();
    return id;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// Moves a member's joining date and re-keys their paid terms to the new
// schedule (moves: Map<paymentId, periodKey> from shiftedPaymentPeriods) in one
// transaction, so the date and the payments can never disagree.
async function moveMemberStartDate(gymId, memberId, startDate, moves) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("UPDATE members SET start_date = ? WHERE tenant_id = ? AND id = ?", [startDate, gymId, memberId]);
    // A payment whose collection date was never recorded is filed under its
    // term's start (date_known = 0), so that date moves with the term. A
    // recorded collection date never changes.
    for (const [paymentId, period] of moves) {
      await connection.execute(
        `UPDATE payments SET billing_period = ?, month_key = ?, payment_date = IF(date_known = 0, ?, payment_date)
         WHERE id = ? AND member_id = ? AND kind = 'membership'`,
        [period, period.slice(0, 7), period, paymentId, memberId],
      );
    }
    // An undated transaction is filed under its earliest term, which just moved.
    await connection.execute(
      `UPDATE payment_transactions t
         SET t.collected_on = (SELECT MIN(p.payment_date) FROM payments p WHERE p.transaction_id = t.id)
       WHERE t.tenant_id = ? AND t.member_id = ? AND t.date_known = 0
         AND EXISTS (SELECT 1 FROM payments p WHERE p.transaction_id = t.id)`,
      [gymId, memberId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

// Archives rather than deletes: the member disappears from the panel, check-in and
// login, but the row and their payment/attendance history stay in the database.
async function deleteMember(gymId, id) {
  return exec("UPDATE members SET archived_at = NOW() WHERE tenant_id = ? AND id = ? AND archived_at IS NULL", [gymId, id]);
}

// Unassign a removed trainer from every member who had them (archived ones too).
async function clearTrainerFromMembers(gymId, trainerId) {
  return exec("UPDATE members SET trainer_id = '' WHERE tenant_id = ? AND trainer_id = ?", [gymId, trainerId]);
}

async function countMembers(gymId) {
  const rows = await query("SELECT COUNT(*) AS count FROM members WHERE tenant_id = ? AND archived_at IS NULL", [gymId]);
  return Number(rows[0]?.count || 0);
}

// dues_detail as stored (mysql2 returns JSON columns parsed; be tolerant of text).
function readDuesDetail(value) {
  let detail = value;
  if (typeof detail === "string") {
    try {
      detail = JSON.parse(detail);
    } catch {
      detail = null;
    }
  }
  const list = (key) => (Array.isArray(detail?.[key]) ? detail[key].filter((term) => term && term.period) : []);
  return { collected: list("collected"), waived: list("waived"), carried: list("carried") };
}

function mapPlanChangeRow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    memberCode: row.member_code,
    from: {
      membershipType: row.old_membership_type,
      packageMonths: Number(row.old_package_months || 1),
      fee: Number(row.old_fee || 0),
      collectionTiming: row.old_collection_timing,
    },
    to: {
      membershipType: row.new_membership_type,
      packageMonths: Number(row.new_package_months || 1),
      fee: Number(row.new_fee || 0),
      collectionTiming: row.new_collection_timing,
    },
    effectiveDate: toDateKey(row.effective_date),
    duesCollected: Number(row.dues_collected || 0),
    duesWaived: Number(row.dues_waived || 0),
    firstTermCollected: Number(row.first_term_collected || 0),
    changeType: row.change_type || "change",
    // Term by term (changes logged before Phase 3 have none: only the totals above).
    duesDetail: row.dues_detail === null || row.dues_detail === undefined ? null : readDuesDetail(row.dues_detail),
    duesCarried:
      Math.round(readDuesDetail(row.dues_detail).carried.reduce((sum, term) => sum + Number(term.balance || 0), 0) * 100) / 100,
    note: row.note || "",
    changedBy: { id: row.changed_by_id, name: row.changed_by_name, role: row.changed_by_role },
    changedAt: row.changed_at,
  };
}

/**
 * Writes a plan change on `conn`, inside the caller's withMemberLock
 * transaction: the member's new plan and billing anchor, any payments taken
 * with it (one transaction), and the log entry with its term-by-term dues.
 * The member UPDATE is still conditional on the plan read before the change,
 * so a stale sheet gets a 409 rather than overwriting a newer plan.
 */
async function applyPlanChange(conn, gymId, { member, previous, payments, change }) {
  const [updated] = await conn.execute(
    `UPDATE members SET membership_type = ?, package_months = ?, fee = ?, collection_timing = ?, plan_start_date = ?
     WHERE tenant_id = ? AND id = ? AND archived_at IS NULL
       AND membership_type = ? AND package_months = ? AND fee = ? AND collection_timing = ? AND plan_start_date <=> ?`,
    [
      member.membershipType,
      member.packageMonths,
      member.fee,
      member.collectionTiming,
      member.planStartDate,
      gymId,
      member.id,
      previous.membershipType,
      previous.packageMonths,
      previous.fee,
      previous.collectionTiming || "",
      previous.planStartDate || null,
    ],
  );
  if (!updated.affectedRows) {
    const error = new Error("This plan was just changed on another device. Reload and try again.");
    error.status = 409;
    throw error;
  }
  // Everything collected with the change was taken in one go: one transaction.
  if (payments.length) {
    const date = toDateKey(payments[0].date || todayKey());
    await insertTransaction(
      conn,
      gymId,
      member.id,
      {
        amount: payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount || 0) * 100), 0) / 100,
        date,
        dateKnown: true,
        mode: payments[0].mode,
        source: "plan_change",
        enteredBy: change.changedBy,
      },
      payments.map((payment) => ({
        billingPeriod: payment.billingPeriod,
        billingMonth: String(payment.billingPeriod).length === 7 ? payment.billingPeriod : "",
        amount: Number(payment.amount || 0),
        periodFee: Number(payment.periodFee ?? payment.amount ?? 0),
      })),
    );
  }
  await conn.execute(
    `INSERT INTO member_plan_changes
       (id, tenant_id, member_id, member_name, member_code,
        old_membership_type, old_package_months, old_fee, old_collection_timing,
        new_membership_type, new_package_months, new_fee, new_collection_timing,
        effective_date, dues_collected, dues_waived, first_term_collected,
        change_type, request_id, dues_detail, note,
        changed_by_id, changed_by_name, changed_by_role, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      change.id,
      gymId,
      member.id,
      change.memberName,
      change.memberCode,
      change.from.membershipType,
      change.from.packageMonths,
      change.from.fee,
      change.from.collectionTiming,
      change.to.membershipType,
      change.to.packageMonths,
      change.to.fee,
      change.to.collectionTiming,
      change.effectiveDate,
      change.duesCollected,
      change.duesWaived,
      change.firstTermCollected,
      change.changeType || "change",
      change.requestId || null,
      change.duesDetail ? JSON.stringify(change.duesDetail) : null,
      change.note,
      change.changedBy.id,
      change.changedBy.name,
      change.changedBy.role,
      change.changedAt,
    ],
  );
  return change;
}

// The change a Change plan sheet already sent (same request id), if any.
async function findPlanChangeByRequest(conn, gymId, requestId) {
  const [rows] = await conn.execute("SELECT id, member_id FROM member_plan_changes WHERE tenant_id = ? AND request_id = ?", [
    gymId,
    requestId,
  ]);
  return rows[0] ? { id: rows[0].id, memberId: rows[0].member_id } : null;
}

async function getPlanChange(gymId, id) {
  const rows = await query("SELECT * FROM member_plan_changes WHERE tenant_id = ? AND id = ?", [gymId, id]);
  return rows[0] ? mapPlanChangeRow(rows[0]) : null;
}

// Newest first. Archived members' changes stay in the log on purpose.
async function listPlanChanges(gymId, { memberId = "", limit = 2000 } = {}) {
  const cap = Math.max(1, Math.min(5000, Math.trunc(Number(limit) || 2000)));
  const rows = memberId
    ? await query(
        `SELECT * FROM member_plan_changes WHERE tenant_id = ? AND member_id = ? ORDER BY changed_at DESC LIMIT ${cap}`,
        [gymId, memberId],
      )
    : await query(`SELECT * FROM member_plan_changes WHERE tenant_id = ? ORDER BY changed_at DESC LIMIT ${cap}`, [gymId]);
  return rows.map(mapPlanChangeRow);
}

function duplicateMemberError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  applyPlanChange,
  clearTrainerFromMembers,
  addTransaction,
  countMembers,
  createMemberWithHistory,
  deleteMember,
  duplicateMemberError,
  findMember,
  findPlanChangeByRequest,
  getPlanChange,
  findMemberByCredentials,
  getAllMembers,
  getMemberById,
  listPlanChanges,
  moveMemberStartDate,
  saveMember,
  withMemberLock,
};
