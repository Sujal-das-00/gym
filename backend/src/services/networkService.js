const os = require("os");
const { PORT } = require("../config/constants");
const { getPublicBaseUrl } = require("../config/env");

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return "localhost";
}

function getAppConfig(req, slug) {
  const baseUrl = getPublicBaseUrl(req);
  const lanUrl = `http://${getLocalIp()}:${PORT}`;
  // In production (APP_BASE_URL set, e.g. https://gymbot.toolszila.com) the
  // shareable check-in URL/QR must point at the public domain. Locally we fall
  // back to the LAN IP so a phone on the same Wi-Fi can scan and reach it.
  const shareBase = process.env.APP_BASE_URL ? baseUrl : lanUrl;
  const checkinPath = slug ? `/checkin/${slug}` : "/checkin";
  return {
    baseUrl,
    localUrl: lanUrl,
    adminUrl: `${shareBase}/admin`,
    checkinUrl: `${shareBase}${checkinPath}`,
  };
}

module.exports = {
  getAppConfig,
  getLocalIp,
};
