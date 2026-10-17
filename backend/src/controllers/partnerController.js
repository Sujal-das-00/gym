const { authConfig, referralConfig } = require("../config/env");
const { buildSetCookie, clearCookie } = require("../utils/cookies");
const referralService = require("../services/referralService");
const licenceService = require("../services/licenceService");
const maintenanceService = require("../services/maintenanceService");
const referralModel = require("../models/referralModel");

function setCookie(res, token) {
  const { partnerCookieName, cookieSecure, tokenTtlSeconds } = authConfig();
  res.setHeader("Set-Cookie", buildSetCookie(partnerCookieName, token, { maxAge: tokenTtlSeconds, secure: cookieSecure }));
}

const str = (value) => String(value || "").trim();

async function postSignup(req, res) {
  const { token, partner } = await referralService.signupPartner({
    name: str(req.body?.name),
    email: str(req.body?.email),
    phone: str(req.body?.phone),
    password: String(req.body?.password || ""),
  });
  setCookie(res, token);
  res.status(201).json({ partner });
}

async function postLogin(req, res) {
  const { token, partner } = await referralService.loginPartner(str(req.body?.email), String(req.body?.password || ""));
  setCookie(res, token);
  res.json({ partner });
}

function postLogout(req, res) {
  const { partnerCookieName, cookieSecure } = authConfig();
  res.setHeader("Set-Cookie", clearCookie(partnerCookieName, { secure: cookieSecure }));
  res.json({ ok: true });
}

async function getDashboard(req, res) {
  res.json(await referralService.dashboard(req.partnerId));
}

async function postPayout(req, res) {
  res.status(201).json(await referralService.requestPayout(req.partnerId, req.body?.payoutDetails));
}

// Public: lets the signup form confirm a code before the owner submits.
async function getCodeCheck(req, res) {
  res.json(await referralService.checkCode(req.params.code));
}

// Public: the programme's headline numbers, so the website copy tracks the config.
function getProgram(req, res) {
  const cfg = referralConfig();
  res.json({
    reward: cfg.referrerReward,
    discount: cfg.referralDiscount,
    licencePrice: cfg.licencePrice,
    effectivePrice: cfg.licencePrice - cfg.referralDiscount,
    supportEmail: cfg.supportEmail,
  });
}

// Gym owner side: plan, price (referral discount included), UPI payment details and access.
async function getLicence(req, res) {
  res.json(await licenceService.getStatus(req.gymId));
}

async function getBilling(req, res) {
  res.json(await maintenanceService.getBilling(req.gymId));
}

async function postLicence(req, res) {
  await referralService.requestPurchase(req.gymId, req.body?.plan);
  res.status(201).json(await licenceService.getStatus(req.gymId));
}

async function postClaim(req, res) {
  const result = await licenceService.claimPayment(req.gymId, req.body?.paymentRef);
  res.status(201).json({ ...result, status: await licenceService.getStatus(req.gymId) });
}

module.exports = { getCodeCheck, getProgram, getDashboard, getBilling, getLicence, postClaim, postLicence, postLogin, postLogout, postPayout, postSignup };
