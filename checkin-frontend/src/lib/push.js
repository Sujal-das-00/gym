/**
 * Browser-side Web Push plumbing: everything that talks to the Push API lives
 * here, so the hook above it only deals with "on" and "off".
 */

// Push is unavailable in http (except localhost), in iOS Safari before the app
// is added to the home screen, and in private windows on some browsers — all of
// which show up as one of these three globals being missing.
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionState() {
  if (!pushSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

/**
 * The applicationServerKey has to be raw bytes; the backend serves the key in
 * the base64url form the VAPID spec uses, so it is decoded here.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

// main.jsx registers the worker on load; this waits for that registration rather
// than racing it, so turning notifications on right after opening the app works.
export async function readyRegistration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await readyRegistration();
  return registration.pushManager.getSubscription();
}

/**
 * Asks for permission (the browser only shows the prompt on a user gesture, so
 * this must be called from a click) and returns a live PushSubscription.
 *
 * An existing subscription created under a DIFFERENT server key is unusable —
 * the backend could not encrypt to it — so it is dropped and re-created.
 */
export async function subscribeToPush(publicKey) {
  if (!pushSupported()) throw new Error("This browser cannot show notifications");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked. Allow them for this site in your browser settings."
        : "Notification permission was dismissed",
    );
  }

  const registration = await readyRegistration();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const sameKey =
      existing.options?.applicationServerKey &&
      new Uint8Array(existing.options.applicationServerKey).toString() === applicationServerKey.toString();
    if (sameKey) return existing;
    await existing.unsubscribe();
  }

  return registration.pushManager.subscribe({
    // Required by Chrome: every push must result in a visible notification.
    userVisibleOnly: true,
    applicationServerKey,
  });
}

// The plain object the backend stores — endpoint plus the two keys it needs to
// encrypt to this device. Nothing else from the subscription is sent.
export function serializeSubscription(subscription) {
  return JSON.parse(JSON.stringify(subscription));
}
