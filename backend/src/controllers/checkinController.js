const { todayKey } = require("../utils/date");
const { dailyCode } = require("../utils/dailyCode");
const { getAppConfig } = require("../services/networkService");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");

async function listCheckins(req, res) {
  const date = String(req.query.date || todayKey());
  res.json(await repo().getCheckinsByDate(req.gymId, date));
}

// What the front desk puts on screen: today's four-digit code, and the QR that
// carries the same code so a scan fills it in for the member. Both change at
// midnight, so the admin view re-reads this on its usual poll.
async function getTodayCode(req, res) {
  const gym = await gymModel.getGymById(req.gymId);
  const date = todayKey();
  const code = dailyCode(req.gymId, date);
  const { checkinUrl } = getAppConfig(req, gym?.slug || "");
  res.json({
    date,
    code,
    checkinUrl,
    qrUrl: `${checkinUrl}?c=${code}`,
  });
}

module.exports = {
  getTodayCode,
  listCheckins,
};
