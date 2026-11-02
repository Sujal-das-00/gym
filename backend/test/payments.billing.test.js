// Phase 2 payment rules without a database, on a fixed clock (2 Nov 2026,
// 30-day cycle): allocation, money parsing, and how every admin screen counts
// collections (once each, reversed never), checked against the server rules.
const test = require("node:test");
const assert = require("node:assert/strict");
const be = require("../src/utils/billing");
const { allocate, closedTermsProblem, outstandingDebts } = require("../src/services/paymentService");
const { parseAmount, toPaise } = require("../src/utils/money");
const { SETTINGS, existingMember, loadAdminLib, restoreClock, setToday, termPayment } = require("./helpers");

let fe;
let pay;
let ledger;
test.before(async () => {
  fe = await loadAdminLib("billing.js");
  pay = await loadAdminLib("payments.js");
  ledger = await loadAdminLib("ledger.js");
});
test.beforeEach(() => setToday("2026-11-02"));
test.afterEach(() => restoreClock());

const TERMS = ["2026-08-02", "2026-09-01", "2026-10-01", "2026-10-31"];
const paise = (lines) => lines.map((line) => [line.period, line.paise]);

// A transaction as the API sends it, with its allocation rows on the member.
function withTransaction(member, { id, amount, date, dateKnown = true, status = "active", allocations }) {
  const tx = { id, amount, date, dateKnown, status, mode: "cash", reference: "", allocations };
  const rows = allocations.map((allocation, index) =>
    termPayment(allocation.billingPeriod, allocation.amount, {
      id: `${id}-${index}`,
      periodFee: allocation.periodFee ?? 1000,
      date: allocation.date || date,
      dateKnown,
      transactionId: id,
    }),
  );
  return {
    ...member,
    transactions: [...(member.transactions || []), tx],
    // Reversed allocations are not sent in `payments` (memberModel.hydrateMembers).
    payments: status === "active" ? [...member.payments, ...rows] : member.payments,
  };
}

test("money: amounts are exact paise; zero, negatives and 3 decimals are rejected", () => {
  assert.equal(toPaise(0.1) + toPaise(0.2), toPaise(0.3));
  assert.equal(parseAmount("1000.50"), 100050);
  assert.equal(parseAmount(999.99), 99999);
  for (const bad of ["0", 0, "-5", "12.345", "abc", "", null, "1e3"]) {
    assert.throws(() => parseAmount(bad), (error) => error.status === 400, String(bad));
  }
  assert.equal(parseAmount("0", "x", { allowZero: true }), 0);
});

test("T2/T5: FIFO pays the oldest debt first and spreads one payment over terms", () => {
  const debts = outstandingDebts(existingMember(), SETTINGS);
  assert.deepEqual(debts.map((debt) => debt.period), TERMS);
  assert.deepEqual(paise(allocate(debts, 300000, "fifo")), [
    ["2026-08-02", 100000],
    ["2026-09-01", 100000],
    ["2026-10-01", 100000],
  ]);
  // Part of the next term once the older ones are full.
  assert.deepEqual(paise(allocate(debts, 150000, "fifo")), [
    ["2026-08-02", 100000],
    ["2026-09-01", 50000],
  ]);
});

test("T5b/P8: the opening balance is the oldest debt", () => {
  const member = existingMember({ openingBalance: 3000, billingCutover: "2026-11-30" });
  const debts = outstandingDebts(member, SETTINGS);
  assert.deepEqual(debts.map((debt) => debt.period), [be.OPENING_PERIOD_KEY]);
  assert.deepEqual(paise(allocate(debts, 200000, "fifo")), [[be.OPENING_PERIOD_KEY, 200000]]);
});

test("T6/T6b: manual allocation is exact and never replaced by FIFO", () => {
  const debts = outstandingDebts(existingMember(), SETTINGS);
  assert.deepEqual(paise(allocate(debts, 100000, "manual", [{ billingPeriod: "2026-10-01", amount: 1000 }])), [["2026-10-01", 100000]]);
  const bad = (amount, lines, pattern) =>
    assert.throws(() => allocate(debts, amount, "manual", lines), (error) => error.status === 400 && pattern.test(error.message));
  bad(150000, [{ billingPeriod: "2026-10-01", amount: 1500 }], /more than the ₹1,000 left/);
  bad(100000, [{ billingPeriod: "2026-10-01", amount: 500 }, { billingPeriod: "2026-10-01", amount: 500 }], /more than once/);
  bad(100000, [{ billingPeriod: "2026-11-30", amount: 1000 }], /nothing owed that can be paid now/);
  bad(100000, [{ billingPeriod: "2026-10-01", amount: 600 }], /₹400 of this payment isn't allocated/);
  bad(100000, [], /Choose what this payment is for/);
});

test("T7/P4/P9: no overpayment, no advance payment, ₹0 only for ₹0-fee terms", () => {
  const debts = outstandingDebts(existingMember(), SETTINGS);
  assert.throws(() => allocate(debts, 500000, "fifo"), /₹5,000 is more than the ₹4,000 owed/);
  assert.throws(() => allocate(debts, 0, "fifo"), /above ₹0/);
  // A pay-after-term member's running term isn't payable yet.
  const postpaid = outstandingDebts(existingMember({ collectionTiming: "fixed-day" }), SETTINGS);
  assert.deepEqual(postpaid.map((debt) => debt.period), TERMS.slice(0, 3));
  // A gym that charges no fee still marks the term done with a ₹0 record.
  const free = outstandingDebts(existingMember({ fee: 0 }), SETTINGS);
  assert.deepEqual(paise(allocate(free, 0, "fifo")), TERMS.map((period) => [period, 0]));
});

test("T2/T11/T14: Insights count each collection once, reversed never, undated per term month", () => {
  let member = existingMember();
  member = withTransaction(member, {
    id: "t1",
    amount: 3000,
    date: "2026-11-02",
    allocations: TERMS.slice(0, 3).map((billingPeriod) => ({ billingPeriod, amount: 1000 })),
  });
  member = withTransaction(member, {
    id: "t2",
    amount: 2000,
    date: "2026-08-02",
    dateKnown: false,
    allocations: [
      { billingPeriod: "2026-08-02", amount: 1000, date: "2026-08-02" },
      { billingPeriod: "2026-09-01", amount: 1000, date: "2026-09-01" },
    ],
  });
  member = withTransaction(member, {
    id: "t3",
    amount: 1000,
    date: "2026-11-02",
    status: "reversed",
    allocations: [{ billingPeriod: "2026-10-31", amount: 1000 }],
  });
  const domain = fe.createDomain(SETTINGS);
  const earnings = ledger.buildLedgerEntries({ members: [member], expenses: [], domain }).filter((entry) => entry.type === "earning");
  const byMonth = (month) => earnings.filter((entry) => entry.date.startsWith(month)).reduce((sum, entry) => sum + entry.amount, 0);
  assert.equal(earnings.filter((entry) => entry.id === "t1").length, 1, "one earning for a 3-term payment");
  assert.equal(byMonth("2026-11"), 3000, "the reversed ₹1,000 is not income");
  assert.equal(byMonth("2026-08"), 1000);
  assert.equal(byMonth("2026-09"), 1000);
  assert.ok(earnings.filter((entry) => entry.id.startsWith("t2:")).every((entry) => entry.detail.includes(fe.DATE_NOT_RECORDED)));
  assert.equal(pay.memberCollections(member).reduce((sum, entry) => sum + entry.amount, 0), 5000);
  // The reversed one is still in the admin history.
  assert.ok(pay.paymentHistory(member).some((entry) => entry.transaction?.id === "t3"));
});

test("form rules match the server: FIFO preview, problems, closed terms", () => {
  const domain = fe.createDomain(SETTINGS);
  const member = existingMember();
  const debts = pay.outstandingDebts(domain, member);
  const draft = { ...pay.blankPaymentDraft("1500"), date: "2026-11-02" };
  const preview = pay.allocationLines({ debts, draft }).map((line) => [line.period, Math.round(line.pay * 100)]);
  assert.deepEqual(preview, paise(allocate(outstandingDebts(member, SETTINGS), 150000, "fifo")));
  assert.equal(pay.paymentProblem({ debts, draft, startDate: member.startDate }), "");
  assert.match(pay.paymentProblem({ debts, draft: { ...draft, amountText: "5000" }, startDate: member.startDate }), /more than the ₹4,000 owed/);
  assert.match(pay.paymentProblem({ debts, draft: { ...draft, date: "2026-12-01" }, startDate: member.startDate }), /future/);
  assert.match(
    pay.paymentProblem({ debts, draft: { ...draft, method: "manual", manual: { "2026-10-01": "1000" } }, startDate: member.startDate }),
    /₹500 isn't allocated/,
  );
  // P7: an undated payment can't touch the opening balance.
  const opening = existingMember({ openingBalance: 3000, billingCutover: "2026-11-30" });
  const openingDebts = pay.outstandingDebts(domain, opening);
  assert.match(
    pay.paymentProblem({ debts: openingDebts, draft: { ...draft, dateUnknown: true }, startDate: opening.startDate }),
    /needs the date/,
  );

  // P6: same answer on both sides.
  const changed = existingMember({ planStartDate: "2026-10-01" });
  const old = { allocations: [{ billingPeriod: "2026-09-01", amount: 1000 }] };
  const current = { allocations: [{ billingPeriod: "2026-10-01", amount: 1000 }] };
  assert.match(closedTermsProblem(changed, old), /plan change/);
  assert.ok(pay.closedTermsProblem(changed, old));
  assert.equal(closedTermsProblem(changed, current), "");
  assert.equal(pay.closedTermsProblem(changed, current), "");
  assert.equal(closedTermsProblem(existingMember(), old), "", "no plan change, nothing closed");
});
