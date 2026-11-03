// Upgrading a database that ran the reverted payment-transactions /
// membership-lifecycle release (origin/main "phase 4"): reversed payments must
// not count again, and dues that release kept as balance must stay owed. A
// throwaway database is created and dropped (never gym_admin); skipped without
// DB_* credentials.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

const DB = `gym_test_upgrade_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
let admin;
let db;

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
});

test.after(async () => {
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

test("reversed payments and kept-as-balance dues from the reverted release migrate safely", opts, async () => {
  const { runMigrations } = require("../src/services/migrationService");
  const { repo } = require("../src/models");
  const billing = require("../src/utils/billing");
  const gymId = (await require("../src/models/gymModel").createGym({ name: "Upgrade gym" })).id;
  // The columns that release added.
  await db.raw("ALTER TABLE payments ADD COLUMN reversed_at DATETIME NULL DEFAULT NULL");
  await db.raw("ALTER TABLE member_plan_changes ADD COLUMN dues_detail JSON NULL");

  const member = { id: "m1", gymId: "U001", name: "Kiran", phone: "9300000101", address: "MG Road", fee: 1000, admissionFee: 0,
    membershipType: "monthly", packageMonths: 1, collectionTiming: "at-join", startDate: "2026-08-02", planStartDate: "2026-11-03",
    photo: "", trainerId: "", createdAt: "2026-08-02T04:30:00.000Z" };
  await repo().saveMember(gymId, member);
  const insert = (id, period, amount, reversed = null) =>
    db.exec(
      "INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, reversed_at) VALUES (?, 'm1', ?, ?, '', ?, ?, 1000, 'membership', ?)",
      [id, period, period.slice(0, 7), period, amount, reversed],
    );
  // The new plan's first term: one payment reversed, so it is still owed.
  await insert("p-rev", "2026-11-03", 1000, "2026-11-03 10:00:00");
  // Two old-plan terms kept as balance; ₹300 already paid toward one of them.
  await insert("p-part", "2026-10-01", 300);
  await db.exec(
    `INSERT INTO member_plan_changes (id, tenant_id, member_id, member_name, member_code, old_membership_type, old_package_months, old_fee,
       old_collection_timing, new_membership_type, new_package_months, new_fee, new_collection_timing, effective_date, dues_collected,
       dues_waived, first_term_collected, note, changed_by_id, changed_by_name, changed_by_role, changed_at, dues_detail)
     VALUES ('c1', ?, 'm1', 'Kiran', 'U001', 'monthly', 1, 1000, 'at-join', 'monthly', 1, 1000, 'at-join', '2026-11-03', 0, 0, 0, '', 'u1', 'Owner', 'gym_admin', ?, ?)`,
    [gymId, "2026-11-03T05:00:00.000Z", JSON.stringify({ collected: [], waived: [], carried: [{ period: "2026-09-01", fee: 1000, balance: 1000 }, { period: "2026-10-01", fee: 1000, balance: 700 }] })],
  );

  await runMigrations();
  await runMigrations(); // twice: the conversion happens once

  const saved = await repo().getMemberById(gymId, "m1");
  const settings = await repo().getSettings(gymId);
  assert.equal(saved.payments.some((payment) => payment.id === "p-rev"), false, "a reversed payment pays nothing");
  assert.equal(saved.openingBalance, 1700, "₹1,000 + the ₹700 left on the part-paid kept term");
  assert.equal(billing.openingBalanceDue(saved), 1700);
  // Owed, but kept dues never make the member overdue.
  assert.deepEqual(billing.dueUnpaidPeriods(saved, settings).filter((period) => period < "2026-11-03"), []);
  const [row] = await db.query("SELECT dues_detail FROM member_plan_changes WHERE id = 'c1'");
  const detail = typeof row.dues_detail === "string" ? JSON.parse(row.dues_detail) : row.dues_detail;
  assert.deepEqual(detail.carried, []);
  assert.deepEqual(detail.carriedToOpeningBalance.map((term) => term.balanceMoved), [1000, 700]);
});
