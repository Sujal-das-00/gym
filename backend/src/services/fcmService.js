const fs = require("fs");
const { firebaseConfig } = require("../config/env");

// Native (Flutter wrapper) devices live in push_subscriptions next to the web
// ones. Their "endpoint" is `fcm://<registration token>`, which keeps the
// existing uniqueness/ownership/cleanup logic working with no schema change.
const NATIVE_PREFIX = "fcm://";

// FCM accepts up to 500 tokens per multicast call.
const MULTICAST_LIMIT = 500;

// Must match the channel the Flutter app creates (lib/notifications.dart). On
// Android 8+ a message naming a channel that does not exist falls back to a
// default one with no sound/heads-up, so the two have to agree.
const ANDROID_CHANNEL_ID = "gymboo_default";

let messagingInstance = null;
let loaded = false;

function loadServiceAccount() {
  const { serviceAccount, serviceAccountFile } = firebaseConfig();
  let raw = serviceAccount;
  if (!raw && serviceAccountFile) {
    try {
      raw = fs.readFileSync(serviceAccountFile, "utf8");
    } catch (error) {
      console.warn(`Could not read FIREBASE_SERVICE_ACCOUNT_FILE: ${error.message}`);
      return null;
    }
  }
  if (!raw) return null;
  // Hosting panels mangle multi-line JSON in env vars, so base64 is accepted too.
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(raw);
  // The Firebase console hands out two different JSON files; only one works here.
  if (parsed.type !== "service_account" || !parsed.private_key || !parsed.client_email) {
    throw new Error(
      "this is not a service-account key. In Firebase console go to Project settings > Service accounts > " +
        '"Generate new private key" (the file contains "type": "service_account" and a "private_key"), ' +
        "not the web app config with apiKey/appId.",
    );
  }
  // The private key's newlines are often escaped twice by env-var tooling.
  if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  return parsed;
}

function messaging() {
  if (loaded) return messagingInstance;
  loaded = true;
  try {
    const credentials = loadServiceAccount();
    if (!credentials) {
      console.warn("FIREBASE_SERVICE_ACCOUNT is not set — notifications to the mobile app are disabled.");
      return null;
    }
    // Modular imports: firebase-admin 12+ no longer exposes admin.credential / admin.messaging().
    const { cert, initializeApp } = require("firebase-admin/app");
    const { getMessaging } = require("firebase-admin/messaging");
    const app = initializeApp({ credential: cert(credentials) }, "gymboo-fcm");
    messagingInstance = getMessaging(app);
  } catch (error) {
    console.warn(`Invalid Firebase configuration — mobile app notifications are disabled: ${error.message}`);
    messagingInstance = null;
  }
  return messagingInstance;
}

function fcmReady() {
  return Boolean(messaging());
}

function isNativeEndpoint(endpoint) {
  return String(endpoint || "").startsWith(NATIVE_PREFIX);
}

function nativeEndpoint(token) {
  return `${NATIVE_PREFIX}${token}`;
}

function tokenOf(endpoint) {
  return String(endpoint).slice(NATIVE_PREFIX.length);
}

// The token is gone for good (app uninstalled, data cleared, token rotated).
// Everything else — quota, outage, network — is transient: keep the row.
const PERMANENT_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/**
 * Sends one notification to a list of native subscriptions.
 * Returns { sent, failed, expired, expiredEndpoints } and never throws for a
 * per-device failure.
 *
 * `notification` is what makes Android draw the tray entry itself, labelled with
 * the app name ("Gym Boo") — so it still shows when the app is closed or killed,
 * with no Dart code running. `data.url` is the in-app page the tap opens.
 */
async function sendToNative(subscriptions, { title, body, url, tag, kind }) {
  const result = { sent: 0, failed: 0, expired: 0, expiredEndpoints: [] };
  const client = messaging();
  if (!client) {
    result.failed = subscriptions.length;
    return result;
  }

  for (let index = 0; index < subscriptions.length; index += MULTICAST_LIMIT) {
    const chunk = subscriptions.slice(index, index + MULTICAST_LIMIT);
    let response;
    try {
      response = await client.sendEachForMulticast({
        tokens: chunk.map((subscription) => tokenOf(subscription.endpoint)),
        notification: { title, body },
        data: { url: String(url || "/"), tag: String(tag || "gymboo"), kind: String(kind || "custom") },
        android: {
          priority: "high",
          ttl: 24 * 60 * 60 * 1000,
          notification: { channelId: ANDROID_CHANNEL_ID, tag: String(tag || "gymboo"), color: "#073f2d" },
        },
        apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
      });
    } catch (error) {
      console.warn(`FCM send failed: ${error.message}`);
      result.failed += chunk.length;
      continue;
    }

    response.responses.forEach((item, position) => {
      if (item.success) {
        result.sent += 1;
        return;
      }
      result.failed += 1;
      if (PERMANENT_CODES.has(item.error?.code)) {
        result.expired += 1;
        result.expiredEndpoints.push(chunk[position].endpoint);
      } else {
        console.warn(`FCM send failed (${item.error?.code || "unknown"}): ${item.error?.message || ""}`);
      }
    });
  }
  return result;
}

module.exports = { fcmReady, isNativeEndpoint, nativeEndpoint, sendToNative, tokenOf };
