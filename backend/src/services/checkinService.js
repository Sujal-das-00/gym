const { todayKey } = require("../utils/date");
const { publicMember } = require("../utils/member");
const { repo } = require("../models");

async function checkInMember(identifier) {
  const member = await repo().findMember(identifier);
  if (!member) return null;

  const date = todayKey();
  await repo().setMemberAttendance(member.id, date, true);
  const existing = await repo().findCheckinForDate(member.id, date);
  const freshMember = await repo().getMemberById(member.id);

  if (existing) {
    return {
      member: publicMember(freshMember),
      checkin: existing,
      duplicate: true,
      revision: await repo().getAttendanceRevision(),
      history: await repo().memberCheckinHistory(member),
    };
  }

  const checkin = await repo().createCheckin(member, date);
  return {
    member: publicMember(await repo().getMemberById(member.id)),
    checkin,
    duplicate: false,
    revision: await repo().getAttendanceRevision(),
    history: await repo().memberCheckinHistory(member),
  };
}

async function getMemberHistory(identifier) {
  const member = await repo().findMember(identifier);
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
