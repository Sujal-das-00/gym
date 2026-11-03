// Phase 4 activity history without a database: the builders (backend
// utils/activity.js) and how the admin panel words and filters them
// (admin-frontend/src/lib/activity.js), on a fixed clock.
const test = require("node:test");
const assert = require("node:assert/strict");
const build = require("../src/utils/activity");
const { loadAdminLib, restoreClock, setToday } = require("./helpers");

let fe;
let domain;
test.before(async () => {
  fe = await loadAdminLib("activity.js");
  domain = (await loadAdminLib("billing.js")).createDomain({ billingCycleMode: "30-days" });
});
test.beforeEach(() => setToday("2026-11-04")); // a Wednesday
test.afterEach(() => restoreClock());

const RAHUL = { id: "m1", name: "Rahul", gymId: "GYM1201", startDate: "2026-08-02", createdAt: "2026-11-02T05:00:00.000Z" };
const OWNER = { id: "u1", name: "Asha", role: "gym_admin" };
const monthly = (fee) => ({ membershipType: "monthly", packageMonths: 1, fee, collectionTiming: "at-join" });

test("periods: the Insights days become local-midnight instants, end day included", () => {
  const local = (y, m, d) => new Date(y, m - 1, d).toISOString();
  assert.deepEqual(fe.dayRange("2026-11-01", "2026-11-30"), { from: local(2026, 11, 1), to: local(2026, 12, 1) });
  assert.deepEqual(fe.dayRange("2026-01-01", "2026-12-31"), { from: local(2026, 1, 1), to: local(2027, 1, 1) });
  assert.deepEqual(fe.dayRange("2028-02-29", "2028-02-29"), { from: local(2028, 2, 29), to: local(2028, 3, 1) });
  assert.deepEqual(fe.dayRange("", ""), { from: "", to: "" }, "custom with no dates = all records");
});

test("membership amount changes read as the spec asks: previous, new, effective, expiry", () => {
  const up = build.planChanged(
    RAHUL,
    OWNER,
    { id: "c1", changeType: "upgrade", from: monthly(2000), to: monthly(4000), effectiveDate: "2026-11-02", changedAt: "2026-11-02T05:15:00.000Z" },
    { today: "2026-11-02", previousEnds: "2026-11-01", newTermEnds: "2026-12-01" },
  );
  assert.equal(fe.activityTitle(up), "Rahul's membership upgraded");
  const card = fe.activityCard(up, domain);
  assert.equal(card.detail, "₹2,000 → ₹4,000 · from 02 Nov 2026 · term ends 01 Dec 2026");
  assert.equal(card.amount, null, "a plan change is not money");
  assert.match(card.meta, /by Asha \(owner\)$/);
  const down = build.planChanged(RAHUL, OWNER, { id: "c2", changeType: "downgrade", from: monthly(4000), to: monthly(2000), effectiveDate: "2026-11-02" }, { today: "2026-11-02" });
  assert.equal(fe.activityTitle(down), "Rahul's membership amount decreased");
  const later = build.planChanged(RAHUL, OWNER, { id: "c3", changeType: "downgrade", from: monthly(4000), to: monthly(2000), effectiveDate: "2026-12-02" }, { today: "2026-11-04" });
  assert.equal(fe.activityTitle(later), "Future membership change scheduled for Rahul");
  assert.deepEqual(up.categories, ["membership"]);
  assert.equal(up.sourceKey, "plan:c1");
});

test("payments: one activity per payment; renewal and old-dues tags from what it paid", () => {
  const tx = {
    id: "t1",
    amount: 2000,
    date: "2026-11-04",
    mode: "upi",
    reference: "UPI 4471",
    source: "desk",
    allocations: [
      { billingPeriod: "2026-10-01", amount: 1000, periodFee: 1000, kind: "old" },
      { billingPeriod: "2026-10-31", amount: 1000, periodFee: 1000, kind: "current" },
    ],
  };
  const paid = build.paymentRecorded(RAHUL, OWNER, tx);
  assert.deepEqual(paid.categories, ["payment", "membership", "balance"]);
  assert.equal(paid.details.oldDuesCleared, 1000);
  assert.equal(fe.activityTitle(paid), "Payment for Rahul · membership renewed");
  const card = fe.activityCard(paid, domain);
  assert.deepEqual(card.amount, { text: "+₹2,000", tone: "in" });
  assert.match(card.detail, /UPI · UPI 4471$/);

  const onlyOld = build.paymentRecorded(RAHUL, OWNER, { ...tx, id: "t2", amount: 1000, allocations: [tx.allocations[0]] });
  assert.equal(fe.activityTitle(onlyOld), "Payment for Rahul · cleared old dues");
  assert.equal(fe.actorLabel(paid), "Asha (owner)");
  assert.equal(fe.actorLabel({ actor: null }), "");
  const old = fe.activityCard({ ...paid, actor: null, backfilled: true }, domain);
  assert.match(old.meta, /from earlier records$/, "no 'by Not recorded'");
});

test("waived dues are a balance activity that says it is not money received", () => {
  const [waived] = build.duesActivities(RAHUL, OWNER, {
    id: "c9",
    changeType: "upgrade",
    duesWaived: 2000,
    duesDetail: { waived: [{ period: "2026-10-01", fee: 1000, balance: 1000 }, { period: "2026-10-31", fee: 1000, balance: 1000 }] },
    changedAt: "2026-11-04T05:00:00.000Z",
  });
  assert.deepEqual([waived.action, waived.categories, waived.details.amount], ["dues_waived", ["balance"], 2000]);
  const card = fe.activityCard(waived, domain);
  assert.match(card.detail, /^Not money received/);
  assert.deepEqual(card.amount, { text: "₹2,000", tone: "none" }, "shown, but never as money in");
});

test("member edits: one activity per field, old → new; existing members show both dates", () => {
  const phone = build.memberFieldChanged(RAHUL, OWNER, "phone", "9000000001", "9000000002");
  assert.equal(fe.activityTitle(phone), "Rahul's phone number changed");
  assert.equal(fe.activityCard(phone, domain).detail, "9000000001 → 9000000002");
  const added = build.memberAdded({ ...RAHUL, onboardingType: "existing", ...monthly(1000) }, OWNER);
  assert.equal(fe.activityTitle(added), "Rahul added as an existing member");
  assert.equal(fe.activityCard(added, domain).detail, "Joined 02 Aug 2026 · added 02 Nov 2026 · ₹1,000");
  assert.equal(build.memberAdded(RAHUL, null).actor, null, "who is optional (old records)");
});

test("day grouping: newest day first, in the device's local time", () => {
  const at = (key, hour) => new Date(...key.split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)), hour).toISOString();
  const rows = [
    { id: "a", occurredAt: at("2026-11-04", 15) },
    { id: "b", occurredAt: at("2026-11-04", 9) },
    { id: "c", occurredAt: at("2026-11-02", 23) },
  ];
  assert.deepEqual(fe.groupActivitiesByDay(rows).map((day) => [day.date, day.rows.map((row) => row.id)]), [
    ["2026-11-04", ["a", "b"]],
    ["2026-11-02", ["c"]],
  ]);
  const typed = [{ categories: ["payment"] }, { categories: ["payment", "membership"] }, { categories: ["member"] }];
  assert.equal(fe.dayBreakdown(typed), "1 member update · 2 payments");
});
