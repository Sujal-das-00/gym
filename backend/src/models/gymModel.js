const crypto = require("crypto");
const { exec, query } = require("../config/database");
const { DEFAULT_SETTINGS } = require("../config/constants");
const { slugify } = require("../utils/slug");
const { trialConfig } = require("../config/env");

// Every gym query selects these two extras: the registration day as a plain string
// (a DATE column would come back as a JS Date and shift with the server's timezone) and
// how many days ago that was, counted by the database so it agrees with the date.
const GYM_COLUMNS = `g.*,
  DATE_FORMAT(COALESCE(g.registered_at, DATE(g.created_at)), '%Y-%m-%d') AS registered_on,
  DATE_FORMAT(g.maintenance_due, '%Y-%m-%d') AS maintenance_due_on,
  (SELECT DATE_FORMAT(MIN(DATE(p.decided_at)), '%Y-%m-%d') FROM licence_purchases p WHERE p.tenant_id = g.id AND p.status = 'approved' AND p.plan = 'lifetime') AS licensed_on,
  DATEDIFF(CURDATE(), COALESCE(g.registered_at, DATE(g.created_at))) AS days_since_registered,
  UNIX_TIMESTAMP(g.grace_until) AS grace_until_ts,
  (g.grace_until IS NOT NULL AND g.grace_until > NOW()) AS grace_active,
  (SELECT p.plan FROM licence_purchases p WHERE p.tenant_id = g.id AND p.status = 'approved'
    ORDER BY (p.plan = 'lifetime') DESC, p.decided_at DESC LIMIT 1) AS licence`;

function mapGymRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    registeredOn: row.registered_on || null,
    trialDays: row.trial_days == null ? 7 : Number(row.trial_days),
    daysOnFree: Math.max(0, Number(row.days_since_registered || 0)),
    licence: row.licence || null,
    priceOverride: row.price_override == null ? null : Number(row.price_override),
    maintenancePrice: row.maintenance_price == null ? null : Number(row.maintenance_price),
    maintenanceDue: row.maintenance_due_on || null,
    licensedOn: row.licensed_on || null,
    graceDaysUsed: Number(row.grace_days_used || 0),
    graceActive: Boolean(Number(row.grace_active || 0)),
    graceUntil: row.grace_until_ts ? Number(row.grace_until_ts) * 1000 : null,
  };
}

// A gym's access, in three states. 'suspended' is a manual block by the super-admin.
// 'trial_expired' is automatic: no licence, trial over, and no temporary access running,
// so the owner is sent to pick a plan. Everything else is 'active'. `phase` says why:
// licensed, still on trial, or on temporary access while a payment is verified.
function accessOf(gym) {
  const maxGraceDays = trialConfig().maxGraceDays;
  const daysLeft = gym.trialDays - gym.daysOnFree;
  const base = {
    licence: gym.licence || null,
    daysOnFree: gym.daysOnFree,
    trialDays: gym.trialDays,
    daysLeft: gym.licence ? null : daysLeft,
    daysOver: !gym.licence && daysLeft < 0 ? -daysLeft : 0,
    graceDaysUsed: gym.graceDaysUsed,
    graceDaysMax: maxGraceDays,
    graceUntil: gym.graceActive ? gym.graceUntil : null,
  };
  if (gym.status === "suspended") return { ...base, state: "suspended", phase: "suspended" };
  if (gym.licence) return { ...base, state: "active", phase: "licensed" };
  if (daysLeft >= 0) return { ...base, state: "active", phase: "trial" };
  if (gym.graceActive) return { ...base, state: "active", phase: "grace" };
  return { ...base, state: "trial_expired", phase: "expired" };
}

async function getGymById(id) {
  const rows = await query(`SELECT ${GYM_COLUMNS} FROM gyms g WHERE g.id = ? LIMIT 1`, [id]);
  return mapGymRow(rows[0]);
}

async function getGymBySlug(slug) {
  const rows = await query(`SELECT ${GYM_COLUMNS} FROM gyms g WHERE g.slug = ? LIMIT 1`, [String(slug || "").toLowerCase()]);
  return mapGymRow(rows[0]);
}

async function listGyms() {
  const rows = await query(`SELECT ${GYM_COLUMNS} FROM gyms g ORDER BY g.name`);
  return rows.map(mapGymRow);
}

async function uniqueSlug(name, seed) {
  const base = slugify(seed || name);
  let candidate = base;
  let suffix = 1;
  // Loop until an unused slug is found (first gym almost always takes the base).
  while ((await query("SELECT id FROM gyms WHERE slug = ? LIMIT 1", [candidate])).length) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

// registeredOn: 'YYYY-MM-DD' or empty for today. trialDays: empty for the default 7.
async function createGym({ name, slug, registeredOn, trialDays }) {
  const id = crypto.randomUUID();
  const finalSlug = await uniqueSlug(name, slug);
  const gymName = String(name || DEFAULT_SETTINGS.gymName).trim() || DEFAULT_SETTINGS.gymName;
  await exec("INSERT INTO gyms (id, slug, name, status, registered_at, trial_days) VALUES (?, ?, ?, 'active', COALESCE(?, CURDATE()), ?)", [
    id,
    finalSlug,
    gymName,
    registeredOn || null,
    trialDays == null ? 7 : trialDays,
  ]);
  await exec(
    `INSERT INTO gym_settings
       (tenant_id, gym_name, logo, billing_cycle_mode, custom_billing_days, default_collection_timing, weekly_holidays, holiday_dates, theme)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      gymName,
      DEFAULT_SETTINGS.logo,
      DEFAULT_SETTINGS.billingCycleMode,
      DEFAULT_SETTINGS.customBillingDays,
      DEFAULT_SETTINGS.defaultCollectionTiming,
      JSON.stringify(DEFAULT_SETTINGS.weeklyHolidays),
      JSON.stringify(DEFAULT_SETTINGS.holidayDates),
      JSON.stringify(DEFAULT_SETTINGS.theme),
    ],
  );
  return getGymById(id);
}

async function setGymStatus(id, status) {
  await exec("UPDATE gyms SET status = ? WHERE id = ?", [status === "suspended" ? "suspended" : "active", id]);
  return getGymById(id);
}

// Super-admin edit of any gym, self-registered or not. The name is mirrored into
// gym_settings, which is what members see in the check-in app.
async function updateGym(id, { name, slug, registeredOn, trialDays, graceDaysUsed, priceOverride, maintenancePrice, maintenanceDue }) {
  await exec("UPDATE gyms SET name = ?, slug = ?, registered_at = ?, trial_days = ?, grace_days_used = ?, price_override = ?, maintenance_price = ?, maintenance_due = ? WHERE id = ?", [
    name,
    slug,
    registeredOn,
    trialDays,
    graceDaysUsed,
    priceOverride,
    maintenancePrice,
    maintenanceDue,
    id,
  ]);
  await exec("UPDATE gym_settings SET gym_name = ? WHERE tenant_id = ?", [name, id]);
  return getGymById(id);
}

function duplicateGymError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  GYM_COLUMNS,
  createGym,
  accessOf,
  updateGym,
  duplicateGymError,
  getGymById,
  getGymBySlug,
  listGyms,
  mapGymRow,
  setGymStatus,
  uniqueSlug,
};
