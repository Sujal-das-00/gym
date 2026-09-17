const webpush = require("web-push");
const { pushConfig } = require("../config/env");
const { deletePushSubscriptionByEndpoint } = require("../models/pushSubscriptionModel");
const { usingFallback } = require("../models");

// How many pushes are in flight at once. Web Push is one HTTPS request per
// device, so a 400-member gym would otherwise open 400 sockets at once.
const BATCH_SIZE = 20;

// Push services reject payloads larger than ~4KB after encryption. Titles and
// bodies are clamped well under that so a long custom message can never make a
// whole batch fail.
const MAX_TITLE = 80;
const MAX_BODY = 300;

let configured = null;

/**
 * Loads the VAPID keys into web-push once. Returns false (rather than throwing)
 * when they are missing, so the app still boots and serves everything else —
 * only the notification endpoints answer 503.
 */
function pushReady() {
  if (configured !== null) return configured;
  const { publicKey, privateKey, subject } = pushConfig();
  if (!publicKey || !privateKey) {
    console.warn("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — push notifications are disabled.");
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.warn(`Invalid VAPID configuration — push notifications are disabled: ${error.message}`);
    configured = false;
  }
  return configured;
}

// The only half of the key pair a browser is ever given. The private key stays
// in this process and is never returned by any endpoint.
function publicVapidKey() {
  return pushConfig().publicKey;
}

// Push subscriptions live in MySQL only; in JSON-fallback mode there is nowhere
// to read them from, so the feature reports itself unavailable instead of 500ing.
function pushAvailable() {
  return pushReady() && !usingFallback();
}

function clamp(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * The exact JSON the service worker's `push` handler parses. Anything not in
 * this shape is ignored there, so build payloads only through this function.
 */
function buildPayload({ title, body, url, tag, kind }) {
  return JSON.stringify({
    title: clamp(title, MAX_TITLE) || "GymBoo",
    body: clamp(body, MAX_BODY),
    url: String(url || "/"),
    tag: String(tag || "gymboo"),
    kind: String(kind || "custom"),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
}

// 404 (endpoint never existed) and 410 Gone (permission revoked, app
// uninstalled, browser data cleared) are permanent: the row is dead weight and
// every future send to it would fail the same way, so drop it. Anything else
// (429 rate limit, 5xx outage, network error) is transient — keep the row.
function isPermanentFailure(error) {
  return error && (error.statusCode === 404 || error.statusCode === 410);
}

/**
 * Sends one payload to a list of stored subscriptions.
 *
 * A single dead device must never abort a gym-wide send, so every failure is
 * caught per subscription and folded into the summary the admin gets back.
 */
async function sendToSubscriptions(subscriptions, payloadInput) {
  const payload = buildPayload(payloadInput);
  const summary = { attempted: 0, sent: 0, failed: 0, expired: 0 };

  for (let index = 0; index < subscriptions.length; index += BATCH_SIZE) {
    const batch = subscriptions.slice(index, index + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((subscription) =>
        webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
          { TTL: 24 * 60 * 60 },
        ),
      ),
    );

    for (let position = 0; position < results.length; position += 1) {
      summary.attempted += 1;
      const result = results[position];
      if (result.status === "fulfilled") {
        summary.sent += 1;
        continue;
      }
      summary.failed += 1;
      const error = result.reason;
      if (!isPermanentFailure(error)) {
        console.warn(`Push send failed (${error?.statusCode || "network"}): ${error?.message || error}`);
        continue;
      }
      summary.expired += 1;
      try {
        await deletePushSubscriptionByEndpoint(batch[position].endpoint);
      } catch (cleanupError) {
        console.warn(`Could not remove expired push subscription: ${cleanupError.message}`);
      }
    }
  }

  return summary;
}

module.exports = {
  buildPayload,
  isPermanentFailure,
  publicVapidKey,
  pushAvailable,
  pushReady,
  sendToSubscriptions,
};
