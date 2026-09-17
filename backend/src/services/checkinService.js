const { todayKey } = require("../utils/date");
const { isValidDailyCode } = require("../utils/dailyCode");
const { isMembershipExpired, memberBillingSummary } = require("../utils/billing");
const { publicMember } = require("../utils/member");
const { repo } = require("../models");

async function checkInMember(gymId, identifier, code) {
  // The code is checked before anything else is looked up: without today's code
  // the caller learns nothing, not even whether the number belongs to a member.
  const date = todayKey();
  if (!isValidDailyCode(gymId, code, date)) return { invalidCode: true };

  const member = await repo().findMember(gymId, identifier);
  if (!member) return null;

  const settings = await repo().getSettings(gymId);
  const expired = isMembershipExpired(member, settings);
  if (expired && !settings.allowExpiredCheckin) {
    return {
      denied: true,
      expired: true,
      member: publicMember(member),
      billing: memberBillingSummary(member, settings),
      history: await repo().memberCheckinHistory(member),
    };
  }

  await repo().setMemberAttendance(gymId, member.id, date, true);
  const existing = await repo().findCheckinForDate(member.id, date);
  const freshMember = await repo().getMemberById(gymId, member.id);

  if (existing) {
    return {
      member: publicMember(freshMember),
      billing: memberBillingSummary(freshMember, settings),
      checkin: existing,
      duplicate: true,
      expired,
      revision: await repo().getAttendanceRevision(gymId),
      history: await repo().memberCheckinHistory(member),
    };
  }

  const checkin = await repo().createCheckin(gymId, member, date, expired);
  const updated = await repo().getMemberById(gymId, member.id);
  return {
    member: publicMember(updated),
    billing: memberBillingSummary(updated, settings),
    checkin,
    duplicate: false,
    expired,
    revision: await repo().getAttendanceRevision(gymId),
    history: await repo().memberCheckinHistory(member),
  };
}

async function getMemberHistory(gymId, identifier) {
  const member = await repo().findMember(gymId, identifier);
  if (!member) return null;
  const settings = await repo().getSettings(gymId);
  return {
    member: publicMember(member),
    // Plan/renewal figures for the member app's home screen.
    billing: memberBillingSummary(member, settings),
    history: await repo().memberCheckinHistory(member),
  };
}

module.exports = {
  checkInMember,
  getMemberHistory,
};
