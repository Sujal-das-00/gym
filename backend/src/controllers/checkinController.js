const { todayKey } = require("../utils/date");
const { repo } = require("../models");
const { checkInMember, getMemberHistory } = require("../services/checkinService");

async function postCheckin(req, res) {
  const result = await checkInMember(req.body.identifier);
  if (!result) return res.status(404).json({ error: "Member not found" });
  return res.status(result.duplicate ? 200 : 201).json(result);
}

async function getCheckinHistory(req, res) {
  const result = await getMemberHistory(req.query.identifier);
  if (!result) return res.status(404).json({ error: "Member not found" });
  return res.json(result);
}

async function listCheckins(req, res) {
  const date = String(req.query.date || todayKey());
  res.json(await repo().getCheckinsByDate(date));
}

module.exports = {
  getCheckinHistory,
  listCheckins,
  postCheckin,
};
