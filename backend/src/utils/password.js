const crypto = require("crypto");

const KEY_LENGTH = 64;

// Passwords are hashed with scrypt (built into Node — no native dependency to
// compile on shared hosting). Stored as "scrypt$<salt>$<hash>".
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// Constant-time equality for two plaintext strings (used to compare the
// super-admin login against the env-configured credentials). Hashing both sides
// to a fixed length first avoids leaking length via the timing-safe compare.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = {
  hashPassword,
  verifyPassword,
  safeEqual,
};
