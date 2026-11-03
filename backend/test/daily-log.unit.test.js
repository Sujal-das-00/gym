// The Daily Log is rebuilt from record timestamps (utils/dailyLog.js). These
// cases pin down how rows become events: payments written with a member or a
// plan change belong to that event, one collection is one event, and edits
// show only when they are not the side effect of something already listed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDailyLog } = require("../src/utils/dailyLog");

const DAY = Date.parse("2026-11-03T00:00:00+05:30");
const at = (hhmm) => DAY + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) * 60000;
const RANGE = { from: DAY, to: DAY + 24 * 3600000 };

const member = (id, name, extra = {}) => ({
  id,
  name,
  code: id.toUpperCase(),
  createdAt: at("08:00") - 30 * 24 * 3600000,
  updatedAt: null,
  archivedAt: null,
  membershipType: "monthly",
  packageMonths: 1,
  fee: 1000,
  onboardingType: "new",
  ...extra,
});
const pay = (id, memberId, time, extra = {}) => ({
  id,
  memberId,
  memberName: memberId,
  memberCode: memberId.toUpperCase(),
  createdAt: typeof time === "number" ? time : at(time),
  updatedAt: null,
  amount: 1000,
  periodFee: 1000,
  kind: "membership",
  period: "2026-11",
  mode: "cash",
  note: "",
  ...extra,
});
const types = (events) => events.map((event) => event.type);

test("a new member's joining payments are part of 'member added', not separate payments", () => {
  const joined = at("09:15");
  const events = buildDailyLog(
    {
      members: [member("rahul", "Rahul", { createdAt: joined, updatedAt: joined + 1000 })],
      payments: [pay("p1", "rahul", joined + 2000, { kind: "admission", period: "admission", amount: 500, periodFee: 500 }), pay("p2", "rahul", joined + 2000)],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["member_added"]);
  assert.equal(events[0].amount, 1500);
});

test("one collection of several terms is one payment; a part payment is flagged", () => {
  const events = buildDailyLog(
    {
      members: [member("rahul", "Rahul"), member("piyush", "Piyush")],
      payments: [
        pay("a", "rahul", at("10:00"), { period: "2026-10" }),
        pay("b", "rahul", at("10:00") + 500, { period: "2026-11" }),
        pay("c", "piyush", at("11:30"), { amount: 400 }),
        pay("d", "rahul", at("18:00"), { kind: "other", period: "other", periodFee: null, amount: 300, note: "Protein" }),
      ],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["purchase", "payment", "payment"]);
  const [purchase, part, both] = events;
  assert.equal(purchase.lines[0].note, "Protein");
  assert.equal(part.part, true);
  assert.equal(part.amount, 400);
  assert.equal(both.amount, 2000);
  assert.equal(both.lines.length, 2);
  assert.equal(both.part, false);
});

test("money taken with a plan change is shown on the plan change, once", () => {
  const changed = at("12:00");
  const events = buildDailyLog(
    {
      members: [member("sujal", "Sujal", { updatedAt: changed + 1500 })],
      planChanges: [
        {
          id: "c1",
          memberId: "sujal",
          memberName: "Sujal",
          memberCode: "SUJAL",
          at: changed,
          from: { membershipType: "monthly", packageMonths: 1, fee: 1000 },
          to: { membershipType: "package", packageMonths: 3, fee: 2700 },
          effectiveDate: "2026-11-03",
          duesWaived: 0,
          by: { name: "Owner", role: "gym_admin" },
        },
      ],
      payments: [pay("x", "sujal", changed + 3000, { amount: 2700, periodFee: 2700, period: "2026-11-03", mode: "upi" })],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["plan_changed"]);
  assert.equal(events[0].amount, 2700);
  assert.equal(events[0].mode, "upi");
  assert.equal(events[0].by.name, "Owner");
});

test("removed members and real profile edits show; side-effect timestamps don't", () => {
  const events = buildDailyLog(
    {
      members: [
        member("rina", "Rina", { archivedAt: at("15:00"), updatedAt: at("15:00") + 1000 }),
        member("deep", "Deep", { updatedAt: at("16:20") }),
      ],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["member_updated", "member_removed"]);
  assert.equal(events[0].memberName, "Deep");
});

test("payment and expense edits show only when made after the record", () => {
  const events = buildDailyLog(
    {
      members: [member("rahul", "Rahul")],
      payments: [pay("old", "rahul", at("09:00") - 5 * 24 * 3600000, { updatedAt: at("13:00"), amount: 800 })],
      expenses: [
        { id: "e1", title: "Electricity bill", category: "utilities", amount: 300, mode: "cash", date: "2026-11-03", createdAt: at("17:00"), updatedAt: null },
        { id: "e2", title: "Rent", category: "rent", amount: 9000, mode: "bank", date: "2026-11-01", createdAt: at("08:00") - 2 * 24 * 3600000, updatedAt: at("17:30") },
      ],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["expense_edited", "expense_added", "payment_edited"]);
  assert.equal(events[2].amount, 800);
});

test("a payment re-keyed by a joining-date edit isn't listed as a payment edit", () => {
  const edit = at("14:00");
  const events = buildDailyLog(
    {
      members: [member("asha", "Asha", { updatedAt: edit })],
      payments: [pay("k", "asha", at("09:00") - 40 * 24 * 3600000, { updatedAt: edit - 200 })],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["member_updated"]);
});

test("only the window asked for, newest first", () => {
  const events = buildDailyLog(
    {
      members: [member("a", "A", { createdAt: at("07:00") }), member("b", "B", { createdAt: DAY - 1000 }), member("c", "C", { createdAt: RANGE.to })],
      trainers: [{ id: "t", name: "Vikram", createdAt: at("19:00") }],
    },
    RANGE,
  );
  assert.deepEqual(types(events), ["trainer_added", "member_added"]);
  assert.equal(events[1].memberName, "A");
});
