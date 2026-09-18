const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");

const PORT = Number(process.env.PORT || 5051);
const ADMIN_DIR = path.join(PROJECT_ROOT, "admin-frontend");
// The admin dashboard is a React app built by Vite; Express serves the build,
// not the source tree. Run `npm install && npm run build` in admin-frontend/.
const ADMIN_DIST = path.join(ADMIN_DIR, "dist");
const SUPERADMIN_DIR = path.join(PROJECT_ROOT, "superadmin-frontend");
const CHECKIN_DIR = path.join(PROJECT_ROOT, "checkin-frontend");
// The member check-in app is a React app built by Vite, like the admin dashboard.
// Run `npm install && npm run build` in checkin-frontend/.
const CHECKIN_DIST = path.join(CHECKIN_DIR, "dist");
const ICONS_DIR = path.join(PROJECT_ROOT, "icons");
// Digital Asset Links: proves the members' Android app and this site share an
// owner, which is what lets the app run without Chrome's URL bar.
const ASSET_LINKS_PATH = path.join(PROJECT_ROOT, ".well-known", "assetlinks.json");
const DATA_DIR = path.join(BACKEND_ROOT, "data");
const UPLOAD_DIR = path.join(BACKEND_ROOT, "uploads");
const LEGACY_DB_PATH = path.join(DATA_DIR, "db.json");
const SCHEMA_PATH = path.join(BACKEND_ROOT, "schema.sql");

// How a payment was collected at the front desk. Payments recorded before this
// existed carry no mode at all — that reads as "not recorded", and is never
// silently assumed to be cash.
const PAYMENT_MODES = ["cash", "upi", "card", "bank", "cheque", "other"];

const DEFAULT_SETTINGS = {
  gymName: "Gym Admin",
  logo: "",
  billingCycleMode: "30-days",
  customBillingDays: 25,
  defaultCollectionTiming: "at-join",
  allowExpiredCheckin: true,
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
  ADMIN_DIST,
  SUPERADMIN_DIR,
  CHECKIN_DIR,
  CHECKIN_DIST,
  ICONS_DIR,
  ASSET_LINKS_PATH,
  DATA_DIR,
  UPLOAD_DIR,
  LEGACY_DB_PATH,
  SCHEMA_PATH,
  DEFAULT_SETTINGS,
  PAYMENT_MODES,
};
