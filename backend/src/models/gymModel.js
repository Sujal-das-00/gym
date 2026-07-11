const crypto = require("crypto");
const { exec, query } = require("../config/database");
const { DEFAULT_SETTINGS } = require("../config/constants");
const { slugify } = require("../utils/slug");

function mapGymRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function getGymById(id) {
  const rows = await query("SELECT * FROM gyms WHERE id = ? LIMIT 1", [id]);
  return mapGymRow(rows[0]);
}

async function getGymBySlug(slug) {
  const rows = await query("SELECT * FROM gyms WHERE slug = ? LIMIT 1", [String(slug || "").toLowerCase()]);
  return mapGymRow(rows[0]);
}

async function listGyms() {
  const rows = await query("SELECT * FROM gyms ORDER BY name");
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

async function createGym({ name, slug }) {
  const id = crypto.randomUUID();
  const finalSlug = await uniqueSlug(name, slug);
  const gymName = String(name || DEFAULT_SETTINGS.gymName).trim() || DEFAULT_SETTINGS.gymName;
  await exec("INSERT INTO gyms (id, slug, name, status) VALUES (?, ?, ?, 'active')", [id, finalSlug, gymName]);
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

function duplicateGymError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

module.exports = {
  createGym,
  duplicateGymError,
  getGymById,
  getGymBySlug,
  listGyms,
  mapGymRow,
  setGymStatus,
  uniqueSlug,
};
