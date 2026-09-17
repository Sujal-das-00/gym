// Small text helpers shared across views.

export function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// Canonical phone form — digits only without the +91/91/0 prefixes, so every
// way of writing the same number compares equal.
// Keep in sync with normalizePhone in backend/src/utils/member.js.
export function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    const rest = digits.slice(2).replace(/^0+/, "");
    if (rest.length === 10) digits = rest;
  }
  return digits;
}

export function roleLabel(role) {
  if (role === "super_admin") return "Owner";
  if (role === "gym_admin") return "Admin";
  return "Staff";
}
