const crypto = require("crypto");
const { todayKey } = require("../utils/date");
const { normalizeMember, normalizePhone, publicMember } = require("../utils/member");
const { saveImageData } = require("./imageService");
const { repo } = require("../models");

async function mergeMemberPayload(existing, payload) {
  const source = {
    ...(existing || {}),
    gymId: String(payload.gymId || payload.id || existing?.gymId || existing?.id || "").trim().toUpperCase(),
    name: String(payload.name || existing?.name || "").trim(),
    phone: normalizePhone(payload.phone ?? existing?.phone),
    address: String(payload.address ?? existing?.address ?? "").trim(),
    fee: Number(payload.fee ?? existing?.fee ?? 0),
    membershipType: payload.membershipType === "package" ? "package" : existing?.membershipType === "package" ? "package" : "monthly",
    packageMonths: Math.max(1, Math.round(Number(payload.packageMonths ?? existing?.packageMonths ?? 1))),
    collectionTiming: ["at-join", "fixed-day"].includes(payload.collectionTiming)
      ? payload.collectionTiming
      : existing?.collectionTiming || "",
    startDate: String(payload.startDate || existing?.startDate || todayKey()),
    photo:
      payload.photo && payload.photo !== existing?.photo
        ? await saveImageData(payload.photo, "member")
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

// Reject a save that would reuse another member's phone number or gym code,
// with a message that names who already has it. The DB unique keys still back
// this up (race safety); this check exists to give a human-readable error.
async function assertUniqueMember(gymId, member) {
  if (member.phone) {
    const byPhone = await repo().findMember(gymId, member.phone);
    if (byPhone && byPhone.id !== member.id) {
      const error = new Error(
        `This mobile number is already registered to ${byPhone.name} (${byPhone.gymId})`,
      );
      error.status = 409;
      throw error;
    }
  }
  const byCode = await repo().findMember(gymId, member.gymId);
  if (byCode && byCode.id !== member.id) {
    const error = new Error(`Gym ID ${member.gymId} is already used by ${byCode.name}`);
    error.status = 409;
    throw error;
  }
}

// The billing period a member's start date falls into (the term they join on).
function firstBillingPeriodKey(member, settings) {
  const start = String(member.startDate || todayKey()).slice(0, 10);
  if (member.membershipType === "package") return start;
  if (settings.billingCycleMode === "month-start") return start.slice(0, 7);
  return start; // 30-days / custom-days cycles are keyed by the exact start date
}

async function createMember(gymId, payload) {
  const settings = await repo().getSettings(gymId);
  const member = await mergeMemberPayload(null, payload);
  member.id = crypto.randomUUID();
  // Snapshot the collection timing on the member so it stays stable if the gym default changes later.
  if (!member.collectionTiming) member.collectionTiming = settings.defaultCollectionTiming;
  await assertUniqueMember(gymId, member);

  const saved = await repo().saveMember(gymId, member);

  // "Collect at join" means the joining term is paid upfront — record that payment so the
  // next due date lands one cycle later instead of showing the join period as already due.
  if (member.collectionTiming === "at-join") {
    const periodKey = firstBillingPeriodKey(member, settings);
    await repo().addPayments(saved, [
      {
        date: member.startDate,
        amount: member.fee,
        month: periodKey.length === 7 ? periodKey : periodKey.slice(0, 7),
        billingMonth: periodKey.length === 7 ? periodKey : "",
        billingPeriod: periodKey,
      },
    ]);
    return publicMember(await repo().getMemberById(gymId, saved.id));
  }

  return publicMember(saved);
}

async function updateMember(gymId, id, payload) {
  const existing = await repo().getMemberById(gymId, id);
  if (!existing) return null;
  const member = await mergeMemberPayload(existing, payload);
  member.id = id;
  await assertUniqueMember(gymId, member);
  return publicMember(await repo().saveMember(gymId, member));
}

module.exports = {
  createMember,
  mergeMemberPayload,
  updateMember,
};
