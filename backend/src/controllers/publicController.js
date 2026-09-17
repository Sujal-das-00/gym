const { createHttpError } = require("../utils/http");
const { authConfig } = require("../config/env");
const { buildSetCookie, clearCookie } = require("../utils/cookies");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const { checkInMember, getMemberHistory } = require("../services/checkinService");
const memberAuthService = require("../services/memberAuthService");
const { clearCodeFailures, recordCodeFailure } = require("../middleware/checkinThrottle");
const { clearLoginFailures, recordLoginFailure } = require("../middleware/memberLoginThrottle");

async function resolveGymBySlug(slug) {
  const gym = await gymModel.getGymBySlug(slug);
  if (!gym || gym.status !== "active") throw createHttpError(404, "Gym not found");
  return gym;
}

// Only expose the branding the check-in page needs — never members or settings internals.
async function getPublicSettings(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const settings = await repo().getSettings(gym.id);
  res.json({
    slug: gym.slug,
    gymName: settings.gymName,
    logo: settings.logo,
    theme: settings.theme,
  });
}

async function postPublicCheckin(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const result = await checkInMember(gym.id, req.body?.identifier, req.body?.code);
  if (result?.invalidCode) {
    recordCodeFailure(req);
    return res.status(401).json({
      error: "That code isn't today's. Check the code on the front-desk screen, or scan the QR.",
      invalidCode: true,
    });
  }
  clearCodeFailures(req);
  if (!result) return res.status(404).json({ error: "Member not found" });
  if (result.denied) {
    return res.status(403).json({
      error: "Membership expired — access denied. Please renew at the front desk.",
      expired: true,
      member: result.member,
      history: result.history,
    });
  }
  return res.status(result.duplicate ? 200 : 201).json(result);
}

async function getPublicCheckinHistory(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const result = await getMemberHistory(gym.id, req.query.identifier);
  if (!result) return res.status(404).json({ error: "Member not found" });
  return res.json(result);
}

function setMemberSessionCookie(res, token, ttlSeconds, trustDevice) {
  const { memberCookieName, cookieSecure } = authConfig();
  // Untrusted devices get a session cookie (no Max-Age): it still carries the
  // short-lived token, but disappears when the browser closes, not just when
  // the token expires.
  const maxAge = trustDevice ? ttlSeconds : undefined;
  res.setHeader("Set-Cookie", buildSetCookie(memberCookieName, token, { maxAge, secure: cookieSecure }));
}

async function postAccountLogin(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const trustDevice = Boolean(req.body?.trustDevice);
  let result;
  try {
    result = await memberAuthService.login(gym, req.body?.gymId, req.body?.phone, trustDevice);
  } catch (error) {
    recordLoginFailure(req);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Sign in failed" });
  }
  clearLoginFailures(req);
  setMemberSessionCookie(res, result.token, result.ttlSeconds, trustDevice);
  // Also return the token so the app can fall back to `Authorization: Bearer`
  // if the cookie isn't delivered — same reasoning as authController.postLogin.
  return res.json({
    token: result.token,
    member: result.member,
    billing: result.billing,
    history: result.history,
  });
}

async function postAccountLogout(req, res) {
  const { memberCookieName, cookieSecure } = authConfig();
  res.setHeader("Set-Cookie", clearCookie(memberCookieName, { secure: cookieSecure }));
  res.json({ ok: true });
}

async function getAccountSession(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  // A stale/foreign cookie (e.g. a different gym's QR was scanned) must not be
  // silently honoured against this gym.
  if (gym.id !== req.memberAuth.tenantId) return res.status(401).json({ error: "Sign in required" });
  const result = await memberAuthService.sessionData(gym, req.memberAuth.memberId);
  if (!result) return res.status(404).json({ error: "Member not found" });
  return res.json(result);
}

module.exports = {
  getAccountSession,
  getPublicCheckinHistory,
  getPublicSettings,
  postAccountLogin,
  postAccountLogout,
  postPublicCheckin,
};
