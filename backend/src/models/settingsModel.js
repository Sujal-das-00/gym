const { DEFAULT_SETTINGS } = require("../config/constants");
const { exec, query } = require("../config/database");
const { mapSettingsRow, normalizeSettings } = require("../utils/settings");

async function ensureDefaultSettings() {
  await exec(
    `INSERT IGNORE INTO app_settings (id, gym_name, logo, billing_cycle_mode, custom_billing_days, default_collection_timing, weekly_holidays, holiday_dates, theme)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [DEFAULT_SETTINGS.gymName, DEFAULT_SETTINGS.logo, DEFAULT_SETTINGS.billingCycleMode, DEFAULT_SETTINGS.customBillingDays, DEFAULT_SETTINGS.defaultCollectionTiming, JSON.stringify(DEFAULT_SETTINGS.weeklyHolidays), JSON.stringify(DEFAULT_SETTINGS.holidayDates), JSON.stringify(DEFAULT_SETTINGS.theme)],
  );
}

async function getSettings() {
  const rows = await query("SELECT * FROM app_settings WHERE id = 1");
  return mapSettingsRow(rows[0]);
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await exec(
    `INSERT INTO app_settings (id, gym_name, logo, billing_cycle_mode, custom_billing_days, default_collection_timing, weekly_holidays, holiday_dates, theme)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gym_name = VALUES(gym_name), logo = VALUES(logo), billing_cycle_mode = VALUES(billing_cycle_mode),
       custom_billing_days = VALUES(custom_billing_days), default_collection_timing = VALUES(default_collection_timing),
       weekly_holidays = VALUES(weekly_holidays), holiday_dates = VALUES(holiday_dates), theme = VALUES(theme)`,
    [normalized.gymName, normalized.logo, normalized.billingCycleMode, normalized.customBillingDays, normalized.defaultCollectionTiming, JSON.stringify(normalized.weeklyHolidays), JSON.stringify(normalized.holidayDates), JSON.stringify(normalized.theme)],
  );
  return normalized;
}

async function getAttendanceRevision() {
  const rows = await query("SELECT attendance_revision FROM app_settings WHERE id = 1");
  return Number(rows[0]?.attendance_revision || 0);
}

async function bumpAttendanceRevision() {
  await exec("UPDATE app_settings SET attendance_revision = attendance_revision + 1 WHERE id = 1");
}

async function setAttendanceRevision(revision) {
  await exec("UPDATE app_settings SET attendance_revision = ? WHERE id = 1", [Number(revision || 0)]);
}

module.exports = {
  bumpAttendanceRevision,
  ensureDefaultSettings,
  getAttendanceRevision,
  getSettings,
  saveSettings,
  setAttendanceRevision,
};
