const { authConfig } = require("../config/env");
const { sign } = require("../utils/jwt");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createHttpError } = require("../utils/http");
const userModel = require("../models/userModel");
const gymModel = require("../models/gymModel");
const settingsModel = require("../models/settingsModel");
const referralService = require("./referralService");
const { normalizeGymPhone } = require("../utils/settings");

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
    result.gym = gym
      ? { id: gym.id, slug: gym.slug, name: gym.name, status: gym.status, access: gymModel.accessOf(gym) }
      : null;
  }
  return result;
}

async function createGymWithAdmin({ gymName, slug, adminEmail, adminPassword, adminName, referralCode, registeredOn, trialDays }) {
  if (!gymName) throw createHttpError(400, "Gym name is required");
  if (!adminEmail || !adminPassword) throw createHttpError(400, "Admin email and password are required");
  // Validated before anything is created, so a bad code never leaves a half-made gym.
  const partner = await referralService.resolveCode(referralCode, adminEmail);

  let gym;
  try {
    gym = await gymModel.createGym({ name: gymName, slug, registeredOn, trialDays });
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

  await referralService.attachReferral(partner, gym.id);
  return { gym, admin: userModel.publicUser(admin) };
}

const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// Self-service signup from the public landing page: a gym and its owner login in
// one step, returning a session so the owner lands in the dashboard signed in.
// The landing form checks the same rules for instant feedback; these are the ones
// that count.
async function signupOwner({ gymName, ownerName, email, password, referralCode, gymPhone = "" }) {
  if (!NAME_PATTERN.test(gymName) || gymName.length < 2 || gymName.length > 30) {
    throw createHttpError(400, "Gym name must be 2-30 letters, with no numbers or symbols");
  }
  if (!NAME_PATTERN.test(ownerName) || ownerName.length < 2 || ownerName.length > 30) {
    throw createHttpError(400, "Your name must be 2-30 letters, with no numbers or symbols");
  }
  if (email.length > 120 || email.includes("..") || !EMAIL_PATTERN.test(email)) {
    throw createHttpError(400, "Enter a valid email address");
  }
  // Optional (the landing page form doesn't ask for it), but checked when given.
  const phone = normalizeGymPhone(gymPhone);
  if (String(gymPhone || "").trim() && !phone) {
    throw createHttpError(400, "Enter a valid 10-digit gym phone number");
  }
  if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw createHttpError(400, "Password must be 8-72 characters with at least one letter and one number");
  }
  // Checked before the gym is created, so a taken email never leaves an owner-less gym behind.
  if (await userModel.findUserByEmail(email)) {
    throw createHttpError(409, "An account with this email already exists. Try logging in.");
  }
  const { gym, admin } = await createGymWithAdmin({
    gymName,
    adminEmail: email,
    adminPassword: password,
    adminName: ownerName,
    referralCode,
  });
  if (phone) await settingsModel.setGymPhone(gym.id, phone);
  await userModel.setLastLogin(admin.id);
  return { token: tokenFor(admin), user: admin, gym: { id: gym.id, slug: gym.slug, name: gym.name } };
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
  signupOwner,
  tokenFor,
};
