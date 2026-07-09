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

function getAppConfig(req) {
  const baseUrl = getPublicBaseUrl(req);
  return {
    baseUrl,
    localUrl: `http://${getLocalIp()}:${PORT}`,
    adminUrl: `${baseUrl}/admin`,
    checkinUrl: `${baseUrl}/checkin`,
  };
}

module.exports = {
  getAppConfig,
  getLocalIp,
};
