const { authConfig } = require("../config/env");
const { buildSetCookie, clearCookie } = require("../utils/cookies");
const superAdminService = require("../services/superAdminService");
const authService = require("../services/authService");
const gymModel = require("../models/gymModel");
const userModel = require("../models/userModel");

function setSuperCookie(res, token) {
  const { superCookieName, cookieSecure, tokenTtlSeconds } = authConfig();
  res.setHeader("Set-Cookie", buildSetCookie(superCookieName, token, { maxAge: tokenTtlSeconds, secure: cookieSecure }));
}

function postLogin(req, res) {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  const { token, superAdmin } = superAdminService.login(email, password);
  setSuperCookie(res, token);
  res.json({ superAdmin });
}

function postLogout(req, res) {
  const { superCookieName, cookieSecure } = authConfig();
  res.setHeader("Set-Cookie", clearCookie(superCookieName, { secure: cookieSecure }));
  res.json({ ok: true });
}

function getMe(req, res) {
  res.json({ superAdmin: req.superUser });
}

async function listGyms(req, res) {
  res.json(await gymModel.listGyms());
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

async function setGymStatus(req, res) {
  const status = req.body?.status === "suspended" ? "suspended" : "active";
  const gym = await gymModel.setGymStatus(req.params.id, status);
  if (!gym) return res.status(404).json({ error: "Gym not found" });
  return res.json(gym);
}

async function listAdmins(req, res) {
  res.json(await userModel.listAdmins());
}

async function postAdmin(req, res) {
  const admin = await superAdminService.addAdmin({
    tenantId: String(req.body?.tenantId || req.body?.gymId || "").trim(),
    email: String(req.body?.email || "").trim(),
    password: String(req.body?.password || ""),
    name: String(req.body?.name || "").trim(),
    role: req.body?.role,
  });
  res.status(201).json(admin);
}

async function setAdminStatus(req, res) {
  const admin = await superAdminService.setAdminStatus(req.params.id, req.body?.status);
  res.json(admin);
}

module.exports = {
  getMe,
  listAdmins,
  listGyms,
  postAdmin,
  postGym,
  postLogin,
  postLogout,
  setAdminStatus,
  setGymStatus,
};
