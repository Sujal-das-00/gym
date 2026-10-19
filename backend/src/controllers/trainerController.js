const { repo } = require("../models");
const { isTrainerId, normalizeTrainer } = require("../utils/trainer");
const { saveImageData } = require("../services/imageService");

async function listTrainers(req, res) {
  res.json(await repo().getAllTrainers(req.gymId));
}

// Create-or-update by the id the panel minted, so trainers carried over from the
// old browser-only storage keep their ids (and the members assigned to them).
async function putTrainer(req, res) {
  const id = String(req.params.id || "");
  if (!isTrainerId(id)) return res.status(400).json({ error: "Invalid trainer id" });
  const existing = await repo().getTrainerById(req.gymId, id);
  const trainer = normalizeTrainer({ ...(existing || {}), ...(req.body || {}), id, createdAt: existing?.createdAt || req.body?.createdAt });
  if (!trainer.name) return res.status(400).json({ error: "Trainer name is required" });
  trainer.photo = trainer.photo && trainer.photo !== existing?.photo ? await saveImageData(trainer.photo, "trainer") : existing?.photo || "";
  try {
    return res.json(await repo().saveTrainer(req.gymId, trainer));
  } catch (error) {
    // The id is taken by another gym's trainer.
    if (error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062)) {
      return res.status(409).json({ error: "That trainer id is already in use. Reload and try again." });
    }
    throw error;
  }
}

async function deleteTrainer(req, res) {
  const result = await repo().deleteTrainer(req.gymId, req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Trainer not found" });
  await repo().clearTrainerFromMembers(req.gymId, req.params.id);
  return res.json({ ok: true });
}

module.exports = {
  deleteTrainer,
  listTrainers,
  putTrainer,
};
