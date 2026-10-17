const { referralConfig, trialConfig } = require("../config/env");
const { qrSvg } = require("../../qr");
const { createHttpError } = require("../utils/http");
const gymModel = require("../models/gymModel");
const model = require("../models/referralModel");
const settings = require("../models/platformSettingsModel");
const referralService = require("./referralService");

// upi://pay with the amount baked in, so the owner scans, confirms and pays without typing it.
function upiUri(upi, amount, note) {
  const q = [
    ["pa", upi.id],
    ["pn", upi.name],
    ["am", Number(amount).toFixed(2)],
    ["cu", "INR"],
    ["tn", note],
  ];
  // "@" stays literal in the payee address: that is how UPI QR codes are written, and
  // some apps reject the percent-encoded form.
  return "upi://pay?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%40/g, "@")}`).join("&");
}

function qrDataUrl(text) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrSvg(text));
}

// Everything the plans page needs in one call.
async function getStatus(tenantId) {
  const gym = await gymModel.getGymById(tenantId);
  if (!gym) throw createHttpError(404, "Gym not found");
  const cfg = referralConfig();
  const [lifetime, monthly, purchase, upi, history, referral] = await Promise.all([
    referralService.quote(tenantId, "lifetime"),
    referralService.quote(tenantId, "monthly"),
    model.getPendingPurchase(tenantId),
    settings.getUpi(),
    model.listPurchases({ tenantId }),
    model.getReferralByTenant(tenantId),
  ]);
  let payment = null;
  if (purchase && upi.id) {
    const uri = upiUri(upi, purchase.amount, `Gymboo ${purchase.plan === "lifetime" ? "licence" : "monthly"}`);
    payment = { upiId: upi.id, payeeName: upi.name, amount: purchase.amount, uri, qr: qrDataUrl(uri) };
  }
  return {
    gym: { id: gym.id, name: gym.name },
    access: gymModel.accessOf(gym),
    quotes: { lifetime, monthly },
    referralCode: referral ? referral.code : null,
    prices: { lifetimeOffer: cfg.licencePrice, monthly: cfg.monthlyPrice, referralDiscount: cfg.referralDiscount },
    upiConfigured: Boolean(upi.id),
    purchase,
    payment,
    purchases: history,
    supportEmail: cfg.supportEmail,
  };
}

// "I have paid". Records the claim for the super-admin to verify, and, if the gym is locked
// out because its trial ended, lets it back in for 24 hours. That can happen only
// maxGraceDays times per gym, so claiming without ever paying runs out.
async function claimPayment(tenantId, rawRef) {
  const ref = String(rawRef || "").trim();
  if (ref && !/^[A-Za-z0-9 _-]{4,40}$/.test(ref)) throw createHttpError(400, "That payment reference doesn't look right. Use the UTR / transaction ID, or leave it empty.");
  const maxGraceDays = trialConfig().maxGraceDays;
  const granted = await model.withTransaction(async (conn) => {
    const [[purchase]] = await conn.execute(
      "SELECT id FROM licence_purchases WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [tenantId],
    );
    if (!purchase) throw createHttpError(400, "Choose a plan before confirming a payment");
    await conn.execute("UPDATE licence_purchases SET claimed_at = CURRENT_TIMESTAMP, payment_ref = IF(? = '', payment_ref, ?) WHERE id = ?", [ref, ref, purchase.id]);

    const [[row]] = await conn.execute(`SELECT ${gymModel.GYM_COLUMNS} FROM gyms g WHERE g.id = ? FOR UPDATE`, [tenantId]);
    const access = gymModel.accessOf(gymModel.mapGymRow(row));
    if (access.phase !== "expired" || access.graceDaysUsed >= maxGraceDays) return false;
    await conn.execute("UPDATE gyms SET grace_until = NOW() + INTERVAL 24 HOUR, grace_days_used = grace_days_used + 1 WHERE id = ?", [tenantId]);
    return true;
  });
  const gym = await gymModel.getGymById(tenantId);
  return { granted, access: gymModel.accessOf(gym) };
}

module.exports = { claimPayment, getStatus };
