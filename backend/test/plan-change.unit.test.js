// The Change plan sheet shows what a plan change will do before it is saved
// (quotePlanChange in admin-frontend/src/lib/billing.js). These cases run the
// sheet's figures and the server's changeMemberPlan() on the same members and
// choices, against a stub repository, and require the two to agree: the same
// changes accepted or refused, the same payment rows, the same logged totals.
const Module = require("module");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAdminLib, restoreClock, setToday, termPayment } = require("./helpers");
const { normalizeMember } = require("../src/utils/member");
const { normalizeSettings } = require("../src/utils/settings");
const backendBilling = require("../src/utils/billing");

// planChangeService reads the member and settings through repo() and writes
// through applyPlanChange; the stub hands it one member and keeps the write.
const stub = { member: null, settings: null, writes: [] };
const modelsPath = require.resolve(path.join(__dirname, "..", "src", "models"));
const fakeModels = new Module(modelsPath);
fakeModels.filename = modelsPath;
fakeModels.loaded = true;
fakeModels.exports = {
  repo: () => ({
    getMemberById: async () => stub.member,
    getSettings: async () => stub.settings,
    applyPlanChange: async (gymId, write) => {
      stub.writes.push(write);
    },
  }),
};
require.cache[modelsPath] = fakeModels;
const { changeMemberPlan } = require("../src/services/planChangeService");

let billing;
test.before(async () => {
  billing = await loadAdminLib("billing.js");
});
test.after(() => restoreClock());

const addDays = (key, days) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};

// What the sheet sends for one set of choices, and what it expects back.
function sheetRequest(settings, member, choice) {
  const quote = billing.quotePlanChange(settings, member, choice);
  const payload = {
    ...quote.plan,
    effectiveDate: quote.effectiveDate,
    oldDues: quote.dues.length ? choice.oldDues : undefined,
    collectFirstTerm: Boolean(quote.firstTerm?.collect),
    mode: "cash",
    note: "",
  };
  return { quote, payload, allowed: !Object.keys(quote.errors).length && !quote.unchanged };
}

async function serverResult(settings, member, payload) {
  stub.member = structuredClone(member);
  stub.settings = settings;
  stub.writes = [];
  try {
    await changeMemberPlan("gym1", member.id, payload, { id: "u1", name: "Owner", role: "gym_admin" });
    return { ok: true, write: stub.writes[0] };
  } catch (error) {
    return { ok: false, error };
  }
}

// Checks one choice end to end and returns the quote for further checks.
async function agree(settings, member, choice, label) {
  const { quote, payload, allowed } = sheetRequest(settings, member, choice);
  const server = await serverResult(settings, member, payload);
  assert.equal(server.ok, allowed, `${label}: sheet ${allowed ? "allows" : "blocks"} it, server ${server.ok ? "accepts" : `refuses (${server.error?.message})`}`);
  if (!server.ok) return quote;

  const rows = server.write.payments.map(({ billingPeriod, amount, periodFee }) => ({ billingPeriod, amount, periodFee }));
  assert.deepEqual(quote.payments, rows, `${label}: payment rows`);
  const { change } = server.write;
  assert.equal(change.effectiveDate, quote.effectiveDate, `${label}: start date`);
  assert.equal(change.duesCollected, quote.waived ? 0 : quote.duesAmount, `${label}: dues collected`);
  assert.equal(change.duesWaived, quote.waived, `${label}: dues waived`);
  assert.equal(change.firstTermCollected, quote.firstTerm?.collect ? quote.firstTerm.amount : 0, `${label}: first term`);
  assert.equal(quote.collectNow, change.duesCollected + change.firstTermCollected, `${label}: collect now`);
  assert.deepEqual(change.to, quote.plan, `${label}: saved plan`);

  // The sheet's "after the change" line, against the server's billing math on
  // the member as it is saved.
  const saved = normalizeMember({
    ...server.write.member,
    payments: [...member.payments, ...server.write.payments.map((payment, index) => ({ ...payment, id: `new${index}`, kind: "membership" }))],
  });
  const overdue = backendBilling.dueUnpaidPeriods(saved, settings).length * saved.fee;
  assert.equal(quote.preview.owes, overdue, `${label}: overdue after the change`);
  return quote;
}

const GYMS = [
  normalizeSettings({ billingCycleMode: "30-days", defaultCollectionTiming: "at-join" }),
  normalizeSettings({ billingCycleMode: "month-start", defaultCollectionTiming: "at-join" }),
  normalizeSettings({ billingCycleMode: "custom-days", customBillingDays: 25, defaultCollectionTiming: "fixed-day" }),
];

function members(settings) {
  const keys = (member) => backendBilling.getBillingPeriodKeys(normalizeMember(member), settings);
  const base = { id: "m1", name: "Asha", fee: 1000, membershipType: "monthly", packageMonths: 1, startDate: "2026-07-14", payments: [] };
  const list = [
    { ...base, collectionTiming: "at-join" },
    { ...base, collectionTiming: "fixed-day" },
    { ...base, collectionTiming: "" },
    { ...base, membershipType: "package", packageMonths: 3, fee: 2700, collectionTiming: "at-join", startDate: "2026-05-31" },
    { ...base, membershipType: "package", packageMonths: 1, fee: 900, collectionTiming: "fixed-day", startDate: "2026-01-31" },
    // Plan already changed, starting later (only that date can be used).
    { ...base, collectionTiming: "at-join", planStartDate: "2026-11-20" },
    // Joining date in the future.
    { ...base, collectionTiming: "at-join", startDate: "2026-11-25" },
  ];
  return list.flatMap((raw) => {
    const terms = keys(raw);
    const variants = [{ ...raw }];
    if (terms.length) {
      // Everything paid; everything paid but the last; first term part-paid; last term part-paid.
      variants.push({ ...raw, payments: terms.map((period) => termPayment(period, raw.fee)) });
      variants.push({ ...raw, payments: terms.slice(0, -1).map((period) => termPayment(period, raw.fee)) });
      variants.push({ ...raw, payments: [termPayment(terms[0], raw.fee / 2, { periodFee: raw.fee })] });
      variants.push({
        ...raw,
        payments: [...terms.slice(0, -1).map((period) => termPayment(period, raw.fee)), termPayment(terms.at(-1), 300, { periodFee: raw.fee })],
      });
      // A legacy row (no period fee) settles its term alone.
      variants.push({ ...raw, payments: [termPayment(terms[0], 400, { periodFee: null })] });
    }
    return variants.map(normalizeMember);
  });
}

const NEW_PLANS = [
  { membershipType: "monthly", packageMonths: 1, fee: 1200, collectionTiming: "at-join" },
  { membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "fixed-day" },
  { membershipType: "package", packageMonths: 3, fee: 2700, collectionTiming: "at-join" },
  { membershipType: "package", packageMonths: 6, fee: 5000, collectionTiming: "fixed-day" },
  { membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "at-join" },
];

for (const today of ["2026-11-03", "2026-11-30"]) {
  test(`sheet and server agree on every plan change (today ${today})`, async () => {
    setToday(today);
    let checked = 0;
    for (const settings of GYMS) {
      for (const member of members(settings)) {
        const window = billing.planChangeWindow(settings, member);
        const startDates = [...new Set([window.today, window.renewal, window.earliest, window.latest, addDays(window.earliest, -1), addDays(window.latest, 1), addDays(window.today, -10)])];
        for (const plan of NEW_PLANS) {
          for (const effectiveDate of startDates) {
            for (const oldDues of ["collect", "waive"]) {
              for (const collectFirstTerm of [true, false]) {
                const label = `${settings.billingCycleMode} ${member.membershipType}/${member.packageMonths} ${member.collectionTiming || "default"} paid=${member.payments.length} → ${plan.membershipType}/${plan.packageMonths} ${plan.collectionTiming} ₹${plan.fee} from ${effectiveDate} ${oldDues} first=${collectFirstTerm}`;
                await agree(settings, member, { ...plan, effectiveDate, oldDues, collectFirstTerm }, label);
                checked += 1;
              }
            }
          }
        }
      }
    }
    assert.ok(checked > 1000);
  });
}

test("the sheet's renewal date is the one the server accepts, also for a package begun on the 31st", async () => {
  setToday("2026-05-10");
  const settings = GYMS[0];
  // Terms: 31 Jan, 28 Feb, 28 Mar, 28 Apr (each month added to the last term).
  const member = normalizeMember({ id: "m1", name: "Ravi", fee: 900, membershipType: "package", packageMonths: 1, collectionTiming: "at-join", startDate: "2026-01-31", payments: [] });
  const window = billing.planChangeWindow(settings, member);
  assert.equal(window.renewal, backendBilling.nextPeriodStartKey(member, settings));
  assert.equal(window.renewal, "2026-05-28");
  const plan = { membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "at-join" };
  await agree(settings, member, { ...plan, effectiveDate: window.renewal, oldDues: "collect", collectFirstTerm: false }, "renewal of a 31st package");
});

test("a part-paid month that becomes the new plan's first month is only charged what is left", async () => {
  setToday("2026-11-10");
  const settings = GYMS[1];
  const member = normalizeMember({
    id: "m1",
    name: "Meena",
    fee: 1000,
    membershipType: "monthly",
    collectionTiming: "at-join",
    startDate: "2026-10-01",
    payments: [termPayment("2026-10", 1000), termPayment("2026-11", 400, { periodFee: 1000 })],
  });
  const plan = { membershipType: "monthly", packageMonths: 1, fee: 1500, collectionTiming: "at-join" };
  // From 1 Nov: November is not before the start, so it becomes the first month at the new fee.
  const quote = await agree(settings, member, { ...plan, effectiveDate: "2026-11-01", oldDues: "collect", collectFirstTerm: true }, "first month part-paid");
  assert.equal(quote.firstTerm.amount, 1100);
  assert.equal(quote.collectNow, 1100);
});

test("unchanged plans, bad fees and bad lengths are blocked before they reach the server", () => {
  setToday("2026-11-03");
  const settings = GYMS[0];
  const member = normalizeMember({ id: "m1", name: "Asha", fee: 1000, membershipType: "monthly", collectionTiming: "", startDate: "2026-07-14", payments: [] });
  const window = billing.planChangeWindow(settings, member);
  const base = { membershipType: "monthly", packageMonths: 1, fee: 1000, collectionTiming: "at-join", effectiveDate: window.renewal, oldDues: "collect", collectFirstTerm: null };
  // "" timing means the gym default (upfront here), so this is the same plan.
  assert.equal(billing.quotePlanChange(settings, member, base).unchanged, true);
  assert.equal(billing.quotePlanChange(settings, member, { ...base, fee: "" }).errors.fee, "Enter the fee");
  assert.ok(billing.quotePlanChange(settings, member, { ...base, fee: 10000001 }).errors.fee);
  assert.equal(billing.quotePlanChange(settings, member, { ...base, membershipType: "package", packageMonths: 61 }).errors.packageMonths, "Enter 1 to 60 months");
  assert.equal(billing.quotePlanChange(settings, member, { ...base, membershipType: "package", packageMonths: 2.5 }).errors.packageMonths, "Enter 1 to 60 months");
  assert.equal(billing.quotePlanChange(settings, member, { ...base, effectiveDate: addDays(window.latest, 1) }).errors.date, "Pick a start date");
});

test("nothing is chosen for the admin: unanswered terms, dues and first-month questions block the change", () => {
  setToday("2026-11-03");
  const settings = GYMS[0];
  // Joined 14 Jul, nothing paid: several unpaid terms on the old plan.
  const member = normalizeMember({ id: "m1", name: "Asha", fee: 1000, membershipType: "monthly", collectionTiming: "at-join", startDate: "2026-07-14", payments: [] });
  const ask = (changes) =>
    billing.quotePlanChange(settings, member, {
      membershipType: "package",
      packageMonths: 3,
      fee: 2700,
      collectionTiming: "at-join",
      effectiveDate: "2026-11-03",
      oldDues: null,
      collectFirstTerm: null,
      ...changes,
    });

  const blank = ask({ collectionTiming: null });
  assert.equal(blank.errors.timing, "Select the billing terms");
  assert.equal(blank.firstTerm, null, "no first month is offered until the terms are chosen");

  const open = ask({});
  assert.ok(open.dues.length > 0);
  assert.equal(open.errors.oldDues, "Settle the previous dues");
  assert.equal(open.errors.firstTerm, "Choose the first payment");
  assert.deepEqual(open.payments, [], "nothing is collected until it is chosen");
  assert.equal(open.waived, 0, "nothing is waived until it is chosen");
  assert.equal(open.preview, null);

  const answered = ask({ oldDues: "waive", collectFirstTerm: false });
  assert.deepEqual(answered.errors, {});
  assert.equal(answered.waived, answered.duesAmount);
  assert.equal(answered.collectNow, 0);
  assert.equal(answered.firstTerm.collect, false);

  // After the period there is no first-month question at all.
  const after = ask({ collectionTiming: "fixed-day", oldDues: "collect" });
  assert.equal(after.firstTerm, null);
  assert.equal(after.errors.firstTerm, undefined);
});
