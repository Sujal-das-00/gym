const fs = require("fs");
const path = require("path");
const { DEFAULT_SETTINGS, LEGACY_DB_PATH, DATA_DIR } = require("../config/constants");
const { normalizeSettings } = require("../utils/settings");

const STORE_PATH = path.join(DATA_DIR, "fallback-db.json");

const state = {
  settings: normalizeSettings(DEFAULT_SETTINGS),
  members: [],
  // "Deleted" members, kept with an archivedAt stamp (never shown or matched).
  archivedMembers: [],
  checkins: [],
  expenses: [],
  trainers: [],
  // Member plan change log (see member_plan_changes in schema.sql).
  planChanges: [],
  attendanceRevision: 0,
};

function normalizeLoaded(data = {}) {
  state.settings = normalizeSettings(data.settings || DEFAULT_SETTINGS);
  state.members = Array.isArray(data.members) ? data.members : [];
  state.checkins = Array.isArray(data.checkins) ? data.checkins : [];
  state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
  state.archivedMembers = Array.isArray(data.archivedMembers) ? data.archivedMembers : [];
  state.trainers = Array.isArray(data.trainers) ? data.trainers : [];
  state.planChanges = Array.isArray(data.planChanges) ? data.planChanges : [];
  state.attendanceRevision = Number(data.attendanceRevision || 0);
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sourcePath = fs.existsSync(STORE_PATH) ? STORE_PATH : LEGACY_DB_PATH;
  if (fs.existsSync(sourcePath)) {
    normalizeLoaded(JSON.parse(fs.readFileSync(sourcePath, "utf8")));
  } else {
    normalizeLoaded({});
  }
  persist();
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

function getState() {
  return state;
}

module.exports = {
  getState,
  load,
  persist,
};
