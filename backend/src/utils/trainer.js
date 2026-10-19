const { nowIso, toDateKey } = require("./date");

// Trainer ids are minted by the admin panel (a UUID, or "trainer-<ms>" on old
// browsers), so they are kept as-is but restricted to a safe shape.
const TRAINER_ID = /^[A-Za-z0-9-]{1,64}$/;

function isTrainerId(value) {
  return TRAINER_ID.test(String(value || ""));
}

function normalizeTrainer(trainer = {}) {
  return {
    id: String(trainer.id || ""),
    name: String(trainer.name || "").trim().slice(0, 160),
    phone: String(trainer.phone || "").trim().slice(0, 30),
    specialty: String(trainer.specialty || "").trim().slice(0, 160),
    shift: String(trainer.shift || "").trim().slice(0, 160),
    status: trainer.status === "inactive" ? "inactive" : "active",
    bio: String(trainer.bio || "").trim(),
    photo: String(trainer.photo || ""),
    attendance: Array.isArray(trainer.attendance) ? [...new Set(trainer.attendance.map(toDateKey))].sort() : [],
    createdAt: String(trainer.createdAt || trainer.created_at || nowIso()),
  };
}

module.exports = {
  isTrainerId,
  normalizeTrainer,
};
