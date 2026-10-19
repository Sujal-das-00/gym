const { exec, query } = require("../config/database");
const { normalizeTrainer } = require("../utils/trainer");

// MySQL hands JSON columns back parsed; MariaDB (JSON = LONGTEXT) as a string.
function parseAttendance(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapTrainerRow(row) {
  return normalizeTrainer({
    id: row.id,
    name: row.name,
    phone: row.phone,
    specialty: row.specialty,
    shift: row.shift,
    status: row.status,
    bio: row.bio,
    photo: row.photo,
    attendance: parseAttendance(row.attendance),
    createdAt: row.created_at,
  });
}

async function getAllTrainers(gymId) {
  const rows = await query("SELECT * FROM trainers WHERE tenant_id = ? ORDER BY name", [gymId]);
  return rows.map(mapTrainerRow);
}

async function getTrainerById(gymId, id) {
  const rows = await query("SELECT * FROM trainers WHERE tenant_id = ? AND id = ?", [gymId, id]);
  return rows[0] ? mapTrainerRow(rows[0]) : null;
}

// Trainer ids come from the client, so a plain upsert could overwrite another
// gym's row that happens to share the id. Update only within this tenant, and
// insert only when the id is unused everywhere (the PK rejects it otherwise).
async function saveTrainer(gymId, trainer) {
  const values = [
    trainer.name,
    trainer.phone,
    trainer.specialty,
    trainer.shift,
    trainer.status,
    trainer.bio,
    trainer.photo,
    JSON.stringify(trainer.attendance || []),
  ];
  const updated = await exec(
    `UPDATE trainers SET name = ?, phone = ?, specialty = ?, shift = ?, status = ?, bio = ?, photo = ?, attendance = ?
     WHERE tenant_id = ? AND id = ?`,
    [...values, gymId, trainer.id],
  );
  if (!updated.affectedRows) {
    await exec(
      `INSERT INTO trainers (name, phone, specialty, shift, status, bio, photo, attendance, id, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, trainer.id, gymId, trainer.createdAt],
    );
  }
  return getTrainerById(gymId, trainer.id);
}

async function deleteTrainer(gymId, id) {
  return exec("DELETE FROM trainers WHERE tenant_id = ? AND id = ?", [gymId, id]);
}

module.exports = {
  deleteTrainer,
  getAllTrainers,
  getTrainerById,
  saveTrainer,
};
