const { todayKey } = require("../utils/date");
const { repo } = require("../models");

async function setAttendance(req, res) {
  const member = await repo().getMemberById(req.body.memberId);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const date = String(req.body.date || todayKey());
  const present = Boolean(req.body.present);
  await repo().setMemberAttendance(member.id, date, present);
  return res.json({
    memberId: member.id,
    date,
    present,
    revision: await repo().getAttendanceRevision(),
  });
}

async function getAttendanceStatus(req, res) {
  const date = String(req.query.date || todayKey());
  const since = Number(req.query.since || -1);
  const revision = await repo().getAttendanceRevision();
  const active = since !== revision;
  return res.json({
    date,
    revision,
    active,
    rows: active ? await repo().attendanceStatusRows(date) : [],
  });
}

module.exports = {
  getAttendanceStatus,
  setAttendance,
};
