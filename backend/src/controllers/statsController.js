const { query } = require("../config/database");

// Public, aggregate-only numbers for the landing page. Nothing here identifies a
// gym or a member: just three counts, cached so the open internet can't turn the
// landing page into a way to hammer the database.
const CACHE_MS = 5 * 60 * 1000;
let cache = null;

async function readStats() {
  const [gyms] = await query("SELECT COUNT(*) AS n FROM gyms WHERE status = 'active'");
  const [members] = await query("SELECT COUNT(*) AS n FROM members WHERE archived_at IS NULL");
  const [active] = await query("SELECT COUNT(*) AS n FROM attendance WHERE attendance_date = CURDATE()");
  return { gyms: Number(gyms.n), members: Number(members.n), dailyActiveUsers: Number(active.n) };
}

async function getPublicStats(req, res) {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_MS) {
    try {
      cache = { at: now, data: await readStats() };
    } catch {
      // No database (JSON fallback mode): say so rather than show made-up zeros.
      return res.status(503).json({ error: "Stats unavailable" });
    }
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json(cache.data);
}

module.exports = { getPublicStats };
