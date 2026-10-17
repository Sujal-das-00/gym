const crypto = require("crypto");
const { authConfig, referralConfig } = require("../config/env");
const { exec, query } = require("../config/database");
const { sign } = require("../utils/jwt");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createHttpError } = require("../utils/http");
const model = require("../models/referralModel");
const gymModel = require("../models/gymModel");

const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// No 0/O/1/I so a code read aloud or off a screenshot is not misheard.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const normalizeCode = (value) => String(value || "").trim().toUpperCase();

function partnerToken(partner) {
  const { partnerJwtSecret, tokenTtlSeconds } = authConfig();
  return sign({ sub: partner.id, partner: true, name: partner.name, email: partner.email }, partnerJwtSecret, tokenTtlSeconds);
}

function newCode() {
  let out = "GYM";
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

// ---------------- Partner account ----------------
async function signupPartner({ name, email, phone, password }) {
  if (!NAME_PATTERN.test(name) || name.length < 2 || name.length > 40) {
    throw createHttpError(400, "Your name must be 2-40 letters, with no numbers or symbols");
  }
  if (email.length > 120 || email.includes("..") || !EMAIL_PATTERN.test(email)) {
    throw createHttpError(400, "Enter a valid email address");
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) throw createHttpError(400, "Enter a valid phone number");
  if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw createHttpError(400, "Password must be 8-72 characters with at least one letter and one number");
  }
  if (await model.getPartnerByEmail(email)) {
    throw createHttpError(409, "A partner account with this email already exists. Try logging in.");
  }

  const passwordHash = hashPassword(password);
  // A random 6-char code can (rarely) collide; retry rather than surface an error.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const partner = await model.createPartner({ name, email, phone: digits, passwordHash, referralCode: newCode() });
      return { token: partnerToken(partner), partner: model.publicPartner(partner) };
    } catch (error) {
      if (!model.duplicateError(error)) throw error;
      if (await model.getPartnerByEmail(email)) throw createHttpError(409, "A partner account with this email already exists.");
    }
  }
  throw createHttpError(500, "Could not generate a referral code. Please try again.");
}

async function loginPartner(email, password) {
  const partner = await model.getPartnerByEmail(email);
  if (!partner || partner.status !== "active" || !verifyPassword(password, partner.passwordHash)) {
    throw createHttpError(401, "Invalid email or password");
  }
  return { token: partnerToken(partner), partner: model.publicPartner(partner) };
}

async function dashboard(partnerId) {
  const partner = await model.getPartnerById(partnerId);
  if (!partner || partner.status !== "active") throw createHttpError(401, "Session is no longer valid");
  const cfg = referralConfig();
  const [totals, referrals, payouts] = await Promise.all([
    model.partnerTotals(partnerId),
    model.listReferralsForPartner(partnerId),
    model.listPayoutsForPartner(partnerId),
  ]);
  return {
    partner: model.publicPartner(partner),
    ...totals,
    referrals,
    payouts,
    program: {
      reward: cfg.referrerReward,
      discount: cfg.referralDiscount,
      effectivePrice: cfg.licencePrice - cfg.referralDiscount,
      supportEmail: cfg.supportEmail,
    },
  };
}

// Pays out the whole available balance. Done inside a transaction with the partner
// row locked so two quick clicks cannot both claim the same money.
async function requestPayout(partnerId, payoutDetails) {
  const details = String(payoutDetails || "").replace(/\s+/g, " ").trim();
  if (details.length < 5 || details.length > 190) {
    throw createHttpError(400, "Enter the UPI ID or bank details we should pay you at");
  }
  return model.withTransaction(async (conn) => {
    await conn.execute("SELECT id FROM referral_partners WHERE id = ? FOR UPDATE", [partnerId]);
    const { available } = await model.partnerTotals(partnerId, conn);
    if (available <= 0) throw createHttpError(400, "You have no earnings available to withdraw yet");
    await conn.execute(
      "INSERT INTO partner_payouts (id, partner_id, amount, payout_details) VALUES (?, ?, ?, ?)",
      [crypto.randomUUID(), partnerId, available, details],
    );
    return { amount: available };
  });
}

// ---------------- Referral codes on gyms ----------------
// Validates a code a gym owner typed at signup. Returns the partner so the caller can
// link the new gym after it exists, or null when no code was given.
async function resolveCode(rawCode, ownerEmail) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const partner = await model.getPartnerByCode(code);
  if (!partner || partner.status !== "active") throw createHttpError(400, "That referral code is not valid");
  if (ownerEmail && partner.email === String(ownerEmail).trim().toLowerCase()) {
    throw createHttpError(400, "You cannot use your own referral code");
  }
  return partner;
}

async function attachReferral(partner, tenantId) {
  if (!partner) return;
  await model.createReferral({ partnerId: partner.id, tenantId, code: partner.referralCode });
}

async function checkCode(rawCode) {
  const cfg = referralConfig();
  const partner = await model.getPartnerByCode(normalizeCode(rawCode));
  const valid = Boolean(partner && partner.status === "active");
  return { valid, discount: valid ? cfg.referralDiscount : 0 };
}

// ---------------- Licence purchases ----------------
// What a gym would pay for a plan right now. The discount needs an un-converted
// referral AND the one-time plan; a monthly plan never gets it and never uses it up.
async function quote(tenantId, plan) {
  const cfg = referralConfig();
  const listPrice = plan === "lifetime" ? cfg.licencePrice : cfg.monthlyPrice;
  const [referral, gym] = await Promise.all([model.getReferralByTenant(tenantId), gymModel.getGymById(tenantId)]);
  const eligible = plan === "lifetime" && referral && referral.status === "pending";
  const discount = eligible ? Math.min(cfg.referralDiscount, listPrice) : 0;
  return priced(listPrice, discount, gym && gym.priceOverride, eligible ? referral.id : null);
}

// list price - referral discount - special-price adjustment = what the gym pays. A gym's
// price override can only lower the price, so it never turns into a surcharge.
function priced(listPrice, discount, priceOverride, referralId) {
  const subtotal = listPrice - discount;
  const adjustment = priceOverride != null && priceOverride < subtotal ? subtotal - priceOverride : 0;
  return { listPrice, discount, adjustment, amount: subtotal - adjustment, referralId: referralId || null };
}

async function requestPurchase(tenantId, plan) {
  if (plan !== "lifetime" && plan !== "monthly") throw createHttpError(400, "Choose the one-time or the monthly plan");
  if (!(await gymModel.getGymById(tenantId))) throw createHttpError(404, "Gym not found");
  if (plan === "lifetime" && (await model.hasApprovedLifetime(tenantId))) {
    throw createHttpError(409, "This gym already has the one-time licence");
  }
  const open = await model.getPendingPurchase(tenantId);
  if (open && open.claimedAt) {
    throw createHttpError(409, "A payment for this gym is already awaiting verification");
  }
  // Changing your mind about the plan replaces the unpaid selection instead of piling up rows.
  await model.deleteUnclaimedPurchases(tenantId);
  return model.createPurchase({ tenantId, plan, ...(await quote(tenantId, plan)) });
}

// Super-admin: attach, change or remove the referral code on any gym, as long as the
// referral has not already paid out. Unpaid selections are re-priced to match.
async function setGymReferral(tenantId, rawCode) {
  const code = normalizeCode(rawCode);
  const existing = await model.getReferralByTenant(tenantId);
  if (existing && existing.status === "successful") {
    if (code !== existing.code) throw createHttpError(409, "This gym's referral has already been rewarded and can't be changed");
    return;
  }
  if (!code) {
    await model.deletePendingReferral(tenantId);
  } else {
    const partner = await model.getPartnerByCode(code);
    if (!partner || partner.status !== "active") throw createHttpError(400, "That referral code is not valid");
    const owners = await query("SELECT email FROM users WHERE tenant_id = ? AND role = 'gym_admin'", [tenantId]);
    if (owners.some((o) => o.email === partner.email)) throw createHttpError(400, "A partner can't be the referrer of their own gym");
    if (!(existing && (await model.repointPendingReferral(tenantId, partner.id, partner.referralCode)))) {
      await model.createReferral({ partnerId: partner.id, tenantId, code: partner.referralCode });
    }
  }
  for (const row of await model.listPendingUnclaimed(tenantId)) {
    await model.requoteUnclaimed(row.id, await quote(tenantId, row.plan));
  }
}

// Approval is where a referral becomes successful. Everything re-reads under lock:
// two pending purchases for one gym must not both get the discount or both pay out.
async function approvePurchase(id) {
  const cfg = referralConfig();
  await model.withTransaction(async (conn) => {
    const [[purchase]] = await conn.execute("SELECT * FROM licence_purchases WHERE id = ? FOR UPDATE", [id]);
    if (!purchase) throw createHttpError(404, "Purchase not found");
    if (purchase.status !== "pending") throw createHttpError(409, `This purchase is already ${purchase.status}`);

    const listPrice = purchase.plan === "lifetime" ? cfg.licencePrice : cfg.monthlyPrice;
    let discount = 0;
    let referralId = null;
    if (purchase.plan === "lifetime") {
      const [[referral]] = await conn.execute("SELECT * FROM gym_referrals WHERE tenant_id = ? FOR UPDATE", [
        purchase.tenant_id,
      ]);
      if (referral && referral.status === "pending") {
        discount = Math.min(cfg.referralDiscount, listPrice);
        referralId = referral.id;
        await conn.execute(
          "UPDATE gym_referrals SET status = 'successful', reward_amount = ?, converted_at = CURRENT_TIMESTAMP WHERE id = ?",
          [cfg.referrerReward, referral.id],
        );
      }
    }
    const [[gymRow]] = await conn.execute("SELECT price_override FROM gyms WHERE id = ?", [purchase.tenant_id]);
    const override = gymRow && gymRow.price_override != null ? Number(gymRow.price_override) : null;
    const final = priced(listPrice, discount, override, referralId);
    await conn.execute(
      `UPDATE licence_purchases
          SET status = 'approved', list_price = ?, discount = ?, adjustment = ?, amount = ?, referral_id = ?, decided_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [final.listPrice, final.discount, final.adjustment, final.amount, final.referralId, id],
    );
  });
  return model.getPurchase(id);
}

async function rejectPurchase(id, note) {
  const { affectedRows } = await exec(
    "UPDATE licence_purchases SET status = 'rejected', note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
    [String(note || "").trim().slice(0, 255), id],
  );
  if (!affectedRows) throw createHttpError(409, "Only a pending purchase can be rejected");
  return model.getPurchase(id);
}

// ---------------- Payout settlement (super-admin) ----------------
async function settlePayout(id, status, note) {
  const next = status === "rejected" ? "rejected" : "paid";
  const { affectedRows } = await exec(
    "UPDATE partner_payouts SET status = ?, note = ?, settled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'requested'",
    [next, String(note || "").trim().slice(0, 255), id],
  );
  if (!affectedRows) throw createHttpError(409, "Only a requested payout can be settled");
  return (await model.listAllPayouts()).find((p) => p.id === id);
}

module.exports = {
  approvePurchase,
  attachReferral,
  checkCode,
  dashboard,
  loginPartner,
  quote,
  rejectPurchase,
  requestPayout,
  setGymReferral,
  requestPurchase,
  resolveCode,
  settlePayout,
  signupPartner,
};
