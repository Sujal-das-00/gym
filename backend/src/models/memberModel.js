const { exec, query } = require("../config/database");
const { toDateKey } = require("../utils/date");
const { normalizeMember } = require("../utils/member");
const { mapPaymentRow } = require("./paymentModel");

async function hydrateMember(row) {
  if (!row) return null;
  const [attendanceRows, paymentRows, expiredCheckinRows] = await Promise.all([
    query("SELECT attendance_date FROM attendance WHERE member_id = ? ORDER BY attendance_date", [row.id]),
    query("SELECT * FROM payments WHERE member_id = ? ORDER BY payment_date, created_at", [row.id]),
    query("SELECT checkin_date FROM checkins WHERE member_id = ? AND expired = 1 ORDER BY checkin_date", [row.id]),
  ]);

  return normalizeMember({
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    fee: row.fee,
    membershipType: row.membership_type,
    packageMonths: row.package_months,
    collectionTiming: row.collection_timing,
    startDate: row.start_date,
    photo: row.photo,
    createdAt: row.created_at,
    attendance: attendanceRows.map((item) => toDateKey(item.attendance_date)),
    expiredCheckins: expiredCheckinRows.map((item) => toDateKey(item.checkin_date)),
    payments: paymentRows.map(mapPaymentRow),
  });
}

async function getAllMembers(gymId) {
  const rows = await query("SELECT * FROM members WHERE tenant_id = ? ORDER BY name", [gymId]);
  return Promise.all(rows.map(hydrateMember));
}

async function getMemberById(gymId, id) {
  const rows = await query("SELECT * FROM members WHERE tenant_id = ? AND id = ?", [gymId, id]);
  return hydrateMember(rows[0]);
}

async function findMember(gymId, identifier) {
  const value = String(identifier || "").trim();
  const phone = String(value).replace(/\D/g, "");
  const rows = await query(
    "SELECT * FROM members WHERE tenant_id = ? AND (LOWER(id) = LOWER(?) OR LOWER(gym_id) = LOWER(?) OR phone = ?) LIMIT 1",
    [gymId, value, value, phone],
  );
  return hydrateMember(rows[0]);
}

async function saveMember(gymId, member) {
  await exec(
    `INSERT INTO members (id, tenant_id, gym_id, name, phone, address, fee, membership_type, package_months, collection_timing, start_date, photo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gym_id = VALUES(gym_id), name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
       fee = VALUES(fee), membership_type = VALUES(membership_type), package_months = VALUES(package_months),
       collection_timing = VALUES(collection_timing), start_date = VALUES(start_date), photo = VALUES(photo)`,
    [member.id, gymId, member.gymId, member.name, member.phone, member.address, member.fee, member.membershipType, member.packageMonths, member.collectionTiming || "", member.startDate, member.photo, member.createdAt],
  );
  return getMemberById(gymId, member.id);
}

async function deleteMember(gymId, id) {
  return exec("DELETE FROM members WHERE tenant_id = ? AND id = ?", [gymId, id]);
}

async function countMembers(gymId) {
  const rows = await query("SELECT COUNT(*) AS count FROM members WHERE tenant_id = ?", [gymId]);
  return Number(rows[0]?.count || 0);
}

function duplicateMemberError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  countMembers,
  deleteMember,
  duplicateMemberError,
  findMember,
  getAllMembers,
  getMemberById,
  saveMember,
};
