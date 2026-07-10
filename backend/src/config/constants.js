const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");

const PORT = Number(process.env.PORT || 5051);
const ADMIN_DIR = path.join(PROJECT_ROOT, "admin-frontend");
const CHECKIN_DIR = path.join(PROJECT_ROOT, "checkin-frontend");
const ICONS_DIR = path.join(PROJECT_ROOT, "icons");
const DATA_DIR = path.join(BACKEND_ROOT, "data");
const UPLOAD_DIR = path.join(BACKEND_ROOT, "uploads");
const LEGACY_DB_PATH = path.join(DATA_DIR, "db.json");
const SCHEMA_PATH = path.join(BACKEND_ROOT, "schema.sql");

const DEFAULT_SETTINGS = {
  gymName: "Gym Admin",
  logo: "",
  billingCycleMode: "30-days",
  customBillingDays: 25,
  defaultCollectionTiming: "at-join",
  weeklyHolidays: [0],
  holidayDates: [],
  theme: {
    primary: "#11784a",
    primaryDark: "#073f2d",
    accent: "#4f46e5",
    danger: "#c43d32",
    background: "#f6f8f5",
    panel: "#ffffff",
    text: "#17201b",
  },
};

module.exports = {
  PORT,
  PROJECT_ROOT,
  ADMIN_DIR,
  CHECKIN_DIR,
  ICONS_DIR,
  DATA_DIR,
  UPLOAD_DIR,
  LEGACY_DB_PATH,
  SCHEMA_PATH,
  DEFAULT_SETTINGS,
};
