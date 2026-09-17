const crypto = require("crypto");
const { exec, query } = require("../config/database");

// Endpoints are too long to index directly, so every lookup goes through the
// same hash the table is unique on. Keep this the ONLY place that derives it.
function endpointHash(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "")).digest("hex");
}

function mapSubscriptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    tenantId: row.tenant_id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upsert on the endpoint, not on (member, endpoint): a browser only ever has one
 * subscription, so re-subscribing on a device that was previously signed in as a
 * different member (shared family phone, member re-registered) must move the row
 * to the new member rather than leave the old one receiving their notifications.
 * The keys are rotated on every save because the browser can re-issue them.
 */
async function savePushSubscription(tenantId, memberId, subscription) {
  const id = crypto.randomUUID();
  const hash = endpointHash(subscription.endpoint);
  await exec(
    `INSERT INTO push_subscriptions (id, member_id, tenant_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       member_id = VALUES(member_id), tenant_id = VALUES(tenant_id),
       p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [id, memberId, tenantId, subscription.endpoint, hash, subscription.keys.p256dh, subscription.keys.auth, subscription.userAgent || ""],
  );
  const rows = await query("SELECT * FROM push_subscriptions WHERE endpoint_hash = ? LIMIT 1", [hash]);
  return mapSubscriptionRow(rows[0]);
}

// Scoped to the member who is asking, so one member's token can never revoke
// another's device even if they learned its endpoint.
async function deletePushSubscription(tenantId, memberId, endpoint) {
  return exec("DELETE FROM push_subscriptions WHERE tenant_id = ? AND member_id = ? AND endpoint_hash = ?", [
    tenantId,
    memberId,
    endpointHash(endpoint),
  ]);
}

// Used when the push service reports the endpoint is permanently gone (404/410).
// Keyed on the endpoint alone: the subscription is dead for whoever owns it.
async function deletePushSubscriptionByEndpoint(endpoint) {
  return exec("DELETE FROM push_subscriptions WHERE endpoint_hash = ?", [endpointHash(endpoint)]);
}

async function listPushSubscriptionsForMember(tenantId, memberId) {
  const rows = await query(
    "SELECT * FROM push_subscriptions WHERE tenant_id = ? AND member_id = ? ORDER BY created_at",
    [tenantId, memberId],
  );
  return rows.map(mapSubscriptionRow);
}

/**
 * Every subscription belonging to the given members OF THIS GYM. The tenant
 * filter is not redundant with the member filter: it is the second lock that
 * stops a forged member id from another gym pulling back a foreign endpoint.
 */
async function listPushSubscriptionsForMembers(tenantId, memberIds) {
  const ids = [...new Set((memberIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await query(
    `SELECT * FROM push_subscriptions WHERE tenant_id = ? AND member_id IN (${placeholders})`,
    [tenantId, ...ids],
  );
  return rows.map(mapSubscriptionRow);
}

async function countPushSubscriptionsForMember(tenantId, memberId) {
  const rows = await query(
    "SELECT COUNT(*) AS count FROM push_subscriptions WHERE tenant_id = ? AND member_id = ?",
    [tenantId, memberId],
  );
  return Number(rows[0]?.count || 0);
}

module.exports = {
  countPushSubscriptionsForMember,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  endpointHash,
  listPushSubscriptionsForMember,
  listPushSubscriptionsForMembers,
  savePushSubscription,
};
