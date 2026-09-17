import { TRAINERS_STORAGE_KEY } from "./constants.js";
import { toDateKey } from "./dates.js";

export function normalizeTrainer(trainer = {}) {
  const id = trainer.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "trainer-" + Date.now());
  return {
    id,
    name: String(trainer.name || "").trim(),
    phone: String(trainer.phone || "").trim(),
    specialty: String(trainer.specialty || "").trim(),
    shift: String(trainer.shift || "").trim(),
    status: trainer.status === "inactive" ? "inactive" : "active",
    bio: String(trainer.bio || "").trim(),
    photo: trainer.photo || "",
    attendance: Array.isArray(trainer.attendance) ? [...new Set(trainer.attendance.map(toDateKey))].sort() : [],
    createdAt: trainer.createdAt || new Date().toISOString(),
  };
}

// Trainers live in localStorage only — they were never given a backend table.
export function loadTrainers() {
  try {
    const rows = JSON.parse(localStorage.getItem(TRAINERS_STORAGE_KEY) || "[]");
    return Array.isArray(rows) ? rows.map(normalizeTrainer).filter((trainer) => trainer.name) : [];
  } catch {
    return [];
  }
}

export function persistTrainers(trainers) {
  localStorage.setItem(TRAINERS_STORAGE_KEY, JSON.stringify(trainers));
}
