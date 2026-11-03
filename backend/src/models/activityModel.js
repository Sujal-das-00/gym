const { exec, query } = require("../config/database");

const PAGE = 100;

/**
 * Stores activities (utils/activity.js). With `conn`, inside the caller's DB
 * transaction, so an activity exists exactly when its action committed.
 * INSERT IGNORE on (tenant_id, source_key): a record is never logged twice
 * (a retried request, or the backfill meeting a live entry).
 */
async function insertActivities(conn, gymId, activities) {
  for (const item of activities) {
    const params = [
      item.id,
      gymId,
      item.occurredAt,
      item.action,
      item.categories.join(","),
      item.memberId,
      item.memberName,
      item.memberCode,
      item.actor?.id || null,
      item.actor?.name || null,
      item.actor?.role || null,
      JSON.stringify(item.details || {}),
      item.sourceKey,
      item.backfilled ? 1 : 0,
    ];
    const sql = `INSERT IGNORE INTO activity_log (id, tenant_id, occurred_at, action, categories, member_id, member_name, member_code,
         actor_id, actor_name, actor_role, details, source_key, backfilled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    if (conn) await conn.execute(sql, params);
    else await exec(sql, params);
  }
}

function mapActivityRow(row) {
  let details = row.details;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = {};
    }
  }
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    seq: Number(row.seq),
    action: row.action,
    categories: String(row.categories || "").split(",").filter(Boolean),
    memberId: row.member_id || "",
    memberName: row.member_name || "",
    memberCode: row.member_code || "",
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name || "", role: row.actor_role || "" } : null,
    details: details || {},
    backfilled: Number(row.backfilled) === 1,
  };
}

/**
 * One gym's activities, newest first, a page at a time.
 *   from / to  – ISO instants (the browser's local day boundaries); to is exclusive
 *   category   – member | payment | membership | balance
 *   q          – part of a member's name or code
 *   before     – { at, seq } of the last row already shown (next page)
 */
async function listActivities(gymId, { from = "", to = "", category = "", q = "", before = null, limit = PAGE } = {}) {
  const where = ["tenant_id = ?"];
  const params = [gymId];
  if (from) {
    where.push("occurred_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("occurred_at < ?");
    params.push(to);
  }
  if (category) {
    where.push("FIND_IN_SET(?, categories)");
    params.push(category);
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    where.push("(member_name LIKE ? OR member_code LIKE ?)");
    params.push(like, like);
  }
  if (before?.at) {
    where.push("(occurred_at < ? OR (occurred_at = ? AND seq < ?))");
    params.push(before.at, before.at, Math.max(0, Math.trunc(Number(before.seq) || 0)));
  }
  const cap = Math.max(1, Math.min(500, Math.trunc(Number(limit) || PAGE)));
  const rows = await query(
    `SELECT * FROM activity_log WHERE ${where.join(" AND ")} ORDER BY occurred_at DESC, seq DESC LIMIT ${cap + 1}`,
    params,
  );
  return { activities: rows.slice(0, cap).map(mapActivityRow), more: rows.length > cap };
}

module.exports = {
  insertActivities,
  listActivities,
};
