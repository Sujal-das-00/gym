const crypto = require("crypto");
const { authConfig } = require("../config/env");
const { todayKey } = require("./date");

// The front-desk code is derived, never stored: HMAC(secret, gym + date) folded
// down to four digits. Every process computes the same code for the same day and
// it rolls over on its own at midnight, so there is no table to keep in sync and
// nothing to clean up. CHECKIN_CODE_SECRET overrides the JWT secret for gyms that
// want the two rotated independently; either way the secret must be stable, or
// the code changes on restart (see authConfig's warning about an unset JWT_SECRET).
function codeSecret() {
  return String(process.env.CHECKIN_CODE_SECRET || "").trim() || authConfig().jwtSecret;
}

function dailyCode(gymId, date = todayKey()) {
  const digest = crypto
    .createHmac("sha256", codeSecret())
    .update(`checkin:${gymId}:${date}`)
    .digest();
  return String(digest.readUInt32BE(0) % 10000).padStart(4, "0");
}

// Compared in constant time: the code is only four digits, so a timing oracle
// would cut the guess space down fast.
function isValidDailyCode(gymId, code, date = todayKey()) {
  const supplied = String(code || "").trim();
  if (!/^\d{4}$/.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(dailyCode(gymId, date)));
}

module.exports = {
  dailyCode,
  isValidDailyCode,
};
