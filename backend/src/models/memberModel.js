const crypto = require("crypto");
const { exec, getPool, query } = require("../config/database");
const { toDateKey, todayKey } = require("../utils/date");
const { normalizeMember, normalizePaymentMode, normalizePhone } = require("../utils/member");
const { mapPaymentRow } = require("./paymentModel");

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
    const [attendanceRows, paymentRows, expiredRows] = await Promise.all([
      query(`SELECT member_id, attendance_date FROM attendance WHERE member_id IN (${marks}) ORDER BY attendance_date`, ids),
      query(`SELECT * FROM payments WHERE member_id IN (${marks}) ORDER BY payment_date, created_at`, ids),
      query(`SELECT member_id, checkin_date FROM checkins WHERE member_id IN (${marks}) AND expired = 1 ORDER BY checkin_date`, ids),
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
    // A database that ran the reverted payment-transactions release can hold
    // reversed rows (payments.reversed_at); they no longer pay anything.
    const payments = group(
      paymentRows.filter((item) => !item.reversed_at),
      mapPaymentRow,
    );
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
async function createMemberWithHistory(gymId, member, payments) {
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
      await connection.execute(
        `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode, date_known)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          member.id,
          payment.date,
          payment.date.slice(0, 7),
          payment.billingMonth || "",
          payment.billingPeriod,
          payment.amount,
          payment.kind === "admission" ? null : payment.periodFee,
          payment.kind === "admission" ? "admission" : "membership",
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
    note: row.note || "",
    changedBy: { id: row.changed_by_id, name: row.changed_by_name, role: row.changed_by_role },
    changedAt: row.changed_at,
  };
}

/**
 * Applies a plan change in one transaction: the member's new plan and billing
 * anchor, any payments taken with it, and the log entry. The member UPDATE is
 * conditional on the plan read before the change, so two people changing the
 * same plan at once can't both win — the second gets a 409.
 */
async function applyPlanChange(gymId, { member, previous, payments, change }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [updated] = await connection.execute(
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
    for (const payment of payments) {
      await connection.execute(
        `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'membership', ?)`,
        [
          crypto.randomUUID(),
          member.id,
          toDateKey(payment.date || todayKey()),
          String(payment.month),
          String(payment.billingPeriod).length === 7 ? payment.billingPeriod : "",
          payment.billingPeriod,
          Number(payment.amount || 0),
          Number(payment.periodFee ?? payment.amount ?? 0),
          payment.mode || null,
        ],
      );
    }
    await connection.execute(
      `INSERT INTO member_plan_changes
         (id, tenant_id, member_id, member_name, member_code,
          old_membership_type, old_package_months, old_fee, old_collection_timing,
          new_membership_type, new_package_months, new_fee, new_collection_timing,
          effective_date, dues_collected, dues_waived, first_term_collected, note,
          changed_by_id, changed_by_name, changed_by_role, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        change.note,
        change.changedBy.id,
        change.changedBy.name,
        change.changedBy.role,
        change.changedAt,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  return change;
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
  countMembers,
  createMemberWithHistory,
  deleteMember,
  duplicateMemberError,
  findMember,
  findMemberByCredentials,
  getAllMembers,
  getMemberById,
  listPlanChanges,
  mapPlanChangeRow,
  moveMemberStartDate,
  saveMember,
};
