// The Daily Log against a real MySQL database: a throwaway database is created
// for this run and dropped afterwards (never gym_admin). Skipped when no DB_*
// credentials are configured. Uses the real clock, because MySQL stamps
// payments and expenses with its own.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");

const DB = `gym_test_daily_log_${Date.now()}`;
const hasDb = Boolean(process.env.DB_USER);
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
  const gymModel = require("../src/models/gymModel");
  gymId = (await gymModel.createGym({ name: "Daily log gym" })).id;
  otherGymId = (await gymModel.createGym({ name: "Another gym" })).id;
});

test.after(async () => {
  if (!admin) return;
  await db.getPool().end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.end();
});

const opts = { skip: hasDb ? false : "no DB_* credentials in .env" };
const localDay = (date = new Date()) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
let phone = 9300000000;
const memberPayload = (name, extra = {}) => {
  phone += 1;
  return { name, phone: String(phone), gymId: `D${phone}`, fee: 1000, membershipType: "monthly", packageMonths: 1, collectionTiming: "at-join", startDate: localDay(), ...extra };
};
// Moves a row's creation an hour back without marking it edited (an explicit
// updated_at = updated_at stops ON UPDATE from firing).
const backdate = (table, id) =>
  db.exec(`UPDATE ${table} SET created_at = created_at - INTERVAL 1 HOUR, updated_at = updated_at WHERE id = ?`, [id]);
// A member (and their joining payments) as if added an hour ago, so what is
// done to them now is its own event rather than part of "member added".
async function addedEarlier(member) {
  await db.exec("UPDATE members SET created_at = ?, updated_at = updated_at - INTERVAL 1 HOUR WHERE id = ?", [
    new Date(Date.parse(member.createdAt) - 3600000).toISOString(),
    member.id,
  ]);
  await db.exec("UPDATE payments SET created_at = created_at - INTERVAL 1 HOUR, updated_at = updated_at WHERE member_id = ?", [member.id]);
}

test("every action shows up once, at the time it happened, for its own gym only", opts, async () => {
  const { createMember, updateMember } = require("../src/services/memberService");
  const { changeMemberPlan } = require("../src/services/planChangeService");
  const { getDailyLog } = require("../src/services/dailyLogService");
  const { repo } = require("../src/models");
  const { normalizeExpense } = require("../src/utils/expense");
  const started = Date.now();

  // Added with an admission fee: the joining payments belong to "member added".
  await createMember(gymId, memberPayload("Rahul", { admissionFee: 500 }));
  // A part payment.
  const piyush = await createMember(gymId, memberPayload("Piyush", { collectionTiming: "fixed-day" }));
  await addedEarlier(piyush);
  await repo().addPayments(piyush, [{ billingPeriod: piyush.startDate, amount: 400, periodFee: 1000, mode: "cash" }]);
  // A plan change from today, collecting the new first term.
  // "After the period", so nothing is paid at joining and the first term is new money.
  const sujal = await createMember(gymId, memberPayload("Sujal", { collectionTiming: "fixed-day" }));
  await addedEarlier(sujal);
  await changeMemberPlan(
    gymId,
    sujal.id,
    { membershipType: "package", packageMonths: 3, fee: 2700, collectionTiming: "at-join", effectiveDate: localDay(), collectFirstTerm: true, mode: "upi" },
    { id: "u1", name: "Owner", role: "gym_admin" },
  );
  // A purchase, then a profile edit.
  const deep = await createMember(gymId, memberPayload("Deep"));
  await addedEarlier(deep);
  await repo().addOtherPayment(deep, { date: localDay(), amount: 300, mode: "upi", note: "Protein" });
  await updateMember(gymId, deep.id, { ...deep, address: "MG Road" });
  // A joining payment corrected now.
  const asha = await createMember(gymId, memberPayload("Asha"));
  await addedEarlier(asha);
  const ashaTerm = (await repo().getMemberById(gymId, asha.id)).payments.find((payment) => payment.kind === "membership");
  await repo().updatePaymentAmount(asha, ashaTerm.id, ashaTerm.billingPeriod, 900, 1000);
  // Removed.
  const rina = await createMember(gymId, memberPayload("Rina"));
  await repo().deleteMember(gymId, rina.id);
  // An expense, and an older one edited now.
  await repo().saveExpense(gymId, normalizeExpense({ title: "Electricity bill", category: "utilities", amount: 300, date: localDay(), mode: "cash" }));
  const rent = await repo().saveExpense(gymId, normalizeExpense({ title: "Rent", category: "rent", amount: 9000, date: localDay(), mode: "bank" }));
  await backdate("expenses", rent.id);
  await repo().saveExpense(gymId, { ...rent, amount: 9500 });
  // A check-in, and another gym's member who must never appear.
  await db.exec("INSERT INTO attendance (member_id, attendance_date) VALUES (?, ?)", [deep.id, localDay()]);
  await createMember(otherGymId, memberPayload("Other gym member"));

  const log = await getDailyLog(gymId, { from: started - 2 * 3600000, to: Date.now() + 60000, fromDay: localDay(), toDay: localDay() });
  const find = (type, name) => log.events.filter((event) => event.type === type && (!name || event.memberName === name));

  assert.equal(find("member_added", "Rahul")[0].amount, 1500);
  assert.equal(find("payment", "Rahul").length, 0, "joining payments are not listed twice");
  assert.equal(find("payment", "Piyush")[0].part, true);
  assert.equal(find("payment", "Piyush")[0].amount, 400);
  assert.equal(find("plan_changed", "Sujal")[0].amount, 2700);
  assert.equal(find("plan_changed", "Sujal")[0].by.name, "Owner");
  assert.equal(find("payment", "Sujal").length, 0, "the plan change's payment is not listed twice");
  assert.equal(find("member_updated", "Sujal").length, 0);
  assert.equal(find("purchase", "Deep")[0].lines[0].note, "Protein");
  assert.equal(find("member_updated", "Deep").length, 1);
  assert.equal(find("payment_edited", "Asha")[0].amount, 900);
  assert.equal(find("member_removed", "Rina").length, 1);
  assert.equal(find("member_updated", "Rina").length, 0);
  assert.deepEqual(find("expense_added").map((event) => event.title).sort(), ["Electricity bill", "Rent"]);
  assert.equal(find("expense_edited")[0].amount, 9500);
  assert.equal(log.events.some((event) => event.memberName === "Other gym member"), false);
  assert.equal(log.checkins[localDay()], 1);
  // Times are real instants, whatever zone the database runs in.
  const earlier = new Set(["Piyush", "Sujal", "Deep", "Asha"]);
  for (const event of log.events) {
    const time = Date.parse(event.at);
    const backdated = (event.type === "member_added" && earlier.has(event.memberName)) || (event.type === "expense_added" && event.title === "Rent");
    const from = backdated ? started - 3600000 - 5000 : started - 5000;
    assert.ok(time >= from && time <= Date.now() + 5000, `${event.type} ${event.memberName || event.title} at ${event.at}`);
  }
});

test("bad windows are refused", opts, async () => {
  const { getDailyLog } = require("../src/services/dailyLogService");
  await assert.rejects(getDailyLog(gymId, { from: 2, to: 1, fromDay: "2026-11-03", toDay: "2026-11-03" }), /Pick the days/);
  await assert.rejects(getDailyLog(gymId, { from: 0, to: 500 * 86400000, fromDay: "2026-11-03", toDay: "2026-11-03" }), /a year or less/);
});
