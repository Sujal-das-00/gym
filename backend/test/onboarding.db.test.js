// Phase 1 against a real MySQL database: a throwaway database is created for
// this run and dropped afterwards (never gym_admin). Skipped when no DB_*
// credentials are configured. Clock fixed at 2 Nov 2026, 30-day cycle.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { restoreClock, setToday } = require("./helpers");

const DB = `gym_test_onboarding_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
let admin;
let gymId;
let db;
let services;
let billing;

test.before(async () => {
  if (!hasDb) return;
  admin = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
  });
  await admin.query(`CREATE DATABASE \`${DB}\``);
  process.env.DB_NAME = DB;
  db = require("../src/config/database");
  await db.initDatabase();
  await require("../src/services/migrationService").runMigrations();
  const gym = await require("../src/models/gymModel").createGym({ name: "Phase 1 test gym" });
  gymId = gym.id;
  services = {
    ...require("../src/services/memberService"),
    ...require("../src/services/onboardingService"),
  };
  billing = require("../src/utils/billing");
});

test.after(async () => {
  restoreClock();
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

test.beforeEach(() => setToday("2026-11-02"));

const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
let phoneSeq = 9100000000;
const nextPhone = () => String((phoneSeq += 1));
const TERMS = ["2026-08-02", "2026-09-01", "2026-10-01", "2026-10-31"];

// The admin app always sends a member code; the server's fallback code is
// time-based, which a frozen clock would repeat.
function existingPayload(onboarding, overrides = {}) {
  const phone = nextPhone();
  return {
    name: "Existing Member",
    phone,
    gymId: `T${phone}`,
    fee: 1000,
    membershipType: "monthly",
    packageMonths: 1,
    collectionTiming: "at-join",
    startDate: "2026-08-02",
    ...overrides,
    onboarding: { type: "existing", ...onboarding },
  };
}

const periods = (answers) => ({ method: "periods", periods: answers });
const paid = (period, extra = {}) => ({ period, status: "paid", amount: 1000, paidInFull: true, date: period, mode: "cash", ...extra });
const unpaid = (period) => ({ period, status: "unpaid" });

async function settings() {
  const { repo } = require("../src/models");
  return repo().getSettings(gymId);
}

async function paymentRows(memberId) {
  return db.query("SELECT * FROM payments WHERE member_id = ? ORDER BY billing_period", [memberId]);
}

async function rejects(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

test("T1/T3: past terms stored against their own terms with real dates", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload(periods([paid("2026-08-02"), paid("2026-09-01", { date: "2026-09-03" }), paid("2026-10-01"), unpaid("2026-10-31")])),
  );
  assert.equal(member.onboardingType, "existing");
  assert.equal(member.startDate, "2026-08-02");
  assert.ok(member.createdAt.startsWith("2026-11-02"), "registration is today, not the joining date");
  const rows = await paymentRows(member.id);
  assert.deepEqual(
    rows.map((row) => [row.billing_period, require("../src/utils/date").toDateKey(row.payment_date), Number(row.date_known)]),
    [
      ["2026-08-02", "2026-08-02", 1],
      ["2026-09-01", "2026-09-03", 1],
      ["2026-10-01", "2026-10-01", 1],
    ],
  );
  assert.ok(rows.every((row) => !require("../src/utils/date").toDateKey(row.payment_date).startsWith("2026-11")), "no November income");
  const s = await settings();
  assert.deepEqual(billing.dueUnpaidPeriods(member, s), ["2026-10-31"]);
  assert.equal(billing.memberOutstanding(member, s), 1000);
});

test("T2: unpaid historical terms are owed", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload(periods([unpaid("2026-08-02"), unpaid("2026-09-01"), paid("2026-10-01"), unpaid("2026-10-31")])),
  );
  const s = await settings();
  assert.deepEqual(billing.dueUnpaidPeriods(member, s), ["2026-08-02", "2026-09-01", "2026-10-31"]);
  assert.equal(billing.memberOutstanding(member, s), 3000);
});

test("T3b/T3c: an unrecorded date is filed at the term start, for both collection timings", opts, async () => {
  for (const collectionTiming of ["at-join", "fixed-day"]) {
    const { member } = await services.createExistingMember(
      gymId,
      existingPayload(periods(TERMS.map((period) => paid(period, { date: null }))), { collectionTiming }),
    );
    const rows = await paymentRows(member.id);
    assert.deepEqual(
      rows.map((row) => [require("../src/utils/date").toDateKey(row.payment_date), Number(row.date_known)]),
      TERMS.map((period) => [period, 0]),
      collectionTiming,
    );
    assert.ok(member.payments.every((payment) => payment.dateKnown === false));
  }
});

test("T4/T4c: an opening balance creates no payments and no income", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload({ method: "opening", openingBalance: 3500, openingBalanceAdmission: 500 }),
  );
  assert.equal(member.openingBalance, 3500);
  assert.equal(member.openingBalanceAdmission, 500);
  assert.equal(member.billingCutover, "2026-11-30");
  assert.equal((await paymentRows(member.id)).length, 0, "no fabricated payments, no admission row");
  const s = await settings();
  assert.equal(billing.memberOutstanding(member, s), 3500);
  assert.equal(billing.isMembershipExpired(member, s), false);

  await rejects(
    services.createExistingMember(gymId, existingPayload({ method: "opening", openingBalance: 300, openingBalanceAdmission: 500 })),
    400,
    /can't be more than the opening balance/,
  );
});

test("T5: a new member is added exactly as before", opts, async () => {
  const member = await services.createMember(gymId, {
    name: "New Member",
    phone: nextPhone(),
    gymId: "NEW001",
    fee: 1000,
    admissionFee: 500,
    admissionMode: "cash",
    membershipType: "monthly",
    collectionTiming: "at-join",
    startDate: "2026-11-02",
  });
  assert.equal(member.onboardingType, "new");
  assert.equal(member.openingBalance, 0);
  assert.equal(member.billingCutover, "");
  const rows = await paymentRows(member.id);
  const summary = rows.map((row) => [row.kind, row.billing_period, require("../src/utils/date").toDateKey(row.payment_date), Number(row.amount), Number(row.date_known)]);
  assert.deepEqual(summary.sort(), [
    ["admission", "admission", "2026-11-02", 500, 1],
    ["membership", "2026-11-02", "2026-11-02", 1000, 1],
  ]);
});

test("T6: double submit and malformed history are rejected without leftovers", opts, async () => {
  const payload = existingPayload(periods(TERMS.map((period) => paid(period))));
  const { member } = await services.createExistingMember(gymId, payload);
  await rejects(services.createExistingMember(gymId, payload), 409, /already registered/);
  const count = await db.query("SELECT COUNT(*) AS n FROM members WHERE tenant_id = ? AND phone = ?", [gymId, payload.phone]);
  assert.equal(Number(count[0].n), 1);
  assert.equal((await paymentRows(member.id)).length, 4);

  const before = Number((await db.query("SELECT COUNT(*) AS n FROM payments"))[0].n);
  await rejects(services.createExistingMember(gymId, existingPayload(periods([...TERMS.map((p) => paid(p)), paid("2026-08-02")]))), 400, /more than once/);
  await rejects(services.createExistingMember(gymId, existingPayload(periods(TERMS.slice(1).map((p) => paid(p))))), 400, /missing/);
  await rejects(
    services.createExistingMember(gymId, existingPayload({ method: "periods", periods: TERMS.map((p) => paid(p)), openingBalance: 100 })),
    400,
    /not both/,
  );
  await rejects(services.createExistingMember(gymId, existingPayload(periods([...TERMS.map((p) => paid(p)), paid("2026-11-30")]))), 400, /not one of/);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM payments"))[0].n), before, "nothing written by rejected requests");
});

test("T7/T7b: paid in full keeps the amount; otherwise the term fee leaves a balance", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload(
      periods([
        paid("2026-08-02", { amount: 800 }),
        paid("2026-09-01", { amount: 500, paidInFull: false, termFee: 1000 }),
        paid("2026-10-01"),
        paid("2026-10-31"),
      ]),
    ),
  );
  const rows = await paymentRows(member.id);
  assert.deepEqual(
    rows.slice(0, 2).map((row) => [Number(row.amount), Number(row.period_fee)]),
    [
      [800, 800],
      [500, 1000],
    ],
  );
  const s = await settings();
  assert.equal(billing.memberOutstanding(member, s), 500);
  assert.equal(billing.isMembershipExpired(member, s), false);
  await rejects(
    services.createExistingMember(gymId, existingPayload(periods([paid("2026-08-02", { amount: 1000, paidInFull: false, termFee: 1000 }), ...TERMS.slice(1).map((p) => paid(p))]))),
    400,
    /Paid in full/,
  );
});

test("T8/T8b: 24 months back is the limit; long histories warn", opts, async () => {
  const s = await settings();
  const termsFrom = (startDate) =>
    billing.getBillingPeriodKeys({ startDate, membershipType: "monthly", fee: 1000, collectionTiming: "at-join" }, s);
  const longStart = "2024-11-02";
  const { warnings } = await services.createExistingMember(
    gymId,
    existingPayload({ method: "opening", openingBalance: 1000 }, { startDate: longStart }),
  );
  assert.ok(termsFrom(longStart).length > 12);
  assert.equal(warnings.length, 1);
  await rejects(
    services.createExistingMember(gymId, existingPayload({ method: "opening", openingBalance: 1000 }, { startDate: "2024-11-01" })),
    400,
    /24 months/,
  );
  const short = await services.createExistingMember(gymId, existingPayload(periods(TERMS.map((p) => paid(p)))));
  assert.deepEqual(short.warnings, []);
});

test("T9/T10: admission date kept through profile edits (C4)", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload({ ...periods(TERMS.map((p) => paid(p))), admission: { paid: true, date: null, mode: "cash" } }, { admissionFee: 500 }),
  );
  const admission = async () => (await paymentRows(member.id)).find((row) => row.kind === "admission");
  let row = await admission();
  assert.equal(require("../src/utils/date").toDateKey(row.payment_date), "2026-08-02");
  assert.equal(Number(row.date_known), 0);

  await services.updateMember(gymId, member.id, { ...member, name: "Renamed Member" });
  await services.updateMember(gymId, member.id, { ...member, name: "Renamed Member", admissionFee: 600 });
  row = await admission();
  assert.equal(Number(row.amount), 600);
  assert.equal(require("../src/utils/date").toDateKey(row.payment_date), "2026-08-02");
  assert.equal(Number(row.date_known), 0);

  // A recorded date stays put too.
  const known = await services.createExistingMember(
    gymId,
    existingPayload({ ...periods(TERMS.map((p) => paid(p))), admission: { paid: true, date: "2026-08-05" } }, { admissionFee: 500 }),
  );
  await services.updateMember(gymId, known.member.id, { ...known.member, address: "New address" });
  const knownRow = (await paymentRows(known.member.id)).find((r) => r.kind === "admission");
  assert.equal(require("../src/utils/date").toDateKey(knownRow.payment_date), "2026-08-05");
  assert.equal(Number(knownRow.date_known), 1);
});

test("T13: existing members and payments are unchanged by the migration", opts, async () => {
  // Rebuild the pre-Phase-1 shape: drop the new columns, add legacy rows.
  for (const [table, column] of [
    ["members", "onboarding_type"],
    ["members", "opening_balance"],
    ["members", "opening_balance_admission"],
    ["members", "billing_cutover"],
    ["payments", "date_known"],
  ]) {
    await db.raw(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
  const legacyId = "legacy-member-0000-0000-000000000001";
  await db.exec(
    `INSERT INTO members (id, tenant_id, gym_id, name, phone, address, fee, membership_type, package_months, collection_timing, start_date, created_at)
     VALUES (?, ?, 'LEG001', 'Legacy Member', '9199999999', '', 1000, 'package', 3, 'at-join', '2026-08-02', '2026-08-02T05:00:00.000Z')`,
    [legacyId, gymId],
  );
  await db.exec(
    `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode)
     VALUES ('legacy-pay-1', ?, '2026-08-02', '2026-08', '', '2026-08-02', 3000, NULL, 'membership', NULL)`,
    [legacyId],
  );
  const { repo } = require("../src/models");
  const s = await settings();
  const snapshot = async () => {
    const memberRow = (await db.query("SELECT * FROM members WHERE id = ?", [legacyId]))[0];
    const payment = (await db.query("SELECT * FROM payments WHERE member_id = ?", [legacyId]))[0];
    const member = await repo().getMemberById(gymId, legacyId);
    return {
      memberRow,
      payment,
      status: [billing.dueUnpaidPeriods(member, s), billing.memberOutstanding(member, s), billing.isMembershipExpired(member, s)],
    };
  };
  const before = await snapshot();
  await require("../src/services/migrationService").runMigrations();
  const after = await snapshot();

  const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
  const memberKeys = Object.keys(before.memberRow).filter((key) => key !== "updated_at");
  assert.deepEqual(pick(after.memberRow, memberKeys), pick(before.memberRow, memberKeys));
  // Phase 2's backfill links it to a transaction of its own (same id); nothing else changes.
  assert.deepEqual(after.payment, { ...before.payment, date_known: 1, transaction_id: before.payment.id });
  assert.equal(after.memberRow.onboarding_type, "new");
  assert.equal(Number(after.memberRow.opening_balance), 0);
  assert.equal(after.memberRow.billing_cutover, null);
  assert.deepEqual(after.status, before.status, "billing status identical");
});

test("joining-date edit: terms move; unrecorded dates follow them, recorded dates don't", opts, async () => {
  const { member } = await services.createExistingMember(
    gymId,
    existingPayload(periods([paid("2026-08-02", { date: "2026-08-02" }), paid("2026-09-01", { date: null }), unpaid("2026-10-01"), unpaid("2026-10-31")])),
  );
  await services.updateMember(gymId, member.id, { ...member, startDate: "2026-08-12" });
  const rows = await paymentRows(member.id);
  const { toDateKey } = require("../src/utils/date");
  assert.deepEqual(
    rows.map((row) => [row.billing_period, toDateKey(row.payment_date), Number(row.date_known)]),
    [
      ["2026-08-12", "2026-08-02", 1],
      ["2026-09-11", "2026-09-11", 0],
    ],
  );
});
