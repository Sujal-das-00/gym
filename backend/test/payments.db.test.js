// Phase 2 against a real MySQL database (a throwaway one, dropped afterwards;
// never gym_admin) and the real HTTP routes for permissions. Skipped when no
// DB_* credentials are configured. Clock fixed at 2 Nov 2026, 30-day cycle.
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { restoreClock, setToday } = require("./helpers");

const DB = `gym_test_payments_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
const TERMS = ["2026-08-02", "2026-09-01", "2026-10-01", "2026-10-31"];
const OWNER = { id: "owner-1", name: "Gym Owner", role: "gym_admin", email: "owner@example.test" };

let admin;
let db;
let gymId;
let otherGymId;
let svc;
let billing;
let server;
let baseUrl;

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
  const { createGym } = require("../src/models/gymModel");
  gymId = (await createGym({ name: "Payments test gym" })).id;
  otherGymId = (await createGym({ name: "Other gym" })).id;
  svc = {
    ...require("../src/services/memberService"),
    ...require("../src/services/onboardingService"),
    ...require("../src/services/paymentService"),
    ...require("../src/services/planChangeService"),
  };
  billing = require("../src/utils/billing");
  server = require("../src/app").createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  restoreClock();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

test.beforeEach(() => setToday("2026-11-02"));

let phoneSeq = 9300000000;
// An existing member who joined 2 Aug 2026 (₹1,000 monthly, upfront): terms
// 2 Aug, 1 Sep, 1 Oct, 31 Oct, each unpaid unless listed in `paid`.
async function owingMember({ paid = [], overrides = {}, onboarding } = {}) {
  phoneSeq += 1;
  const { member } = await svc.createExistingMember(
    gymId,
    {
      name: "Payer",
      phone: String(phoneSeq),
      gymId: `P${phoneSeq}`,
      fee: 1000,
      membershipType: "monthly",
      packageMonths: 1,
      collectionTiming: "at-join",
      startDate: "2026-08-02",
      ...overrides,
      onboarding: onboarding || {
        type: "existing",
        method: "periods",
        periods: TERMS.map((period) =>
          paid.includes(period)
            ? { period, status: "paid", amount: 1000, paidInFull: true, date: period, mode: "cash" }
            : { period, status: "unpaid" },
        ),
      },
    },
    OWNER,
  );
  return member;
}

const record = (member, body, user = OWNER) =>
  svc.recordPayment(gymId, member.id, { requestId: crypto.randomUUID(), date: "2026-11-02", mode: "cash", ...body }, user);

async function settings() {
  return require("../src/models").repo().getSettings(gymId);
}

const fresh = async (member) => require("../src/models").repo().getMemberById(gymId, member.id);
const status = async (member) => {
  const s = await settings();
  const m = await fresh(member);
  const ledger = billing.getPeriodLedger(m);
  return {
    member: m,
    outstanding: billing.memberOutstanding(m, s),
    overdue: billing.dueUnpaidPeriods(m, s),
    settled: TERMS.filter((period) => ledger.get(period)?.settled),
    balance: (period) => (ledger.has(period) ? ledger.get(period).charge - ledger.get(period).paid : 1000),
  };
};

async function rejects(promise, code, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

const countRows = async (sql, params = []) => Number((await db.query(sql, params))[0].n);

test("T1: a full payment settles one term", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 1000, allocation: "manual", allocations: [{ billingPeriod: "2026-10-31", amount: 1000 }] });
  assert.equal(transaction.allocations.length, 1);
  assert.deepEqual((await status(member)).settled, ["2026-10-31"]);
});

test("T2: one payment over three terms is one transaction", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 3000 });
  assert.equal(transaction.amount, 3000);
  assert.deepEqual(transaction.allocations.map((a) => a.billingPeriod), TERMS.slice(0, 3));
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payment_transactions WHERE member_id = ? AND source = 'desk'", [member.id]), 1);
  const s = await status(member);
  assert.deepEqual(s.settled, TERMS.slice(0, 3));
  assert.deepEqual(s.overdue, ["2026-10-31"]);
});

test("T3/T4: two payments settle one term; a part payment leaves a balance", opts, async () => {
  const member = await owingMember({ paid: TERMS.slice(1) });
  await record(member, { amount: 600 });
  let s = await status(member);
  assert.equal(s.balance("2026-08-02"), 400);
  assert.deepEqual(s.overdue, [], "part-paid is a balance, not overdue");
  await record(member, { amount: 400 });
  s = await status(member);
  assert.deepEqual(s.settled, TERMS);
  assert.equal(s.outstanding, 0);
});

test("T5/T5b: FIFO across Phase 1 history, and the opening balance first", opts, async () => {
  const member = await owingMember({ paid: ["2026-08-02"] });
  await record(member, { amount: 1500 });
  const s = await status(member);
  assert.deepEqual(s.settled, ["2026-08-02", "2026-09-01"]);
  assert.equal(s.balance("2026-10-01"), 500);

  const opening = await owingMember({ onboarding: { type: "existing", method: "opening", openingBalance: 3000 } });
  const { transaction } = await record(opening, { amount: 2000 });
  assert.deepEqual(transaction.allocations.map((a) => a.billingPeriod), [billing.OPENING_PERIOD_KEY]);
  assert.equal(billing.openingBalanceDue(await fresh(opening)), 1000);
});

test("T6: manual allocation to a newer term leaves older terms owed", opts, async () => {
  const member = await owingMember();
  await record(member, { amount: 1000, allocation: "manual", allocations: [{ billingPeriod: "2026-10-01", amount: 1000 }] });
  const s = await status(member);
  assert.deepEqual(s.settled, ["2026-10-01"]);
  assert.deepEqual(s.overdue, ["2026-08-02", "2026-09-01", "2026-10-31"]);
});

test("T7: overpayment, bad amounts and bad dates are rejected with nothing written", opts, async () => {
  const member = await owingMember();
  const before = await countRows("SELECT COUNT(*) AS n FROM payments WHERE member_id = ?", [member.id]);
  await rejects(record(member, { amount: 5000 }), 400, /more than the ₹4,000 owed/);
  await rejects(record(member, { amount: 0 }), 400, /above ₹0/);
  await rejects(record(member, { amount: -10 }), 400);
  await rejects(record(member, { amount: "10.555" }), 400);
  await rejects(record(member, { amount: 1000, date: "2026-11-03" }), 400, /future/);
  await rejects(record(member, { amount: 1000, date: "2026-08-01" }), 400, /before the joining date/);
  await rejects(record(member, { amount: 1000, date: "2026-02-30" }), 400);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payments WHERE member_id = ?", [member.id]), before);
});

test("T8: editing method / reference is logged and changes nothing else", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 1000 });
  const { transaction: edited } = await svc.editPaymentDetails(gymId, member.id, transaction.id, { mode: "upi", reference: "UPI 4471" }, OWNER);
  assert.equal(edited.mode, "upi");
  assert.equal(edited.reference, "UPI 4471");
  assert.equal(edited.amount, 1000);
  assert.deepEqual(edited.allocations, transaction.allocations);
  const log = await require("../src/models").repo().listCorrections(gymId, transaction.id);
  assert.deepEqual(log.map((entry) => [entry.field, entry.from, entry.to, entry.changedBy.name]), [
    ["mode", "cash", "upi", "Gym Owner"],
    ["reference", "", "UPI 4471", "Gym Owner"],
  ]);
  await rejects(svc.editPaymentDetails(gymId, member.id, transaction.id, { mode: "upi" }, OWNER), 400, /Nothing was changed/);
});

test("T8b/c/d: corrections reverse and replace atomically, keeping the original", opts, async () => {
  const member = await owingMember({ paid: TERMS.slice(1) });
  const { transaction: original } = await record(member, { amount: 1000, date: "2026-10-02" });

  // A failing replacement leaves the original untouched.
  await rejects(svc.correctPayment(gymId, member.id, original.id, { reason: "typo", amount: 9999, date: "2026-10-02" }, OWNER), 400);
  assert.equal((await fresh(member)).transactions.find((tx) => tx.id === original.id).status, "active");

  // Amount: ₹1,000 → ₹800 leaves ₹200 on the term.
  const { transaction: replacement } = await svc.correctPayment(
    gymId,
    member.id,
    original.id,
    { reason: "Typed the wrong amount", amount: 800, date: "2026-10-02" },
    OWNER,
  );
  let m = await fresh(member);
  const old = m.transactions.find((tx) => tx.id === original.id);
  assert.equal(old.status, "reversed");
  assert.equal(old.replacedById, replacement.id);
  assert.match(old.reversalReason, /^Corrected: Typed the wrong amount/);
  assert.equal(replacement.replacesId, original.id);
  assert.equal((await status(member)).balance("2026-08-02"), 200);
  await rejects(svc.correctPayment(gymId, member.id, original.id, { reason: "again", amount: 500 }, OWNER), 409, /Correct its replacement/);

  // Date: moves the income from October to September; one active payment.
  const { transaction: redated } = await svc.correctPayment(
    gymId,
    member.id,
    replacement.id,
    { reason: "Paid in September", amount: 800, date: "2026-09-28" },
    OWNER,
  );
  m = await fresh(member);
  const active = m.transactions.filter((tx) => tx.status === "active" && tx.source !== "onboarding");
  assert.deepEqual(active.map((tx) => [tx.id, tx.date, tx.amount]), [[redated.id, "2026-09-28", 800]]);
});

test("T8d: correcting the allocation moves the payment to another term", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 1000, allocation: "manual", allocations: [{ billingPeriod: "2026-10-01", amount: 1000 }] });
  await svc.correctPayment(
    gymId,
    member.id,
    transaction.id,
    { reason: "Was for the 31 Oct term", amount: 1000, allocation: "manual", allocations: [{ billingPeriod: "2026-10-31", amount: 1000 }] },
    OWNER,
  );
  assert.deepEqual((await status(member)).settled, ["2026-10-31"]);
});

test("T9/T9b: reversal restores what was owed and can't be repeated", opts, async () => {
  const member = await owingMember();
  const before = await status(member);
  const { transaction } = await record(member, { amount: 2000 });
  assert.equal((await status(member)).outstanding, before.outstanding - 2000);
  await rejects(svc.reversePayment(gymId, member.id, transaction.id, { reason: "" }, OWNER), 400, /reason/);
  const { transaction: reversed } = await svc.reversePayment(gymId, member.id, transaction.id, { reason: "Cheque bounced" }, OWNER);
  assert.equal(reversed.status, "reversed");
  assert.equal(reversed.reversedBy.name, "Gym Owner");
  assert.equal(reversed.reversalReason, "Cheque bounced");
  assert.equal((await status(member)).outstanding, before.outstanding);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payments WHERE transaction_id = ? AND reversed_at IS NOT NULL", [transaction.id]), 2);
  await rejects(svc.reversePayment(gymId, member.id, transaction.id, { reason: "Again" }, OWNER), 409, /already reversed/);
});

test("T9c/T9d: terms closed by a plan change can't be reversed; opening-balance payments can", opts, async () => {
  phoneSeq += 1;
  const member = await svc.createMember(
    gymId,
    { name: "Changer", phone: String(phoneSeq), gymId: `C${phoneSeq}`, fee: 1000, collectionTiming: "at-join", startDate: "2026-08-02" },
    OWNER,
  );
  const join = member.transactions.find((tx) => tx.source === "join");
  assert.ok(join, "the at-join first term is a transaction");
  // Phase 3 (L7): a change can't start before the current term (31 Oct), so
  // both unpaid earlier terms are collected with it and closed.
  await svc.changeMemberPlan(
    gymId,
    member.id,
    { membershipType: "monthly", packageMonths: 1, fee: 1200, collectionTiming: "at-join", effectiveDate: "2026-10-31", oldDues: "collect", mode: "cash" },
    OWNER,
  );
  const m = await fresh(member);
  const atChange = m.transactions.find((tx) => tx.source === "plan_change");
  assert.deepEqual(atChange.allocations.map((a) => a.billingPeriod), ["2026-09-01", "2026-10-01"]);
  for (const tx of [join, atChange]) {
    await rejects(svc.reversePayment(gymId, member.id, tx.id, { reason: "Test" }, OWNER), 409, /plan change/);
    await rejects(svc.correctPayment(gymId, member.id, tx.id, { reason: "Test", amount: 1 }, OWNER), 409, /plan change/);
  }
  assert.ok((await fresh(member)).transactions.filter((tx) => tx.status === "active").length >= 2, "debt kept");

  const opening = await owingMember({ onboarding: { type: "existing", method: "opening", openingBalance: 3000 } });
  const { transaction } = await record(opening, { amount: 1000 });
  await svc.reversePayment(gymId, opening.id, transaction.id, { reason: "Wrong member" }, OWNER);
  assert.equal(billing.openingBalanceDue(await fresh(opening)), 3000);
});

test("T10/T10b: an opening balance is settled by dated payments only", opts, async () => {
  const opening = await owingMember({ onboarding: { type: "existing", method: "opening", openingBalance: 3000 } });
  await rejects(record(opening, { amount: 1000, date: null }), 400, /needs the date/);
  await record(opening, { amount: 1000 });
  await record(opening, { amount: 2000, date: "2026-11-01" });
  assert.equal(billing.openingBalanceDue(await fresh(opening)), 0);
  await rejects(record(opening, { amount: 100 }), 400, /Nothing is owed/);
});

test("T11: an undated payment is filed under each term's start", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 2000, date: null });
  assert.equal(transaction.dateKnown, false);
  assert.equal(transaction.date, "2026-08-02");
  const rows = await db.query("SELECT billing_period, payment_date, date_known FROM payments WHERE transaction_id = ? ORDER BY billing_period", [transaction.id]);
  const { toDateKey } = require("../src/utils/date");
  assert.deepEqual(rows.map((row) => [row.billing_period, toDateKey(row.payment_date), Number(row.date_known)]), [
    ["2026-08-02", "2026-08-02", 0],
    ["2026-09-01", "2026-09-01", 0],
  ]);
});

test("T12/T12b: a repeated request records once; parallel requests never over-allocate", opts, async () => {
  const member = await owingMember();
  const requestId = crypto.randomUUID();
  const first = await record(member, { requestId, amount: 1000 });
  const second = await record(member, { requestId, amount: 1000 });
  assert.equal(second.repeated, true);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payment_transactions WHERE member_id = ? AND source = 'desk'", [member.id]), 1);

  const last = await owingMember({ paid: TERMS.slice(0, 3) });
  const results = await Promise.allSettled([record(last, { amount: 1000 }), record(last, { amount: 1000 }), record(last, { amount: 1000 })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(results.filter((result) => result.status === "rejected").every((result) => result.reason.status === 400));
  const s = await status(last);
  assert.equal(s.outstanding, 0);
  assert.equal(s.balance("2026-10-31"), 0, "never paid twice");
});

test("T13: monthly income is the sum of active transactions, after correct and reverse", opts, async () => {
  const member = await owingMember();
  const a = (await record(member, { amount: 1000, date: "2026-10-05" })).transaction;
  const b = (await record(member, { amount: 1000, date: "2026-10-06" })).transaction;
  await svc.correctPayment(gymId, member.id, a.id, { reason: "Was paid in Sep", amount: 1000, date: "2026-09-30" }, OWNER);
  await svc.reversePayment(gymId, member.id, b.id, { reason: "Duplicate entry" }, OWNER);
  const byMonth = await db.query(
    "SELECT DATE_FORMAT(collected_on, '%Y-%m') AS month, SUM(amount) AS total FROM payment_transactions WHERE member_id = ? AND status = 'active' AND source IN ('desk', 'correction') GROUP BY month ORDER BY month",
    [member.id],
  );
  // October's two payments: one corrected into September, one reversed.
  assert.deepEqual(byMonth.map((row) => [row.month, Number(row.total)]), [["2026-09", 1000]]);
});

test("T15: another gym can't record, edit, correct or reverse", opts, async () => {
  const member = await owingMember();
  const { transaction } = await record(member, { amount: 1000 });
  await rejects(svc.recordPayment(otherGymId, member.id, { amount: 1000 }, OWNER), 404);
  await rejects(svc.editPaymentDetails(otherGymId, member.id, transaction.id, { note: "x" }, OWNER), 404);
  await rejects(svc.reversePayment(otherGymId, member.id, transaction.id, { reason: "x x x" }, OWNER), 404);
  await rejects(svc.correctPayment(otherGymId, member.id, transaction.id, { reason: "x x x", amount: 1 }, OWNER), 404);
});

test("HTTP: owners correct and reverse; staff can record but not change (P5)", opts, async () => {
  const { sign } = require("../src/utils/jwt");
  const { authConfig } = require("../src/config/env");
  const token = (user) => sign({ sub: user.id, role: user.role, tenantId: user.tenantId, name: user.name }, authConfig().jwtSecret);
  const call = (user, method, url, body) =>
    fetch(baseUrl + url, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token(user)}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  const staff = { id: "staff-1", role: "staff", tenantId: gymId, name: "Desk Staff" };
  const owner = { ...OWNER, tenantId: gymId };
  const intruder = { id: "owner-2", role: "gym_admin", tenantId: otherGymId, name: "Other Owner" };
  const member = await owingMember();
  const base = `/api/members/${member.id}/payments`;

  const recorded = await call(staff, "POST", base, { requestId: crypto.randomUUID(), amount: 1000, date: "2026-11-02", mode: "cash" });
  assert.equal(recorded.status, 201);
  const { transaction } = await recorded.json();
  assert.equal(transaction.enteredBy.name, "Desk Staff");

  assert.equal((await call(staff, "PATCH", `${base}/${transaction.id}`, { note: "x" })).status, 403);
  assert.equal((await call(staff, "POST", `${base}/${transaction.id}/reverse`, { reason: "No way" })).status, 403);
  assert.equal((await call(staff, "POST", `${base}/${transaction.id}/correct`, { reason: "No way", amount: 1 })).status, 403);
  assert.equal((await call(intruder, "POST", `${base}/${transaction.id}/reverse`, { reason: "Not mine" })).status, 404);
  const reversed = await call(owner, "POST", `${base}/${transaction.id}/reverse`, { reason: "Test reversal" });
  assert.equal(reversed.status, 200);
  assert.equal((await reversed.json()).transaction.status, "reversed");

  // The older request body still works (T17) and returns the member, as before.
  const legacy = await call(staff, "POST", base, { payments: [{ billingPeriod: "2026-08-02", amount: 1000, mode: "upi" }] });
  assert.equal(legacy.status, 200);
  const legacyMember = await legacy.json();
  assert.equal(legacyMember.id, member.id);
  assert.equal(legacyMember.transactions.filter((tx) => tx.status === "active" && tx.source === "desk").length, 1);
});

test("T18 (P10): admission rows are left alone by profile saves and payment routes", opts, async () => {
  phoneSeq += 1;
  const member = await svc.createMember(
    gymId,
    { name: "Joiner", phone: String(phoneSeq), gymId: `J${phoneSeq}`, fee: 1000, admissionFee: 500, admissionMode: "cash", collectionTiming: "at-join", startDate: "2026-11-02" },
    OWNER,
  );
  const admission = async () => (await db.query("SELECT * FROM payments WHERE member_id = ? AND kind = 'admission'", [member.id]))[0];
  const first = await admission();
  await svc.updateMember(gymId, member.id, { ...member, name: "Joiner Renamed" });
  let now = await admission();
  assert.equal(now.id, first.id, "same row, not re-created");
  assert.equal(String(now.payment_date), String(first.payment_date));
  await svc.updateMember(gymId, member.id, { ...member, name: "Joiner Renamed", admissionFee: 600 });
  now = await admission();
  assert.equal(now.id, first.id);
  assert.equal(Number(now.amount), 600);
  assert.equal(now.transaction_id, null);
  await rejects(svc.reversePayment(gymId, member.id, first.id, { reason: "Not allowed" }, OWNER), 404);
});

test("T19: every writer records transactions with its source", opts, async () => {
  const sources = await db.query("SELECT DISTINCT source FROM payment_transactions WHERE tenant_id = ? ORDER BY source", [gymId]);
  const found = sources.map((row) => row.source);
  for (const source of ["correction", "desk", "join", "onboarding", "plan_change"]) assert.ok(found.includes(source), source);
  // Every membership row belongs to a transaction; admission rows never do.
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payments p JOIN members m ON m.id = p.member_id WHERE m.tenant_id = ? AND p.kind = 'membership' AND p.transaction_id IS NULL", [gymId]), 0);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payments p JOIN members m ON m.id = p.member_id WHERE m.tenant_id = ? AND p.kind = 'admission' AND p.transaction_id IS NOT NULL", [gymId]), 0);
});

test("T16: existing payment rows get one transaction each; nothing else changes", opts, async () => {
  const member = await owingMember();
  // Rows as they were before Phase 2: no transaction.
  for (const [id, period, date] of [
    ["legacy-row-1", "2026-08-02", "2026-08-02"],
    ["legacy-row-2", "2026-09-01", "2026-09-05"],
  ]) {
    await db.exec(
      `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount, period_fee, kind, payment_mode)
       VALUES (?, ?, ?, ?, '', ?, 1000, NULL, 'membership', 'cash')`,
      [id, member.id, date, date.slice(0, 7), period],
    );
  }
  const s = await settings();
  const before = await fresh(member);
  const beforeStatus = [billing.memberOutstanding(before, s), billing.dueUnpaidPeriods(before, s)];
  const beforeRows = await db.query("SELECT id, payment_date, billing_period, amount, period_fee, payment_mode, date_known FROM payments WHERE member_id = ? ORDER BY id", [member.id]);

  await require("../src/services/migrationService").runMigrations();
  const linked = await db.query("SELECT id, transaction_id FROM payments WHERE id LIKE 'legacy-row-%' ORDER BY id");
  assert.deepEqual(linked.map((row) => [row.id, row.transaction_id]), [
    ["legacy-row-1", "legacy-row-1"],
    ["legacy-row-2", "legacy-row-2"],
  ]);
  const tx = await db.query("SELECT id, amount, collected_on, source FROM payment_transactions WHERE id LIKE 'legacy-row-%' ORDER BY id");
  const { toDateKey } = require("../src/utils/date");
  assert.deepEqual(tx.map((row) => [row.id, Number(row.amount), toDateKey(row.collected_on), row.source]), [
    ["legacy-row-1", 1000, "2026-08-02", "legacy"],
    ["legacy-row-2", 1000, "2026-09-05", "legacy"],
  ]);
  const afterRows = await db.query("SELECT id, payment_date, billing_period, amount, period_fee, payment_mode, date_known FROM payments WHERE member_id = ? ORDER BY id", [member.id]);
  assert.deepEqual(afterRows, beforeRows, "amounts, dates and terms unchanged");
  const after = await fresh(member);
  assert.deepEqual([billing.memberOutstanding(after, s), billing.dueUnpaidPeriods(after, s)], beforeStatus);

  const count = await countRows("SELECT COUNT(*) AS n FROM payment_transactions");
  await require("../src/services/migrationService").runMigrations();
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM payment_transactions"), count, "re-running adds nothing");
});
