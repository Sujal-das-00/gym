const crypto = require("crypto");
const { todayKey } = require("../utils/date");
const { normalizeMember, normalizePhone, publicMember } = require("../utils/member");
const { saveImageData } = require("./imageService");
const { repo } = require("../models");

function mergeMemberPayload(existing, payload) {
  const source = {
    ...(existing || {}),
    gymId: String(payload.gymId || payload.id || existing?.gymId || existing?.id || "").trim().toUpperCase(),
    name: String(payload.name || existing?.name || "").trim(),
    phone: normalizePhone(payload.phone ?? existing?.phone),
    address: String(payload.address ?? existing?.address ?? "").trim(),
    fee: Number(payload.fee ?? existing?.fee ?? 0),
    membershipType: payload.membershipType === "package" ? "package" : existing?.membershipType === "package" ? "package" : "monthly",
    packageMonths: Math.max(1, Math.round(Number(payload.packageMonths ?? existing?.packageMonths ?? 1))),
    startDate: String(payload.startDate || existing?.startDate || todayKey()),
    photo:
      payload.photo && payload.photo !== existing?.photo
        ? saveImageData(payload.photo, "member")
        : String(existing?.photo || payload.photo || ""),
  };

  if (!source.gymId) source.gymId = `GYM${Date.now().toString().slice(-6)}`;
  if (!source.name || !source.phone) {
    const error = new Error("Name and phone are required");
    error.status = 400;
    throw error;
  }

  return normalizeMember(source);
}

async function createMember(payload) {
  const member = mergeMemberPayload(null, payload);
  member.id = crypto.randomUUID();
  return publicMember(await repo().saveMember(member));
}

async function updateMember(id, payload) {
  const existing = await repo().getMemberById(id);
  if (!existing) return null;
  const member = mergeMemberPayload(existing, payload);
  member.id = id;
  return publicMember(await repo().saveMember(member));
}

module.exports = {
  createMember,
  mergeMemberPayload,
  updateMember,
};
