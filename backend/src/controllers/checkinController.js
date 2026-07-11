const { todayKey } = require("../utils/date");
const { repo } = require("../models");

async function listCheckins(req, res) {
  const date = String(req.query.date || todayKey());
  res.json(await repo().getCheckinsByDate(req.gymId, date));
}

module.exports = {
  listCheckins,
};
