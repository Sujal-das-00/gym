const { repo } = require("../models");
const { updateSettings } = require("../services/settingsService");

async function getSettings(req, res) {
  res.json(await repo().getSettings());
}

async function putSettings(req, res) {
  res.json(await updateSettings(req.body || {}));
}

module.exports = {
  getSettings,
  putSettings,
};
