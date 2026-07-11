const crypto = require("crypto");
const { exec, query } = require("../config/database");
const { nowIso, toDateKey } = require("../utils/date");

function mapCheckinRow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    gymId: row.gym_id,
    memberName: row.member_name,
    phone: row.phone,
    date: toDateKey(row.checkin_date),
    time: row.checkin_time,
  };
}

async function findCheckinForDate(memberId, date) {
  const rows = await query("SELECT * FROM checkins WHERE member_id = ? AND checkin_date = ?", [memberId, date]);
  return rows[0] ? mapCheckinRow(rows[0]) : null;
}

async function createCheckin(gymId, member, date) {
  const checkin = {
    id: crypto.randomUUID(),
    memberId: member.id,
    gymId: member.gymId,
    memberName: member.name,
    phone: member.phone,
    date,
    time: nowIso(),
  };

  await exec(
    `INSERT INTO checkins (id, member_id, tenant_id, gym_id, member_name, phone, checkin_date, checkin_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [checkin.id, checkin.memberId, gymId, checkin.gymId, checkin.memberName, checkin.phone, checkin.date, checkin.time],
  );

  return checkin;
}

async function importCheckin(gymId, member, source) {
  await exec(
    `INSERT IGNORE INTO checkins (id, member_id, tenant_id, gym_id, member_name, phone, checkin_date, checkin_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [source.id || crypto.randomUUID(), member.id, gymId, member.gymId, member.name, member.phone, toDateKey(source.date), source.time || nowIso()],
  );
}

async function getCheckinsByDate(gymId, date) {
  const rows = await query("SELECT * FROM checkins WHERE tenant_id = ? AND checkin_date = ? ORDER BY checkin_time DESC", [gymId, date]);
  return rows.map(mapCheckinRow);
}

module.exports = {
  createCheckin,
  findCheckinForDate,
  getCheckinsByDate,
  importCheckin,
  mapCheckinRow,
};
