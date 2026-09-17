// Member login is a real two-factor check (gym_id + phone), but a phone number
// is only 10 digits, so it must still be rate-limited or a script could brute
// force it against one known/guessed membership code. Two keys are tracked:
// one tight per (ip, slug, gymCode) — catches phone-guessing against one code —
// and one looser per (ip, slug) — catches gymCode-enumeration against one known
// phone, which the first key alone would never trip since each guess is a new key.
// Modeled on checkinThrottle.js, but kept separate: wrong-phone and wrong-daily-
// code have different risk profiles and thresholds.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CODE = 6;
const MAX_FAILURES_PER_IP = 30;

const codeAttempts = new Map();
const ipAttempts = new Map();

function codeKeyFor(req) {
  const gymCode = String(req.body?.gymId || "").trim().toLowerCase();
  return `${req.ip}|${req.params.slug || ""}|${gymCode}`;
}

function ipKeyFor(req) {
  return `${req.ip}|${req.params.slug || ""}`;
}

function prune(map, now) {
  for (const [key, entry] of map) {
    if (now - entry.firstAt > WINDOW_MS) map.delete(key);
  }
}

function tripped(map, key, max, now) {
  const entry = map.get(key);
  return entry && entry.count >= max && now - entry.firstAt <= WINDOW_MS ? entry : null;
}

function memberLoginThrottle(req, res, next) {
  const now = Date.now();
  prune(codeAttempts, now);
  prune(ipAttempts, now);

  const codeHit = tripped(codeAttempts, codeKeyFor(req), MAX_FAILURES_PER_CODE, now);
  const ipHit = tripped(ipAttempts, ipKeyFor(req), MAX_FAILURES_PER_IP, now);
  const hit = codeHit || ipHit;
  if (hit) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - hit.firstAt)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Too many attempts. Wait a few minutes and try again.",
    });
  }
  return next();
}

function record(map, key, now) {
  const entry = map.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) map.set(key, { count: 1, firstAt: now });
  else entry.count += 1;
}

function recordLoginFailure(req) {
  const now = Date.now();
  record(codeAttempts, codeKeyFor(req), now);
  record(ipAttempts, ipKeyFor(req), now);
}

function clearLoginFailures(req) {
  codeAttempts.delete(codeKeyFor(req));
  ipAttempts.delete(ipKeyFor(req));
}

module.exports = {
  memberLoginThrottle,
  recordLoginFailure,
  clearLoginFailures,
};
