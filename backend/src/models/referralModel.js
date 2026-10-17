const crypto = require("crypto");
const { exec, getPool, query } = require("../config/database");

// Money columns come back from mysql2 as strings; the API deals in plain numbers.
const num = (value) => Number(value || 0);

function mapPartner(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    referralCode: row.referral_code,
    status: row.status,
    createdAt: row.created_at,
  };
}

function publicPartner(partner) {
  if (!partner) return null;
  const { passwordHash, ...rest } = partner;
  return rest;
}

function duplicateError(error) {
  return error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);
}

// Runs fn(conn) in a transaction on one pooled connection. Used wherever a balance
// or an approval has to be read and written without another request slipping in.
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// ---------------- Partners ----------------
async function createPartner({ name, email, phone, passwordHash, referralCode }) {
  const id = crypto.randomUUID();
  await exec(
    "INSERT INTO referral_partners (id, name, email, phone, password_hash, referral_code) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, String(email).trim().toLowerCase(), phone, passwordHash, referralCode],
  );
  return getPartnerById(id);
}

async function getPartnerById(id) {
  return mapPartner((await query("SELECT * FROM referral_partners WHERE id = ? LIMIT 1", [id]))[0]);
}

async function getPartnerByEmail(email) {
  return mapPartner(
    (await query("SELECT * FROM referral_partners WHERE email = ? LIMIT 1", [String(email || "").trim().toLowerCase()]))[0],
  );
}

async function getPartnerByCode(code) {
  return mapPartner((await query("SELECT * FROM referral_partners WHERE referral_code = ? LIMIT 1", [code]))[0]);
}

// ---------------- Referrals ----------------
async function createReferral({ partnerId, tenantId, code }) {
  await exec("INSERT INTO gym_referrals (id, partner_id, tenant_id, code) VALUES (?, ?, ?, ?)", [
    crypto.randomUUID(),
    partnerId,
    tenantId,
    code,
  ]);
}

async function getReferralByTenant(tenantId) {
  const rows = await query("SELECT * FROM gym_referrals WHERE tenant_id = ? LIMIT 1", [tenantId]);
  return rows[0] || null;
}

// The partner's own view: gym name plus status, nothing about the gym's account.
async function listReferralsForPartner(partnerId) {
  const rows = await query(
    `SELECT r.id, r.status, r.reward_amount, r.created_at, r.converted_at, g.name AS gym_name
       FROM gym_referrals r JOIN gyms g ON g.id = r.tenant_id
      WHERE r.partner_id = ? ORDER BY r.created_at DESC`,
    [partnerId],
  );
  return rows.map((row) => ({
    id: row.id,
    gymName: row.gym_name,
    status: row.status,
    reward: num(row.reward_amount),
    createdAt: row.created_at,
    convertedAt: row.converted_at,
  }));
}

async function partnerTotals(partnerId, conn) {
  const run = async (sql, params) => (conn ? (await conn.execute(sql, params))[0] : query(sql, params));
  const [ref] = await run(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'successful'), 0) AS successful,
            COALESCE(SUM(CASE WHEN status = 'successful' THEN reward_amount ELSE 0 END), 0) AS earned
       FROM gym_referrals WHERE partner_id = ?`,
    [partnerId],
  );
  const [pay] = await run(
    `SELECT COALESCE(SUM(CASE WHEN status IN ('requested', 'paid') THEN amount ELSE 0 END), 0) AS claimed,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid
       FROM partner_payouts WHERE partner_id = ?`,
    [partnerId],
  );
  const earned = num(ref.earned);
  return {
    totalReferrals: num(ref.total),
    successfulReferrals: num(ref.successful),
    earned,
    paidOut: num(pay.paid),
    available: earned - num(pay.claimed),
  };
}

// ---------------- Licence purchases ----------------
function mapPurchase(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    gymName: row.gym_name,
    plan: row.plan,
    listPrice: num(row.list_price),
    discount: num(row.discount),
    adjustment: num(row.adjustment),
    amount: num(row.amount),
    referralId: row.referral_id,
    referredBy: row.partner_name || null,
    status: row.status,
    note: row.note,
    claimedAt: row.claimed_at,
    paymentRef: row.payment_ref || "",
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

const PURCHASE_SELECT = `SELECT p.*, g.name AS gym_name, rp.name AS partner_name
    FROM licence_purchases p
    JOIN gyms g ON g.id = p.tenant_id
    LEFT JOIN gym_referrals r ON r.id = p.referral_id
    LEFT JOIN referral_partners rp ON rp.id = r.partner_id`;

async function createPurchase({ tenantId, plan, listPrice, discount, adjustment = 0, amount, referralId }) {
  const id = crypto.randomUUID();
  await exec(
    `INSERT INTO licence_purchases (id, tenant_id, plan, list_price, discount, adjustment, amount, referral_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, plan, listPrice, discount, adjustment, amount, referralId || null],
  );
  return getPurchase(id);
}

async function getPurchase(id) {
  const rows = await query(`${PURCHASE_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapPurchase(rows[0]) : null;
}

async function listPurchases({ tenantId } = {}) {
  const rows = tenantId
    ? await query(`${PURCHASE_SELECT} WHERE p.tenant_id = ? ORDER BY p.created_at DESC`, [tenantId])
    : await query(`${PURCHASE_SELECT} ORDER BY (p.status = 'pending') DESC, (p.claimed_at IS NOT NULL) DESC, p.created_at DESC`);
  return rows.map(mapPurchase);
}

// The purchase an owner is currently working on: pending, newest first.
async function getPendingPurchase(tenantId) {
  const rows = await query(`${PURCHASE_SELECT} WHERE p.tenant_id = ? AND p.status = 'pending' ORDER BY p.created_at DESC LIMIT 1`, [tenantId]);
  return rows[0] ? mapPurchase(rows[0]) : null;
}

// Picking a different plan replaces a pending purchase the owner has not paid for yet.
async function deleteUnclaimedPurchases(tenantId) {
  await exec("DELETE FROM licence_purchases WHERE tenant_id = ? AND status = 'pending' AND claimed_at IS NULL", [tenantId]);
}

async function listPendingUnclaimed(tenantId) {
  return query("SELECT id, plan FROM licence_purchases WHERE tenant_id = ? AND status = 'pending' AND claimed_at IS NULL", [tenantId]);
}

async function requoteUnclaimed(id, { listPrice, discount, adjustment = 0, amount, referralId }) {
  await exec("UPDATE licence_purchases SET list_price = ?, discount = ?, adjustment = ?, amount = ?, referral_id = ? WHERE id = ?", [listPrice, discount, adjustment, amount, referralId || null, id]);
}

async function deletePendingReferral(tenantId) {
  await exec("DELETE FROM gym_referrals WHERE tenant_id = ? AND status = 'pending'", [tenantId]);
}

async function repointPendingReferral(tenantId, partnerId, code) {
  const result = await exec("UPDATE gym_referrals SET partner_id = ?, code = ? WHERE tenant_id = ? AND status = 'pending'", [partnerId, code, tenantId]);
  return result.affectedRows > 0;
}

async function hasApprovedLifetime(tenantId) {
  const rows = await query(
    "SELECT 1 FROM licence_purchases WHERE tenant_id = ? AND plan = 'lifetime' AND status = 'approved' LIMIT 1",
    [tenantId],
  );
  return rows.length > 0;
}

// ---------------- Payouts ----------------
function mapPayout(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    partnerEmail: row.partner_email,
    amount: num(row.amount),
    payoutDetails: row.payout_details,
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    settledAt: row.settled_at,
  };
}

const PAYOUT_SELECT = `SELECT o.*, rp.name AS partner_name, rp.email AS partner_email
    FROM partner_payouts o JOIN referral_partners rp ON rp.id = o.partner_id`;

async function listPayoutsForPartner(partnerId) {
  const rows = await query(`${PAYOUT_SELECT} WHERE o.partner_id = ? ORDER BY o.requested_at DESC`, [partnerId]);
  return rows.map(mapPayout);
}

async function listAllPayouts() {
  const rows = await query(`${PAYOUT_SELECT} ORDER BY (o.status = 'requested') DESC, o.requested_at DESC`);
  return rows.map(mapPayout);
}

async function listPartnersWithTotals() {
  const partners = (await query("SELECT * FROM referral_partners ORDER BY created_at DESC")).map(mapPartner);
  return Promise.all(partners.map(async (p) => ({ ...publicPartner(p), ...(await partnerTotals(p.id)) })));
}

module.exports = {
  createPartner,
  createPurchase,
  createReferral,
  deletePendingReferral,
  deleteUnclaimedPurchases,
  getPendingPurchase,
  listPendingUnclaimed,
  repointPendingReferral,
  requoteUnclaimed,
  duplicateError,
  getPartnerByCode,
  getPartnerByEmail,
  getPartnerById,
  getPurchase,
  getReferralByTenant,
  hasApprovedLifetime,
  listAllPayouts,
  listPartnersWithTotals,
  listPayoutsForPartner,
  listPurchases,
  listReferralsForPartner,
  mapPayout,
  mapPurchase,
  partnerTotals,
  publicPartner,
  withTransaction,
};
