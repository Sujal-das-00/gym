const { authConfig } = require("../config/env");
const { parseCookies } = require("../utils/cookies");
const { verify } = require("../utils/jwt");
const { createHttpError } = require("../utils/http");

// Guards /api/partner/*. Partner tokens use their own derived secret and carry
// `partner: true`, so no gym, member or super-admin token can pass (or vice versa).
function authenticatePartner(req, res, next) {
  const { partnerJwtSecret, partnerCookieName } = authConfig();
  const token = parseCookies(req)[partnerCookieName];
  const payload = token ? verify(token, partnerJwtSecret) : null;
  if (!payload || payload.partner !== true || !payload.sub) {
    return next(createHttpError(401, "Sign in required"));
  }
  req.partnerId = payload.sub;
  next();
}

module.exports = { authenticatePartner };
