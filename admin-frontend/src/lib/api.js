import { AUTH_TOKEN_KEY } from "./constants.js";

const API_BASE = "";

// The session cookie is HttpOnly, but some setups don't deliver it back (opening
// the app on a different host than you logged in on — localhost vs 127.0.0.1 —
// SameSite, or Secure over http). We keep the JWT here too and send it as a
// Bearer header, which the backend accepts as an equivalent to the cookie.
export function getToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // localStorage unavailable (private mode) — cookie auth still applies.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

// The auth provider registers itself here so `api()` keeps the same call
// signature it had when it read the `authState` global directly.
let apiContext = {
  getUser: () => null,
  getGymId: () => "",
  onUnauthorized: () => {},
};

export function setApiContext(context) {
  apiContext = { ...apiContext, ...context };
}

export async function api(path, options = {}) {
  const opts = { credentials: "include", ...options };
  opts.headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  // A super-admin operates on a chosen gym; every other role is locked to their own.
  const user = apiContext.getUser();
  const gymId = apiContext.getGymId();
  if (user && user.role === "super_admin" && gymId) {
    opts.headers["x-gym-id"] = gymId;
  }
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) {
    apiContext.onUnauthorized();
    throw new Error("Your session has expired. Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function fetchMe() {
  try {
    const token = getToken();
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) return null;
    return (await res.json()).user;
  } catch {
    return null;
  }
}

export async function login(email, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignore network errors on logout
  }
}

export const jsonRequest = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
