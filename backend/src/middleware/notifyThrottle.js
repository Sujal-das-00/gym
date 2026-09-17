// A mass-notification endpoint writes to every member's phone at once, so it is
// the one admin action where an accidental double-click (or a bored staff
// account) is felt by hundreds of people. Capped per authenticated user AND per
// gym, in memory — same single-process model as checkinThrottle.js.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 6;

const sends = new Map();

function keysFor(req) {
  // Both keys, so neither "one admin, many gyms" (super-admin) nor "many admins,
  // one gym" can multiply the cap.
  return [`user:${req.user?.id || req.ip}`, `gym:${req.gymId || ""}`];
}

function prune(now) {
  for (const [key, entry] of sends) {
    if (now - entry.firstAt > WINDOW_MS) sends.delete(key);
  }
}

function notifyThrottle(req, res, next) {
  const now = Date.now();
  prune(now);

  const keys = keysFor(req);
  const blocked = keys
    .map((key) => sends.get(key))
    .find((entry) => entry && entry.count >= MAX_SENDS_PER_HOUR && now - entry.firstAt <= WINDOW_MS);

  if (blocked) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - blocked.firstAt)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: `Too many notification sends. You can send ${MAX_SENDS_PER_HOUR} per hour — try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    });
  }

  // Counted on entry, not on success: a send that fails halfway has still woken
  // up every phone it reached before failing.
  for (const key of keys) {
    const entry = sends.get(key);
    if (!entry || now - entry.firstAt > WINDOW_MS) sends.set(key, { count: 1, firstAt: now });
    else entry.count += 1;
  }
  return next();
}

module.exports = { notifyThrottle };
