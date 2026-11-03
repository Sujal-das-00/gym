const { getDailyLog } = require("../services/dailyLogService");

// GET /api/daily-log?from=&to=&fromDay=&toDay= (see dailyLogService.getDailyLog).
async function listDailyLog(req, res) {
  res.json(await getDailyLog(req.gymId, req.query || {}));
}

module.exports = { listDailyLog };
