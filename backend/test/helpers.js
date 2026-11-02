// Shared by the Phase 1 tests: a fixed clock, so billing that reads "today"
// is checked on known dates, and the admin panel's copy of the billing math,
// so every case runs through both implementations.
const path = require("path");
const { pathToFileURL } = require("url");

const RealDate = global.Date;
let fixedTime = null;

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(fixedTime ?? RealDate.now());
  }

  static now() {
    return fixedTime ?? RealDate.now();
  }
}

// Makes `new Date()` / Date.now() read 10:00 local time on `key` (YYYY-MM-DD).
function setToday(key, hour = 10) {
  const [year, month, day] = key.split("-").map(Number);
  fixedTime = new RealDate(year, month - 1, day, hour).getTime();
  global.Date = FixedDate;
}

function restoreClock() {
  fixedTime = null;
  global.Date = RealDate;
}

const ADMIN_LIB = path.join(__dirname, "..", "..", "admin-frontend", "src", "lib");

async function loadAdminLib(name) {
  return import(pathToFileURL(path.join(ADMIN_LIB, name)).href);
}

// The default 30-day cycle every gym starts on.
const SETTINGS = { billingCycleMode: "30-days", customBillingDays: 25, defaultCollectionTiming: "at-join" };

// Monthly ₹1,000, upfront, joined 2 Aug 2026: on 2 Nov 2026 its terms start
// 2 Aug, 1 Sep, 1 Oct and 31 Oct.
function existingMember(overrides = {}) {
  return {
    id: "m1",
    name: "Test Member",
    membershipType: "monthly",
    packageMonths: 1,
    fee: 1000,
    collectionTiming: "at-join",
    startDate: "2026-08-02",
    planStartDate: "",
    billingCutover: "",
    onboardingType: "existing",
    openingBalance: 0,
    openingBalanceAdmission: 0,
    createdAt: "2026-11-02T04:30:00.000Z",
    payments: [],
    ...overrides,
  };
}

let paymentSeq = 0;
function termPayment(period, amount = 1000, extra = {}) {
  paymentSeq += 1;
  return {
    id: `p${paymentSeq}`,
    kind: "membership",
    billingPeriod: period,
    billingMonth: "",
    amount,
    periodFee: amount,
    date: period,
    dateKnown: true,
    mode: "cash",
    ...extra,
  };
}

module.exports = { SETTINGS, existingMember, loadAdminLib, restoreClock, setToday, termPayment };
