// The gym activity record (Daily Log) against a real MySQL database: every
// admin action, driven through the real controllers, lands in gym_activity
// with who did it and what changed, and the Daily Log shows recorded activity
// instead of rebuilding it. Throwaway database (never gym_admin); skipped
// without DB_* credentials. Real clock: MySQL stamps rows with its own.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

const DB = `gym_test_activity_record_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
let admin;
let db;
let gymId;
let otherGymId;

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
  const gyms = require("../src/models/gymModel");
  gymId = (await gyms.createGym({ name: "Activity gym" })).id;
  otherGymId = (await gyms.createGym({ name: "Other gym" })).id;
});

test.after(async () => {
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

const OWNER = { id: "u-owner", name: "Sujal", role: "gym_admin" };
const localDay = (date = new Date()) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const shift = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + days));
};

// Calls a controller the way Express would and returns the JSON it sent.
async function call(handler, { gym = gymId, params = {}, body = {} } = {}) {
  let sent;
  const res = { status: () => res, json: (value) => (sent = value) };
  await handler({ gymId: gym, params, body, query: {}, user: OWNER }, res);
  return sent;
}

test("every admin action is recorded with who did it and what changed, and the Daily Log shows it", opts, async () => {
  const members = require("../src/controllers/memberController");
  const expenses = require("../src/controllers/expenseController");
  const trainers = require("../src/controllers/trainerController");
  const settings = require("../src/controllers/settingsController");
  const { getDailyLog } = require("../src/services/dailyLogService");
  const started = Date.now();
  const today = localDay();

  // An existing member with past payments: history, not money in today.
  const existing = await call(members.postMember, {
    body: {
      name: "Asd", phone: "9311100001", gymId: "A001", address: "MG Road", fee: 500, membershipType: "monthly", packageMonths: 1,
      collectionTiming: "at-join", startDate: shift(today, -40), admissionFee: 700,
      onboarding: {
        type: "existing", method: "periods",
        periods: [
          { period: shift(today, -40), status: "paid", amount: 500, paidInFull: true, date: shift(today, -38), mode: "cash" },
          { period: shift(today, -10), status: "paid", amount: 500, paidInFull: true, date: shift(today, -9), mode: "cash" },
        ],
        admission: { paid: true, date: shift(today, -40), mode: "cash" },
      },
    },
  });
  const fresh = await call(members.postMember, {
    body: { name: "Kavya", phone: "9311100002", gymId: "A002", address: "MG Road", fee: 1000, membershipType: "monthly", packageMonths: 1, collectionTiming: "at-join", startDate: today, admissionFee: 300, admissionMode: "upi" },
  });
  await call(members.putMember, { params: { id: fresh.id }, body: { ...fresh, address: "BTM Layout", gymId: "HACKED" } });
  await call(members.postOtherPayment, { params: { id: fresh.id }, body: { amount: 250, mode: "cash", note: "Protein shake" } });
  const term = existing.payments.find((payment) => payment.kind === "membership");
  await call(members.putPayment, { params: { id: existing.id, paymentId: term.id }, body: { amount: 400 } });
  await call(members.putPaymentDate, { params: { id: existing.id, paymentId: term.id }, body: { date: shift(today, -37) } });
  await call(members.deletePayment, { params: { id: existing.id, paymentId: term.id } });
  const expense = await call(expenses.postExpense, { body: { title: "Electricity bill", category: "utilities", amount: 300, date: today, mode: "cash" } });
  await call(expenses.putExpense, { params: { id: expense.id }, body: { amount: 350 } });
  await call(expenses.deleteExpense, { params: { id: expense.id } });
  await call(trainers.putTrainer, { params: { id: "trainer-1" }, body: { name: "Vikram", phone: "9311100099", specialty: "Strength", shift: "Morning", status: "active" } });
  await call(settings.putSettings, { body: { gymName: "Iron Den" } });
  await call(members.deleteMember, { params: { id: fresh.id } });
  // Another gym's action never shows up here.
  await call(members.postMember, { gym: otherGymId, body: { name: "Elsewhere", phone: "9311100003", gymId: "B001", address: "Far away", fee: 900, membershipType: "monthly", packageMonths: 1, collectionTiming: "at-join", startDate: today } });

  const log = await getDailyLog(gymId, { from: started - 60000, to: Date.now() + 60000, fromDay: today, toDay: today });
  const of = (type) => log.events.filter((event) => event.type === type);

  for (const event of log.events) {
    assert.equal(event.recorded, true, `${event.type} comes from the record`);
    assert.equal(event.by?.name, "Sujal", `${event.type} names who did it`);
  }
  assert.equal(log.events.some((event) => event.memberName === "Elsewhere"), false);

  const [added] = of("member_added").filter((event) => event.memberName === "Asd");
  assert.equal(added.existing, true);
  assert.equal(added.amount, 0, "past payments are not money received today");
  assert.equal(added.historyTotal, 1700);
  assert.deepEqual(added.lines.filter((line) => line.kind === "membership").map((line) => [line.amount, line.date]), [[500, shift(today, -38)], [500, shift(today, -9)]]);

  const [joined] = of("member_added").filter((event) => event.memberName === "Kavya");
  assert.equal(joined.amount, 1300, "first month and admission fee taken at joining");

  const [edit] = of("member_updated");
  assert.deepEqual(edit.changes, [{ field: "address", from: "MG Road", to: "BTM Layout" }], "the Gym ID can't change, so it isn't listed");
  assert.equal(of("purchase")[0].lines[0].note, "Protein shake");
  assert.deepEqual([of("payment_edited")[0].from, of("payment_edited")[0].to], [500, 400]);
  assert.equal(of("payment_date_changed")[0].to, shift(today, -37));
  assert.equal(of("payment_deleted")[0].line.amount, 400);
  assert.deepEqual(of("expense_edited")[0].changes, [{ field: "amount", from: 300, to: 350 }]);
  assert.equal(of("expense_deleted")[0].title, "Electricity bill");
  assert.equal(of("trainer_added")[0].trainerName, "Vikram");
  assert.deepEqual(of("settings_updated")[0].changes.map((item) => item.field), ["gymName"]);
  assert.equal(of("member_removed")[0].memberName, "Kavya");
  // The same actions are not listed a second time from record timestamps.
  assert.equal(log.events.filter((event) => !event.recorded).length, 0);
});
