const { authConfig } = require("../config/env");
const { parseCookies } = require("../utils/cookies");
const { verify } = require("../utils/jwt");
const { createHttpError } = require("../utils/http");

// Guards the /api/super/* endpoints. A super-admin session lives in its own
// cookie and its token must carry `super: true` — a regular gym-admin session
// (different cookie, no super flag) can never satisfy this check.
function authenticateSuper(req, res, next) {
  const { jwtSecret, superCookieName } = authConfig();
  const token = parseCookies(req)[superCookieName];
  const payload = token ? verify(token, jwtSecret) : null;
  if (!payload || payload.super !== true) {
    return next(createHttpError(401, "Super-admin authentication required"));
  }
  req.superUser = { email: payload.email || "", name: payload.name || "" };
  next();
}

module.exports = { authenticateSuper };
