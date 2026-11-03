const { query } = require("../config/database");
const { toDateKey } = require("../utils/date");
const { normalizePaymentMode } = require("../utils/member");
const { SAME_ACTION_MS, parseTime } = require("../utils/dailyLog");
const { mapPlanChangeRow } = require("./memberModel");

// UNIX_TIMESTAMP() reads a TIMESTAMP as the instant it is, and a NOW()-filled
// DATETIME in the same session zone it was written in, so times come out right
// whatever zone the database server runs in.
const ms = (seconds) => (seconds === null || seconds === undefined ? null : Math.round(Number(seconds) * 1000));

/**
 * Every row the Daily Log needs for [from, to) (epoch ms), one gym only.
 * Members come whole (a short list, needed to match the payments written
 * with them); the rest only when created or edited in the window. Check-ins
 * are counted per day between fromDay and toDay (date keys).
 */
async function getDailyLogRecords(gymId, { from, to, fromDay, toDay }) {
  // Payments written with a member or a plan change just inside the window
  // are fetched with a little margin so they still match their event.
  const start = Math.floor((from - SAME_ACTION_MS) / 1000);
  const end = Math.ceil((to + SAME_ACTION_MS) / 1000);
  const fromIso = new Date(from - SAME_ACTION_MS).toISOString();
  const toIso = new Date(to + SAME_ACTION_MS).toISOString();

  const [members, planChanges, payments, expenses, trainers, checkins] = await Promise.all([
    query(
      `SELECT id, name, gym_id, created_at, UNIX_TIMESTAMP(updated_at) AS updated_ts, UNIX_TIMESTAMP(archived_at) AS archived_ts,
              membership_type, package_months, fee, onboarding_type
       FROM members WHERE tenant_id = ?`,
      [gymId],
    ),
    query(
      "SELECT * FROM member_plan_changes WHERE tenant_id = ? AND changed_at >= ? AND changed_at < ? ORDER BY changed_at",
      [gymId, fromIso, toIso],
    ),
    query(
      `SELECT p.*, UNIX_TIMESTAMP(p.created_at) AS created_ts, UNIX_TIMESTAMP(p.updated_at) AS updated_ts, m.name, m.gym_id
       FROM payments p JOIN members m ON m.id = p.member_id
       WHERE m.tenant_id = ?
         AND ((p.created_at >= FROM_UNIXTIME(?) AND p.created_at < FROM_UNIXTIME(?))
           OR (p.updated_at >= FROM_UNIXTIME(?) AND p.updated_at < FROM_UNIXTIME(?)))`,
      [gymId, start, end, start, end],
    ),
    query(
      `SELECT id, title, category, amount, expense_date, payment_mode,
              UNIX_TIMESTAMP(created_at) AS created_ts, UNIX_TIMESTAMP(updated_at) AS updated_ts
       FROM expenses
       WHERE tenant_id = ?
         AND ((created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?))
           OR (updated_at >= FROM_UNIXTIME(?) AND updated_at < FROM_UNIXTIME(?)))`,
      [gymId, start, end, start, end],
    ),
    query("SELECT id, name, created_at FROM trainers WHERE tenant_id = ?", [gymId]),
    query(
      `SELECT a.attendance_date AS day, COUNT(*) AS count
       FROM attendance a JOIN members m ON m.id = a.member_id
       WHERE m.tenant_id = ? AND a.attendance_date BETWEEN ? AND ?
       GROUP BY a.attendance_date`,
      [gymId, fromDay, toDay],
    ),
  ]);

  return {
    members: members.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.gym_id,
      createdAt: parseTime(row.created_at),
      updatedAt: ms(row.updated_ts),
      archivedAt: ms(row.archived_ts),
      membershipType: row.membership_type === "package" ? "package" : "monthly",
      packageMonths: Number(row.package_months || 1),
      fee: Number(row.fee || 0),
      onboardingType: row.onboarding_type,
    })),
    planChanges: planChanges.map(mapPlanChangeRow).map((change) => ({
      ...change,
      at: parseTime(change.changedAt),
      by: change.changedBy?.name || change.changedBy?.role ? { name: change.changedBy.name || "", role: change.changedBy.role || "" } : null,
    })),
    // Reversed rows (see memberModel hydration) are not money received.
    payments: payments.filter((row) => !row.reversed_at).map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: row.name,
      memberCode: row.gym_id,
      createdAt: ms(row.created_ts),
      updatedAt: ms(row.updated_ts),
      amount: Number(row.amount || 0),
      periodFee: row.period_fee === null ? null : Number(row.period_fee),
      kind: row.billing_period === "opening-balance" ? "opening-balance" : row.kind,
      period: row.billing_period,
      mode: normalizePaymentMode(row.payment_mode),
      note: row.note || "",
      date: toDateKey(row.payment_date),
      dateKnown: ![0, false, "0"].includes(row.date_known),
    })),
    expenses: expenses.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      amount: Number(row.amount || 0),
      mode: normalizePaymentMode(row.payment_mode),
      date: toDateKey(row.expense_date),
      createdAt: ms(row.created_ts),
      updatedAt: ms(row.updated_ts),
    })),
    trainers: trainers.map((row) => ({ id: row.id, name: row.name, createdAt: parseTime(row.created_at) })),
    checkins: Object.fromEntries(checkins.map((row) => [toDateKey(row.day), Number(row.count)])),
  };
}

module.exports = { getDailyLogRecords };
