const { qrSvg } = require("../../qr");
const { getAppConfig, getLocalIp } = require("../services/networkService");
const { PORT } = require("../config/constants");
const gymModel = require("../models/gymModel");

async function getConfig(req, res) {
  let slug = "";
  if (req.gymId) {
    const gym = await gymModel.getGymById(req.gymId);
    slug = gym?.slug || "";
  }
  res.json(getAppConfig(req, slug));
}

function getQr(req, res) {
  const target = req.query.url || `http://${getLocalIp()}:${PORT}/checkin`;
  res.type("image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(qrSvg(String(target)));
}

module.exports = {
  getConfig,
  getQr,
};
