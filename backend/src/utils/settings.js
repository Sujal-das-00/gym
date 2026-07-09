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

function normalizeSettings(settings = {}) {
  const mode = ["month-start", "30-days", "custom-days"].includes(settings.billingCycleMode)
    ? settings.billingCycleMode
    : DEFAULT_SETTINGS.billingCycleMode;

  return {
    gymName: String(settings.gymName || DEFAULT_SETTINGS.gymName).trim() || DEFAULT_SETTINGS.gymName,
    logo: String(settings.logo || ""),
    billingCycleMode: mode,
    customBillingDays: Math.max(1, Math.round(Number(settings.customBillingDays || DEFAULT_SETTINGS.customBillingDays))),
    theme: normalizeTheme(settings.theme),
  };
}

function mapSettingsRow(row) {
  return normalizeSettings({
    gymName: row?.gym_name,
    logo: row?.logo,
    billingCycleMode: row?.billing_cycle_mode,
    customBillingDays: row?.custom_billing_days,
    theme: fromJson(row?.theme, DEFAULT_SETTINGS.theme),
  });
}

module.exports = {
  mapSettingsRow,
  normalizeSettings,
};
