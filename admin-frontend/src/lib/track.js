/**
 * Ad-measurement events for the phone app (Meta App Events). Inside the Gym Boo app
 * they go over the `GymBooNative` bridge; in a normal browser this does nothing.
 * The app validates and de-duplicates them (mobile-app/admin-app/lib/analytics.dart),
 * so calling this twice for the same thing is safe. Never pass email, phone or names.
 * landing/plans.js has the same helper for the plans page.
 */
import { api } from "./api.js";
import { isNativeApp, nativeCall } from "./native.js";

export function track(event, params = {}) {
  try {
    if (typeof window.GymBooNative?.postMessage !== "function") return;
    window.GymBooNative.postMessage(JSON.stringify({ type: "track", event, params }));
  } catch {
    // tracking must never break the page
  }
}

let deviceRegistered = false;

// Tells the server this install's anonymous Meta id so an approved purchase can be sent to
// Meta from there. Once per page load; failures are ignored.
export async function registerMetaDevice() {
  if (deviceRegistered || !isNativeApp()) return;
  deviceRegistered = true;
  try {
    const ids = await nativeCall("metaIds", {}, 10000);
    if (ids?.anonId) await api("/api/meta/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId: ids.anonId }) });
  } catch {
    deviceRegistered = false;
  }
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000; // Meta ignores older events; skip old history

// Server-approved purchases (the super-admin verified the payment) that are recent.
// `sentByServer`: purchase ids the server already reported, which must not be reported twice.
export function trackApprovedPurchases(purchases, sentByServer = []) {
  for (const p of purchases || []) {
    if (sentByServer.includes(p.id)) continue;
    if (p.status !== "approved" || !(Number(p.amount) > 0)) continue;
    if (!p.decidedAt || Date.now() - new Date(p.decidedAt).getTime() > RECENT_MS) continue;
    const params = { purchase_id: String(p.id), user_id: p.tenantId, plan: p.plan, amount: p.amount, currency: "INR" };
    track("Purchase", params);
    if (p.plan === "monthly") track("Subscribe", params);
  }
}
