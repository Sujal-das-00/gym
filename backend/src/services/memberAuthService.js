const { authConfig } = require("../config/env");
const { sign } = require("../utils/jwt");
const { createHttpError } = require("../utils/http");
const { memberBillingSummary } = require("../utils/billing");
const { publicMember } = require("../utils/member");
const { repo } = require("../models");

async function login(gym, gymCode, phone, trustDevice) {
  const member = await repo().findMemberByCredentials(gym.id, gymCode, phone);
  // One generic error for both "no such code" and "wrong phone" — never reveal
  // which factor was wrong.
  if (!member) throw createHttpError(401, "Membership ID or mobile number is incorrect");

  const { memberJwtSecret, memberTokenTtlSeconds, memberTokenTtlShortSeconds } = authConfig();
  const ttlSeconds = trustDevice ? memberTokenTtlSeconds : memberTokenTtlShortSeconds;
  const token = sign({ sub: member.id, tenantId: gym.id, slug: gym.slug, member: true }, memberJwtSecret, ttlSeconds);

  const settings = await repo().getSettings(gym.id);
  return {
    token,
    ttlSeconds,
    member: publicMember(member),
    billing: memberBillingSummary(member, settings),
    history: await repo().memberCheckinHistory(member),
  };
}

async function sessionData(gym, memberId) {
  const member = await repo().getMemberById(gym.id, memberId);
  if (!member) return null;
  const settings = await repo().getSettings(gym.id);
  return {
    member: publicMember(member),
    billing: memberBillingSummary(member, settings),
    history: await repo().memberCheckinHistory(member),
  };
}

module.exports = {
  login,
  sessionData,
};
