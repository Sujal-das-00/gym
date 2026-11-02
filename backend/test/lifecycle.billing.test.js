// Phase 3 membership-lifecycle rules without a database, on a fixed clock,
// through BOTH billing copies (backend/src/utils/billing.js and
// admin-frontend/src/lib/billing.js), so the sheets always show what the
// server enforces: plan classification, the one-term-ahead renewal, the plan
// change window, kept dues, statuses and the history builder.
const test = require("node:test");
const assert = require("node:assert/strict");
const be = require("../src/utils/billing");
const { allocate, checkAheadOrder, closedTermsProblem, outstandingDebts } = require("../src/services/paymentService");
const { buildMembershipHistory } = require("../src/utils/membershipHistory");
const { SETTINGS, existingMember, loadAdminLib, restoreClock, setToday, termPayment } = require("./helpers");

let fe;
let pay;
test.before(async () => {
  fe = await loadAdminLib("billing.js");
  pay = await loadAdminLib("payments.js");
});
test.beforeEach(() => setToday("2026-11-02"));
test.afterEach(() => restoreClock());

const MONTH_START = { ...SETTINGS, billingCycleMode: "month-start" };
const CUSTOM_25 = { ...SETTINGS, billingCycleMode: "custom-days", customBillingDays: 25 };
const monthly = (fee, timing = "at-join") => ({ membershipType: "monthly", packageMonths: 1, fee, collectionTiming: timing });
const pack = (months, fee) => ({ membershipType: "package", packageMonths: months, fee, collectionTiming: "at-join" });

// A member who joined on `startDate` and paid each listed term in full.
function member(startDate, paid = [], overrides = {}) {
  return existingMember({ onboardingType: "new", startDate, payments: paid.map((period) => termPayment(period, overrides.fee || 1000)), ...overrides });
}

test("L1: upgrades and downgrades by monthly-equivalent price, across durations and cycles", () => {
  const cases = [
    [SETTINGS, monthly(1000), monthly(1500), "upgrade"],
    [SETTINGS, monthly(1500), monthly(1000), "downgrade"],
    [SETTINGS, monthly(1000), pack(3, 2700), "downgrade"], // ₹900 a month
    [SETTINGS, monthly(1000), pack(3, 3000), "change"], // same ₹1,000 a month
    [SETTINGS, pack(6, 5400), pack(3, 3000), "upgrade"], // ₹900 → ₹1,000
    [SETTINGS, monthly(1000), { ...monthly(1000), collectionTiming: "fixed-day" }, "change"],
    // A ₹1,000 25-day cycle is ₹1,200 a month, so a 3-month ₹3,300 package is cheaper.
    [CUSTOM_25, monthly(1000), pack(3, 3300), "downgrade"],
    [CUSTOM_25, monthly(1000), pack(3, 3900), "upgrade"],
  ];
  for (const [settings, from, to, expected] of cases) {
    assert.equal(be.classifyPlanChange(from, to, settings), expected, JSON.stringify([from, to]));
    assert.equal(fe.classifyPlanChange(settings, from, to), expected, "admin copy");
  }
});

test("L3: one term can be paid ahead; the cycle never moves (1-30 Nov → 1-30 Dec)", () => {
  const paidNov = member("2026-11-01", ["2026-11-01"]);
  const ahead = be.advanceTerm(paidNov, SETTINGS);
  assert.deepEqual(ahead, { period: "2026-12-01", charge: 1000, paid: 0, balance: 1000 });
  assert.equal(fe.getAdvanceTerm(SETTINGS, paidNov).period, "2026-12-01");

  const renewed = { ...paidNov, payments: [...paidNov.payments, termPayment("2026-12-01")] };
  assert.equal(be.advanceTerm(renewed, SETTINGS), null, "never two ahead");
  assert.equal(fe.getAdvanceTerm(SETTINGS, renewed), null);
  // The renewal date moves to the end of the paid-ahead term: 30 Dec is the last day.
  assert.equal(be.memberBillingSummary(renewed, SETTINGS).nextDueDate, "2026-12-31");
  assert.equal(fe.createDomain(SETTINGS).getDueDateKey(renewed), "2026-12-31");
  assert.equal(be.paidAheadEndKey(renewed, SETTINGS), "2026-12-31");
  // Paying early didn't shift anything: on 1 Dec the grid is exactly 1 Nov, 1 Dec.
  setToday("2026-12-01");
  assert.deepEqual(be.getBillingPeriodKeys(renewed, SETTINGS), ["2026-11-01", "2026-12-01"]);
  assert.equal(be.isMembershipExpired(renewed, SETTINGS), false);
  assert.equal(be.advanceTerm(renewed, SETTINGS).period, "2026-12-31", "then the next one becomes payable ahead");

  // Pay-after-term members never pay ahead.
  setToday("2026-11-02");
  assert.equal(be.advanceTerm(member("2026-11-01", [], { collectionTiming: "fixed-day" }), SETTINGS), null);
});

test("L3: term keys ahead on month-start, packages, month-end and leap years", () => {
  const cases = [
    ["2026-11-02", MONTH_START, member("2026-10-15", ["2026-10", "2026-11"]), "2026-12"],
    ["2026-02-02", SETTINGS, member("2026-01-31", [], pack(3, 2700)), "2026-04-30"], // 31 Jan + 3 months
    ["2028-03-01", SETTINGS, member("2028-02-29", []), "2028-03-30"], // leap day + 30 days
    ["2028-02-29", MONTH_START, member("2028-02-01", []), "2028-03"],
    ["2026-02-10", SETTINGS, member("2026-01-31", [], pack(1, 1000)), "2026-02-28"], // 31 Jan + 1 month
  ];
  for (const [today, settings, m, expected] of cases) {
    setToday(today);
    assert.equal(be.nextTermKey(m, settings), expected, `${m.startDate} on ${today}`);
    assert.equal(fe.nextTermKey(settings, m), expected, "admin copy");
  }
});

test("L3: renewing ahead is opt-in, comes after the dues, and P4 still rejects overpayment", () => {
  const owing = member("2026-10-03", ["2026-10-03"]); // the 2 Nov term is due
  // Without the opt-in a second term's worth is still an overpayment (Phase 2 P4).
  assert.throws(() => allocate(outstandingDebts(owing, SETTINGS), 200000, "fifo"), /more than the ₹1,000 owed/);
  const debts = outstandingDebts(owing, SETTINGS, { renewAhead: true });
  assert.deepEqual(debts.map((debt) => debt.period), ["2026-11-02", "2026-12-02"]);
  const lines = allocate(debts, 200000, "fifo");
  assert.deepEqual(lines.map((line) => [line.period, line.paise]), [["2026-11-02", 100000], ["2026-12-02", 100000]]);
  checkAheadOrder(debts, lines);
  // A manual split can't skip the term that is due to pay ahead.
  const skip = allocate(debts, 100000, "manual", [{ billingPeriod: "2026-12-02", amount: 1000 }]);
  assert.throws(() => checkAheadOrder(debts, skip), /Clear the terms already due/);
  // The sheet says the same before sending.
  const domain = fe.createDomain(SETTINGS);
  const feDebts = pay.outstandingDebts(domain, owing, { renewAhead: true });
  assert.deepEqual(feDebts.map((debt) => debt.period), debts.map((debt) => debt.period));
  const draft = { ...pay.blankPaymentDraft("1000"), method: "manual", manual: { "2026-12-02": "1000" } };
  assert.match(pay.paymentProblem({ debts: feDebts, draft, startDate: owing.startDate }), /Clear the terms already due/);
  assert.equal(pay.paymentBody({ debts: feDebts, draft: pay.blankPaymentDraft("2000") }).renewAhead, true);
  assert.throws(() => outstandingDebts(member("2026-11-01", [], { collectionTiming: "fixed-day" }), SETTINGS, { renewAhead: true }), /pays after/);
});

test("L5/L6/L7: the change window, paid terms never re-planned, downgrades at renewal", () => {
  // Joined 20 Oct, paid: the term runs 20 Oct – 18 Nov, renewal 19 Nov.
  const m = member("2026-10-20", ["2026-10-20"]);
  const window = be.planChangeWindow(m, SETTINGS);
  assert.deepEqual(window, { earliest: "2026-10-20", latest: "2026-11-19", paidStart: "2026-10-20" });
  assert.deepEqual(fe.planChangeWindow(SETTINGS, m), window);

  const check = (plan, effectiveDate, restart = false) => [
    be.planChangeProblem(m, SETTINGS, { plan, effectiveDate, restart }),
    fe.planChangeProblem(SETTINGS, m, { plan, effectiveDate, restart }),
  ];
  const ok = (pair) => assert.deepEqual(pair.map(Boolean), [false, false], pair.join(" | "));
  const bad = (pair, pattern) => pair.forEach((message) => assert.match(message, pattern));

  ok(check(monthly(1500), "2026-11-02")); // upgrade now: a new cycle from today
  ok(check(monthly(1500), "2026-11-19")); // upgrade at renewal
  bad(check(monthly(1500), "2026-10-20"), /already paid on the current plan/); // would re-plan the paid term
  bad(check(monthly(1500), "2026-10-10"), /before the current term/);
  bad(check(monthly(1500), "2026-11-20"), /by the next renewal/);
  bad(check(monthly(800), "2026-11-02"), /downgrade starts at the next renewal/);
  ok(check(monthly(800), "2026-11-19"));

  // Calendar-month gym: a mid-month change would share November's key, so a
  // paid November keeps the change waiting for December.
  const cal = member("2026-10-01", ["2026-10", "2026-11"]);
  assert.match(be.planChangeProblem(cal, MONTH_START, { plan: monthly(1500), effectiveDate: "2026-11-15" }), /already paid/);
  assert.equal(be.planChangeProblem(cal, MONTH_START, { plan: monthly(1500), effectiveDate: "2026-12-01" }), "");
  // Unpaid November: it becomes the new plan's first term, never also an old-plan due.
  const calOwing = member("2026-10-01", ["2026-10"]);
  assert.deepEqual(be.unsettledBeforeChange(calOwing, MONTH_START, "2026-11-15", "2026-11"), []);
  assert.deepEqual(fe.unsettledBeforeChange(MONTH_START, calOwing, "2026-11-15", "2026-11"), []);
});

test("L8: kept old-plan terms are owed as a balance, never overdue; reversible (P6 exempt)", () => {
  const m = member("2026-08-02", ["2026-08-02"], {
    planStartDate: "2026-10-31",
    carriedTerms: [
      { period: "2026-09-01", fee: 1000, changeId: "c1" },
      { period: "2026-10-01", fee: 1000, changeId: "c1" },
    ],
    payments: [termPayment("2026-08-02"), termPayment("2026-10-31"), termPayment("2026-09-01", 400, { periodFee: 1000, transactionId: "t9" })],
  });
  assert.equal(be.carriedBalanceDue(m), 1600);
  assert.equal(be.balanceDue(m, SETTINGS), 1600);
  assert.equal(be.memberOutstanding(m, SETTINGS), 1600);
  assert.deepEqual(be.dueUnpaidPeriods(m, SETTINGS), []);
  assert.equal(be.isMembershipExpired(m, SETTINGS), false, "kept dues never block check-in");
  assert.equal(be.memberBillingSummary(m, SETTINGS).carriedBalanceDue, 1600);
  const domain = fe.createDomain(SETTINGS);
  assert.equal(domain.getOutstandingAmount(m), 1600);
  assert.equal(domain.getFeeStatus(m), "balance");
  assert.equal(domain.isOverdue(m), false);
  // Payable oldest first, after an opening balance, before current terms.
  assert.deepEqual(outstandingDebts(m, SETTINGS).map((debt) => [debt.period, debt.balancePaise]), [
    ["2026-09-01", 60000],
    ["2026-10-01", 100000],
  ]);
  assert.deepEqual(pay.outstandingDebts(domain, m).map((debt) => debt.period), ["2026-09-01", "2026-10-01"]);
  // A payment on a kept term can be reversed: the term stays owed, nothing is lost.
  const tx = { allocations: [{ billingPeriod: "2026-09-01", amount: 400 }] };
  assert.equal(closedTermsProblem(m, tx), "");
  assert.equal(pay.closedTermsProblem(m, tx), "");
  assert.match(closedTermsProblem(m, { allocations: [{ billingPeriod: "2026-08-02", amount: 1000 }] }), /plan change/);
});

test("L9: Active / Expired / Scheduled, and dues alone don't expire", () => {
  const domain = fe.createDomain(SETTINGS);
  const cases = [
    [member("2026-11-10"), "scheduled"],
    [member("2026-10-03", ["2026-10-03"]), "active"], // 2 Nov term starts today: not overdue yet
    [member("2026-09-01", ["2026-09-01"]), "expired"],
    [member("2026-10-03", ["2026-10-03", "2026-11-02"], { openingBalance: 5000 }), "active"],
  ];
  for (const [m, expected] of cases) {
    assert.equal(be.membershipStatus(m, SETTINGS), expected, m.startDate);
    assert.equal(domain.getMembershipStatus(m), expected, "admin copy");
  }
});

test("history: segments, renewals, an upgrade cutting a term short, a scheduled change", () => {
  const m = member("2026-08-02", [], {
    fee: 1500,
    planStartDate: "2026-10-15",
    transactions: [],
    payments: [
      termPayment("2026-08-02", 1000, { transactionId: "a" }),
      termPayment("2026-09-01", 1000, { transactionId: "b" }),
      termPayment("2026-10-01", 1000, { transactionId: "c" }),
      termPayment("2026-10-15", 1500, { transactionId: "d" }),
    ],
  });
  m.transactions = ["a", "b", "c", "d"].map((id) => ({
    id,
    status: "active",
    date: "2026-10-15",
    dateKnown: true,
    mode: "cash",
    allocations: m.payments.filter((p) => p.transactionId === id).map((p) => ({ billingPeriod: p.billingPeriod, amount: p.amount })),
  }));
  const changes = [
    {
      id: "up",
      changedAt: "2026-10-15T05:00:00.000Z",
      effectiveDate: "2026-10-15",
      changeType: "upgrade",
      from: monthly(1000),
      to: monthly(1500),
      duesDetail: { collected: [], waived: [], carried: [] },
    },
  ];
  const history = buildMembershipHistory(m, changes, SETTINGS);
  assert.deepEqual(
    history.entries.map((entry) => [entry.type, entry.date, entry.plan.fee, entry.term?.status]),
    [
      ["joined", "2026-08-02", 1000, "paid"],
      ["renewed", "2026-09-01", 1000, "paid"],
      ["renewed", "2026-10-01", 1000, "paid"],
      ["upgrade", "2026-10-15", 1500, "paid"], // its next term (14 Nov) hasn't started yet
    ],
  );
  const cut = history.entries[2].term;
  assert.equal(cut.lastDay, "2026-10-14", "the upgrade ended the 1 Oct term early");
  assert.equal(cut.cutShort, true);
  assert.equal(history.entries[3].previousPlan.fee, 1000);
  assert.deepEqual(history.entries[3].term.payments.map((p) => p.transactionId), ["d"]);
  assert.equal(history.status, "active");

  // A downgrade scheduled for the renewal: still Active on the current plan until then.
  const scheduled = buildMembershipHistory({ ...m, fee: 1000, planStartDate: "2026-11-14" }, [
    ...changes,
    { id: "down", changedAt: "2026-11-02T05:00:00.000Z", effectiveDate: "2026-11-14", changeType: "downgrade", from: monthly(1500), to: monthly(1000), duesDetail: null },
  ], SETTINGS);
  const last = scheduled.entries[scheduled.entries.length - 1];
  assert.deepEqual([last.type, last.state, last.date], ["downgrade", "scheduled", "2026-11-14"]);
  assert.equal(scheduled.upcomingChange, "2026-11-14");
  assert.equal(scheduled.status, "active");
});
