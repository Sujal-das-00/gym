const { authConfig } = require("../config/env");
const { exec, query } = require("../config/database");
const { buildSetCookie, clearCookie } = require("../utils/cookies");
const superAdminService = require("../services/superAdminService");
const authService = require("../services/authService");
const gymModel = require("../models/gymModel");
const userModel = require("../models/userModel");
const referralModel = require("../models/referralModel");
const platformSettings = require("../models/platformSettingsModel");
const referralService = require("../services/referralService");
const maintenanceService = require("../services/maintenanceService");

function setSuperCookie(res, token) {
  const { superCookieName, cookieSecure, tokenTtlSeconds } = authConfig();
  res.setHeader("Set-Cookie", buildSetCookie(superCookieName, token, { maxAge: tokenTtlSeconds, secure: cookieSecure }));
}

function postLogin(req, res) {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  const { token, superAdmin } = superAdminService.login(email, password);
  setSuperCookie(res, token);
  res.json({ superAdmin });
}

function postLogout(req, res) {
  const { superCookieName, cookieSecure } = authConfig();
  res.setHeader("Set-Cookie", clearCookie(superCookieName, { secure: cookieSecure }));
  res.json({ ok: true });
}

function getMe(req, res) {
  res.json({ superAdmin: req.superUser });
}

// Gyms with the context a super-admin needs at a glance: size, who referred them, their
// access state, and whether an owner is waiting on payment verification.
async function listGyms(req, res) {
  const rows = await query(
    `SELECT ${gymModel.GYM_COLUMNS},
            (SELECT COUNT(*) FROM members m WHERE m.tenant_id = g.id AND m.archived_at IS NULL) AS member_count,
            (SELECT rp.name FROM gym_referrals r JOIN referral_partners rp ON rp.id = r.partner_id WHERE r.tenant_id = g.id LIMIT 1) AS referred_by,
            (SELECT r.code FROM gym_referrals r WHERE r.tenant_id = g.id LIMIT 1) AS referral_code,
            (SELECT r.status FROM gym_referrals r WHERE r.tenant_id = g.id LIMIT 1) AS referral_status,
            (SELECT u.email FROM users u WHERE u.tenant_id = g.id AND u.role = 'gym_admin' ORDER BY u.created_at LIMIT 1) AS owner_email,
            EXISTS (SELECT 1 FROM licence_purchases p WHERE p.tenant_id = g.id AND p.status = 'pending' AND p.claimed_at IS NOT NULL) AS payment_claimed
       FROM gyms g ORDER BY g.created_at DESC`,
  );
  const maintDefaults = await platformSettings.getMaintenanceDefaults();
  const paid = await query("SELECT tenant_id, period_year FROM maintenance_payments");
  const paidBy = new Map();
  for (const p of paid) paidBy.set(p.tenant_id, [...(paidBy.get(p.tenant_id) || []), { periodYear: Number(p.period_year) }]);
  res.json(rows.map((row) => {
    const gym = gymModel.mapGymRow(row);
    return {
      maintenance: maintenanceService.compute(gym, paidBy.get(gym.id) || [], maintDefaults),
      ...gym,
      ...gymModel.accessOf(gym),
      memberCount: Number(row.member_count || 0),
      referredBy: row.referred_by || null,
      referralCode: row.referral_code || "",
      referralStatus: row.referral_status || null,
      ownerEmail: row.owner_email || "",
      paymentClaimed: Boolean(Number(row.payment_claimed)),
    };
  }));
}

async function postGym(req, res) {
  const result = await authService.createGymWithAdmin({
    gymName: String(req.body?.gymName || req.body?.name || "").trim(),
    slug: req.body?.slug,
    adminEmail: String(req.body?.adminEmail || "").trim(),
    adminPassword: String(req.body?.adminPassword || ""),
    adminName: String(req.body?.adminName || "").trim(),
    referralCode: String(req.body?.referralCode || ""),
    ...superAdminService.parseTrial({ registeredOn: req.body?.registeredOn, trialDays: req.body?.trialDays }),
  });
  res.status(201).json(result);
}

async function getMaintenance(req, res) {
  const gym = await gymModel.getGymById(req.params.id);
  if (!gym) return res.status(404).json({ error: "Gym not found" });
  res.json({ status: await maintenanceService.statusFor(gym), payments: await maintenanceService.listPayments(gym.id) });
}

async function postMaintenance(req, res) {
  const status = await maintenanceService.recordPayment(req.params.id, req.body || {});
  res.status(201).json({ status, payments: await maintenanceService.listPayments(req.params.id) });
}

async function patchGym(req, res) {
  res.json(await superAdminService.editGym(req.params.id, req.body || {}));
}

async function setGymStatus(req, res) {
  const status = req.body?.status === "suspended" ? "suspended" : "active";
  const gym = await gymModel.setGymStatus(req.params.id, status);
  if (!gym) return res.status(404).json({ error: "Gym not found" });
  return res.json(gym);
}

async function listAdmins(req, res) {
  res.json(await userModel.listAdmins());
}

async function postAdmin(req, res) {
  const admin = await superAdminService.addAdmin({
    tenantId: String(req.body?.tenantId || req.body?.gymId || "").trim(),
    email: String(req.body?.email || "").trim(),
    password: String(req.body?.password || ""),
    name: String(req.body?.name || "").trim(),
    role: req.body?.role,
  });
  res.status(201).json(admin);
}

async function setAdminStatus(req, res) {
  const admin = await superAdminService.setAdminStatus(req.params.id, req.body?.status);
  res.json(admin);
}

async function listPartners(req, res) {
  res.json(await referralModel.listPartnersWithTotals());
}

async function listPurchases(req, res) {
  res.json(await referralModel.listPurchases());
}

async function postPurchase(req, res) {
  const purchase = await referralService.requestPurchase(String(req.body?.tenantId || "").trim(), req.body?.plan);
  res.status(201).json(purchase);
}

async function approvePurchase(req, res) {
  res.json(await referralService.approvePurchase(req.params.id));
}

async function rejectPurchase(req, res) {
  res.json(await referralService.rejectPurchase(req.params.id, req.body?.note));
}

async function listPayouts(req, res) {
  res.json(await referralModel.listAllPayouts());
}

async function settlePayout(req, res) {
  res.json(await referralService.settlePayout(req.params.id, req.body?.status, req.body?.note));
}

const num = (v) => Number(v || 0);

async function getSettings(req, res) {
  const upi = await platformSettings.getUpi();
  res.json({ upiId: upi.id, upiName: upi.name, maintenance: await platformSettings.getMaintenanceDefaults() });
}

// Default yearly server & maintenance price and the MM-DD window it is due in.
async function putMaintenanceSettings(req, res) {
  const price = Math.round(Number(req.body?.price) * 100) / 100;
  const start = String(req.body?.start || "").trim();
  const end = String(req.body?.end || "").trim();
  if (!Number.isFinite(price) || price < 1 || price > 1000000) return res.status(400).json({ error: "Enter a yearly price between ₹1 and ₹10,00,000" });
  if (!platformSettings.MD_RE.test(start) || !platformSettings.MD_RE.test(end) || start > end) {
    return res.status(400).json({ error: "Enter a valid window; the last day can't be before the first day" });
  }
  await platformSettings.set("maintenance_price", price);
  await platformSettings.set("maintenance_start", start);
  await platformSettings.set("maintenance_end", end);
  return res.json({ maintenance: await platformSettings.getMaintenanceDefaults() });
}

// The UPI id licence payments are collected on. Owners see it (and a QR built from it)
// on the plans page, so it is validated as a real VPA before it is saved.
async function putSettings(req, res) {
  const upiId = String(req.body?.upiId || "").trim();
  const upiName = String(req.body?.upiName || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,30}$/.test(upiId)) {
    return res.status(400).json({ error: "Enter a valid UPI ID, like name@bank" });
  }
  await platformSettings.set("upi_id", upiId);
  await platformSettings.set("upi_name", upiName || "Gymboo");
  return res.json({ upiId, upiName: upiName || "Gymboo" });
}

// One round-trip of headline numbers for the console's Overview page.
async function getOverview(req, res) {
  const [[gyms], [members], [purchases], [partners], [payouts], [reviews], [trials]] = await Promise.all([
    query("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active FROM gyms"),
    query("SELECT COUNT(*) AS total FROM members WHERE archived_at IS NULL"),
    query(`SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
                  COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS revenue,
                  COALESCE(SUM(status = 'approved' AND plan = 'lifetime'), 0) AS lifetime
             FROM licence_purchases`),
    query(`SELECT COUNT(*) AS total,
                  (SELECT COALESCE(SUM(status = 'successful'), 0) FROM gym_referrals) AS successful,
                  (SELECT COALESCE(SUM(CASE WHEN status = 'successful' THEN reward_amount ELSE 0 END), 0) FROM gym_referrals) AS earned
             FROM referral_partners`),
    query(`SELECT COALESCE(SUM(status = 'requested'), 0) AS pending,
                  COALESCE(SUM(CASE WHEN status = 'requested' THEN amount ELSE 0 END), 0) AS pendingAmount,
                  COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid
             FROM partner_payouts`),
    query("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'pending'), 0) AS pending FROM site_reviews"),
    // Gyms still without a licence: how many are mid-trial and how many have run past it.
    query(`SELECT COALESCE(SUM(d <= trial_days), 0) AS onTrial,
                  COALESCE(SUM(d > trial_days AND graced = 1), 0) AS onGrace,
                  COALESCE(SUM(d > trial_days AND graced = 0), 0) AS expired
             FROM (SELECT g.trial_days, DATEDIFF(CURDATE(), COALESCE(g.registered_at, DATE(g.created_at))) AS d,
                          (g.grace_until IS NOT NULL AND g.grace_until > NOW()) AS graced
                     FROM gyms g
                    WHERE g.status = 'active'
                      AND NOT EXISTS (SELECT 1 FROM licence_purchases p WHERE p.tenant_id = g.id AND p.status = 'approved')) t`),
  ]);
  res.json({
    gyms: { total: num(gyms.total), active: num(gyms.active) },
    members: num(members.total),
    purchases: { pending: num(purchases.pending), revenue: num(purchases.revenue), lifetime: num(purchases.lifetime) },
    partners: { total: num(partners.total), successfulReferrals: num(partners.successful), earned: num(partners.earned) },
    payouts: { pending: num(payouts.pending), pendingAmount: num(payouts.pendingAmount), paid: num(payouts.paid) },
    reviews: { total: num(reviews.total), pending: num(reviews.pending) },
    trials: { onTrial: num(trials.onTrial), onGrace: num(trials.onGrace), expired: num(trials.expired) },
  });
}

// Landing-page reviews. They are moderated here; approving one marks it but does not
// publish it — the site's testimonials still live in landing/testimonials.js.
async function listReviews(req, res) {
  const rows = await query("SELECT * FROM site_reviews ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 500");
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, gymName: r.gym_name, message: r.message, status: r.status, createdAt: r.created_at,
  })));
}

async function setReviewStatus(req, res) {
  const status = ["pending", "approved", "rejected"].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: "Invalid status" });
  const result = await exec("UPDATE site_reviews SET status = ? WHERE id = ?", [status, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Review not found" });
  return res.json({ id: req.params.id, status });
}

async function deleteReview(req, res) {
  const result = await exec("DELETE FROM site_reviews WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Review not found" });
  return res.json({ ok: true });
}

module.exports = {
  getMaintenance,
  postMaintenance,
  getSettings,
  putSettings,
  putMaintenanceSettings,
  patchGym,
  deleteReview,
  getOverview,
  listReviews,
  setReviewStatus,
  approvePurchase,
  listPartners,
  listPayouts,
  listPurchases,
  postPurchase,
  rejectPurchase,
  settlePayout,
  getMe,
  listAdmins,
  listGyms,
  postAdmin,
  postGym,
  postLogin,
  postLogout,
  setAdminStatus,
  setGymStatus,
};
