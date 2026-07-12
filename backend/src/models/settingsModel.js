const { exec, query } = require("../config/database");
const { mapSettingsRow, normalizeSettings } = require("../utils/settings");

async function getSettings(gymId) {
  const rows = await query("SELECT * FROM gym_settings WHERE tenant_id = ?", [gymId]);
  return mapSettingsRow(rows[0]);
}

async function saveSettings(gymId, settings) {
  const normalized = normalizeSettings(settings);
  await exec(
    `INSERT INTO gym_settings
       (tenant_id, gym_name, logo, billing_cycle_mode, custom_billing_days, default_collection_timing, allow_expired_checkin, weekly_holidays, holiday_dates, theme)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       gym_name = VALUES(gym_name), logo = VALUES(logo), billing_cycle_mode = VALUES(billing_cycle_mode),
       custom_billing_days = VALUES(custom_billing_days), default_collection_timing = VALUES(default_collection_timing),
       allow_expired_checkin = VALUES(allow_expired_checkin),
       weekly_holidays = VALUES(weekly_holidays), holiday_dates = VALUES(holiday_dates), theme = VALUES(theme)`,
    [
      gymId,
      normalized.gymName,
      normalized.logo,
      normalized.billingCycleMode,
      normalized.customBillingDays,
      normalized.defaultCollectionTiming,
      normalized.allowExpiredCheckin ? 1 : 0,
      JSON.stringify(normalized.weeklyHolidays),
      JSON.stringify(normalized.holidayDates),
      JSON.stringify(normalized.theme),
    ],
  );
  return normalized;
}

async function getAttendanceRevision(gymId) {
  const rows = await query("SELECT attendance_revision FROM gym_settings WHERE tenant_id = ?", [gymId]);
  return Number(rows[0]?.attendance_revision || 0);
}

async function bumpAttendanceRevision(gymId) {
  await exec("UPDATE gym_settings SET attendance_revision = attendance_revision + 1 WHERE tenant_id = ?", [gymId]);
}

async function setAttendanceRevision(gymId, revision) {
  await exec("UPDATE gym_settings SET attendance_revision = ? WHERE tenant_id = ?", [Number(revision || 0), gymId]);
}

module.exports = {
  bumpAttendanceRevision,
  getAttendanceRevision,
  getSettings,
  saveSettings,
  setAttendanceRevision,
};
