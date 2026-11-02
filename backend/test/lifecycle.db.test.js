// Phase 3 (membership lifecycle) against a real MySQL database (a throwaway
// one, dropped afterwards; never gym_admin), the real services, the real
// check-in gate and the real HTTP routes. Skipped when no DB_* credentials are
// configured. Clock fixed at 2 Nov 2026 unless a test moves it; 30-day cycle.
// Test names carry the spec's §12 numbers (S1–S20).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { restoreClock, setToday } = require("./helpers");

const DB = `gym_test_lifecycle_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
const OWNER = { id: "owner-1", name: "Gym Owner", role: "gym_admin", email: "owner@example.test" };

let admin;
let db;
let gymId;
let otherGymId;
let svc;
let billing;
let models;
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
  gymId = (await createGym({ name: "Lifecycle test gym" })).id;
  otherGymId = (await createGym({ name: "Other gym" })).id;
  svc = {
    ...require("../src/services/memberService"),
    ...require("../src/services/onboardingService"),
    ...require("../src/services/paymentService"),
    ...require("../src/services/planChangeService"),
    ...require("../src/services/checkinService"),
  };
  billing = require("../src/utils/billing");
  models = require("../src/models");
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

const today = () => require("../src/utils/date").todayKey();
let phoneSeq = 9400000000;

// A new member (₹1,000 monthly upfront unless overridden). Joining pays the first term.
async function newMember(startDate, overrides = {}) {
  phoneSeq += 1;
  return svc.createMember(
    gymId,
    {
      name: "Lifer",
      phone: String(phoneSeq),
      gymId: `L${phoneSeq}`,
      fee: 1000,
      membershipType: "monthly",
      packageMonths: 1,
      collectionTiming: "at-join",
      startDate,
      ...overrides,
    },
    OWNER,
  );
}

// Joined 2 Aug 2026 as an existing member with a ₹3,000 opening balance (Phase 1).
async function openingMember() {
  phoneSeq += 1;
  const { member } = await svc.createExistingMember(
    gymId,
    {
      name: "Opener",
      phone: String(phoneSeq),
      gymId: `O${phoneSeq}`,
      fee: 1000,
      membershipType: "monthly",
      packageMonths: 1,
      collectionTiming: "at-join",
      startDate: "2026-08-02",
      onboarding: { type: "existing", method: "opening", openingBalance: 3000 },
    },
    OWNER,
  );
  return member;
}

const record = (member, body) =>
  svc.recordPayment(gymId, member.id, { requestId: crypto.randomUUID(), date: today(), mode: "cash", ...body }, OWNER);

const changePlan = (member, body) =>
  svc.changeMemberPlan(
    gymId,
    member.id,
    { requestId: crypto.randomUUID(), membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "at-join", mode: "cash", ...body },
    OWNER,
  );

const restart = (member, body = {}) => changePlan(member, { restart: true, effectiveDate: today(), ...body });

const settings = () => models.repo().getSettings(gymId);
const fresh = (member) => models.repo().getMemberById(gymId, member.id);
const terms = async (member) => billing.getBillingPeriodKeys(await fresh(member), await settings());
const periodsOf = (tx) => tx.allocations.map((allocation) => allocation.billingPeriod);
const countRows = async (sql, params = []) => Number((await db.query(sql, params))[0].n);

async function rejects(promise, code, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

// Every term's money stays within its fee, and no key is both kept and on the grid.
async function assertConsistent(member) {
  const m = await fresh(member);
  const s = await settings();
  for (const [period, entry] of billing.getPeriodLedger(m)) {
    assert.ok(entry.legacy || entry.paid <= entry.charge, `${period} over-paid: ${entry.paid} of ${entry.charge}`);
  }
  const grid = new Set(billing.getBillingPeriodKeys(m, s));
  for (const term of m.carriedTerms) assert.ok(!grid.has(term.period), `${term.period} is both kept and billed`);
  assert.equal(new Set(m.carriedTerms.map((term) => term.period)).size, m.carriedTerms.length, "a term kept twice");
}

test("S1/S16: renewing before expiry pays the next term; Nov 1–30 is followed by Dec 1–30", opts, async () => {
  const member = await newMember("2026-11-01");
  const { transaction } = await record(member, { amount: 1000, renewAhead: true });
  assert.deepEqual(periodsOf(transaction), ["2026-12-01"]);
  const s = await settings();
  const m = await fresh(member);
  assert.equal(billing.memberBillingSummary(m, s).nextDueDate, "2026-12-31", "paid through 30 Dec");
  assert.deepEqual(await terms(member), ["2026-11-01"], "the grid didn't move");
  await rejects(record(member, { amount: 1000, renewAhead: true }), 400, /Only one term can be paid ahead/);
  await rejects(record(member, { amount: 1000 }), 400, /Nothing is owed/);
  await assertConsistent(member);
});

test("S2: renewing after expiry pays the lapsed terms on the original cycle", opts, async () => {
  const member = await newMember("2026-09-01"); // 1 Sep paid at joining; 1 Oct and 31 Oct lapsed
  const s = await settings();
  assert.equal(billing.isMembershipExpired(await fresh(member), s), true);
  const first = await record(member, { amount: 1000 });
  assert.deepEqual(periodsOf(first.transaction), ["2026-10-01"], "oldest lapsed term first");
  assert.equal(billing.isMembershipExpired(await fresh(member), s), true, "31 Oct still lapsed");
  await record(member, { amount: 1000 });
  const m = await fresh(member);
  assert.equal(billing.isMembershipExpired(m, s), false);
  assert.deepEqual(await terms(member), ["2026-09-01", "2026-10-01", "2026-10-31"], "late payment didn't move the cycle");
  assert.equal(billing.memberBillingSummary(m, s).nextDueDate, "2026-11-30");
});

test("S3: consecutive renewals, each one term ahead, keep the grid", opts, async () => {
  const member = await newMember("2026-11-01");
  const paid = [];
  for (const day of ["2026-11-02", "2026-12-01", "2026-12-31"]) {
    setToday(day);
    paid.push(...periodsOf((await record(member, { amount: 1000, renewAhead: true })).transaction));
  }
  assert.deepEqual(paid, ["2026-12-01", "2026-12-31", "2027-01-30"]);
  assert.deepEqual(await terms(member), ["2026-11-01", "2026-12-01", "2026-12-31"]);
  const m = await fresh(member);
  assert.equal(m.transactions.filter((tx) => tx.source === "desk").length, 3, "one transaction per renewal");
  await assertConsistent(member);
});

test("S4/S6: an immediate upgrade starts a new cycle at the full new fee; the paid term is untouched", opts, async () => {
  const member = await newMember("2026-10-20"); // paid 20 Oct – 18 Nov
  const { change, member: after } = await changePlan(member, { fee: 1500, effectiveDate: "2026-11-02", collectFirstTerm: true });
  assert.equal(change.changeType, "upgrade");
  assert.equal(after.fee, 1500);
  assert.equal(after.planStartDate, "2026-11-02");
  const atChange = after.transactions.find((tx) => tx.source === "plan_change");
  assert.deepEqual([atChange.amount, periodsOf(atChange)], [1500, ["2026-11-02"]], "no proration: the full new fee");
  const old = billing.getPeriodLedger(after).get("2026-10-20");
  assert.deepEqual([old.paid, old.charge, old.settled], [1000, 1000, true], "the paid term keeps its price");
  // A change can never take over a paid term.
  const other = await newMember("2026-10-20");
  await rejects(changePlan(other, { fee: 1500, effectiveDate: "2026-10-20" }), 400, /already paid on the current plan/);
  await rejects(changePlan(other, { fee: 1500, effectiveDate: "2026-10-10" }), 400, /before the current term/);
});

test("S7: a future-effective upgrade waits; the member stays Active until it starts", opts, async () => {
  const member = await newMember("2026-10-20");
  await changePlan(member, { fee: 1500, effectiveDate: "2026-11-19" });
  const s = await settings();
  let m = await fresh(member);
  assert.equal(billing.membershipStatus(m, s), "active");
  assert.equal(billing.memberOutstanding(m, s), 0);
  assert.deepEqual(billing.getBillingPeriodKeys(m, s), [], "no new-plan term before 19 Nov");
  const history = await svc.getMembershipHistory(gymId, member.id);
  assert.equal(history.upcomingChange, "2026-11-19");
  assert.deepEqual(history.entries.at(-1).type + ":" + history.entries.at(-1).state, "upgrade:scheduled");

  setToday("2026-11-19");
  m = await fresh(member);
  assert.deepEqual(billing.getBillingPeriodKeys(m, s), ["2026-11-19"]);
  assert.equal(billing.isMembershipExpired(m, s), false, "upfront: due on the day it starts");
  setToday("2026-11-20");
  assert.equal(billing.memberOutstanding(await fresh(member), s), 1500, "then owed at the new fee");
});

test("S5: a downgrade only starts at the next renewal; nothing refunded or re-priced", opts, async () => {
  const member = await newMember("2026-10-20", { fee: 1500 });
  await rejects(changePlan(member, { fee: 1000, effectiveDate: "2026-11-02" }), 400, /downgrade starts at the next renewal \(2026-11-19\)/);
  const before = await db.query("SELECT id, amount, period_fee, billing_period FROM payments WHERE member_id = ? ORDER BY id", [member.id]);
  const { change } = await changePlan(member, { fee: 1000, effectiveDate: "2026-11-19" });
  assert.equal(change.changeType, "downgrade");
  const after = await db.query("SELECT id, amount, period_fee, billing_period FROM payments WHERE member_id = ? ORDER BY id", [member.id]);
  assert.deepEqual(after, before, "no refund row; the paid term keeps its ₹1,500 price");
});

test("S9/S11: upgrade with unpaid dues: an explicit collect, keep or waive, each recorded term by term", opts, async () => {
  const body = { fee: 1500, effectiveDate: "2026-11-02" };
  const owing = await newMember("2026-09-01"); // 1 Oct and 31 Oct unpaid
  await rejects(changePlan(owing, body), 409, /collect it, waive it or keep it as balance due/);

  const kept = await changePlan(owing, { ...body, oldDues: "carry" });
  assert.equal(kept.change.duesCarried, 2000);
  assert.deepEqual(kept.change.duesDetail.carried.map((due) => due.period), ["2026-10-01", "2026-10-31"]);
  const s = await settings();
  const m = await fresh(owing);
  assert.equal(billing.memberOutstanding(m, s), 2000, "still owed");
  assert.equal(billing.isMembershipExpired(m, s), false, "kept dues don't expire the membership");
  await assertConsistent(owing);

  const waiver = await newMember("2026-09-01");
  const waived = await changePlan(waiver, { ...body, oldDues: "waive", note: "Goodwill" });
  assert.deepEqual(
    waived.change.duesDetail.waived.map((due) => [due.period, due.balance]),
    [["2026-10-01", 1000], ["2026-10-31", 1000]],
    "an auditable list of what was waived",
  );
  assert.equal(waived.change.duesWaived, 2000);
  assert.equal(billing.memberOutstanding(await fresh(waiver), s), 0);

  const payer = await newMember("2026-09-01");
  const collected = await changePlan(payer, { ...body, oldDues: "collect" });
  const tx = (await fresh(payer)).transactions.find((item) => item.source === "plan_change");
  assert.deepEqual([tx.amount, periodsOf(tx)], [2000, ["2026-10-01", "2026-10-31"]]);
  assert.equal(collected.change.duesCollected, 2000);

  // A Phase 1 opening balance is never touched by a plan change.
  const opener = await openingMember();
  await changePlan(opener, { fee: 1500, effectiveDate: "2026-11-30" });
  assert.equal(billing.openingBalanceDue(await fresh(opener)), 3000);
});

test("S10/S12: renewing with dues outstanding, and part payments on renewals and upgrades", opts, async () => {
  // An opening balance doesn't hold a renewal up, and a renewal doesn't settle it.
  const opener = await openingMember(); // billing starts 30 Nov
  const { transaction } = await record(opener, {
    amount: 1000,
    renewAhead: true,
    allocation: "manual",
    allocations: [{ billingPeriod: "2026-11-30", amount: 1000 }],
  });
  assert.deepEqual(periodsOf(transaction), ["2026-11-30"]);
  assert.equal(billing.openingBalanceDue(await fresh(opener)), 3000, "old dues not marked paid");

  // ₹400 now toward the next term, ₹600 later.
  const member = await newMember("2026-11-01");
  await record(member, { amount: 400, renewAhead: true });
  const s = await settings();
  let m = await fresh(member);
  assert.deepEqual(billing.advanceTerm(m, s), { period: "2026-12-01", charge: 1000, paid: 400, balance: 600 });
  assert.equal(billing.paidAheadEndKey(m, s), "", "not paid ahead until it's paid in full");
  await record(member, { amount: 600, renewAhead: true });
  m = await fresh(member);
  assert.equal(billing.getPeriodLedger(m).get("2026-12-01").settled, true);

  // After an upgrade, its first term can be paid in parts like any other.
  const upgrader = await newMember("2026-10-20");
  await changePlan(upgrader, { fee: 1500, effectiveDate: "2026-11-02" });
  await record(upgrader, { amount: 700 });
  const entry = billing.getPeriodLedger(await fresh(upgrader)).get("2026-11-02");
  assert.deepEqual([entry.paid, entry.charge, entry.settled], [700, 1500, false]);
  await assertConsistent(upgrader);
});

test("L4: Restart membership: same plan, new cycle; missed terms kept, collected or waived, never duplicated", opts, async () => {
  const active = await newMember("2026-10-20");
  await rejects(restart(active), 400, /hasn't lapsed/);

  const member = await newMember("2026-09-01"); // lapsed: 1 Oct and 31 Oct unpaid
  await rejects(changePlan(member, { effectiveDate: "2026-11-02" }), 400, /use Restart membership/);
  await rejects(restart(member), 409, /collect it, waive it or keep it/);
  await rejects(restart(member, { effectiveDate: "2026-11-05", oldDues: "carry" }), 400, /future/);

  const { change, member: after } = await restart(member, { oldDues: "carry", collectFirstTerm: true });
  assert.equal(change.changeType, "restart");
  assert.deepEqual(change.to, change.from, "same plan");
  assert.equal(after.planStartDate, "2026-11-02");
  const s = await settings();
  const m = await fresh(member);
  assert.deepEqual(billing.getBillingPeriodKeys(m, s), ["2026-11-02"], "a new cycle from the return date");
  assert.deepEqual(m.carriedTerms.map((term) => term.period), ["2026-10-01", "2026-10-31"], "missed terms still owed");
  assert.equal(billing.memberOutstanding(m, s), 2000);
  assert.equal(billing.membershipStatus(m, s), "active");
  await assertConsistent(member);

  // Paying the kept dues settles them oldest first.
  const paid = await record(member, { amount: 1000 });
  assert.deepEqual(periodsOf(paid.transaction), ["2026-10-01"]);
  assert.equal(billing.memberOutstanding(await fresh(member), s), 1000);
});

test("S8/S15: history keeps every plan, term, price and payment; periods never overlap", opts, async () => {
  const member = await newMember("2026-10-20");
  await changePlan(member, { fee: 1500, effectiveDate: "2026-11-02", collectFirstTerm: true }); // upgrade now
  await record(member, { amount: 1500, renewAhead: true }); // 2 Dec term, ahead
  // The downgrade waits for the end of the term paid ahead.
  await rejects(changePlan(member, { fee: 1000, effectiveDate: "2026-12-02" }), 400);
  await changePlan(member, { fee: 1000, effectiveDate: "2027-01-01", note: "Cheaper plan" });
  // Ordinary profile edits never rewrite history.
  await svc.updateMember(gymId, member.id, { ...(await fresh(member)), name: "Renamed Lifer" });

  const history = await svc.getMembershipHistory(gymId, member.id);
  assert.deepEqual(
    history.entries.map((entry) => [entry.type, entry.date, entry.plan.fee, entry.term?.status || "", entry.state]),
    [
      ["joined", "2026-10-20", 1000, "paid", "started"],
      ["upgrade", "2026-11-02", 1500, "paid", "started"],
      ["renewed", "2026-12-02", 1500, "paid", "scheduled"],
      ["downgrade", "2027-01-01", 1000, "", "scheduled"],
    ],
  );
  const [joined, upgrade, ahead, downgrade] = history.entries;
  assert.equal(joined.term.lastDay, "2026-11-01", "ended early by the upgrade");
  assert.deepEqual([upgrade.previousPlan.fee, upgrade.term.fee], [1000, 1500]);
  assert.equal(ahead.term.paidAhead, true);
  assert.equal(ahead.term.payments.length, 1);
  assert.equal(downgrade.change.note, "Cheaper plan");
  assert.equal(downgrade.change.by.name, "Gym Owner");
  // Terms are consecutive and never overlap.
  const termList = history.entries.map((entry) => entry.term).filter(Boolean);
  for (let i = 1; i < termList.length; i += 1) assert.ok(termList[i].start > termList[i - 1].lastDay, "overlap");
  await assertConsistent(member);
});

test("S13: reversals still work on renewals, upgrades and kept dues", opts, async () => {
  const member = await newMember("2026-11-01");
  const { transaction } = await record(member, { amount: 1000, renewAhead: true });
  const s = await settings();
  await svc.correctPayment(gymId, member.id, transaction.id, { reason: "Typed wrong", amount: 800, date: today() }, OWNER);
  let m = await fresh(member);
  assert.equal(billing.advanceTerm(m, s).balance, 200, "a paid-ahead payment can be corrected onto its term");
  const replacement = m.transactions.find((tx) => tx.status === "active" && tx.source === "correction");
  await svc.reversePayment(gymId, member.id, replacement.id, { reason: "Refunded at desk" }, OWNER);
  m = await fresh(member);
  assert.equal(billing.advanceTerm(m, s).balance, 1000, "the next term is unpaid again");

  // Reversing the first-term payment taken with an upgrade leaves the plan changed and the term owed.
  const upgrader = await newMember("2026-10-20");
  await changePlan(upgrader, { fee: 1500, effectiveDate: "2026-11-02", collectFirstTerm: true });
  const atChange = (await fresh(upgrader)).transactions.find((tx) => tx.source === "plan_change");
  await svc.reversePayment(gymId, upgrader.id, atChange.id, { reason: "Card declined" }, OWNER);
  m = await fresh(upgrader);
  assert.equal(m.fee, 1500);
  assert.equal(billing.getPeriodLedger(m).has("2026-11-02"), false);

  // A payment on a kept term can be reversed (P6 doesn't apply): the debt stays.
  const lapsed = await newMember("2026-09-01");
  await restart(lapsed, { oldDues: "carry" });
  const keptPayment = await record(lapsed, { amount: 1000 });
  await svc.reversePayment(gymId, lapsed.id, keptPayment.transaction.id, { reason: "Wrong member" }, OWNER);
  assert.equal(billing.carriedBalanceDue(await fresh(lapsed)), 2000);
});

test("S14: a repeated or concurrent change saves once; renewals never double-pay", opts, async () => {
  const member = await newMember("2026-10-20");
  const body = { requestId: crypto.randomUUID(), membershipType: "monthly", packageMonths: 1, fee: 1500, collectionTiming: "at-join", effectiveDate: "2026-11-19" };
  const [a, b] = await Promise.all([
    svc.changeMemberPlan(gymId, member.id, body, OWNER),
    svc.changeMemberPlan(gymId, member.id, body, OWNER),
  ]);
  assert.equal(a.change.id, b.change.id);
  assert.equal([a.repeated, b.repeated].filter(Boolean).length, 1);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM member_plan_changes WHERE member_id = ?", [member.id]), 1);

  // Two different sheets at once: the second sees the plan already changed.
  const twin = await newMember("2026-10-20");
  const results = await Promise.allSettled([
    changePlan(twin, { fee: 1500, effectiveDate: "2026-11-19" }),
    changePlan(twin, { fee: 1500, effectiveDate: "2026-11-19" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await countRows("SELECT COUNT(*) AS n FROM member_plan_changes WHERE member_id = ?", [twin.id]), 1);

  // Two renewals at once: one pays the next term, the other is refused.
  const renewer = await newMember("2026-11-01");
  const renewals = await Promise.allSettled([1, 2].map(() => record(renewer, { amount: 1000, renewAhead: true })));
  assert.equal(renewals.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(billing.getPeriodLedger(await fresh(renewer)).get("2026-12-01").paid, 1000);

  // A desk payment racing a plan change that collects the same dues never over-pays a term.
  const raced = await newMember("2026-09-01");
  await Promise.allSettled([
    changePlan(raced, { fee: 1500, effectiveDate: "2026-11-02", oldDues: "collect" }),
    record(raced, { amount: 1000 }),
  ]);
  await assertConsistent(raced);
});

test("S17: check-in eligibility follows membership validity, not dues", opts, async () => {
  const { dailyCode } = require("../src/utils/dailyCode");
  await db.exec("UPDATE gym_settings SET allow_expired_checkin = 0 WHERE tenant_id = ?", [gymId]);
  try {
    const checkIn = (member) => svc.checkInMember(gymId, member.gymId, dailyCode(gymId));
    const lapsed = await newMember("2026-09-01");
    assert.equal((await checkIn(lapsed)).denied, true, "expired → refused (gym setting off)");
    await restart(lapsed, { oldDues: "carry" });
    const back = await checkIn(lapsed);
    assert.ok(!back.denied, "restarted with kept dues → allowed");
    assert.equal(back.billing.carriedBalanceDue, 2000);
    assert.equal(back.billing.status, "active");

    const scheduled = await newMember("2026-10-20");
    await changePlan(scheduled, { fee: 1500, effectiveDate: "2026-11-19" });
    assert.ok(!(await checkIn(scheduled)).denied, "scheduled upgrade → still allowed on the current plan");

    const upgradedWithDues = await newMember("2026-09-01");
    await changePlan(upgradedWithDues, { fee: 1500, effectiveDate: "2026-11-02", oldDues: "carry" });
    assert.ok(!(await checkIn(upgradedWithDues)).denied, "kept dues alone never block");
  } finally {
    await db.exec("UPDATE gym_settings SET allow_expired_checkin = 1 WHERE tenant_id = ?", [gymId]);
  }
});

test("S20: another gym can't change, restart or read a member's history", opts, async () => {
  const member = await newMember("2026-10-20");
  const body = { membershipType: "monthly", packageMonths: 1, fee: 1500, collectionTiming: "at-join", effectiveDate: "2026-11-19" };
  await rejects(svc.changeMemberPlan(otherGymId, member.id, body, OWNER), 404);
  await rejects(svc.changeMemberPlan(otherGymId, member.id, { restart: true, effectiveDate: "2026-11-02" }, OWNER), 404);
  await rejects(svc.getMembershipHistory(otherGymId, member.id), 404);

  const { sign } = require("../src/utils/jwt");
  const { authConfig } = require("../src/config/env");
  const call = (user, url) =>
    fetch(baseUrl + url, {
      headers: { authorization: `Bearer ${sign({ sub: user.id, role: user.role, tenantId: user.tenantId, name: user.name }, authConfig().jwtSecret)}` },
    });
  const url = `/api/members/${member.id}/membership-history`;
  assert.equal((await call({ id: "owner-2", role: "gym_admin", tenantId: otherGymId, name: "Other" }, url)).status, 404);
  const own = await call({ ...OWNER, tenantId: gymId }, url);
  assert.equal(own.status, 200);
  assert.equal((await own.json()).entries[0].type, "joined");
});

test("Migration: old plan changes are classified once; boot and SQL file are re-runnable", opts, async () => {
  const member = await newMember("2026-10-20");
  const legacy = [
    ["legacy-up", "monthly", 1, 1000, "monthly", 1, 1500, "upgrade"],
    ["legacy-down", "monthly", 1, 1000, "package", 3, 2700, "downgrade"],
    ["legacy-same", "monthly", 1, 1000, "package", 3, 3000, "change"],
  ];
  const dropPhase3 = () =>
    db.exec(
      "ALTER TABLE member_plan_changes DROP INDEX uniq_plan_changes_request, DROP COLUMN dues_detail, DROP COLUMN request_id, DROP COLUMN change_type",
    );
  const insertLegacy = async () => {
    await db.exec("DELETE FROM member_plan_changes WHERE id LIKE 'legacy-%'");
    for (const [id, oldType, oldMonths, oldFee, newType, newMonths, newFee] of legacy) {
      await db.exec(
        `INSERT INTO member_plan_changes (id, tenant_id, member_id, old_membership_type, old_package_months, old_fee,
           new_membership_type, new_package_months, new_fee, effective_date, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-01T05:00:00.000Z')`,
        [id, gymId, member.id, oldType, oldMonths, oldFee, newType, newMonths, newFee],
      );
    }
  };
  const types = async () =>
    (await db.query("SELECT id, change_type, request_id, dues_detail FROM member_plan_changes WHERE id LIKE 'legacy-%' ORDER BY id")).map(
      (row) => [row.id, row.change_type, row.request_id, row.dues_detail],
    );
  const expected = legacy.map(([id, , , , , , , type]) => [id, type, null, null]).sort((a, b) => a[0].localeCompare(b[0]));

  // Boot migration (migrationService).
  await dropPhase3();
  await insertLegacy();
  await require("../src/services/migrationService").runMigrations();
  assert.deepEqual(await types(), expected);
  await require("../src/services/migrationService").runMigrations();
  assert.deepEqual(await types(), expected, "re-running changes nothing");

  // Hand-run SQL file, twice.
  await dropPhase3();
  await insertLegacy();
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "007-membership-lifecycle.sql"), "utf8");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: DB,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    assert.deepEqual(await types(), expected);
    await conn.query(sql);
    assert.deepEqual(await types(), expected, "re-running the file changes nothing");
  } finally {
    await conn.end();
  }
  // And the member reads as before.
  assert.equal((await fresh(member)).fee, 1000);
});
