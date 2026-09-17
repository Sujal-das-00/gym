const publicBase = (slug) => (slug ? `/api/public/${encodeURIComponent(slug)}` : "");

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export async function fetchGymSettings(slug) {
  const res = await fetch(`${publicBase(slug)}/settings`);
  if (!res.ok) throw new Error("Branding unavailable");
  return res.json();
}

export async function fetchCheckinHistory(slug, identifier) {
  const res = await fetch(
    `${publicBase(slug)}/checkin/history?identifier=${encodeURIComponent(identifier)}`,
  );
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Member not found");
  return data;
}

// Account-screen sign in: gym_id (membership code) as the username, phone as the
// password. `credentials: "include"` sends/receives the member session cookie —
// safe here because the checkin app and the API are always same-origin (Vite's
// dev proxy, or Express serving the built app in production).
export async function postAccountLogin(slug, { gymId, phone, trustDevice }) {
  const res = await fetch(`${publicBase(slug)}/account/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gymId, phone, trustDevice }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Sign in failed");
  return data;
}

export async function postAccountLogout(slug) {
  await fetch(`${publicBase(slug)}/account/logout`, { method: "POST", credentials: "include" });
}

// Silently restores a session from the member cookie; callers treat a failure
// (401/404 — no cookie, or an expired/foreign one) as "not signed in", not an error.
export async function fetchAccountSession(slug) {
  const res = await fetch(`${publicBase(slug)}/account/session`, { credentials: "include" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Sign in required");
  return data;
}

/**
 * Resolves for every outcome the backend can return — including the 403 the gym
 * sends when expired memberships are blocked, which carries the member and their
 * history alongside the refusal and so isn't treated as a transport error.
 *
 * `code` is the gym's four-digit code for today, shown at the front desk; the
 * backend rejects the check-in without it.
 */
export async function postCheckin(slug, identifier, code) {
  const res = await fetch(`${publicBase(slug)}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, code }),
  });
  const data = await readJson(res);
  if (res.status === 403 && data.expired) return { ...data, denied: true };
  if (!res.ok) throw new Error(data.error || "Check-in failed");
  return data;
}

/* ---- Web Push -----------------------------------------------------------
 * The public VAPID key is not a secret — it is what the browser encrypts its
 * payloads to. The matching private key never leaves the backend.
 * ----------------------------------------------------------------------- */

export async function fetchPushPublicKey() {
  const res = await fetch("/api/push/public-key");
  if (!res.ok) throw new Error("Push notifications are unavailable");
  return res.json();
}

// Registering the device needs the member session, so these all go through the
// account namespace with the member cookie attached.
export async function postPushSubscribe(slug, subscription) {
  const res = await fetch(`${publicBase(slug)}/account/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not turn on notifications");
  return data;
}

export async function postPushUnsubscribe(slug, endpoint) {
  const res = await fetch(`${publicBase(slug)}/account/push/unsubscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || "Could not turn off notifications");
  return data;
}
