const { authConfig } = require("../config/env");
const { sign } = require("../utils/jwt");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createHttpError } = require("../utils/http");
const userModel = require("../models/userModel");
const gymModel = require("../models/gymModel");

function tokenFor(user) {
  const { jwtSecret, tokenTtlSeconds } = authConfig();
  return sign(
    { sub: user.id, role: user.role, tenantId: user.tenantId || null, name: user.name, email: user.email },
    jwtSecret,
    tokenTtlSeconds,
  );
}

async function login(email, password) {
  const user = await userModel.findUserByEmail(email);
  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
    throw createHttpError(401, "Invalid email or password");
  }
  // Super-admins sign in only through the isolated super-admin panel (env creds).
  // Reject any legacy super_admin row here so this panel stays admins-only.
  if (user.role === "super_admin") throw createHttpError(401, "Invalid email or password");
  if (user.tenantId) {
    const gym = await gymModel.getGymById(user.tenantId);
    if (!gym || gym.status !== "active") throw createHttpError(403, "This gym is currently suspended");
  }
  await userModel.setLastLogin(user.id);
  return { token: tokenFor(user), user: userModel.publicUser(user) };
}

async function me(userId) {
  const user = await userModel.getUserById(userId);
  if (!user) throw createHttpError(401, "Session is no longer valid");
  const result = userModel.publicUser(user);
  if (user.tenantId) {
    const gym = await gymModel.getGymById(user.tenantId);
    result.gym = gym ? { id: gym.id, slug: gym.slug, name: gym.name, status: gym.status } : null;
  }
  return result;
}

async function createGymWithAdmin({ gymName, slug, adminEmail, adminPassword, adminName }) {
  if (!gymName) throw createHttpError(400, "Gym name is required");
  if (!adminEmail || !adminPassword) throw createHttpError(400, "Admin email and password are required");

  let gym;
  try {
    gym = await gymModel.createGym({ name: gymName, slug });
  } catch (error) {
    if (gymModel.duplicateGymError(error)) throw createHttpError(409, "A gym with this slug already exists");
    throw error;
  }

  let admin;
  try {
    admin = await userModel.createUser({
      tenantId: gym.id,
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "gym_admin",
      name: adminName || "",
    });
  } catch (error) {
    if (userModel.duplicateUserError(error)) throw createHttpError(409, "A user with this email already exists");
    throw error;
  }

  return { gym, admin: userModel.publicUser(admin) };
}

async function createStaff(tenantId, { email, password, name, role }) {
  if (!email || !password) throw createHttpError(400, "Email and password are required");
  const staffRole = role === "gym_admin" ? "gym_admin" : "staff";
  try {
    const user = await userModel.createUser({
      tenantId,
      email,
      passwordHash: hashPassword(password),
      role: staffRole,
      name: name || "",
    });
    return userModel.publicUser(user);
  } catch (error) {
    if (userModel.duplicateUserError(error)) throw createHttpError(409, "A user with this email already exists");
    throw error;
  }
}

module.exports = {
  createGymWithAdmin,
  createStaff,
  login,
  me,
  tokenFor,
};
