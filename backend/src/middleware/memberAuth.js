const { authConfig } = require("../config/env");
const { parseCookies } = require("../utils/cookies");
const { verify } = require("../utils/jwt");
const { createHttpError } = require("../utils/http");

// Guards the /api/public/:slug/account/* endpoints. A member token is signed
// with its own derived secret and carries `member: true` — a staff or
// super-admin session (different secret, different cookie) can never satisfy
// this check, and this check can never satisfy `authenticate()`/`authenticateSuper`.
function authenticateMember(req, res, next) {
  const { memberJwtSecret, memberCookieName } = authConfig();
  const cookies = parseCookies(req);
  const header = String(req.headers.authorization || "");
  const token = cookies[memberCookieName] || (header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const payload = token ? verify(token, memberJwtSecret) : null;
  if (!payload || payload.member !== true || !payload.sub || !payload.tenantId) {
    return next(createHttpError(401, "Sign in required"));
  }
  req.memberAuth = { memberId: payload.sub, tenantId: payload.tenantId, slug: payload.slug || "" };
  next();
}

module.exports = { authenticateMember };
