// Phase 4 (activity history) against a real MySQL database (a throwaway one,
// dropped afterwards; never gym_admin), the real services and HTTP routes.
// Skipped when no DB_* credentials are configured. Clock fixed per test.
// Test names carry the spec's §7 numbers (A1–A12).
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { loadAdminLib, restoreClock, setToday } = require("./helpers");

const DB = `gym_test_activity_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
const OWNER = { id: "owner-1", name: "Gym Owner", role: "gym_admin", email: "owner@example.test" };
const STAFF = { id: "staff-1", name: "Desk Staff", role: "staff" };

let admin;
let db;
let gymId;
let otherGymId;
let svc;
let server;
let baseUrl;
let fe;

test.before(async () => {
  fe = { ...(await loadAdminLib("activity.js")), billing: await loadAdminLib("billing.js") };
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
  gymId = (await createGym({ name: "Activity test gym" })).id;
  otherGymId = (await createGym({ name: "Other gym" })).id;
  svc = {
    ...require("../src/services/memberService"),
    ...require("../src/services/onboardingService"),
    ...require("../src/services/paymentService"),
    ...require("../src/services/planChangeService"),
    ...require("../src/services/activityService"),
  };
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
let phoneSeq = 9500000000;

// A new member starts on the day they are added, so the clock is set to their
// joining day while they are created and then put back.
async function newMember(startDate, overrides = {}, user = OWNER) {
  phoneSeq += 1;
  setToday(startDate);
  try {
    return await svc.createMember(
      gymId,
      { name: `Rahul ${phoneSeq}`, phone: String(phoneSeq), gymId: `A${phoneSeq}`, fee: 1000, collectionTiming: "at-join", startDate, ...overrides },
      user,
    );
  } finally {
    setToday("2026-11-02");
  }
}

async function existingMember(onboarding) {
  phoneSeq += 1;
  const { member } = await svc.createExistingMember(
    gymId,
    {
      name: `Old Timer ${phoneSeq}`,
      phone: String(phoneSeq),
      gymId: `E${phoneSeq}`,
      fee: 1000,
      membershipType: "monthly",
      packageMonths: 1,
      collectionTiming: "at-join",
      startDate: "2026-08-02",
      onboarding,
    },
    OWNER,
  );
  return member;
}

const record = (member, body, user = OWNER) =>
  svc.recordPayment(gymId, member.id, { requestId: crypto.randomUUID(), date: today(), mode: "cash", ...body }, user);
const changePlan = (member, body) =>
  svc.changeMemberPlan(
    gymId,
    member.id,
    { requestId: crypto.randomUUID(), membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "at-join", mode: "cash", ...body },
    OWNER,
  );
// Everything logged for one member, oldest first.
const logOf = async (member, gym = gymId) =>
  (await svc.listActivities(gym, { q: member.gymId, limit: 500 })).activities.filter((a) => a.memberId === member.id).reverse();
const actions = (log) => log.map((activity) => activity.action);
const countTx = async (member) => Number((await db.query("SELECT COUNT(*) AS n FROM payment_transactions WHERE member_id = ?", [member.id]))[0].n);

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, code, error.message);
    return true;
  });
}

test("A1: adding a new member logs the member and their joining payment, with who did it", opts, async () => {
  const member = await newMember("2026-11-02", {}, STAFF);
  const log = await logOf(member);
  assert.deepEqual(actions(log), ["member_added", "payment_recorded"]);
  const [added, paid] = log;
  assert.equal(added.details.type, "new");
  assert.deepEqual(added.actor, { id: "staff-1", name: "Desk Staff", role: "staff" });
  assert.equal(added.memberName, member.name);
  assert.deepEqual(paid.categories.sort(), ["membership", "payment"], "the joining term is a renewal-type payment");
  assert.equal(paid.details.source, "join");
  assert.equal(fe.activityTitle(added), `${member.name} added as a new member`);
});

test("A2: adding an existing member shows both dates and the confirmed history, never as new payments", opts, async () => {
  const periods = [
    { period: "2026-08-02", status: "paid", amount: 1000, paidInFull: true, date: "2026-08-02", mode: "cash" },
    { period: "2026-09-01", status: "paid", amount: 1000, paidInFull: true, date: null, mode: "cash" },
    { period: "2026-10-01", status: "unpaid" },
    { period: "2026-10-31", status: "unpaid" },
  ];
  const member = await existingMember({ type: "existing", method: "periods", periods });
  const log = await logOf(member);
  assert.deepEqual(actions(log), ["member_added", "history_confirmed"], "historical payments are one confirmation, not payments");
  const [added, history] = log;
  assert.equal(added.details.type, "existing");
  assert.equal(added.details.joinedOn, "2026-08-02");
  assert.equal(added.details.addedOn, member.createdAt);
  assert.deepEqual([history.details.paidCount, history.details.unpaidCount, history.details.paidTotal], [2, 2, 2000]);
  const domain = fe.billing.createDomain({ billingCycleMode: "30-days" });
  assert.match(fe.activityCard(added, domain).detail, /^Joined 02 Aug 2026 · added 02 Nov 2026/);

  const opener = await existingMember({ type: "existing", method: "opening", openingBalance: 3000 });
  const openLog = await logOf(opener);
  assert.deepEqual(actions(openLog), ["member_added", "opening_balance_added"]);
  assert.equal(openLog[1].details.amount, 3000);
  assert.deepEqual(openLog[1].categories, ["balance"]);
});

test("A3: each edited field is its own activity with old and new values; joining date moves the end date", opts, async () => {
  const member = await newMember("2026-10-20");
  setToday("2026-11-02", 10);
  await svc.updateMember(gymId, member.id, { ...member, phone: "9876512345" }, OWNER);
  setToday("2026-11-02", 11);
  await svc.updateMember(gymId, member.id, { ...member, phone: "9876512345", name: "Rahul Kumar", address: "MG Road" }, STAFF);
  const edits = (await logOf(member)).filter((a) => a.action === "member_updated");
  assert.deepEqual(
    edits.map((a) => [a.details.field, a.details.from, a.details.to, a.actor.name]),
    [
      ["phone", member.phone, "9876512345", "Gym Owner"],
      ["name", member.name, "Rahul Kumar", "Desk Staff"],
      ["address", "", "MG Road", "Desk Staff"],
    ],
  );
  assert.equal(edits[2].memberName, "Rahul Kumar", "the snapshot is the member as it is now");
  assert.match(fe.activityTitle(edits[0]), /phone number changed/);

  await svc.updateMember(gymId, member.id, { ...member, phone: "9876512345", name: "Rahul Kumar", address: "MG Road", startDate: "2026-10-22" }, OWNER);
  const moved = (await logOf(member)).find((a) => a.action === "joining_date_changed");
  assert.deepEqual([moved.details.from, moved.details.to], ["2026-10-20", "2026-10-22"]);
  assert.deepEqual([moved.details.renewalBefore, moved.details.renewalAfter], ["2026-11-19", "2026-11-21"]);
  assert.ok(moved.categories.includes("membership"), "a membership end-date change");
  // A save that changes nothing logs nothing.
  const before = (await logOf(member)).length;
  await svc.updateMember(gymId, member.id, { ...(await require("../src/models").repo().getMemberById(gymId, member.id)) }, OWNER);
  assert.equal((await logOf(member)).length, before);
});

test("A4: several payments, one activity each, even when one covers several terms", opts, async () => {
  const member = await newMember("2026-09-01"); // 1 Oct and 31 Oct unpaid
  await record(member, { amount: 500 });
  // A retried submit (same request id) is one payment, so one activity.
  const requestId = crypto.randomUUID();
  await record(member, { amount: 1500, requestId });
  assert.equal((await record(member, { amount: 1500, requestId })).repeated, true);
  const payments = (await logOf(member)).filter((a) => a.action === "payment_recorded" && a.details.source === "desk");
  assert.equal(payments.length, 2);
  assert.deepEqual(payments[1].details.terms.map((t) => [t.period, t.amount, t.kind]), [
    ["2026-10-01", 500, "old"],
    ["2026-10-31", 1000, "current"],
  ]);
  assert.deepEqual(payments[1].categories.sort(), ["balance", "membership", "payment"], "cleared an old due and renewed");
  assert.equal(payments[1].details.oldDuesCleared, 500);
  // A refused payment logs nothing: activities exist only for what committed.
  const count = (await logOf(member)).length;
  await rejects(record(member, { amount: 5000 }), 400);
  assert.equal((await logOf(member)).length, count);
});

test("A5: edits, corrections and cancellations each get their own activity", opts, async () => {
  const member = await newMember("2026-09-01");
  const { transaction } = await record(member, { amount: 1000 });
  await svc.editPaymentDetails(gymId, member.id, transaction.id, { reference: "UPI 4471", note: "At desk" }, OWNER);
  const { transaction: fixed } = await svc.correctPayment(
    gymId,
    member.id,
    transaction.id,
    { reason: "Typed wrong", amount: 800, date: today(), allocation: "manual", allocations: [{ billingPeriod: "2026-10-31", amount: 800 }] },
    OWNER,
  );
  await svc.reversePayment(gymId, member.id, fixed.id, { reason: "Refunded" }, OWNER);
  const log = (await logOf(member)).filter((a) => a.action !== "member_added" && a.details.source !== "join");
  assert.deepEqual(actions(log), ["payment_recorded", "payment_edited", "payment_edited", "payment_corrected", "payment_cancelled"]);
  assert.deepEqual(log.slice(1, 3).map((a) => [a.details.field, a.details.to]), [
    ["reference", "UPI 4471"],
    ["note", "At desk"],
  ]);
  const corrected = log[3];
  assert.deepEqual([corrected.details.original.amount, corrected.details.replacement.amount], [1000, 800]);
  assert.equal(corrected.details.moved, true, "moved from 1 Oct to 31 Oct");
  assert.match(fe.activityTitle(corrected), /moved to another billing period/);
  assert.equal(log[4].details.reason, "Refunded");
  assert.equal((await logOf(member)).filter((a) => a.action === "payment_recorded").length, 2, "the replacement isn't a second 'recorded'");
});

test("A6: renewing a membership is a payment and a membership activity", opts, async () => {
  const member = await newMember("2026-10-03"); // the 2 Nov month is due
  await record(member, { amount: 1000 });
  const renewal = (await logOf(member)).at(-1);
  assert.equal(renewal.details.renewal, true);
  assert.deepEqual(renewal.details.terms.map((t) => t.kind), ["current"]);
  assert.match(fe.activityTitle(renewal), /membership renewed/);
  const memberships = (await svc.listActivities(gymId, { category: "membership", q: member.gymId })).activities;
  assert.ok(memberships.some((a) => a.id === renewal.id), "shown under Membership");
  const payments = (await svc.listActivities(gymId, { category: "payment", q: member.gymId })).activities;
  assert.ok(payments.some((a) => a.id === renewal.id), "and under Payments");
});

test("A7/A8: ₹2,000 → ₹4,000 now, then ₹4,000 → ₹2,000 at renewal (scheduled)", opts, async () => {
  const member = await newMember("2026-10-20", { fee: 2000 });
  await changePlan(member, { fee: 4000, effectiveDate: "2026-11-02", collectFirstTerm: true });
  await changePlan(member, { fee: 2000, effectiveDate: "2026-12-02" });
  const log = await logOf(member);
  const changes = log.filter((a) => a.action === "plan_changed");
  assert.deepEqual(
    changes.map((a) => [a.details.changeType, a.details.from.fee, a.details.to.fee, a.details.effectiveDate, a.details.scheduled]),
    [
      ["upgrade", 2000, 4000, "2026-11-02", false],
      ["downgrade", 4000, 2000, "2026-12-02", true],
    ],
  );
  assert.deepEqual([changes[0].details.previousEnds, changes[0].details.newTermEnds], ["2026-11-01", "2026-12-01"]);
  assert.deepEqual([changes[1].details.previousEnds, changes[1].details.newTermEnds], ["2026-12-01", "2026-12-31"]);
  const collected = log.find((a) => a.action === "payment_recorded" && a.details.source === "plan_change");
  assert.deepEqual([collected.details.amount, collected.details.terms[0].kind], [4000, "current"]);

  const domain = fe.billing.createDomain({ billingCycleMode: "30-days" });
  assert.equal(fe.activityTitle(changes[0]), `${member.name}'s membership upgraded`);
  assert.equal(fe.activityTitle(changes[1]), `Future membership change scheduled for ${member.name}`);
  assert.equal(fe.activityCard(changes[0], domain).detail, "₹2,000 → ₹4,000 · from 02 Nov 2026 · term ends 01 Dec 2026");
});

test("A9/A10: restarting an expired membership; waiving dues is logged but is never money", opts, async () => {
  const lapsed = await newMember("2026-09-01");
  await changePlan(lapsed, { restart: true, effectiveDate: today(), oldDues: "carry" });
  const restartLog = await logOf(lapsed);
  assert.deepEqual(restartLog.filter((a) => a.action !== "member_added" && a.details.source !== "join").map((a) => [a.action, a.details.changeType]), [
    ["plan_changed", "restart"],
    ["dues_kept", "restart"],
  ]);
  assert.match(fe.activityTitle(restartLog.find((a) => a.action === "plan_changed")), /expired membership restarted/);

  const waiver = await newMember("2026-09-01");
  const txBefore = await countTx(waiver);
  await changePlan(waiver, { fee: 1500, effectiveDate: today(), oldDues: "waive", note: "Goodwill" });
  const waived = (await logOf(waiver)).find((a) => a.action === "dues_waived");
  assert.equal(waived.details.amount, 2000);
  assert.deepEqual(waived.categories, ["balance"]);
  assert.deepEqual(waived.details.terms.map((t) => t.period), ["2026-10-01", "2026-10-31"]);
  assert.equal(await countTx(waiver), txBefore, "no payment transaction: income is unchanged");
  const domain = fe.billing.createDomain({ billingCycleMode: "30-days" });
  assert.match(fe.activityCard(waived, domain).detail, /^Not money received/);
});

test("A11: activities on different days, filtered by the Insights period, newest first, paged", opts, async () => {
  setToday("2026-11-02", 9);
  const member = await newMember("2026-09-01");
  setToday("2026-11-03", 9);
  await record(member, { amount: 1000 });
  setToday("2026-11-04", 9);
  await record(member, { amount: 500 });
  setToday("2026-11-04", 15);
  await record(member, { amount: 500 });

  // The Insights bar's days (inclusive), as the Activity tab sends them.
  const inDays = async (startKey, endKey) => {
    const { from, to } = fe.dayRange(startKey, endKey);
    return (await svc.listActivities(gymId, { from, to, q: member.gymId })).activities;
  };
  const day4 = await inDays("2026-11-04", "2026-11-04");
  assert.deepEqual(day4.map((a) => a.details.amount), [500, 500], "one day, newest first");
  assert.ok(day4[0].occurredAt > day4[1].occurredAt);
  assert.deepEqual((await inDays("2026-11-03", "2026-11-03")).map((a) => a.details.amount), [1000]);
  const november = await inDays("2026-11-01", "2026-11-30");
  assert.equal(november.length, 5, "added, joining payment, 3 payments");
  assert.deepEqual(fe.groupActivitiesByDay(november).map((day) => [day.date, day.rows.length]), [
    ["2026-11-04", 2],
    ["2026-11-03", 1],
    ["2026-11-02", 2],
  ]);
  assert.equal((await inDays("2026-12-01", "2026-12-31")).length, 0, "nothing in December");
  assert.equal((await inDays("", "")).length, 5, "custom with no dates = all records");

  // Pages continue exactly where the last one stopped.
  const first = await svc.listActivities(gymId, { q: member.gymId, limit: 2 });
  assert.equal(first.more, true);
  const last = first.activities.at(-1);
  const second = await svc.listActivities(gymId, { q: member.gymId, limit: 10, before: last.occurredAt, beforeSeq: last.seq });
  assert.deepEqual([...first.activities, ...second.activities].map((a) => a.id), (await svc.listActivities(gymId, { q: member.gymId })).activities.map((a) => a.id));
  await rejects(svc.listActivities(gymId, { category: "money" }), 400);
  await rejects(svc.listActivities(gymId, { from: "yesterday" }), 400);
});

test("Search by member name, and archived members keep their history", opts, async () => {
  const member = await newMember("2026-11-02", { name: "Zubeen Unique" });
  await svc.archiveMember(gymId, member.id, OWNER);
  const found = (await svc.listActivities(gymId, { q: "zubeen" })).activities;
  assert.deepEqual(actions(found).sort(), ["member_added", "member_archived", "payment_recorded"]);
  assert.match(fe.activityTitle(found.find((a) => a.action === "member_archived")), /removed from members/);
});

test("A12: one gym never sees another gym's activities (service and HTTP)", opts, async () => {
  const member = await newMember("2026-11-02", { name: "Private Person" });
  assert.equal((await svc.listActivities(otherGymId, { q: "Private Person" })).activities.length, 0);
  assert.ok((await svc.listActivities(gymId, { q: "Private Person" })).activities.length > 0);

  const { sign } = require("../src/utils/jwt");
  const { authConfig } = require("../src/config/env");
  const call = (user, url) =>
    fetch(baseUrl + url, {
      headers: { authorization: `Bearer ${sign({ sub: user.id, role: user.role, tenantId: user.tenantId, name: user.name }, authConfig().jwtSecret)}` },
    });
  const mine = await call({ ...STAFF, tenantId: gymId }, "/api/activities?q=Private");
  assert.equal(mine.status, 200);
  assert.ok((await mine.json()).activities.some((a) => a.memberId === member.id), "staff can read their own gym's log");
  const theirs = await call({ id: "owner-2", role: "gym_admin", tenantId: otherGymId, name: "Other" }, "/api/activities?q=Private");
  assert.deepEqual((await theirs.json()).activities, []);
  assert.equal((await fetch(baseUrl + "/api/activities")).status, 401, "never public");
});

test("Backfill: records from before the log rebuild the same activities, once", opts, async () => {
  // Rebuild the log of this gym from its records alone, as on the first Phase 4 boot.
  const live = await svc.listActivities(gymId, { limit: 500 });
  await db.exec("DELETE FROM activity_log WHERE tenant_id = ?", [gymId]);
  const inserted = await svc.backfillActivities();
  assert.ok(inserted > 0);
  const rebuilt = (await svc.listActivities(gymId, { limit: 500 })).activities;
  assert.ok(rebuilt.every((a) => a.backfilled));
  // Everything with a record behind it comes back; profile edits never had one.
  const keyOf = (a) => `${a.action}:${a.memberId}:${a.details.transactionId || a.details.changeId || a.details.replacement?.transactionId || ""}:${a.details.field || ""}`;
  const expected = live.activities.filter((a) => !["member_updated", "joining_date_changed"].includes(a.action)).map(keyOf).sort();
  assert.deepEqual(rebuilt.map(keyOf).sort(), expected);
  const upgrade = rebuilt.find((a) => a.action === "plan_changed" && a.details.changeType === "upgrade");
  assert.equal(upgrade.actor.name, "Gym Owner", "who did it comes from the record");
  assert.equal(await svc.backfillActivities(), 0, "never twice");
});
