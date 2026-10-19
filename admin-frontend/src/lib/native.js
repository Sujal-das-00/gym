/**
 * Bridge to the Gym Boo phone app (the Flutter WebView wrapper). A WebView can't
 * download a generated file, so the app does it: the page posts a request on the
 * `GymBooNative` channel and the app answers through window.__gymbooNativeResult.
 * Same protocol as checkin-frontend/src/lib/native.js.
 */

export function isNativeApp() {
  return typeof window !== "undefined" && typeof window.GymBooNative?.postMessage === "function";
}

// Inside the phone app (see the inline script in index.html), bridge or not.
export function isAppShell() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("app-shell");
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

// Generous timeout: the answer comes back after the share sheet closes.
export function nativeCall(type, data = {}, timeoutMs = 120000) {
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
    window.GymBooNative.postMessage(JSON.stringify({ ...data, id, type }));
  });
}
