const { todayKey } = require("../utils/date");
const { isMembershipExpired } = require("../utils/billing");
const { publicMember } = require("../utils/member");
const { repo } = require("../models");

async function checkInMember(gymId, identifier) {
  const member = await repo().findMember(gymId, identifier);
  if (!member) return null;

  const settings = await repo().getSettings(gymId);
  const expired = isMembershipExpired(member, settings);
  if (expired && !settings.allowExpiredCheckin) {
    return {
      denied: true,
      expired: true,
      member: publicMember(member),
      history: await repo().memberCheckinHistory(member),
    };
  }

  const date = todayKey();
  await repo().setMemberAttendance(gymId, member.id, date, true);
  const existing = await repo().findCheckinForDate(member.id, date);
  const freshMember = await repo().getMemberById(gymId, member.id);

  if (existing) {
    return {
      member: publicMember(freshMember),
      checkin: existing,
      duplicate: true,
      expired,
      revision: await repo().getAttendanceRevision(gymId),
      history: await repo().memberCheckinHistory(member),
    };
  }

  const checkin = await repo().createCheckin(gymId, member, date, expired);
  return {
    member: publicMember(await repo().getMemberById(gymId, member.id)),
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
  return {
    member: publicMember(member),
    history: await repo().memberCheckinHistory(member),
  };
}

module.exports = {
  checkInMember,
  getMemberHistory,
};
