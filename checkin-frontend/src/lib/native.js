/**
 * Bridge to the Gym Boo mobile app (the Flutter WebView wrapper).
 *
 * A WebView has no Web Push, so inside the app notifications are native (FCM).
 * The wrapper exposes a `GymBooNative` JavaScript channel; we send it a request
 * and it answers through window.__gymbooNativeResult. Outside the app none of
 * this exists and every caller falls back to the browser Push API.
 */

export function isNativeApp() {
  return typeof window !== "undefined" && typeof window.GymBooNative?.postMessage === "function";
}

const pending = new Map();
let nextId = 1;

if (typeof window !== "undefined") {
  window.__gymbooNativeResult = (id, payload) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    try {
      entry.resolve(typeof payload === "string" ? JSON.parse(payload) : payload);
    } catch (error) {
      entry.reject(error);
    }
  };
}

// Resolves with the wrapper's answer. The timeout is generous because the
// first "enable" waits on the OS permission dialog.
export function nativeCall(type, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!isNativeApp()) {
      reject(new Error("Not running inside the Gym Boo app"));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The app did not respond"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window.GymBooNative.postMessage(JSON.stringify({ id, type }));
  });
}
