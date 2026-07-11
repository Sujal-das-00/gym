const fs = require("fs");
const { DEFAULT_SETTINGS, LEGACY_DB_PATH } = require("../config/constants");
const { initDatabase } = require("../config/database");
const { todayKey, toDateKey } = require("../utils/date");
const { normalizeMember } = require("../utils/member");
const { normalizeSettings } = require("../utils/settings");
const { importAttendance } = require("../models/attendanceModel");
const { importCheckin } = require("../models/checkinModel");
const { findMember, saveMember } = require("../models/memberModel");
const { importPayment } = require("../models/paymentModel");
const { saveSettings, setAttendanceRevision } = require("../models/settingsModel");
const { createGym, listGyms } = require("../models/gymModel");
const { runMigrations } = require("./migrationService");
const memoryStore = require("./memoryStore");

// One-time import of the old single-gym JSON store (backend/data/db.json) into a
// brand-new install. Everything lands under a single default gym. Skipped once any
// gym exists (i.e. after the MySQL migration has run or a gym was created).
async function importLegacyJsonIfEmpty() {
  if (!fs.existsSync(LEGACY_DB_PATH)) return;
  if ((await listGyms()).length > 0) return;

  const legacy = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, "utf8"));
  const settings = normalizeSettings(legacy.settings || DEFAULT_SETTINGS);
  const gym = await createGym({ name: settings.gymName });
  await saveSettings(gym.id, settings);

  for (const source of legacy.members || []) {
    const member = normalizeMember(source);
    await saveMember(gym.id, member);
    for (const day of member.attendance || []) await importAttendance(member.id, day);
    for (const payment of member.payments || []) await importPayment(member, payment);
  }

  for (const checkin of legacy.checkins || []) {
    const member = await findMember(gym.id, checkin.memberId || checkin.gymId || checkin.phone);
    if (!member) continue;
    await importCheckin(gym.id, member, checkin);
    await importAttendance(member.id, toDateKey(checkin.date || todayKey()));
  }

  if (Number(legacy.attendanceRevision || 0) > 0) {
    await setAttendanceRevision(gym.id, Number(legacy.attendanceRevision));
  }
}

async function bootstrapDatabase() {
  try {
    await initDatabase();
    await runMigrations();
    await importLegacyJsonIfEmpty();
    return { mode: "mysql" };
  } catch (error) {
    if (process.env.REQUIRE_DB === "true") throw error;
    console.warn("MySQL database startup failed; using local JSON fallback:", error.message);
    memoryStore.load();
    return { mode: "json", error };
  }
}

module.exports = {
  bootstrapDatabase,
};
