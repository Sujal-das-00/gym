const { repo } = require("../models");
const { updateSettings } = require("../services/settingsService");
const { changes, record } = require("../services/auditService");

// Settings an owner changes and the log names; the logo and colours are logged as "changed".
const SETTING_FIELDS = ["gymName", "gymPhone", "billingCycleMode", "customBillingDays", "defaultCollectionTiming", "allowExpiredCheckin"];
const listText = (value) => (Array.isArray(value) ? [...value].sort().join(", ") : String(value ?? ""));

async function getSettings(req, res) {
  res.json(await repo().getSettings(req.gymId));
}

async function putSettings(req, res) {
  const before = await repo().getSettings(req.gymId);
  const saved = await updateSettings(req.gymId, req.body || {});
  const after = { ...before, ...saved };
  const changed = changes(before, after, SETTING_FIELDS);
  for (const field of ["weeklyHolidays", "holidayDates"]) {
    if (listText(before[field]) !== listText(after[field])) changed.push({ field, from: listText(before[field]), to: listText(after[field]) });
  }
  for (const field of ["logo", "theme"]) {
    if (JSON.stringify(before[field] ?? "") !== JSON.stringify(after[field] ?? "")) changed.push({ field, from: "", to: "changed" });
  }
  if (changed.length) await record(req.gymId, req.user, "settings_updated", { details: { changes: changed } });
  res.json(saved);
}

module.exports = {
  getSettings,
  putSettings,
};
