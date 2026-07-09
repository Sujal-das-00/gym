const fs = require("fs");
const { DEFAULT_SETTINGS, LEGACY_DB_PATH } = require("../config/constants");
const { initDatabase } = require("../config/database");
const { todayKey, toDateKey } = require("../utils/date");
const { normalizeMember } = require("../utils/member");
const { normalizeSettings } = require("../utils/settings");
const { importAttendance } = require("../models/attendanceModel");
const { importCheckin } = require("../models/checkinModel");
const { countMembers, findMember, saveMember } = require("../models/memberModel");
const { importPayment } = require("../models/paymentModel");
const { ensureDefaultSettings, saveSettings, setAttendanceRevision } = require("../models/settingsModel");
const memoryStore = require("./memoryStore");

async function importLegacyJsonIfEmpty() {
  if ((await countMembers()) > 0 || !fs.existsSync(LEGACY_DB_PATH)) return;
  const legacy = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, "utf8"));
  await saveSettings(normalizeSettings(legacy.settings || DEFAULT_SETTINGS));

  for (const source of legacy.members || []) {
    const member = normalizeMember(source);
    await saveMember(member);
    for (const day of member.attendance || []) await importAttendance(member.id, day);
    for (const payment of member.payments || []) await importPayment(member, payment);
  }

  for (const checkin of legacy.checkins || []) {
    const member = await findMember(checkin.memberId || checkin.gymId || checkin.phone);
    if (!member) continue;
    await importCheckin(member, checkin);
    await importAttendance(member.id, toDateKey(checkin.date || todayKey()));
  }

  if (Number(legacy.attendanceRevision || 0) > 0) {
    await setAttendanceRevision(Number(legacy.attendanceRevision));
  }
}

async function bootstrapDatabase() {
  try {
    await initDatabase();
    await ensureDefaultSettings();
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
