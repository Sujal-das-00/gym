/**
 * The Daily Log: what happened in a gym, rebuilt from the timestamps the
 * records already carry. There is no log table, so this only knows what the
 * rows themselves still show:
 *
 * - members: added (created_at), last profile edit (updated_at), removed (archived_at)
 * - payments and expenses: recorded (created_at), last edit (updated_at)
 * - plan changes: every one, with who made it (member_plan_changes)
 * - trainers: added (created_at)
 * - check-ins: a count per day
 *
 * A deleted payment, expense or trainer leaves no row behind, and a record
 * edited twice only shows its latest edit.
 *
 * Every time below is epoch milliseconds. Payments written together with a
 * member or a plan change belong to that event, so money is never listed twice.
 */

// Rows written by one action land within a few seconds of each other (the
// database clock stamps payments, the app clock stamps members and plan changes).
const SAME_ACTION_MS = 10000;
// Payment rows recorded within this of each other for one member are one collection.
const SAME_COLLECTION_MS = 2000;

const near = (a, b, window = SAME_ACTION_MS) => a !== null && b !== null && Math.abs(a - b) <= window;
const inRange = (at, { from, to }) => at !== null && at >= from && at < to;
const iso = (ms) => new Date(ms).toISOString();
const sum = (rows) => Math.round(rows.reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100;

function paymentLine(row) {
  return {
    kind: row.kind,
    period: row.period,
    amount: Number(row.amount || 0),
    periodFee: row.periodFee === null || row.periodFee === undefined ? null : Number(row.periodFee),
    note: row.note || "",
    date: row.date || "",
    dateKnown: row.dateKnown !== false,
    mode: row.mode || "",
  };
}

// A membership row that covered only part of its term's fee.
const isPart = (row) => row.kind === "membership" && row.periodFee !== null && row.periodFee !== undefined && Number(row.amount) < Number(row.periodFee);

function memberRef(row) {
  return { memberId: row.memberId || row.id, memberName: row.memberName ?? row.name ?? "", memberCode: row.memberCode ?? row.code ?? "" };
}

/**
 * records: { members, planChanges, payments, expenses, trainers } in the raw
 * shapes the models return (see dailyLogModel.js). range: { from, to } in ms,
 * `to` exclusive. Returns events, newest first.
 */
function buildDailyLog(records, range) {
  const members = records.members || [];
  const planChanges = records.planChanges || [];
  const payments = records.payments || [];
  const events = [];
  const usedPayments = new Set();
  const memberById = new Map(members.map((member) => [member.id, member]));

  const takePayments = (memberId, at) => {
    const rows = payments.filter((row) => row.memberId === memberId && !usedPayments.has(row.id) && near(row.createdAt, at));
    rows.forEach((row) => usedPayments.add(row.id));
    return rows;
  };

  for (const change of planChanges) {
    const rows = takePayments(change.memberId, change.at);
    if (!inRange(change.at, range)) continue;
    events.push({
      id: `plan:${change.id}`,
      at: iso(change.at),
      type: "plan_changed",
      ...memberRef(change),
      from: change.from,
      to: change.to,
      effectiveDate: change.effectiveDate,
      amount: sum(rows),
      waived: Number(change.duesWaived || 0),
      mode: rows[0]?.mode || "",
      note: change.note || "",
      by: change.by || null,
    });
  }

  for (const member of members) {
    const rows = takePayments(member.id, member.createdAt);
    if (inRange(member.createdAt, range)) {
      events.push({
        id: `member:${member.id}`,
        at: iso(member.createdAt),
        type: "member_added",
        ...memberRef(member),
        plan: { membershipType: member.membershipType, packageMonths: member.packageMonths, fee: member.fee },
        existing: member.onboardingType === "existing",
        // An existing member's are past payments entered today, each with its own date.
        lines: rows.map(paymentLine),
        historyTotal: member.onboardingType === "existing" ? sum(rows) : 0,
        amount: member.onboardingType === "existing" ? 0 : sum(rows),
        removed: member.archivedAt !== null,
      });
    }
    if (inRange(member.archivedAt, range)) {
      events.push({ id: `removed:${member.id}`, at: iso(member.archivedAt), type: "member_removed", ...memberRef(member) });
    }
    // updated_at also moves when the row changes for another reason already listed.
    const explained =
      near(member.updatedAt, member.createdAt) ||
      near(member.updatedAt, member.archivedAt) ||
      planChanges.some((change) => change.memberId === member.id && near(member.updatedAt, change.at));
    if (inRange(member.updatedAt, range) && !explained) {
      events.push({ id: `edited:${member.id}`, at: iso(member.updatedAt), type: "member_updated", ...memberRef(member), removed: member.archivedAt !== null });
    }
  }

  // Whatever is left was collected on its own: one event per collection.
  const loose = payments
    .filter((row) => !usedPayments.has(row.id) && inRange(row.createdAt, range))
    .sort((a, b) => a.createdAt - b.createdAt);
  const collections = [];
  for (const row of loose) {
    const last = collections.findLast((group) => group.memberId === row.memberId);
    if (last && near(row.createdAt, last.rows.at(-1).createdAt, SAME_COLLECTION_MS)) last.rows.push(row);
    else collections.push({ memberId: row.memberId, rows: [row] });
  }
  for (const { rows } of collections) {
    const kinds = new Set(rows.map((row) => row.kind));
    events.push({
      id: `pay:${rows[0].id}`,
      at: iso(rows[0].createdAt),
      type: kinds.size === 1 && kinds.has("other") ? "purchase" : "payment",
      ...memberRef(rows[0]),
      amount: sum(rows),
      part: rows.some(isPart),
      mode: rows[0].mode || "",
      lines: rows.map(paymentLine),
    });
  }

  // Edited payments: the latest edit of each, grouped per member and moment.
  // A row re-keyed by a joining-date edit moved with the member's own edit.
  const edited = payments
    .filter((row) => inRange(row.updatedAt, range) && !near(row.updatedAt, row.createdAt))
    .filter((row) => !near(row.updatedAt, memberById.get(row.memberId)?.updatedAt ?? null))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const editGroups = [];
  for (const row of edited) {
    const last = editGroups.findLast((group) => group.memberId === row.memberId);
    if (last && near(row.updatedAt, last.rows.at(-1).updatedAt, SAME_COLLECTION_MS)) last.rows.push(row);
    else editGroups.push({ memberId: row.memberId, rows: [row] });
  }
  for (const { rows } of editGroups) {
    events.push({
      id: `payedit:${rows[0].id}:${rows[0].updatedAt}`,
      at: iso(rows[0].updatedAt),
      type: "payment_edited",
      ...memberRef(rows[0]),
      amount: sum(rows),
      lines: rows.map(paymentLine),
    });
  }

  for (const expense of records.expenses || []) {
    const detail = { title: expense.title, category: expense.category, amount: Number(expense.amount || 0), mode: expense.mode || "", date: expense.date };
    if (inRange(expense.createdAt, range)) {
      events.push({ id: `expense:${expense.id}`, at: iso(expense.createdAt), type: "expense_added", ...detail });
    }
    if (inRange(expense.updatedAt, range) && !near(expense.updatedAt, expense.createdAt)) {
      events.push({ id: `expedit:${expense.id}`, at: iso(expense.updatedAt), type: "expense_edited", ...detail });
    }
  }

  for (const trainer of records.trainers || []) {
    if (inRange(trainer.createdAt, range)) {
      events.push({ id: `trainer:${trainer.id}`, at: iso(trainer.createdAt), type: "trainer_added", trainerName: trainer.name });
    }
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
}

// "2026-11-03T04:30:00.000Z" (or any Date.parse-able text) → ms, or null.
function parseTime(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

module.exports = { buildDailyLog, parseTime, SAME_ACTION_MS };
