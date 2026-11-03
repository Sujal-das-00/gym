// Phase 1 billing rules for existing members, on a fixed clock (2 Nov 2026,
// the default 30-day cycle). Every case runs through the backend billing and
// the admin panel's copy of it, so the two can't drift apart.
const test = require("node:test");
const assert = require("node:assert/strict");
const be = require("../src/utils/billing");
const { preparePeriodPayments } = require("../src/services/paymentService");
const { feeReminderRecipients, inExistingMemberHold } = require("../src/services/notificationService");
const { SETTINGS, existingMember, loadAdminLib, restoreClock, setToday, termPayment } = require("./helpers");

let fe;
let feLedger;
let feOnboarding;
test.before(async () => {
  fe = await loadAdminLib("billing.js");
  feLedger = await loadAdminLib("ledger.js");
  feOnboarding = await loadAdminLib("onboarding.js");
});
test.beforeEach(() => setToday("2026-11-02"));
test.afterEach(() => restoreClock());

// The same questions asked of both implementations.
function both(member, settings = SETTINGS) {
  const domain = fe.createDomain(settings);
  const backend = {
    terms: be.getBillingPeriodKeys(member, settings),
    overdue: be.dueUnpaidPeriods(member, settings),
    expired: be.isMembershipExpired(member, settings),
    outstanding: be.memberOutstanding(member, settings),
    opening: be.openingBalanceDue(member),
  };
  const frontend = {
    terms: domain.getBillingPeriodKeys(member),
    overdue: domain.getDueUnpaidPeriods(member),
    expired: domain.isOverdue(member),
    outstanding: domain.getOutstandingAmount(member),
    opening: domain.getOpeningBalanceDue(member),
  };
  assert.deepEqual(frontend, backend, "admin panel and backend disagree");
  return { ...backend, status: domain.getFeeStatus(member), domain };
}

const TERMS = ["2026-08-02", "2026-09-01", "2026-10-01", "2026-10-31"];

test("C1/T12: terms are the gym's 30-day terms, not calendar months", () => {
  assert.deepEqual(both(existingMember()).terms, TERMS);
  // A gym set to month-start billing keeps its calendar-month terms.
  assert.deepEqual(both(existingMember(), { ...SETTINGS, billingCycleMode: "month-start" }).terms, [
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
});

test("T1: past terms paid, current unpaid -> only the current term is outstanding", () => {
  const result = both(existingMember({ payments: TERMS.slice(0, 3).map((period) => termPayment(period)) }));
  assert.deepEqual(result.overdue, ["2026-10-31"]);
  assert.equal(result.outstanding, 1000);
  assert.equal(result.expired, true);
});

test("T2: unpaid historical terms add up; the paid one is not listed", () => {
  const result = both(existingMember({ payments: [termPayment("2026-10-01")] }));
  assert.deepEqual(result.overdue, ["2026-08-02", "2026-09-01", "2026-10-31"]);
  assert.equal(result.outstanding, 3000);
});

function novemberIncome(member) {
  const domain = fe.createDomain(SETTINGS);
  return feLedger
    .buildLedgerEntries({ members: [member], expenses: [], domain })
    .filter((entry) => entry.type === "earning" && entry.date.startsWith("2026-11"))
    .reduce((sum, entry) => sum + entry.amount, 0);
}

test("T3: payments collected Aug-Oct and entered on 2 Nov don't inflate November", () => {
  const payments = [
    termPayment("2026-08-02", 1000, { date: "2026-08-02" }),
    termPayment("2026-09-01", 1000, { date: "2026-09-03" }),
    termPayment("2026-10-01", 1000, { date: "2026-10-01" }),
  ];
  const member = existingMember({ payments });
  assert.equal(novemberIncome(member), 0);
  const result = both(member);
  assert.deepEqual(result.overdue, ["2026-10-31"], "November's term is not marked paid");
});

test("T3b: unrecorded dates count in each term's month and are labelled", () => {
  const payments = TERMS.slice(0, 3).map((period) => termPayment(period, 1000, { date: period, dateKnown: false }));
  const member = existingMember({ payments });
  assert.equal(novemberIncome(member), 0);
  const domain = fe.createDomain(SETTINGS);
  const entries = feLedger.buildLedgerEntries({ members: [member], expenses: [], domain });
  // Each entry carries the flag; the lists show "Date not recorded" from it.
  assert.ok(entries.every((entry) => entry.dateKnown === false));
  assert.equal(domain.getPaymentDateLabel(payments[0]), fe.DATE_NOT_RECORDED);
});

test("T4: an opening balance is owed as a balance, never as overdue terms", () => {
  const member = existingMember({ openingBalance: 3000, billingCutover: "2026-11-30" });
  const result = both(member);
  assert.equal(result.outstanding, 3000);
  assert.deepEqual(result.overdue, []);
  assert.equal(result.expired, false, "check-in is never blocked by an opening balance");
  assert.deepEqual(result.terms, [], "every started term is covered (C5)");
  assert.equal(result.status, "balance");
  const summary = be.memberBillingSummary(member, SETTINGS);
  assert.equal(summary.expired, false);
  assert.equal(summary.openingBalanceDue, 3000);
  assert.equal(summary.nextDueDate, "2026-11-30");
});

test("T4b: collecting an opening balance reduces it; it can't be overpaid", () => {
  const member = existingMember({ openingBalance: 3000, billingCutover: "2026-11-30" });
  const [first] = preparePeriodPayments(member, [{ billingPeriod: be.OPENING_PERIOD_KEY, amount: 1000, date: "2026-11-02" }]);
  assert.equal(first.periodFee, 3000);
  assert.equal(first.billingMonth, "");
  member.payments.push({ ...first, id: "o1" });
  assert.equal(both(member).opening, 2000);
  assert.throws(
    () => preparePeriodPayments(member, [{ billingPeriod: be.OPENING_PERIOD_KEY, amount: 2500 }]),
    /more than the ₹2,000 left on the opening balance/,
  );
  member.payments.push({ ...preparePeriodPayments(member, [{ billingPeriod: be.OPENING_PERIOD_KEY }])[0], id: "o2" });
  assert.equal(both(member).opening, 0);
  assert.throws(() => preparePeriodPayments(member, [{ billingPeriod: be.OPENING_PERIOD_KEY, amount: 1 }]), /already cleared/);
  // Opening-balance rows never mark a term paid.
  assert.equal(be.getPeriodLedger(member).size, 0);
});

test("T4d: normal billing resumes at the cut-over (C5, C6)", () => {
  const member = existingMember({ openingBalance: 3000, billingCutover: "2026-11-30" });
  setToday("2026-11-30");
  let result = both(member);
  assert.deepEqual(result.terms, ["2026-11-30"], "no term before the cut-over is ever billable");
  assert.deepEqual(result.overdue, []);
  setToday("2026-12-01");
  result = both(member);
  assert.deepEqual(result.overdue, ["2026-11-30"]);
  assert.equal(result.outstanding, 4000);
});

test("T7: paid in full below today's fee settles the term at the amount received", () => {
  const payments = [...TERMS.slice(0, 3).map((period) => termPayment(period)), termPayment("2026-10-31", 800)];
  const result = both(existingMember({ payments }));
  assert.equal(result.outstanding, 0);
  assert.deepEqual(result.overdue, []);
});

test("T7b: not paid in full leaves the rest as a balance, not overdue", () => {
  const payments = [
    ...TERMS.slice(0, 3).map((period) => termPayment(period)),
    termPayment("2026-10-31", 500, { periodFee: 1000 }),
  ];
  const result = both(existingMember({ payments }));
  assert.equal(result.outstanding, 500);
  assert.deepEqual(result.overdue, []);
  assert.equal(result.status, "balance");
});

test("D4/C2: the scheduled reminder holds new existing members for 3 days only", () => {
  const registered = new Date(2026, 10, 2, 9).getTime();
  const fresh = existingMember({ createdAt: new Date(registered).toISOString() });
  const day = 24 * 60 * 60 * 1000;
  assert.equal(inExistingMemberHold(fresh, registered), true);
  assert.equal(inExistingMemberHold(fresh, registered + 2 * day), true);
  assert.equal(inExistingMemberHold(fresh, registered + 3 * day), false);
  // Members already in the system ('new') are never held.
  assert.equal(inExistingMemberHold({ ...fresh, onboardingType: "new" }, registered), false);

  const owing = existingMember({ id: "owing", createdAt: fresh.createdAt });
  const cleared = existingMember({ id: "cleared", createdAt: fresh.createdAt, payments: TERMS.map((period) => termPayment(period)) });
  const oldMember = existingMember({ id: "old", onboardingType: "new" });
  const ids = (options) => feeReminderRecipients([owing, cleared, oldMember], SETTINGS, options).map((entry) => entry.member.id);
  assert.deepEqual(ids({ scheduled: true, now: registered }), ["old"]);
  assert.deepEqual(ids({ scheduled: true, now: registered + 3 * day }).sort(), ["old", "owing"]);
  // A manual send (the admin's button) is never held.
  assert.deepEqual(ids({ scheduled: false, now: registered }).sort(), ["old", "owing"]);
});

test("an opening balance alone is enough to get a fee reminder", () => {
  const member = existingMember({ openingBalance: 500, billingCutover: "2026-11-30", onboardingType: "new" });
  assert.equal(feeReminderRecipients([member], SETTINGS).length, 1);
});

test("T8 (form): joining date limits, and every term must be answered", () => {
  const today = "2026-11-02";
  assert.equal(feOnboarding.earliestJoiningDate(today), "2024-11-02");
  assert.equal(feOnboarding.joiningDateProblem("2024-11-02", today), "");
  assert.match(feOnboarding.joiningDateProblem("2024-11-01", today), /24 months/);
  assert.match(feOnboarding.joiningDateProblem(today, today), /new member/);

  const domain = fe.createDomain(SETTINGS);
  const member = existingMember();
  const history = feOnboarding.blankHistory();
  const ask = () => feOnboarding.historyProblem({ startDate: member.startDate, terms: TERMS, history, domain, member, today });
  assert.match(ask(), /4 left/);
  for (const period of TERMS) history.answers[period] = { ...feOnboarding.blankAnswer(1000), status: "unpaid" };
  // The admission fee is a question too: nothing is assumed.
  assert.match(ask(), /admission fee was paid/);
  history.admission.paid = true;
  assert.match(ask(), /Enter the admission fee/);
  history.admission.paid = false;
  assert.equal(ask(), "");
  history.answers["2026-08-02"] = { ...feOnboarding.blankAnswer(1000), status: "paid" };
  assert.match(ask(), /Don't know the date/);
  history.answers["2026-08-02"].dateUnknown = true;
  assert.equal(ask(), "");
  history.answers["2026-08-02"].amount = "1200";
  assert.match(ask(), /more than the monthly fee/);
});

test("form preview and payload match what the server stores", () => {
  const domain = fe.createDomain(SETTINGS);
  const member = existingMember();
  const history = feOnboarding.blankHistory();
  history.answers = {
    "2026-08-02": { ...feOnboarding.blankAnswer(1000), status: "paid", date: "2026-08-02" },
    "2026-09-01": { ...feOnboarding.blankAnswer(1000), status: "paid", amount: "800", dateUnknown: true },
    "2026-10-01": { ...feOnboarding.blankAnswer(1000), status: "paid", amount: "500", date: "2026-10-03" },
    "2026-10-31": { ...feOnboarding.blankAnswer(1000), status: "unpaid" },
  };
  const preview = feOnboarding.previewMember({ member, terms: TERMS, history, cutover: "" });
  assert.deepEqual(
    preview.payments.map(({ billingPeriod, amount, periodFee, date, dateKnown }) => [billingPeriod, amount, periodFee, date, dateKnown]),
    [
      ["2026-08-02", 1000, 1000, "2026-08-02", true],
      ["2026-09-01", 800, 1000, "2026-09-01", false],
      ["2026-10-01", 500, 1000, "2026-10-03", true],
    ],
  );
  // ₹200 short on 1 Sep + ₹500 short on 1 Oct + the unpaid 31 Oct term.
  assert.equal(domain.getOutstandingAmount(preview), 1700);

  const payload = feOnboarding.onboardingPayload({ terms: TERMS, history, fee: 1000 });
  assert.equal(payload.method, "periods");
  assert.deepEqual(payload.periods[1], { period: "2026-09-01", status: "paid", amount: 800, paidInFull: false, termFee: 1000, date: null, mode: "" });
  assert.deepEqual(payload.periods[2].termFee, 1000);
  assert.deepEqual(payload.periods[3], { period: "2026-10-31", status: "unpaid" });

  const cutover = feOnboarding.openingCutover(domain, member);
  assert.equal(cutover, "2026-11-30");
  assert.equal(cutover, be.nextPeriodStartKey(member, SETTINGS), "form and server agree on the cut-over");
});

test("other payments: income with a note that never changes what is owed, on both sides", () => {
  const paidUp = existingMember({ payments: TERMS.map((period) => termPayment(period)), collectionTiming: "at-join" });
  const extra = {
    id: "x1",
    kind: "other",
    billingPeriod: "other",
    billingMonth: "",
    amount: 750,
    periodFee: null,
    date: "2026-11-02",
    dateKnown: true,
    mode: "upi",
    note: "Whey protein",
  };
  const member = { ...paidUp, payments: [...paidUp.payments, extra] };

  const before = both(paidUp);
  const after = both(member);
  assert.deepEqual([after.overdue, after.outstanding, after.expired, after.status], [before.overdue, before.outstanding, before.expired, before.status]);
  assert.equal(after.status, "paid");
  assert.equal(after.domain.isPartPayment(extra), false);
  assert.equal(after.domain.getPaymentLabel(extra, member), "Other payment");
  assert.equal(after.domain.getPeriodLedger?.(member)?.has?.("other") ?? false, false);

  // The ledger counts it as income, named by its note.
  const entry = feLedger.buildLedgerEntries({ members: [member], expenses: [], domain: after.domain }).find((item) => item.id === "x1");
  assert.deepEqual(
    [entry.type, entry.amount, entry.category, entry.purchase, entry.detail, entry.dateKnown],
    ["earning", 750, "other-payment", "Whey protein", "Other payment", true],
  );
  assert.equal(novemberIncome(member) - novemberIncome(paidUp), 750);
});

test("part-paying the running package of an after-the-period member before it ends", () => {
  const pkg = (payments = []) => ({
    id: "pkg", name: "Pkg", fee: 6000, membershipType: "package", packageMonths: 3, collectionTiming: "fixed-day",
    startDate: "2026-11-02", planStartDate: "", billingCutover: "", openingBalance: 0, payments,
  });
  const part = { id: "a", kind: "membership", billingPeriod: "2026-11-02", amount: 2000, periodFee: 6000, date: "2026-11-02", dateKnown: true };
  const domain = fe.createDomain(SETTINGS);

  // The running term is the one offered for an advance payment, until something is paid on it.
  assert.equal(domain.getAdvanceTerm(pkg()), "2026-11-02");
  assert.equal(domain.getAdvanceTerm(pkg([part])), "");
  assert.equal(domain.getAdvanceTerm({ ...pkg(), collectionTiming: "at-join" }), "", "upfront members pay at the start, not in advance");

  // The server takes it, stamping the term's full fee, and refuses more than the fee.
  const [prepared] = preparePeriodPayments(pkg(), [{ billingPeriod: "2026-11-02", amount: 2000 }]);
  assert.deepEqual([prepared.amount, prepared.periodFee], [2000, 6000]);
  assert.throws(() => preparePeriodPayments(pkg(), [{ billingPeriod: "2026-11-02", amount: 7000 }]), /more than/);

  // Same answers on both sides: a balance, not overdue, and still due at the end of the package.
  const result = both(pkg([part]));
  assert.deepEqual([result.outstanding, result.expired, result.overdue], [4000, false, []]);
  assert.equal(result.status, "balance");
  assert.equal(result.domain.getDueDateKey(pkg([part])), "2027-02-02");
  assert.equal(be.memberBillingSummary(pkg([part]), SETTINGS).nextDueDate, "2027-02-02");

  // Paying the whole fee early settles the term.
  const full = pkg([{ ...part, amount: 6000 }]);
  assert.equal(both(full).outstanding, 0);
});
