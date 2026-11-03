// Editing and deleting recorded payments against a real MySQL database: a throwaway database is created for
// this run and dropped afterwards (never gym_admin). Skipped when no DB_*
// credentials are configured. Clock fixed at 2 Nov 2026, 30-day cycle.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { restoreClock, setToday } = require("./helpers");

const DB = `gym_test_payedit_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
let admin;
let gymId;
let db;
let services;
let repo;
let billing;

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
  const gym = await require("../src/models/gymModel").createGym({ name: "Payment edit test gym" });
  gymId = gym.id;
  services = {
    ...require("../src/services/memberService"),
    ...require("../src/services/onboardingService"),
    ...require("../src/services/paymentService"),
  };
  repo = require("../src/models").repo;
  billing = require("../src/utils/billing");
});

test.after(async () => {
  restoreClock();
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

test.beforeEach(() => setToday("2026-11-02"));

const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
let phoneSeq = 9300000000;
const TERMS = ["2026-08-02", "2026-09-01", "2026-10-01", "2026-10-31"];

async function addMember(answers) {
  const phone = String((phoneSeq += 1));
  const { member } = await services.createExistingMember(gymId, {
    name: "Edit Member",
    phone,
    gymId: `E${phone}`,
    fee: 1000,
    membershipType: "monthly",
    packageMonths: 1,
    collectionTiming: "at-join",
    startDate: "2026-08-02",
    onboarding: { type: "existing", method: "periods", periods: answers },
  });
  return member;
}
const allPaid = () => TERMS.map((period) => ({ period, status: "paid", amount: 1000, paidInFull: true, date: period, mode: "cash" }));
const reload = (member) => repo().getMemberById(gymId, member.id);
const settings = () => repo().getSettings(gymId);
const status = async (member) => {
  const s = await settings();
  const m = await reload(member);
  return { overdue: billing.dueUnpaidPeriods(m, s).length, outstanding: billing.memberOutstanding(m, s) };
};
const paymentFor = (member, period) => member.payments.find((payment) => payment.billingPeriod === period);

test("lowering a payment below the fee leaves the rest due, not overdue", opts, async () => {
  const member = await addMember(allPaid());
  assert.deepEqual(await status(member), { overdue: 0, outstanding: 0 });

  const edit = services.prepareAmountEdit(await reload(member), paymentFor(member, "2026-10-01").id, 200, await settings());
  await repo().updatePaymentAmount(member, edit.payment.id, edit.period, edit.amount, edit.periodFee);

  assert.deepEqual(await status(member), { overdue: 0, outstanding: 800 });
  const after = paymentFor(await reload(member), "2026-10-01");
  assert.equal(after.amount, 200);
  assert.equal(after.periodFee, 1000);
});

test("an amount above the term's fee is rejected; raising back to the fee settles it", opts, async () => {
  const member = await addMember(allPaid());
  const id = paymentFor(member, "2026-09-01").id;
  assert.throws(() => services.prepareAmountEdit(member, id, 1200, { billingCycleMode: "30-days" }), /more than/);
  assert.throws(() => services.prepareAmountEdit(member, id, 0, { billingCycleMode: "30-days" }), /delete/);

  const low = services.prepareAmountEdit(member, id, 300, await settings());
  await repo().updatePaymentAmount(member, id, low.period, low.amount, low.periodFee);
  assert.equal((await status(member)).outstanding, 700);
  const high = services.prepareAmountEdit(await reload(member), id, 1000, await settings());
  await repo().updatePaymentAmount(member, id, high.period, high.amount, high.periodFee);
  assert.deepEqual(await status(member), { overdue: 0, outstanding: 0 });
});

test("deleting a past-month payment makes that month overdue and unpaid", opts, async () => {
  const member = await addMember(allPaid());
  const { payment } = services.findEditablePayment(member, paymentFor(member, "2026-09-01").id, await settings());
  await repo().deletePayment(member, payment.id);

  assert.deepEqual(await status(member), { overdue: 1, outstanding: 1000 });
  assert.equal(paymentFor(await reload(member), "2026-09-01"), undefined);
});

test("admission payments and unknown ids can't be edited or deleted here", opts, async () => {
  const member = await addMember(allPaid());
  assert.throws(() => services.findEditablePayment(member, "no-such-id", { billingCycleMode: "30-days" }), (error) => error.status === 404 || error.statusCode === 404);
});

test("an owner can correct a recorded payment date; the term it pays and the amount stay", opts, async () => {
  const member = await addMember(allPaid());
  const id = paymentFor(member, "2026-09-01").id;
  const edit = services.prepareDateEdit(await reload(member), id, "2026-09-05", "2026-11-02");
  await repo().updatePaymentDate(member, edit.payment.id, edit.date);

  const after = paymentFor(await reload(member), "2026-09-01");
  assert.equal(after.date, "2026-09-05");
  assert.equal(after.month, "2026-09");
  assert.equal(after.amount, 1000);
  assert.equal(after.dateKnown, true);
  assert.deepEqual(await status(member), { overdue: 0, outstanding: 0 });

  assert.throws(() => services.prepareDateEdit(member, id, "2026-12-01", "2026-11-02"), /future/);
  assert.throws(() => services.prepareDateEdit(member, id, "2026-07-01", "2026-11-02"), /before the joining date/);
});

test("a recorded admission fee is corrected from Edit payments, never from the profile; the Gym ID is fixed", opts, async () => {
  const member = await addMember(allPaid());
  await services.updateMember(gymId, member.id, { ...member, admissionFee: 500, admissionMode: "cash" });
  const admissionOf = async () => (await reload(member)).payments.find((payment) => payment.kind === "admission");
  const recorded = await admissionOf();
  assert.equal(recorded.amount, 500, "a fee that was never recorded can be added from the profile");

  // Profile saves leave a recorded fee alone, and never change the Gym ID.
  const fresh = await reload(member);
  await services.updateMember(gymId, member.id, { ...fresh, admissionFee: 900, gymId: "CHANGED-ID", address: "New address" });
  const after = await reload(member);
  assert.equal(after.gymId, member.gymId);
  assert.equal(after.admissionFee, 500);
  assert.equal((await admissionOf()).id, recorded.id);
  assert.equal((await admissionOf()).amount, 500);

  // Edit payments corrects the amount (the profile follows) and the date.
  const edit = services.prepareAdmissionEdit(after, recorded.id, 650);
  await repo().updateAdmissionAmount(after, edit.payment.id, edit.amount);
  assert.equal((await admissionOf()).amount, 650);
  assert.equal((await reload(member)).admissionFee, 650);
  const date = services.prepareDateEdit(await reload(member), recorded.id, "2026-08-05", "2026-11-02");
  await repo().updatePaymentDate(member, date.payment.id, date.date);
  assert.equal((await admissionOf()).date, "2026-08-05");
  // Billing never counts it: the member is still fully paid.
  assert.deepEqual(await status(member), { overdue: 0, outstanding: 0 });

  assert.throws(() => services.prepareAdmissionEdit(after, recorded.id, 0), /admission fee received/);
  assert.throws(() => services.prepareAdmissionEdit(after, paymentFor(member, "2026-09-01").id, 100), /not the admission/);
});
