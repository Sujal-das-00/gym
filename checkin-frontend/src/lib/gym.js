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
