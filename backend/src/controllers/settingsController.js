const { repo } = require("../models");
const { updateSettings } = require("../services/settingsService");

async function getSettings(req, res) {
  res.json(await repo().getSettings(req.gymId));
}

async function putSettings(req, res) {
  res.json(await updateSettings(req.gymId, req.body || {}));
}

module.exports = {
  getSettings,
  putSettings,
};
