/**
 * Activity history (Phase 4): recording, reading, and the one-time backfill.
 *
 * Actions that run in a DB transaction (payments, plan changes, existing-member
 * onboarding) write their activities on the same connection, so an activity
 * exists exactly when its action committed. Member adds, edits and archives
 * are separate writes today; their activities are written right after the
 * action succeeds (logAfter), and a failure to log never undoes the action.
 */
const { query } = require("../config/database");
const { toDateKey, todayKey } = require("../utils/date");
const { billablePeriodKeys, periodEndDate, termKeyFor, OPENING_PERIOD_KEY } = require("../utils/billing");
const { createHttpError } = require("../utils/http");
const build = require("../utils/activity");
const { repo, usingFallback } = require("../models");

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function localKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dayBefore(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return localKey(new Date(year, month - 1, day - 1));
}

async function record(gymId, activities, conn = null) {
  if (activities.length) await repo().insertActivities(conn, gymId, activities);
}

// For actions that aren't one DB transaction: logged once they have succeeded.
async function logAfter(gymId, activities) {
  try {
    await record(gymId, activities);
  } catch (error) {
    console.warn(`Activity not recorded (${activities.map((item) => item.action).join(", ")}): ${error.message}`);
  }
}

/**
 * Marks each line of a payment with what it paid, for the activity: the
 * opening balance, kept old-plan dues, an earlier due ("old") or the latest
 * payable term ("current").
 */
function classifyLines(member, settings, lines) {
  const payable = billablePeriodKeys(member, settings);
  const latest = payable[payable.length - 1] || "";
  const kept = new Set((member.carriedTerms || []).map((term) => term.period));
  return lines.map((line) => {
    const period = line.billingPeriod || line.period;
    let kind = "old";
    if (period === OPENING_PERIOD_KEY) kind = "opening";
    else if (kept.has(period)) kind = "kept";
    else if (period === latest) kind = "current";
    return { ...line, kind };
  });
}

// When the old plan's last day falls, and when the new plan's first term ends.
function planChangeEnds(change, settings) {
  const firstKey = termKeyFor(change.to, settings, change.effectiveDate);
  const end = periodEndDate(change.to, settings, firstKey);
  return {
    previousEnds: dayBefore(change.effectiveDate),
    newTermEnds: Number.isNaN(end.getTime()) ? "" : dayBefore(localKey(end)),
  };
}

/** The activities one plan change (or restart) produces, besides its payment. */
function planChangeActivities(member, user, change, settings) {
  const extra = { today: todayKey(), ...planChangeEnds(change, settings) };
  return [build.planChanged(member, user, change, extra), ...build.duesActivities(member, user, change)];
}

/* ---- Reading ---------------------------------------------------------------- */

function readInstant(value, label) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  if (!ISO.test(text) || Number.isNaN(Date.parse(text))) throw createHttpError(400, `Invalid ${label}.`);
  return new Date(text).toISOString();
}

async function listActivities(gymId, params = {}) {
  const category = String(params.category || "");
  if (category && !build.CATEGORIES.includes(category)) throw createHttpError(400, "Unknown activity type.");
  const q = String(params.q || "").trim().slice(0, 80);
  const before = params.before ? { at: readInstant(params.before, "page"), seq: Number(params.beforeSeq) || 0 } : null;
  return repo().listActivities(gymId, {
    from: readInstant(params.from, "start time"),
    to: readInstant(params.to, "end time"),
    category,
    q,
    before,
    limit: params.limit,
  });
}

/* ---- Backfill ---------------------------------------------------------------- */

const isoOf = (value) => {
  if (!value) return "";
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
};
const actorFrom = (id, name, role) => (id ? { id, name: name || "", role: role || "" } : null);
const planFrom = (row, side) => ({
  membershipType: row[`${side}_membership_type`],
  packageMonths: Number(row[`${side}_package_months`] || 1),
  fee: Number(row[`${side}_fee`] || 0),
  collectionTiming: row[`${side}_collection_timing`] || "",
});
const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Rebuilds the history of everything recorded before the activity log
 * existed, from the records themselves: members added (and archived),
 * payments recorded, corrected, cancelled and edited, plan changes with their
 * waived or kept dues. Marked backfilled; who did it is shown where the
 * record kept it. Runs once: after the first run, backfilled rows exist.
 * Safe to repeat anyway (INSERT IGNORE on each record's source key).
 */
async function backfillActivities() {
  if (usingFallback()) return 0;
  if ((await query("SELECT 1 FROM activity_log WHERE backfilled = 1 LIMIT 1")).length) return 0;

  const memberRows = await query("SELECT * FROM members");
  if (!memberRows.length) return 0;
  const members = new Map(
    memberRows.map((row) => [
      row.id,
      {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        gymId: row.gym_id,
        phone: row.phone,
        startDate: toDateKey(row.start_date),
        createdAt: isoOf(row.created_at),
        archivedAt: isoOf(row.archived_at),
        onboardingType: row.onboarding_type || "new",
        admissionFee: Number(row.admission_fee || 0),
        openingBalance: Number(row.opening_balance || 0),
        openingBalanceAdmission: Number(row.opening_balance_admission || 0),
        billingCutover: row.billing_cutover ? toDateKey(row.billing_cutover) : "",
        membershipType: row.membership_type,
        packageMonths: Number(row.package_months || 1),
        fee: Number(row.fee || 0),
        collectionTiming: row.collection_timing || "",
      },
    ]),
  );

  const allocationRows = await query(
    "SELECT transaction_id, billing_period, amount, period_fee FROM payments WHERE transaction_id IS NOT NULL ORDER BY billing_period",
  );
  const allocations = new Map();
  for (const row of allocationRows) {
    if (!allocations.has(row.transaction_id)) allocations.set(row.transaction_id, []);
    allocations.get(row.transaction_id).push({
      billingPeriod: row.billing_period,
      amount: Number(row.amount || 0),
      periodFee: row.period_fee === null ? null : Number(row.period_fee),
    });
  }
  const txRows = await query("SELECT * FROM payment_transactions ORDER BY created_at");
  const txs = new Map(
    txRows.map((row) => [
      row.id,
      {
        id: row.id,
        tenantId: row.tenant_id,
        memberId: row.member_id,
        amount: Number(row.amount || 0),
        date: toDateKey(row.collected_on),
        dateKnown: Number(row.date_known) !== 0,
        mode: row.payment_mode || "",
        reference: row.reference || "",
        note: row.note || "",
        source: row.source,
        status: row.status,
        createdAt: isoOf(row.created_at),
        reversedAt: isoOf(row.reversed_at),
        reversalReason: row.reversal_reason || "",
        replacesId: row.replaces_id || "",
        replacedById: row.replaced_by_id || "",
        enteredBy: actorFrom(row.entered_by_id, row.entered_by_name, row.entered_by_role),
        reversedBy: actorFrom(row.reversed_by_id, row.reversed_by_name, ""),
        allocations: allocations.get(row.id) || [],
      },
    ]),
  );

  const changeRows = await query("SELECT * FROM member_plan_changes ORDER BY changed_at");
  // The plan a member joined on: what their first logged change changed from.
  const joiningPlan = new Map();
  for (const row of changeRows) if (!joiningPlan.has(row.member_id)) joiningPlan.set(row.member_id, planFrom(row, "old"));

  const out = new Map(); // tenant → activities
  const add = (tenantId, items) => {
    if (!out.has(tenantId)) out.set(tenantId, []);
    out.get(tenantId).push(...items);
  };
  const extra = (occurredAt) => ({ occurredAt, backfilled: true });

  for (const member of members.values()) {
    // Who added them: whoever entered their first payment (at joining or their history), if anyone did.
    const first = [...txs.values()].find(
      (tx) => tx.memberId === member.id && (tx.source === "join" || tx.source === "onboarding") && tx.enteredBy,
    );
    const actor = first?.enteredBy || null;
    if (!member.createdAt) continue;
    const items = [build.memberAdded({ ...member, ...(joiningPlan.get(member.id) || {}) }, actor, extra(member.createdAt))];
    if (member.onboardingType === "existing" && member.openingBalance > 0) {
      items.push(build.openingBalanceAdded(member, actor, extra(member.createdAt)));
    } else if (member.onboardingType === "existing") {
      const terms = [...txs.values()]
        .filter((tx) => tx.memberId === member.id && tx.source === "onboarding")
        .flatMap((tx) => tx.allocations.map((a) => ({ period: a.billingPeriod, status: "paid", amount: a.amount, fee: a.periodFee })));
      if (terms.length) {
        const confirmed = build.historyConfirmed(member, actor, terms, extra(member.createdAt));
        // Unpaid terms weren't stored as rows, so their count isn't known here.
        confirmed.details.unpaidCount = null;
        items.push(confirmed);
      }
    }
    if (member.archivedAt) items.push(build.memberArchived(member, null, extra(member.archivedAt)));
    add(member.tenantId, items);
  }

  for (const tx of txs.values()) {
    const member = members.get(tx.memberId);
    if (!member || tx.source === "onboarding") continue;
    if (tx.source === "correction" && tx.replacesId && txs.has(tx.replacesId)) {
      const original = txs.get(tx.replacesId);
      const reason = original.reversalReason.replace(/^Corrected:\s*/, "");
      add(tx.tenantId, [build.paymentCorrected(member, tx.enteredBy, original, tx, reason, extra(tx.createdAt))]);
    } else if (tx.createdAt) {
      add(tx.tenantId, [build.paymentRecorded(member, tx.enteredBy, tx, extra(tx.createdAt))]);
    }
    if (tx.status === "reversed" && !tx.replacedById && tx.reversedAt) {
      add(tx.tenantId, [build.paymentCancelled(member, tx.reversedBy, tx, tx.reversalReason, extra(tx.reversedAt))]);
    }
  }

  const editRows = await query("SELECT * FROM payment_corrections ORDER BY changed_at");
  for (const row of editRows) {
    const tx = txs.get(row.transaction_id);
    const member = tx && members.get(tx.memberId);
    if (!member) continue;
    add(row.tenant_id, [
      build.paymentEdited(member, actorFrom(row.changed_by_id, row.changed_by_name, row.changed_by_role), tx, row.field, row.old_value, row.new_value, {
        ...extra(isoOf(row.changed_at)),
        sourceKey: `edit:${row.id}`,
      }),
    ]);
  }

  const settingsByGym = new Map();
  for (const row of changeRows) {
    const member = members.get(row.member_id) || { id: row.member_id, name: row.member_name, gymId: row.member_code };
    if (!settingsByGym.has(row.tenant_id)) settingsByGym.set(row.tenant_id, await repo().getSettings(row.tenant_id));
    const change = {
      id: row.id,
      changeType: row.change_type || "change",
      from: planFrom(row, "old"),
      to: planFrom(row, "new"),
      effectiveDate: toDateKey(row.effective_date),
      duesCollected: Number(row.dues_collected || 0),
      duesWaived: Number(row.dues_waived || 0),
      duesCarried: (parseJson(row.dues_detail)?.carried || []).reduce((sum, term) => sum + Number(term.balance || 0), 0),
      duesDetail: parseJson(row.dues_detail),
      firstTermCollected: Number(row.first_term_collected || 0),
      note: row.note || "",
      changedAt: isoOf(row.changed_at),
    };
    const actor = actorFrom(row.changed_by_id, row.changed_by_name, row.changed_by_role);
    const ends = planChangeEnds(change, settingsByGym.get(row.tenant_id));
    // "Scheduled" is how it looked when it was made: effective after the day it was recorded.
    const madeOn = change.changedAt ? localKey(new Date(change.changedAt)) : "";
    add(row.tenant_id, [
      build.planChanged(member, actor, change, { ...extra(change.changedAt), ...ends, today: madeOn }),
      ...build.duesActivities(member, actor, change, extra(change.changedAt)),
    ]);
  }

  let count = 0;
  for (const [tenantId, items] of out) {
    await repo().insertActivities(null, tenantId, items);
    count += items.length;
  }
  return count;
}

module.exports = {
  backfillActivities,
  classifyLines,
  listActivities,
  logAfter,
  planChangeActivities,
  record,
};
