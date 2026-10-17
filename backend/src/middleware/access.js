const gymModel = require("../models/gymModel");
const maintenanceService = require("../services/maintenanceService");
const { createHttpError } = require("../utils/http");

// Gate for every gym-scoped dashboard API. Suspended gyms are blocked outright; a gym
// whose free trial has run out (and has no licence or temporary access) gets 402 with
// a code the dashboard turns into a redirect to the plans page. Login, /auth/me and the
// /licence routes sit before this gate so a locked owner can still sign in and pay.
// A dashboard load fires a burst of API calls; resolving the gym's standing (two or three
// queries) for each is wasteful, so the verdict is kept for a few seconds per gym.
const TTL_MS = 3000;
const verdicts = new Map();

function resolveVerdict(gymId) {
  const hit = verdicts.get(gymId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async () => {
    const gym = await gymModel.getGymById(gymId);
    if (!gym) return { missing: true };
    const access = gymModel.accessOf(gym);
    const locked = access.state === "active" && (await maintenanceService.isLocked(gym));
    return { access, locked };
  })();
  if (verdicts.size > 1000) verdicts.clear();
  verdicts.set(gymId, { at: Date.now(), promise });
  // A failed lookup must not be remembered.
  promise.catch(() => verdicts.delete(gymId));
  return promise;
}

async function enforceAccess(req, res, next) {
  try {
    const { missing, access, locked } = await resolveVerdict(req.gymId);
    if (missing) return next(createHttpError(404, "Gym not found"));
    if (access.state === "suspended") {
      return res.status(403).json({ error: "This gym is currently suspended", code: "SUSPENDED" });
    }
    if (access.state === "trial_expired") {
      return res.status(402).json({ error: "Your free trial has ended. Choose a plan to continue.", code: "TRIAL_EXPIRED" });
    }
    // Yearly maintenance unpaid past its last date: the account is kept on hold (data is
    // kept) until we record the payment. /billing sits before this gate so the owner can see why.
    if (locked) {
      return res.status(402).json({ error: "Your yearly maintenance fee is overdue. Pay it to reopen your account.", code: "MAINTENANCE_OVERDUE" });
    }
    req.access = access;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { enforceAccess };
