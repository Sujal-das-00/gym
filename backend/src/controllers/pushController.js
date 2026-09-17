const { createHttpError } = require("../utils/http");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const { publicVapidKey, pushAvailable } = require("../services/pushService");
const notificationService = require("../services/notificationService");

// A subscription endpoint is a URL issued by the browser's push service. Only
// https is ever legitimate, and the length cap keeps a hostile client from
// pushing an unbounded string into the table.
const MAX_ENDPOINT = 2000;
const MAX_KEY = 255;

/**
 * Accepts only the three fields of a PushSubscription that web-push needs, and
 * rejects anything malformed outright — never trust the body just because the
 * member is authenticated.
 */
function validateSubscription(input) {
  const endpoint = String(input?.endpoint || "").trim();
  const p256dh = String(input?.keys?.p256dh || "").trim();
  const auth = String(input?.keys?.auth || "").trim();

  if (!endpoint || endpoint.length > MAX_ENDPOINT) throw createHttpError(400, "Invalid push subscription endpoint");
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw createHttpError(400, "Invalid push subscription endpoint");
  }
  if (parsed.protocol !== "https:") throw createHttpError(400, "Invalid push subscription endpoint");
  // Both keys are base64url; anything else can only be junk or an injection attempt.
  if (!p256dh || p256dh.length > MAX_KEY || !/^[A-Za-z0-9_-]+=*$/.test(p256dh)) {
    throw createHttpError(400, "Invalid push subscription keys");
  }
  if (!auth || auth.length > MAX_KEY || !/^[A-Za-z0-9_-]+=*$/.test(auth)) {
    throw createHttpError(400, "Invalid push subscription keys");
  }
  return { endpoint, keys: { p256dh, auth } };
}

// The gym in the URL must be the gym the member's session was issued for —
// the same check getAccountSession makes, for the same reason.
async function resolveMemberGym(req) {
  const gym = await gymModel.getGymBySlug(req.params.slug);
  if (!gym || gym.status !== "active") throw createHttpError(404, "Gym not found");
  if (gym.id !== req.memberAuth.tenantId) throw createHttpError(401, "Sign in required");
  return gym;
}

// Public by design: the VAPID public key is what the browser encrypts to, and
// it is useless without the private key, which never leaves this process.
async function getPublicKey(req, res) {
  res.json({ available: pushAvailable(), publicKey: pushAvailable() ? publicVapidKey() : "" });
}

async function postSubscribe(req, res) {
  if (!pushAvailable()) throw createHttpError(503, "Push notifications are not available");
  const gym = await resolveMemberGym(req);
  const subscription = validateSubscription(req.body?.subscription || req.body);
  subscription.userAgent = String(req.headers["user-agent"] || "").slice(0, 255);
  const saved = await repo().savePushSubscription(gym.id, req.memberAuth.memberId, subscription);
  res.status(201).json({ ok: true, id: saved?.id || "" });
}

async function deleteSubscribe(req, res) {
  if (!pushAvailable()) throw createHttpError(503, "Push notifications are not available");
  const gym = await resolveMemberGym(req);
  const endpoint = String(req.body?.endpoint || "").trim();
  if (!endpoint) throw createHttpError(400, "Missing push subscription endpoint");
  await repo().deletePushSubscription(gym.id, req.memberAuth.memberId, endpoint);
  res.json({ ok: true });
}

// Lets the member app show "notifications are on for this device" without
// leaking anything: only this member's own devices, counted.
async function getMySubscriptions(req, res) {
  if (!pushAvailable()) return res.json({ available: false, devices: 0 });
  const gym = await resolveMemberGym(req);
  const devices = await repo().countPushSubscriptionsForMember(gym.id, req.memberAuth.memberId);
  return res.json({ available: true, devices });
}

/* ---- Gym-owner side. Every handler below runs after authenticate +
   resolveTenant + requireRole, so req.gymId is the caller's own gym. ------- */

async function getFeeReminderPreview(req, res) {
  res.json(await notificationService.feeReminderPreview(req.gymId));
}

async function postFeeReminders(req, res) {
  res.json(await notificationService.sendFeeReminders(req.gymId));
}

async function postCustomNotification(req, res) {
  res.json(await notificationService.sendCustomNotification(req.gymId, req.body || {}));
}

module.exports = {
  deleteSubscribe,
  getFeeReminderPreview,
  getMySubscriptions,
  getPublicKey,
  postCustomNotification,
  postFeeReminders,
  postSubscribe,
  validateSubscription,
};
