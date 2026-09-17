// Today's code is only four digits, and the check-in endpoint is public — a
// script could otherwise walk all 10,000 of them in seconds. Failed attempts are
// counted per IP + gym in memory; successful check-ins clear the counter, so a
// member fumbling their number is never locked out. Single-process store, which
// matches how this app is deployed.
const WINDOW_MS = 10 * 60 * 1000;
// Members on the gym's wifi share one public IP, so this has to tolerate a run of
// honest fumbles. A success clears the counter, so the cap is only reached after
// this many consecutive failures with no valid check-in in between. It still caps
// a brute force at ~20 guesses per 10 minutes against a code that changes daily.
const MAX_FAILURES = 20;

const attempts = new Map();

function keyFor(req) {
  return `${req.ip}|${req.params.slug || ""}`;
}

function prune(now) {
  for (const [key, entry] of attempts) {
    if (now - entry.firstAt > WINDOW_MS) attempts.delete(key);
  }
}

function checkinThrottle(req, res, next) {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(keyFor(req));
  if (entry && entry.count >= MAX_FAILURES && now - entry.firstAt <= WINDOW_MS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Too many wrong codes. Wait a few minutes, then check the code on the front-desk screen.",
    });
  }
  return next();
}

function recordCodeFailure(req) {
  const now = Date.now();
  const key = keyFor(req);
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) attempts.set(key, { count: 1, firstAt: now });
  else entry.count += 1;
}

function clearCodeFailures(req) {
  attempts.delete(keyFor(req));
}

module.exports = {
  checkinThrottle,
  clearCodeFailures,
  recordCodeFailure,
};
