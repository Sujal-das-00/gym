const { authConfig } = require("../config/env");
const { sign } = require("../utils/jwt");
const { hashPassword, safeEqual } = require("../utils/password");
const { createHttpError } = require("../utils/http");
const userModel = require("../models/userModel");
const gymModel = require("../models/gymModel");
const { slugify } = require("../utils/slug");
const referralService = require("./referralService");
const maintenanceService = require("./maintenanceService");

function superToken() {
  const { jwtSecret, tokenTtlSeconds, superAdmin } = authConfig();
  return sign(
    { sub: `super:${superAdmin.email}`, super: true, role: "super_admin", email: superAdmin.email, name: superAdmin.name },
    jwtSecret,
    tokenTtlSeconds,
  );
}

// Super-admin credentials are matched directly against the environment
// (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD) — never against the users table.
function login(email, password) {
  const { superAdmin } = authConfig();
  if (!superAdmin.email || !superAdmin.password) {
    throw createHttpError(503, "Super-admin login is not configured on the server");
  }
  const emailOk = String(email || "").trim().toLowerCase() === superAdmin.email;
  const passOk = safeEqual(String(password || ""), superAdmin.password);
  if (!emailOk || !passOk) throw createHttpError(401, "Invalid email or password");
  return { token: superToken(), superAdmin: { email: superAdmin.email, name: superAdmin.name } };
}

// Shared by gym create and edit. Dates are 'YYYY-MM-DD' (what <input type=date> sends).
// A registration date in the future is refused: the trial clock would not have started.
function parseTrial({ registeredOn, trialDays }, { required = false } = {}) {
  let date = null;
  if (registeredOn) {
    const text = String(registeredOn).trim();
    const parsed = new Date(`${text}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw createHttpError(400, "Registration date must be a valid date");
    }
    if (parsed.getTime() > Date.now() + 14 * 3600 * 1000) throw createHttpError(400, "Registration date cannot be in the future");
    date = text;
  } else if (required) {
    throw createHttpError(400, "Registration date is required");
  }
  let days = null;
  if (trialDays !== undefined && trialDays !== null && String(trialDays).trim() !== "") {
    days = Number(trialDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) throw createHttpError(400, "Free trial must be a whole number of days between 0 and 365");
  }
  return { registeredOn: date, trialDays: days };
}

async function editGym(id, body) {
  const gym = await gymModel.getGymById(id);
  if (!gym) throw createHttpError(404, "Gym not found");
  const name = String(body.name || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 160) throw createHttpError(400, "Gym name must be 2-160 characters");
  const slug = slugify(body.slug || gym.slug, gym.slug);
  const trial = parseTrial({ registeredOn: body.registeredOn || gym.registeredOn, trialDays: body.trialDays ?? gym.trialDays }, { required: true });
  // Checked before anything is written, so a bad code never leaves the gym half-edited.
  if (body.referralCode) await referralService.resolveCode(body.referralCode);
  let graceDaysUsed = gym.graceDaysUsed;
  if (body.graceDaysUsed !== undefined && String(body.graceDaysUsed).trim() !== "") {
    graceDaysUsed = Number(body.graceDaysUsed);
    if (!Number.isInteger(graceDaysUsed) || graceDaysUsed < 0 || graceDaysUsed > 100) {
      throw createHttpError(400, "Temporary access days used must be a whole number");
    }
  }
  // undefined = leave as is; empty = back to standard pricing; otherwise a fixed amount.
  let priceOverride = gym.priceOverride;
  if (body.priceOverride !== undefined) {
    if (body.priceOverride === null || String(body.priceOverride).trim() === "") priceOverride = null;
    else {
      priceOverride = Math.round(Number(body.priceOverride) * 100) / 100;
      if (!Number.isFinite(priceOverride) || priceOverride < 1 || priceOverride > 100000) {
        throw createHttpError(400, "Special price must be between ₹1 and ₹1,00,000, or empty for standard pricing");
      }
    }
  }
  const maint = maintenanceService.parseSettings(body, gym);
  try {
    const updated = await gymModel.updateGym(id, { name, slug, registeredOn: trial.registeredOn, trialDays: trial.trialDays, graceDaysUsed, priceOverride, ...maint });
    if (body.referralCode !== undefined) await referralService.setGymReferral(id, body.referralCode);
    if (body.status === "active" || body.status === "suspended") return gymModel.setGymStatus(id, body.status);
    return updated;
  } catch (error) {
    if (gymModel.duplicateGymError(error)) throw createHttpError(409, "Another gym already uses that check-in link");
    throw error;
  }
}

async function addAdmin({ tenantId, email, password, name, role }) {
  if (!tenantId) throw createHttpError(400, "Choose a gym for this admin");
  const gym = await gymModel.getGymById(tenantId);
  if (!gym) throw createHttpError(404, "Gym not found");
  if (!email || !password) throw createHttpError(400, "Email and password are required");
  const adminRole = role === "staff" ? "staff" : "gym_admin";
  try {
    const user = await userModel.createUser({
      tenantId,
      email,
      passwordHash: hashPassword(password),
      role: adminRole,
      name: name || "",
    });
    return userModel.publicUser(user);
  } catch (error) {
    if (userModel.duplicateUserError(error)) throw createHttpError(409, "A user with this email already exists");
    throw error;
  }
}

async function setAdminStatus(id, status) {
  const next = status === "disabled" || status === "suspended" ? "disabled" : "active";
  const user = await userModel.setUserStatus(id, next);
  if (!user || user.role === "super_admin") throw createHttpError(404, "Admin user not found");
  return userModel.publicUser(user);
}

module.exports = {
  addAdmin,
  editGym,
  parseTrial,
  login,
  setAdminStatus,
};
