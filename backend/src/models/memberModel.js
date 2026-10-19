const { exec, query } = require("../config/database");
const { toDateKey } = require("../utils/date");
const { normalizeMember, normalizePhone } = require("../utils/member");
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
    const payments = group(paymentRows, mapPaymentRow);
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
    `INSERT INTO members (id, tenant_id, gym_id, name, phone, address, fee, admission_fee, membership_type, package_months, collection_timing, start_date, photo, trainer_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gym_id = VALUES(gym_id), name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
       fee = VALUES(fee), admission_fee = VALUES(admission_fee), membership_type = VALUES(membership_type),
       package_months = VALUES(package_months), collection_timing = VALUES(collection_timing),
       start_date = VALUES(start_date), photo = VALUES(photo), trainer_id = VALUES(trainer_id)`,
    [member.id, gymId, member.gymId, member.name, member.phone, member.address, member.fee, member.admissionFee, member.membershipType, member.packageMonths, member.collectionTiming || "", member.startDate, member.photo, member.trainerId || "", member.createdAt],
  );
  return getMemberById(gymId, member.id);
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

function duplicateMemberError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  clearTrainerFromMembers,
  countMembers,
  deleteMember,
  duplicateMemberError,
  findMember,
  findMemberByCredentials,
  getAllMembers,
  getMemberById,
  saveMember,
};
