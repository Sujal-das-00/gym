// The public review form is open to the internet, so each IP gets a handful of
// submissions per hour. In-memory like the other throttles (resets on restart).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

const submissions = new Map();

function reviewThrottle(req, res, next) {
  const now = Date.now();
  for (const [key, entry] of submissions) {
    if (now - entry.firstAt > WINDOW_MS) submissions.delete(key);
  }
  const entry = submissions.get(req.ip);
  if (!entry) submissions.set(req.ip, { count: 1, firstAt: now });
  else entry.count += 1;

  const current = submissions.get(req.ip);
  if (current.count > MAX_SUBMISSIONS) {
    res.setHeader("Retry-After", String(Math.ceil((WINDOW_MS - (now - current.firstAt)) / 1000)));
    return res.status(429).json({ error: "Too many reviews from this connection. Please try again later." });
  }
  return next();
}

module.exports = { reviewThrottle };
