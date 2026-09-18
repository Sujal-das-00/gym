// The gym is identified by the URL slug, e.g. /checkin/nova-fitness.
export function readSlugFromLocation() {
  const path = window.location.pathname.replace(/^\/checkin\/?/, "");
  return decodeURIComponent((path.split(/[/?#]/)[0] || "").trim());
}

/**
 * A scanned front-desk QR holds the gym's check-in URL plus today's code, e.g.
 * /checkin/nova-fitness?c=4821. Pull both back out: the slug picks the gym for a
 * member who opened the bare /checkin app (or the installed PWA), and the code
 * fills in the field they would otherwise read off the front-desk screen.
 */
export function readScan(text) {
  const value = String(text || "").trim();
  if (!value) return { slug: "", code: "" };
  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/checkin\/([^/?#]+)/);
    const code = String(url.searchParams.get("c") || "").trim();
    return {
      slug: match ? decodeURIComponent(match[1]) : "",
      code: /^\d{4}$/.test(code) ? code : "",
    };
  } catch {
    return { slug: "", code: "" };
  }
}

// A member who opens the QR link directly lands on the page with ?c= already set,
// so seed the code from the address bar too.
export function readCodeFromLocation() {
  try {
    const code = new URLSearchParams(window.location.search).get("c") || "";
    return /^\d{4}$/.test(code.trim()) ? code.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Which member screen to land on, from the ?screen= a push notification's click
 * URL carries (backend/src/services/notificationService.js builds it). Anything
 * unrecognised falls back to the dashboard, so a stale or hand-edited link can
 * never leave the app on a blank destination.
 */
const MEMBER_SCREENS = ["home", "receipts", "id-card", "checkin"];

export function readScreenFromLocation() {
  try {
    const screen = String(new URLSearchParams(window.location.search).get("screen") || "").trim();
    return MEMBER_SCREENS.includes(screen) ? screen : "home";
  } catch {
    return "home";
  }
}

/**
 * The gym the member last scanned into.
 *
 * The installed app (and the APK) opens the bare /checkin — the same build for
 * every gym, so its URL can't name one. The first scanned QR is remembered here
 * and every launch after that goes straight to that gym's page.
 */
const LAST_GYM_KEY = "gym-checkin:last-gym";

export function readLastGym() {
  try {
    return localStorage.getItem(LAST_GYM_KEY) || "";
  } catch {
    // localStorage unavailable (private mode) — the member just scans each time.
    return "";
  }
}

export function writeLastGym(slug) {
  try {
    if (slug) localStorage.setItem(LAST_GYM_KEY, slug);
  } catch {
    // ignore
  }
}

export function clearLastGym() {
  try {
    localStorage.removeItem(LAST_GYM_KEY);
  } catch {
    // ignore
  }
}

// /checkin?pick=1 — the "not your gym?" link. It opens the scanner on a phone that
// already has a gym saved, which is the only way back out of the auto-open.
export function wantsGymPicker() {
  try {
    return new URLSearchParams(window.location.search).has("pick");
  } catch {
    return false;
  }
}

// Namespace the saved member id per gym so different gyms don't overwrite each other.
export const savedIdKey = (slug) => (slug ? `gym-checkin-id:${slug}` : "gym-checkin-id");

export function readSavedId(slug) {
  try {
    return localStorage.getItem(savedIdKey(slug)) || "";
  } catch {
    return "";
  }
}

export function writeSavedId(slug, identifier) {
  try {
    localStorage.setItem(savedIdKey(slug), identifier);
  } catch {
    // localStorage unavailable (private mode) — check-in still works, just not remembered.
  }
}

export function clearSavedId(slug) {
  try {
    localStorage.removeItem(savedIdKey(slug));
  } catch {
    // ignore
  }
}
