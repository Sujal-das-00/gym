const { SAME_ACTION_MS, buildDailyLog } = require("../utils/dailyLog");
const { createHttpError } = require("../utils/http");
const { repo } = require("../models");

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 5000;

/**
 * The Daily Log for a window the admin app picks in its own time zone:
 * from/to are epoch ms (to exclusive) of the first and last local day's
 * bounds, fromDay/toDay the same days as date keys (for check-in counts).
 */
async function getDailyLog(gymId, params) {
  const from = Number(params.from);
  const to = Number(params.to);
  const fromDay = String(params.fromDay || "");
  const toDay = String(params.toDay || "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !DATE_KEY.test(fromDay) || !DATE_KEY.test(toDay)) {
    throw createHttpError(400, "Pick the days to show.");
  }
  if (to - from > MAX_RANGE_MS) throw createHttpError(400, "Pick a year or less.");

  const [records, recorded] = await Promise.all([
    repo().getDailyLogRecords(gymId, { from, to, fromDay, toDay }),
    repo().getActivityRecords(gymId, { from, to }),
  ]);
  // Everything since the gym's first recorded action comes from the record
  // (who did it, old and new values, deletions); before that it is rebuilt
  // from record timestamps.
  // A recorded action's own rows are stamped a moment before its record entry,
  // so the rebuilt history stops a little earlier than the first entry.
  const since = recorded.since === null ? null : recorded.since - SAME_ACTION_MS;
  const rebuilt = buildDailyLog(records, { from, to: since === null ? to : Math.max(from, Math.min(to, since)) });
  const logged = recorded.rows.map((row) => ({
    ...row.details,
    id: `log:${row.id}`,
    at: new Date(row.at).toISOString(),
    type: row.action,
    memberId: row.memberId,
    memberName: row.memberName,
    memberCode: row.memberCode,
    amount: row.amount ?? 0,
    by: row.actor ? { name: row.actor.name, role: row.actor.role } : null,
    recorded: true,
  }));
  const events = [...logged, ...rebuilt].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
  return {
    events: events.slice(0, MAX_EVENTS),
    truncated: events.length > MAX_EVENTS,
    checkins: records.checkins || {},
  };
}

module.exports = { getDailyLog };
