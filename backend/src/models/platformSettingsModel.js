const { exec, query } = require("../config/database");

async function get(name, fallback = "") {
  const rows = await query("SELECT value FROM platform_settings WHERE name = ? LIMIT 1", [name]);
  return rows.length ? String(rows[0].value) : fallback;
}

async function set(name, value) {
  await exec(
    "INSERT INTO platform_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [name, String(value)],
  );
}

// Where licence payments are sent. The database wins; UPI_ID / UPI_NAME in .env are only
// the starting point for an install that hasn't opened the console's settings yet.
async function getUpi() {
  return {
    id: (await get("upi_id", String(process.env.UPI_ID || ""))).trim(),
    name: (await get("upi_name", String(process.env.UPI_NAME || "Gymboo"))).trim() || "Gymboo",
  };
}

// Platform-wide default for the yearly server & maintenance fee: the price and the MM-DD
// window it is due in. A gym's own price / due date (on the gym) overrides these.
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
async function getMaintenanceDefaults() {
  const fallbackPrice = require("../config/env").referralConfig().maintenancePrice;
  const rows = await query(
    "SELECT name, value FROM platform_settings WHERE name IN ('maintenance_price', 'maintenance_start', 'maintenance_end', 'maintenance_enforce_from')",
  );
  const v = Object.fromEntries(rows.map((r) => [r.name, String(r.value)]));
  // Maintenance only locks an account for windows that close on or after this date, so
  // switching the feature on never locks out a gym for a window that passed before it
  // existed. It is stamped with today the first time anything reads it.
  if (!v.maintenance_enforce_from) {
    const d = new Date();
    v.maintenance_enforce_from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await set("maintenance_enforce_from", v.maintenance_enforce_from);
  }
  const price = Number(v.maintenance_price ?? fallbackPrice);
  return {
    price: Number.isFinite(price) && price > 0 ? price : fallbackPrice,
    start: MD_RE.test(v.maintenance_start || "") ? v.maintenance_start : "01-01",
    end: MD_RE.test(v.maintenance_end || "") ? v.maintenance_end : "01-15",
    enforceFrom: v.maintenance_enforce_from,
  };
}

module.exports = { MD_RE, get, getMaintenanceDefaults, getUpi, set };
