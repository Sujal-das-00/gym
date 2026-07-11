const { authConfig } = require("../config/env");
const { sign } = require("../utils/jwt");
const { hashPassword, safeEqual } = require("../utils/password");
const { createHttpError } = require("../utils/http");
const userModel = require("../models/userModel");
const gymModel = require("../models/gymModel");

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
  login,
  setAdminStatus,
};
