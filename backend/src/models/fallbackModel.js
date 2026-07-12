const crypto = require("crypto");
const { nowIso, todayKey, toDateKey } = require("../utils/date");
const { normalizeMember, normalizePhone, publicMember } = require("../utils/member");
const { normalizeSettings } = require("../utils/settings");
const store = require("../services/memoryStore");

function getAllMembers() {
  return store.getState().members.map(publicMember).sort((a, b) => a.name.localeCompare(b.name));
}

function getMemberById(id) {
  return publicMember(store.getState().members.find((member) => member.id === id) || null);
}

function findMember(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  const phone = normalizePhone(value);
  const member = store.getState().members.find((item) => {
    return String(item.id || "").toLowerCase() === value || String(item.gymId || "").toLowerCase() === value || normalizePhone(item.phone) === phone;
  });
  return publicMember(member || null);
}

function saveMember(member) {
  const normalized = normalizeMember(member);
  const rows = store.getState().members;
  const duplicate = rows.find((item) => item.id !== normalized.id && (item.gymId === normalized.gymId || normalizePhone(item.phone) === normalized.phone));
  if (duplicate) {
    const error = new Error("Member with this Gym ID or phone already exists");
    error.status = 409;
    throw error;
  }
  const index = rows.findIndex((item) => item.id === normalized.id);
  if (index >= 0) rows[index] = normalized;
  else rows.push(normalized);
  store.persist();
  return publicMember(normalized);
}

function deleteMember(id) {
  const rows = store.getState().members;
  const before = rows.length;
  store.getState().members = rows.filter((member) => member.id !== id);
  store.getState().checkins = store.getState().checkins.filter((checkin) => checkin.memberId !== id);
  if (store.getState().members.length !== before) bumpAttendanceRevision();
  store.persist();
  return { affectedRows: before === store.getState().members.length ? 0 : 1 };
}

function getSettings() {
  return normalizeSettings(store.getState().settings);
}

function saveSettings(settings) {
  store.getState().settings = normalizeSettings(settings);
  store.persist();
  return getSettings();
}

function getAttendanceRevision() {
  return Number(store.getState().attendanceRevision || 0);
}

function bumpAttendanceRevision() {
  store.getState().attendanceRevision = getAttendanceRevision() + 1;
  store.persist();
}

function setMemberAttendance(memberId, date, present) {
  const member = store.getState().members.find((item) => item.id === memberId);
  if (!member) return;
  const attendance = new Set(member.attendance || []);
  const key = toDateKey(date);
  const before = attendance.has(key);
  if (present) attendance.add(key);
  else attendance.delete(key);
  member.attendance = [...attendance].sort();
  if (before !== attendance.has(key)) bumpAttendanceRevision();
  store.persist();
}

function attendanceStatusRows(date) {
  const key = toDateKey(date);
  return getAllMembers().map((member) => ({ id: member.id, gymId: member.gymId, present: (member.attendance || []).includes(key) }));
}

function addPayments(member, payments = []) {
  const target = store.getState().members.find((item) => item.id === member.id);
  if (!target) return;
  target.payments ||= [];
  for (const payment of payments) {
    const billingPeriod = String(payment.billingPeriod || payment.billingMonth || payment.month || todayKey().slice(0, 7));
    target.payments.push({
      id: payment.id || crypto.randomUUID(),
      date: toDateKey(payment.date || todayKey()),
      month: String(payment.month || todayKey().slice(0, 7)),
      billingMonth: String(payment.billingMonth || (billingPeriod.length === 7 ? billingPeriod : "")),
      billingPeriod,
      amount: Number(payment.amount || member.fee || 0),
    });
  }
  store.persist();
}

function mapCheckin(checkin) {
  return {
    id: checkin.id,
    memberId: checkin.memberId,
    gymId: checkin.gymId,
    memberName: checkin.memberName,
    phone: checkin.phone,
    date: toDateKey(checkin.date),
    time: checkin.time,
    expired: Boolean(checkin.expired),
  };
}

function findCheckinForDate(memberId, date) {
  const key = toDateKey(date);
  const checkin = store.getState().checkins.find((item) => item.memberId === memberId && toDateKey(item.date) === key);
  return checkin ? mapCheckin(checkin) : null;
}

function createCheckin(member, date, expired = false) {
  const checkin = {
    id: crypto.randomUUID(),
    memberId: member.id,
    gymId: member.gymId,
    memberName: member.name,
    phone: member.phone,
    date: toDateKey(date),
    time: nowIso(),
    expired: Boolean(expired),
  };
  store.getState().checkins.push(checkin);
  store.persist();
  return mapCheckin(checkin);
}

function getCheckinsByDate(date) {
  const key = toDateKey(date);
  return store
    .getState()
    .checkins.filter((item) => toDateKey(item.date) === key)
    .map(mapCheckin)
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));
}

function memberCheckinHistory(member, limit = 12) {
  const checkinMap = new Map(store.getState().checkins.filter((item) => item.memberId === member.id).map((item) => [toDateKey(item.date), item]));
  return [...(member.attendance || [])]
    .sort()
    .reverse()
    .slice(0, limit)
    .map((date) => ({
      date,
      time: checkinMap.get(date)?.time || "",
      source: checkinMap.has(date) ? "qr" : "manual",
      expired: Boolean(checkinMap.get(date)?.expired),
    }));
}

module.exports = {
  addPayments,
  attendanceStatusRows,
  createCheckin,
  deleteMember,
  findCheckinForDate,
  findMember,
  getAllMembers,
  getAttendanceRevision,
  getCheckinsByDate,
  getMemberById,
  getSettings,
  memberCheckinHistory,
  saveMember,
  saveSettings,
  setMemberAttendance,
};
