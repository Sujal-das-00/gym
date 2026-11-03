const crypto = require("crypto");
const { exec, query } = require("../config/database");

async function insertActivity(gymId, entry) {
  await exec(
    `INSERT INTO gym_activity (id, tenant_id, at_ms, action, member_id, member_name, member_code, actor_id, actor_name, actor_role, amount, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      gymId,
      entry.at,
      entry.action,
      entry.memberId || null,
      String(entry.memberName || "").slice(0, 160),
      String(entry.memberCode || "").slice(0, 40),
      entry.actor?.id ? String(entry.actor.id).slice(0, 64) : null,
      entry.actor?.id ? String(entry.actor.name || "").slice(0, 160) : null,
      entry.actor?.id ? String(entry.actor.role || "").slice(0, 32) : null,
      entry.amount === null || entry.amount === undefined ? null : Number(entry.amount),
      JSON.stringify(entry.details || {}),
    ],
  );
}

function mapActivityRow(row) {
  let details = {};
  try {
    details = row.details ? JSON.parse(row.details) : {};
  } catch {
    details = {};
  }
  return {
    id: row.id,
    at: Number(row.at_ms),
    action: row.action,
    memberId: row.member_id || "",
    memberName: row.member_name || "",
    memberCode: row.member_code || "",
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name || "", role: row.actor_role || "" } : null,
    amount: row.amount === null ? null : Number(row.amount),
    details,
  };
}

// Recorded activity in [from, to) (epoch ms), oldest first, plus when this
// gym's record begins (null before its first recorded action).
async function getActivityRecords(gymId, { from, to }) {
  const [rows, first] = await Promise.all([
    query("SELECT * FROM gym_activity WHERE tenant_id = ? AND at_ms >= ? AND at_ms < ? ORDER BY at_ms, seq", [gymId, from, to]),
    query("SELECT MIN(at_ms) AS first FROM gym_activity WHERE tenant_id = ?", [gymId]),
  ]);
  return { rows: rows.map(mapActivityRow), since: first[0]?.first === null || first[0]?.first === undefined ? null : Number(first[0].first) };
}

module.exports = { getActivityRecords, insertActivity };
