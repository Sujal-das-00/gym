const { exec, query } = require("../config/database");
const { createHttpError } = require("../utils/http");

// Server-side Meta (Facebook) app events. The phone app logs most events itself; a
// purchase is only real once the super-admin approves the payment, so that one is sent
// from here, using the anonymous Meta id the app reported for the gym.
//
// Needs META_APP_ID and META_CAPI_ACCESS_TOKEN in .env. The token never leaves the
// server. Without them everything here is a no-op and the app reports purchases itself.
const GRAPH_VERSION = "v21.0";
const APP_PACKAGE = "app.gymboo.gym_boo";

function metaConfig() {
  return {
    appId: String(process.env.META_APP_ID || "").trim(),
    token: String(process.env.META_CAPI_ACCESS_TOKEN || "").trim(),
  };
}

function enabled() {
  const { appId, token } = metaConfig();
  return Boolean(appId && token);
}

async function saveDevice(tenantId, anonId) {
  const id = String(anonId || "").trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw createHttpError(400, "Invalid device id");
  await exec(
    "INSERT INTO meta_devices (tenant_id, anon_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE anon_id = VALUES(anon_id)",
    [tenantId, id],
  );
}

// Purchase ids already sent to Meta for this gym; the app skips reporting these itself.
async function sentPurchaseIds(tenantId) {
  if (!enabled()) return [];
  const rows = await query("SELECT purchase_id FROM meta_sent_purchases WHERE tenant_id = ?", [tenantId]);
  return rows.map((row) => row.purchase_id);
}

// extinfo is a fixed 16-slot array; only the app identity is known server-side.
function extInfo() {
  const info = new Array(16).fill("");
  info[0] = "a2";
  info[1] = APP_PACKAGE;
  return info;
}

async function post(events, anonId) {
  const { appId, token } = metaConfig();
  const body = new URLSearchParams({
    event: "CUSTOM_APP_EVENTS",
    custom_events: JSON.stringify(events),
    application_tracking_enabled: "1",
    advertiser_tracking_enabled: "1",
    anon_id: anonId,
    extinfo: JSON.stringify(extInfo()),
    access_token: token,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${appId}/activities`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The body can echo request details; keep the log short and never include the token.
    throw new Error(`Meta responded ${res.status}: ${detail.slice(0, 200).replace(token, "***")}`);
  }
}

// Called after the super-admin approves a purchase. Never throws: a Meta outage must not
// affect approving a payment. If it fails, the app reports the purchase itself.
async function sendApprovedPurchase(purchase) {
  try {
    if (!enabled() || !purchase || purchase.status !== "approved" || !(Number(purchase.amount) > 0)) return;
    const [device] = await query("SELECT anon_id FROM meta_devices WHERE tenant_id = ?", [purchase.tenantId]);
    if (!device) return;
    const already = await query("SELECT 1 FROM meta_sent_purchases WHERE purchase_id = ?", [purchase.id]);
    if (already.length) return;

    const time = Math.floor(Date.now() / 1000);
    const common = {
      _valueToSum: Number(purchase.amount),
      fb_currency: "INR",
      fb_order_id: purchase.id,
      plan: purchase.plan,
      gym_id: purchase.tenantId,
      _logTime: time,
    };
    const events = [{ _eventName: "fb_mobile_purchase", ...common }];
    if (purchase.plan === "monthly") events.push({ _eventName: "Subscribe", ...common });
    await post(events, device.anon_id);
    await exec("INSERT IGNORE INTO meta_sent_purchases (purchase_id, tenant_id) VALUES (?, ?)", [purchase.id, purchase.tenantId]);
  } catch (error) {
    console.warn(`Meta purchase event not sent: ${error.message}`);
  }
}

module.exports = { enabled, saveDevice, sendApprovedPurchase, sentPurchaseIds };
