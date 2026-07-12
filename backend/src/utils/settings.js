const { DEFAULT_SETTINGS } = require("../config/constants");

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function fromJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTheme(theme = {}) {
  const defaults = DEFAULT_SETTINGS.theme;
  return {
    primary: isHexColor(theme.primary) ? theme.primary : defaults.primary,
    primaryDark: isHexColor(theme.primaryDark) ? theme.primaryDark : defaults.primaryDark,
    accent: isHexColor(theme.accent) ? theme.accent : defaults.accent,
    danger: isHexColor(theme.danger) ? theme.danger : defaults.danger,
    background: isHexColor(theme.background) ? theme.background : defaults.background,
    panel: isHexColor(theme.panel) ? theme.panel : defaults.panel,
    text: isHexColor(theme.text) ? theme.text : defaults.text,
  };
}

function normalizeWeeklyHolidays(value) {
  const list = fromJson(value, DEFAULT_SETTINGS.weeklyHolidays);
  if (!Array.isArray(list)) return [...DEFAULT_SETTINGS.weeklyHolidays];
  const days = list
    .map((day) => Math.trunc(Number(day)))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

function normalizeHolidayDates(value) {
  const list = fromJson(value, DEFAULT_SETTINGS.holidayDates);
  if (!Array.isArray(list)) return [];
  const dates = list
    .map((date) => String(date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  return [...new Set(dates)].sort();
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no"].includes(value.toLowerCase());
  return Boolean(Number(value) || value === true);
}

function normalizeSettings(settings = {}) {
  const mode = ["month-start", "30-days", "custom-days"].includes(settings.billingCycleMode)
    ? settings.billingCycleMode
    : DEFAULT_SETTINGS.billingCycleMode;

  const defaultCollectionTiming = ["at-join", "fixed-day"].includes(settings.defaultCollectionTiming)
    ? settings.defaultCollectionTiming
    : DEFAULT_SETTINGS.defaultCollectionTiming;

  return {
    gymName: String(settings.gymName || DEFAULT_SETTINGS.gymName).trim() || DEFAULT_SETTINGS.gymName,
    logo: String(settings.logo || ""),
    billingCycleMode: mode,
    customBillingDays: Math.max(1, Math.round(Number(settings.customBillingDays || DEFAULT_SETTINGS.customBillingDays))),
    defaultCollectionTiming,
    allowExpiredCheckin: toBool(settings.allowExpiredCheckin, DEFAULT_SETTINGS.allowExpiredCheckin),
    weeklyHolidays: normalizeWeeklyHolidays(settings.weeklyHolidays),
    holidayDates: normalizeHolidayDates(settings.holidayDates),
    theme: normalizeTheme(settings.theme),
  };
}

function mapSettingsRow(row) {
  return normalizeSettings({
    gymName: row?.gym_name,
    logo: row?.logo,
    billingCycleMode: row?.billing_cycle_mode,
    customBillingDays: row?.custom_billing_days,
    defaultCollectionTiming: row?.default_collection_timing,
    allowExpiredCheckin: row?.allow_expired_checkin,
    weeklyHolidays: fromJson(row?.weekly_holidays, DEFAULT_SETTINGS.weeklyHolidays),
    holidayDates: fromJson(row?.holiday_dates, DEFAULT_SETTINGS.holidayDates),
    theme: fromJson(row?.theme, DEFAULT_SETTINGS.theme),
  });
}

module.exports = {
  mapSettingsRow,
  normalizeSettings,
};
