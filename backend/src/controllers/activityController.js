const { listActivities } = require("../services/activityService");

// The gym's activity history, newest first, one page at a time
// (?from=&to=&category=&q=&before=&beforeSeq=; see activityService.listActivities).
async function getActivities(req, res) {
  res.json(await listActivities(req.gymId, req.query || {}));
}

module.exports = { getActivities };
