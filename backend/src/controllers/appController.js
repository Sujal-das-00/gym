const { qrSvg } = require("../../qr");
const { getAppConfig, getLocalIp } = require("../services/networkService");
const { PORT } = require("../config/constants");

function getConfig(req, res) {
  res.json(getAppConfig(req));
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
