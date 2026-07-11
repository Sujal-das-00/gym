const crypto = require("crypto");
const { exec, query } = require("../config/database");

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    name: row.name,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

// Public shape: never leak the password hash to callers/clients.
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    name: user.name,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

async function findUserByEmail(email) {
  const rows = await query("SELECT * FROM users WHERE email = ? LIMIT 1", [String(email || "").trim().toLowerCase()]);
  return mapUserRow(rows[0]);
}

async function getUserById(id) {
  const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return mapUserRow(rows[0]);
}

async function createUser({ tenantId = null, email, passwordHash, role = "gym_admin", name = "" }) {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO users (id, tenant_id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?, ?)",
    [id, tenantId, String(email).trim().toLowerCase(), passwordHash, role, String(name || "").trim()],
  );
  return getUserById(id);
}

async function listStaffForGym(tenantId) {
  const rows = await query("SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at", [tenantId]);
  return rows.map(mapUserRow);
}

// Every gym admin / staff account across all gyms, joined to their gym. Used by
// the super-admin panel. Super-admins are env-based and never stored, so they
// never appear here.
async function listAdmins() {
  const rows = await query(
    `SELECT u.*, g.name AS gym_name, g.slug AS gym_slug, g.status AS gym_status
       FROM users u
       LEFT JOIN gyms g ON g.id = u.tenant_id
      WHERE u.role IN ('gym_admin', 'staff')
      ORDER BY g.name, u.created_at`,
  );
  return rows.map((row) => ({
    ...publicUser(mapUserRow(row)),
    gym: row.tenant_id
      ? { id: row.tenant_id, name: row.gym_name, slug: row.gym_slug, status: row.gym_status }
      : null,
  }));
}

// Suspend ('disabled') or reactivate ('active') an admin account. Scoped to
// gym admins/staff so a super-admin can never be toggled through this path.
async function setUserStatus(id, status) {
  const next = status === "disabled" ? "disabled" : "active";
  await exec("UPDATE users SET status = ? WHERE id = ? AND role IN ('gym_admin', 'staff')", [next, id]);
  return getUserById(id);
}

async function setLastLogin(id) {
  await exec("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

function duplicateUserError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  createUser,
  duplicateUserError,
  findUserByEmail,
  getUserById,
  listAdmins,
  listStaffForGym,
  mapUserRow,
  publicUser,
  setLastLogin,
  setUserStatus,
};
