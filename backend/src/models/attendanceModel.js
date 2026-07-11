const { exec, query } = require("../config/database");
const { toDateKey } = require("../utils/date");
const { bumpAttendanceRevision } = require("./settingsModel");

async function setMemberAttendance(gymId, memberId, date, present) {
  const before = await query("SELECT member_id FROM attendance WHERE member_id = ? AND attendance_date = ?", [memberId, date]);
  if (present) {
    await exec("INSERT IGNORE INTO attendance (member_id, attendance_date) VALUES (?, ?)", [memberId, date]);
  } else {
    await exec("DELETE FROM attendance WHERE member_id = ? AND attendance_date = ?", [memberId, date]);
  }
  const after = await query("SELECT member_id FROM attendance WHERE member_id = ? AND attendance_date = ?", [memberId, date]);
  if (Boolean(before.length) !== Boolean(after.length)) await bumpAttendanceRevision(gymId);
}

async function importAttendance(memberId, date) {
  await exec("INSERT IGNORE INTO attendance (member_id, attendance_date) VALUES (?, ?)", [memberId, toDateKey(date)]);
}

async function attendanceStatusRows(gymId, date) {
  const rows = await query(
    `SELECT m.id, m.gym_id, CASE WHEN a.member_id IS NULL THEN 0 ELSE 1 END AS present
     FROM members m
     LEFT JOIN attendance a ON a.member_id = m.id AND a.attendance_date = ?
     WHERE m.tenant_id = ?
     ORDER BY m.name`,
    [date, gymId],
  );
  return rows.map((row) => ({ id: row.id, gymId: row.gym_id, present: Boolean(row.present) }));
}

async function memberCheckinHistory(member, limit = 12) {
  // MySQL's prepared-statement protocol rejects a bound parameter in LIMIT
  // ("Incorrect arguments to mysqld_stmt_execute"), so inline a validated integer.
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 12));
  const rows = await query(
    `SELECT a.attendance_date, c.checkin_time, c.id AS checkin_id
     FROM attendance a
     LEFT JOIN checkins c ON c.member_id = a.member_id AND c.checkin_date = a.attendance_date
     WHERE a.member_id = ?
     ORDER BY a.attendance_date DESC
     LIMIT ${safeLimit}`,
    [member.id],
  );
  return rows.map((row) => ({
    date: toDateKey(row.attendance_date),
    time: row.checkin_time || "",
    source: row.checkin_id ? "qr" : "manual",
  }));
}

module.exports = {
  attendanceStatusRows,
  importAttendance,
  memberCheckinHistory,
  setMemberAttendance,
};
