const crypto = require("crypto");
const { exec, query, raw } = require("../config/database");
const { DEFAULT_SETTINGS } = require("../config/constants");
const { slugify } = require("../utils/slug");

async function columnExists(table, column) {
  const rows = await query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const rows = await query(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
    [table, indexName],
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [table],
  );
  return rows.length > 0;
}

async function constraintExists(table, name) {
  const rows = await query(
    "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1",
    [table, name],
  );
  return rows.length > 0;
}

// Constraint tightening is best-effort: tenant isolation is enforced by the
// `tenant_id = ?` filters in the models, not by these DB constraints. If a step
// fails on an odd legacy row we log and move on rather than crash the boot.
async function tryRaw(sql, label) {
  try {
    await raw(sql);
  } catch (error) {
    console.warn(`Migration step skipped (${label}): ${error.message}`);
  }
}

async function ensureTenantColumns() {
  if (!(await columnExists("members", "tenant_id"))) {
    await raw("ALTER TABLE members ADD COLUMN tenant_id CHAR(36) NULL AFTER id");
  }
  if (!(await columnExists("checkins", "tenant_id"))) {
    await raw("ALTER TABLE checkins ADD COLUMN tenant_id CHAR(36) NULL AFTER member_id");
  }
}

function jsonOr(value, fallback) {
  if (value === null || value === undefined) return JSON.stringify(fallback);
  // mysql2 returns JSON columns already parsed; re-stringify defensively.
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value);
}

async function legacyAppSettings() {
  if (!(await tableExists("app_settings"))) return null;
  const rows = await query("SELECT * FROM app_settings WHERE id = 1 LIMIT 1");
  return rows[0] || null;
}

// Create the default gym that pre-existing (tenant-less) data is assigned to,
// carrying over the old single-row settings and attendance revision.
async function ensureDefaultGym() {
  const existing = await query("SELECT id FROM gyms ORDER BY created_at LIMIT 1");
  if (existing.length) return existing[0].id;

  const settings = await legacyAppSettings();
  const name = String(settings?.gym_name || DEFAULT_SETTINGS.gymName).trim() || DEFAULT_SETTINGS.gymName;
  const id = crypto.randomUUID();
  let slug = slugify(name);
  if ((await query("SELECT id FROM gyms WHERE slug = ? LIMIT 1", [slug])).length) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  await exec("INSERT INTO gyms (id, slug, name, status) VALUES (?, ?, ?, 'active')", [id, slug, name]);
  await exec(
    `INSERT INTO gym_settings
       (tenant_id, gym_name, logo, billing_cycle_mode, custom_billing_days, default_collection_timing, weekly_holidays, holiday_dates, theme, attendance_revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      settings?.logo || DEFAULT_SETTINGS.logo,
      settings?.billing_cycle_mode || DEFAULT_SETTINGS.billingCycleMode,
      settings?.custom_billing_days ?? DEFAULT_SETTINGS.customBillingDays,
      settings?.default_collection_timing || DEFAULT_SETTINGS.defaultCollectionTiming,
      jsonOr(settings?.weekly_holidays, DEFAULT_SETTINGS.weeklyHolidays),
      jsonOr(settings?.holiday_dates, DEFAULT_SETTINGS.holidayDates),
      jsonOr(settings?.theme, DEFAULT_SETTINGS.theme),
      Number(settings?.attendance_revision || 0),
    ],
  );
  console.log(`Created default gym "${name}" (/checkin/${slug}) for existing data.`);
  return id;
}

async function backfillTenant(defaultGymId) {
  await exec("UPDATE members SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''", [defaultGymId]);
  await exec("UPDATE checkins SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''", [defaultGymId]);
}

async function tightenConstraints() {
  // Replace the old global-unique keys with per-tenant unique keys.
  if (await indexExists("members", "gym_id")) await tryRaw("ALTER TABLE members DROP INDEX gym_id", "drop members.gym_id unique");
  if (await indexExists("members", "phone")) await tryRaw("ALTER TABLE members DROP INDEX phone", "drop members.phone unique");
  if (!(await indexExists("members", "uniq_members_tenant_code"))) {
    await tryRaw("ALTER TABLE members ADD UNIQUE KEY uniq_members_tenant_code (tenant_id, gym_id)", "add members (tenant, code) unique");
  }
  if (!(await indexExists("members", "uniq_members_tenant_phone"))) {
    await tryRaw("ALTER TABLE members ADD UNIQUE KEY uniq_members_tenant_phone (tenant_id, phone)", "add members (tenant, phone) unique");
  }
  if (!(await indexExists("members", "idx_members_tenant"))) {
    await tryRaw("ALTER TABLE members ADD INDEX idx_members_tenant (tenant_id)", "add members tenant index");
  }
  if (!(await indexExists("checkins", "idx_checkins_tenant_date"))) {
    await tryRaw("ALTER TABLE checkins ADD INDEX idx_checkins_tenant_date (tenant_id, checkin_date)", "add checkins tenant/date index");
  }

  // Only enforce NOT NULL / FK once every row is backfilled.
  const membersNull = await query("SELECT 1 FROM members WHERE tenant_id IS NULL OR tenant_id = '' LIMIT 1");
  if (!membersNull.length) {
    await tryRaw("ALTER TABLE members MODIFY COLUMN tenant_id CHAR(36) NOT NULL", "members tenant_id NOT NULL");
    if (!(await constraintExists("members", "fk_members_gym"))) {
      await tryRaw("ALTER TABLE members ADD CONSTRAINT fk_members_gym FOREIGN KEY (tenant_id) REFERENCES gyms(id) ON DELETE CASCADE", "members tenant FK");
    }
  }
  const checkinsNull = await query("SELECT 1 FROM checkins WHERE tenant_id IS NULL OR tenant_id = '' LIMIT 1");
  if (!checkinsNull.length) {
    await tryRaw("ALTER TABLE checkins MODIFY COLUMN tenant_id CHAR(36) NOT NULL", "checkins tenant_id NOT NULL");
  }
}

async function ensureFeatureColumns() {
  if (!(await columnExists("gym_settings", "allow_expired_checkin"))) {
    await tryRaw(
      "ALTER TABLE gym_settings ADD COLUMN allow_expired_checkin TINYINT(1) NOT NULL DEFAULT 1 AFTER default_collection_timing",
      "gym_settings.allow_expired_checkin",
    );
  }
  if (!(await columnExists("checkins", "expired"))) {
    await tryRaw("ALTER TABLE checkins ADD COLUMN expired TINYINT(1) NOT NULL DEFAULT 0 AFTER checkin_time", "checkins.expired");
  }
}

async function runMigrations() {
  await ensureTenantColumns();
  await ensureFeatureColumns();

  const needsDefault =
    (await query("SELECT 1 FROM members WHERE tenant_id IS NULL OR tenant_id = '' LIMIT 1")).length > 0 ||
    (await query("SELECT 1 FROM checkins WHERE tenant_id IS NULL OR tenant_id = '' LIMIT 1")).length > 0;

  if (needsDefault) {
    const defaultGymId = await ensureDefaultGym();
    await backfillTenant(defaultGymId);
  }

  await tightenConstraints();
  // Super-admins are authenticated straight from env (SUPER_ADMIN_EMAIL /
  // SUPER_ADMIN_PASSWORD) via the /superadmin panel — nothing to seed here.
}

module.exports = {
  runMigrations,
};
