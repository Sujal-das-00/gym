const { createHttpError } = require("../utils/http");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const { checkInMember, getMemberHistory } = require("../services/checkinService");

async function resolveGymBySlug(slug) {
  const gym = await gymModel.getGymBySlug(slug);
  if (!gym || gym.status !== "active") throw createHttpError(404, "Gym not found");
  return gym;
}

// Only expose the branding the check-in page needs — never members or settings internals.
async function getPublicSettings(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const settings = await repo().getSettings(gym.id);
  res.json({
    slug: gym.slug,
    gymName: settings.gymName,
    logo: settings.logo,
    theme: settings.theme,
  });
}

async function postPublicCheckin(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const result = await checkInMember(gym.id, req.body?.identifier);
  if (!result) return res.status(404).json({ error: "Member not found" });
  if (result.denied) {
    return res.status(403).json({
      error: "Membership expired — access denied. Please renew at the front desk.",
      expired: true,
      member: result.member,
      history: result.history,
    });
  }
  return res.status(result.duplicate ? 200 : 201).json(result);
}

async function getPublicCheckinHistory(req, res) {
  const gym = await resolveGymBySlug(req.params.slug);
  const result = await getMemberHistory(gym.id, req.query.identifier);
  if (!result) return res.status(404).json({ error: "Member not found" });
  return res.json(result);
}

module.exports = {
  getPublicCheckinHistory,
  getPublicSettings,
  postPublicCheckin,
};
