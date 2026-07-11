const { authConfig } = require("../config/env");
const { parseCookies } = require("../utils/cookies");
const { verify } = require("../utils/jwt");
const { createHttpError } = require("../utils/http");

function readToken(req) {
  const { cookieName } = authConfig();
  const cookies = parseCookies(req);
  if (cookies[cookieName]) return cookies[cookieName];
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return "";
}

function authenticate(req, res, next) {
  const { jwtSecret } = authConfig();
  const token = readToken(req);
  const payload = token ? verify(token, jwtSecret) : null;
  if (!payload || !payload.sub) return next(createHttpError(401, "Authentication required"));
  req.user = {
    id: payload.sub,
    role: payload.role,
    tenantId: payload.tenantId || null,
    name: payload.name || "",
    email: payload.email || "",
  };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(createHttpError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) return next(createHttpError(403, "You do not have access to this resource"));
    next();
  };
}

// Resolve which gym's data this request touches. Gym admins/staff are locked to
// their own gym; a super-admin must name the target gym via the x-gym-id header.
function resolveTenant(req, res, next) {
  if (!req.user) return next(createHttpError(401, "Authentication required"));
  if (req.user.role === "super_admin") {
    const target = String(req.headers["x-gym-id"] || req.query.gymId || "").trim();
    if (!target) return next(createHttpError(400, "Select a gym first (missing gym context)"));
    req.gymId = target;
  } else {
    if (!req.user.tenantId) return next(createHttpError(403, "Your account is not linked to a gym"));
    req.gymId = req.user.tenantId;
  }
  next();
}

module.exports = {
  authenticate,
  requireRole,
  resolveTenant,
};
