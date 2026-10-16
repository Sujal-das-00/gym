// Login and signup are open to the internet, so each IP gets a bounded number of
// attempts per window — enough for a person fumbling a password, too few for a
// script guessing passwords or minting gyms. In-memory like the other throttles:
// it resets on restart, which is acceptable for a single shared-hosting process.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

const attempts = new Map();

function authThrottle(req, res, next) {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.firstAt > WINDOW_MS) attempts.delete(key);
  }
  const entry = attempts.get(req.ip);
  if (!entry) attempts.set(req.ip, { count: 1, firstAt: now });
  else entry.count += 1;

  const current = attempts.get(req.ip);
  if (current.count > MAX_ATTEMPTS) {
    res.setHeader("Retry-After", String(Math.ceil((WINDOW_MS - (now - current.firstAt)) / 1000)));
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
  }
  return next();
}

module.exports = { authThrottle };
