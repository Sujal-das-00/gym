const { authConfig } = require("../config/env");
const { buildSetCookie, clearCookie } = require("../utils/cookies");
const authService = require("../services/authService");
const gymModel = require("../models/gymModel");
const userModel = require("../models/userModel");

function setSessionCookie(res, token) {
  const { cookieName, cookieSecure, tokenTtlSeconds } = authConfig();
  res.setHeader("Set-Cookie", buildSetCookie(cookieName, token, { maxAge: tokenTtlSeconds, secure: cookieSecure }));
}

async function postLogin(req, res) {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  console.log(email, " ", password)
  const { token, user } = await authService.login(email, password);
  setSessionCookie(res, token);
  // Also return the token so the SPA can send it as `Authorization: Bearer` —
  // a fallback for when the cookie isn't delivered (host mismatch, SameSite, etc.).
  res.json({ user, token });
}

async function postLogout(req, res) {
  const { cookieName, cookieSecure } = authConfig();
  res.setHeader("Set-Cookie", clearCookie(cookieName, { secure: cookieSecure }));
  res.json({ ok: true });
}

async function getMe(req, res) {
  res.json({ user: await authService.me(req.user.id) });
}

async function postGym(req, res) {
  const result = await authService.createGymWithAdmin({
    gymName: String(req.body?.gymName || req.body?.name || "").trim(),
    slug: req.body?.slug,
    adminEmail: String(req.body?.adminEmail || "").trim(),
    adminPassword: String(req.body?.adminPassword || ""),
    adminName: String(req.body?.adminName || "").trim(),
  });
  res.status(201).json(result);
}

async function listGyms(req, res) {
  res.json(await gymModel.listGyms());
}

async function setGymStatus(req, res) {
  const status = req.body?.status === "suspended" ? "suspended" : "active";
  const gym = await gymModel.setGymStatus(req.params.id, status);
  if (!gym) return res.status(404).json({ error: "Gym not found" });
  return res.json(gym);
}

async function postStaff(req, res) {
  const staff = await authService.createStaff(req.gymId, {
    email: String(req.body?.email || "").trim(),
    password: String(req.body?.password || ""),
    name: String(req.body?.name || "").trim(),
    role: req.body?.role,
  });
  res.status(201).json(staff);
}

async function listStaff(req, res) {
  res.json((await userModel.listStaffForGym(req.gymId)).map(userModel.publicUser));
}

module.exports = {
  getMe,
  listGyms,
  listStaff,
  postGym,
  postLogin,
  postLogout,
  postStaff,
  setGymStatus,
};
