const crypto = require("crypto");
const { nowIso, todayKey, toDateKey } = require("../utils/date");
const { normalizeMember, normalizePaymentMode, normalizePhone, publicMember } = require("../utils/member");
const { normalizeSettings } = require("../utils/settings");
const { ADMISSION_PERIOD_KEY } = require("../utils/billing");
const { parseTime } = require("../utils/dailyLog");
const store = require("../services/memoryStore");

function getAllMembers() {
  return store.getState().members.map(publicMember).sort((a, b) => a.name.localeCompare(b.name));
}

// Member functions mirror memberModel's (gymId, ...) signatures; the JSON
// fallback is single-tenant, so gymId is accepted and ignored.
function getMemberById(gymId, id) {
  return publicMember(store.getState().members.find((member) => member.id === id) || null);
}

function findMember(gymId, identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  const phone = normalizePhone(value);
  const member = store.getState().members.find((item) => {
    return String(item.id || "").toLowerCase() === value || String(item.gymId || "").toLowerCase() === value || (phone && normalizePhone(item.phone) === phone);
  });
  return publicMember(member || null);
}

// Unlike findMember (OR-match, used by kiosk check-in), login requires BOTH the
// membership code and the phone to match the same member — two factors, not one.
function findMemberByCredentials(gymId, gymCode, phone) {
  const code = String(gymCode || "").trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (!code || !normalizedPhone) return publicMember(null);
  const member = store.getState().members.find((item) => {
    return String(item.gymId || "").toLowerCase() === code && normalizePhone(item.phone) === normalizedPhone;
  });
  return publicMember(member || null);
}

function saveMember(gymId, member) {
  const normalized = normalizeMember(member);
  const rows = store.getState().members;
  const duplicate = rows.find((item) => item.id !== normalized.id && (item.gymId === normalized.gymId || normalizePhone(item.phone) === normalized.phone));
  if (duplicate) {
    const error = new Error("Member with this Gym ID or phone already exists");
    error.status = 409;
    throw error;
  }
  const index = rows.findIndex((item) => item.id === normalized.id);
  // Like the MySQL saveMember, payments are not written here: keep the stored
  // rows, which may have changed (moveMemberStartDate) since `member` was read.
  if (index >= 0) rows[index] = { ...normalized, payments: rows[index].payments || [] };
  else rows.push(normalized);
  store.persist();
  return publicMember(normalized);
}

// Mirrors memberModel.createMemberWithHistory; everything lands in one persist().
function createMemberWithHistory(gymId, member, payments) {
  const rows = store.getState().members;
  if (rows.some((item) => item.gymId === member.gymId || normalizePhone(item.phone) === member.phone)) {
    const error = new Error("Member with this Gym ID or phone already exists");
    error.status = 409;
    throw error;
  }
  const normalized = normalizeMember({
    ...member,
    onboardingType: "existing",
    planStartDate: "",
    payments: payments.map((payment) => ({
      id: crypto.randomUUID(),
      date: payment.date,
      month: payment.date.slice(0, 7),
      billingMonth: payment.billingMonth || "",
      billingPeriod: payment.billingPeriod,
      amount: payment.amount,
      periodFee: payment.kind === "admission" ? null : payment.periodFee,
      kind: payment.kind === "admission" ? "admission" : "membership",
      mode: normalizePaymentMode(payment.mode),
      dateKnown: Boolean(payment.dateKnown),
    })),
  });
  rows.push(normalized);
  store.persist();
  return publicMember(normalized);
}

// Mirrors memberModel.moveMemberStartDate; everything lands in one persist().
function moveMemberStartDate(gymId, memberId, startDate, moves) {
  const target = store.getState().members.find((item) => item.id === memberId);
  if (!target) return;
  target.startDate = startDate;
  for (const payment of target.payments || []) {
    const period = payment.kind === "admission" ? undefined : moves.get(payment.id);
    if (!period) continue;
    payment.billingPeriod = period;
    payment.month = period.slice(0, 7);
    // An unrecorded collection date is filed under the term start, so it moves too.
    if (payment.dateKnown === false) payment.date = period;
  }
  store.persist();
}

// Archives like memberModel.deleteMember: the member (with their payments and
// attendance) moves to archivedMembers instead of being thrown away.
function deleteMember(gymId, id) {
  const state = store.getState();
  const member = state.members.find((item) => item.id === id);
  if (!member) return { affectedRows: 0 };
  state.members = state.members.filter((item) => item.id !== id);
  state.archivedMembers ||= [];
  state.archivedMembers.push({ ...member, archivedAt: nowIso() });
  bumpAttendanceRevision();
  store.persist();
  return { affectedRows: 1 };
}

function clearTrainerFromMembers(gymId, trainerId) {
  const state = store.getState();
  for (const member of [...state.members, ...(state.archivedMembers || [])]) {
    if (member.trainerId === trainerId) member.trainerId = "";
  }
  store.persist();
  return { affectedRows: 1 };
}

// Trainer functions mirror trainerModel's (gymId, ...) signatures.
function getAllTrainers() {
  return [...(store.getState().trainers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function getTrainerById(gymId, id) {
  return (store.getState().trainers || []).find((trainer) => trainer.id === id) || null;
}

function saveTrainer(gymId, trainer) {
  store.getState().trainers ||= [];
  const rows = store.getState().trainers;
  const index = rows.findIndex((item) => item.id === trainer.id);
  if (index >= 0) rows[index] = trainer;
  else rows.push(trainer);
  store.persist();
  return trainer;
}

function deleteTrainer(gymId, id) {
  const rows = store.getState().trainers || [];
  const before = rows.length;
  store.getState().trainers = rows.filter((trainer) => trainer.id !== id);
  store.persist();
  return { affectedRows: before === store.getState().trainers.length ? 0 : 1 };
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

function updatePaymentAmount(member, paymentId, period, amount, periodFee) {
  const target = store.getState().members.find((item) => item.id === member.id);
  if (!target) return;
  for (const payment of target.payments || []) {
    if (payment.id === paymentId) payment.amount = amount;
    if (payment.kind !== "admission" && payment.billingPeriod === period) payment.periodFee = periodFee;
  }
  store.persist();
}

function updateAdmissionAmount(member, paymentId, amount) {
  const target = store.getState().members.find((item) => item.id === member.id);
  const payment = (target?.payments || []).find((item) => item.id === paymentId && item.kind === "admission");
  if (!payment) return;
  payment.amount = amount;
  target.admissionFee = amount;
  store.persist();
}

function updatePaymentDate(member, paymentId, date) {
  const target = store.getState().members.find((item) => item.id === member.id);
  const payment = (target?.payments || []).find((item) => item.id === paymentId);
  if (!payment) return;
  payment.date = date;
  payment.month = date.slice(0, 7);
  payment.dateKnown = true;
  store.persist();
}

function addOtherPayment(member, { id, date, amount, mode, note }) {
  const target = store.getState().members.find((item) => item.id === member.id);
  if (!target) return;
  target.payments ||= [];
  target.payments.push({
    id: id || crypto.randomUUID(),
    date,
    month: date.slice(0, 7),
    billingMonth: "",
    billingPeriod: "other",
    amount,
    periodFee: null,
    kind: "other",
    note,
    mode: normalizePaymentMode(mode),
    dateKnown: true,
  });
  store.persist();
}

function deletePayment(member, paymentId) {
  const target = store.getState().members.find((item) => item.id === member.id);
  if (!target) return;
  target.payments = (target.payments || []).filter((payment) => !(payment.id === paymentId && payment.kind !== "admission"));
  store.persist();
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
      amount: Number(payment.amount ?? member.fee ?? 0),
      periodFee: payment.kind === "admission" ? null : Number(payment.periodFee ?? member.fee ?? 0),
      kind: payment.kind === "admission" ? "admission" : "membership",
      mode: normalizePaymentMode(payment.mode),
    });
  }
  store.persist();
}

// Mirrors paymentModel.syncAdmissionPayment: one admission-fee payment per
// member, always matching members.admissionFee, so an edited or cleared fee
// leaves no stale earning behind.
function syncAdmissionPayment(member) {
  const target = store.getState().members.find((item) => item.id === member.id);
  if (!target) return;
  const amount = Number(member.admissionFee || 0);
  // Mirrors paymentModel.syncRecordedAdmission: an existing member's admission
  // row keeps the date it was really collected on (or "not recorded").
  const recorded = (target.payments || []).find((payment) => payment.kind === "admission");
  if (member.onboardingType === "existing" && recorded && amount > 0) {
    recorded.amount = amount;
    recorded.mode = normalizePaymentMode(member.admissionMode) || recorded.mode;
    store.persist();
    return;
  }
  target.payments = (target.payments || []).filter((payment) => payment.kind !== "admission");
  if (amount > 0) {
    const date = toDateKey(member.startDate || todayKey());
    target.payments.push({
      id: crypto.randomUUID(),
      date,
      month: date.slice(0, 7),
      billingMonth: "",
      billingPeriod: ADMISSION_PERIOD_KEY,
      amount,
      kind: "admission",
      mode: normalizePaymentMode(member.admissionMode),
      // An existing member's fee added after onboarding has no known date.
      dateKnown: member.onboardingType !== "existing",
    });
  }
  store.persist();
}

// Mirrors memberModel.applyPlanChange; everything lands in one persist().
function applyPlanChange(gymId, { member, previous, payments, change }) {
  const state = store.getState();
  const target = state.members.find((item) => item.id === member.id);
  const current = target ? normalizeMember(target) : null;
  if (
    !current ||
    current.membershipType !== previous.membershipType ||
    current.packageMonths !== previous.packageMonths ||
    current.fee !== previous.fee ||
    current.collectionTiming !== (previous.collectionTiming || "") ||
    current.planStartDate !== (previous.planStartDate || "")
  ) {
    const error = new Error("This plan was just changed on another device. Reload and try again.");
    error.status = 409;
    throw error;
  }
  Object.assign(target, {
    membershipType: member.membershipType,
    packageMonths: member.packageMonths,
    fee: member.fee,
    collectionTiming: member.collectionTiming,
    planStartDate: member.planStartDate,
  });
  target.payments ||= [];
  for (const payment of payments) {
    target.payments.push({
      id: crypto.randomUUID(),
      date: toDateKey(payment.date || todayKey()),
      month: String(payment.month),
      billingMonth: String(payment.billingPeriod).length === 7 ? payment.billingPeriod : "",
      billingPeriod: payment.billingPeriod,
      amount: Number(payment.amount || 0),
      periodFee: Number(payment.periodFee ?? payment.amount ?? 0),
      kind: "membership",
      mode: normalizePaymentMode(payment.mode),
    });
  }
  state.planChanges ||= [];
  state.planChanges.push({ ...change, memberId: member.id });
  store.persist();
  return change;
}

function listPlanChanges(gymId, { memberId = "", limit = 2000 } = {}) {
  return (store.getState().planChanges || [])
    .filter((change) => !memberId || change.memberId === memberId)
    .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)))
    .slice(0, Math.max(1, Math.trunc(Number(limit) || 2000)));
}

// Expense functions mirror expenseModel's (gymId, ...) signatures; the JSON
// fallback is single-tenant, so gymId is accepted and ignored.
function getAllExpenses() {
  return [...(store.getState().expenses || [])].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)),
  );
}

function getExpenseById(gymId, id) {
  return (store.getState().expenses || []).find((expense) => expense.id === id) || null;
}

function saveExpense(gymId, expense) {
  store.getState().expenses ||= [];
  const rows = store.getState().expenses;
  const index = rows.findIndex((item) => item.id === expense.id);
  if (index >= 0) rows[index] = expense;
  else rows.push(expense);
  store.persist();
  return expense;
}

function deleteExpense(gymId, id) {
  const rows = store.getState().expenses || [];
  const before = rows.length;
  store.getState().expenses = rows.filter((expense) => expense.id !== id);
  store.persist();
  return { affectedRows: before === store.getState().expenses.length ? 0 : 1 };
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

// JSON mode keeps the activity record in the store like everything else.
function insertActivity(gymId, entry) {
  const state = store.getState();
  state.activity ||= [];
  state.activity.push({ id: crypto.randomUUID(), ...entry, details: entry.details || {} });
  store.persist();
}

function getActivityRecords(gymId, { from, to }) {
  const all = store.getState().activity || [];
  return {
    rows: all
      .filter((row) => row.at >= from && row.at < to)
      .map((row) => ({ ...row, memberId: row.memberId || "", actor: row.actor?.id ? row.actor : null, amount: row.amount ?? null })),
    since: all.length ? Math.min(...all.map((row) => row.at)) : null,
  };
}

// JSON mode keeps no edit or payment times, so its Daily Log shows members
// added and removed, plan changes, trainers and check-ins (dev use only).
function getDailyLogRecords(gymId, { fromDay, toDay }) {
  const state = store.getState();
  const toMember = (member) => ({
    id: member.id,
    name: member.name,
    code: member.gymId,
    createdAt: parseTime(member.createdAt),
    updatedAt: null,
    archivedAt: parseTime(member.archivedAt),
    membershipType: member.membershipType === "package" ? "package" : "monthly",
    packageMonths: Number(member.packageMonths || 1),
    fee: Number(member.fee || 0),
    onboardingType: member.onboardingType,
  });
  const checkins = {};
  for (const member of state.members) {
    for (const day of member.attendance || []) {
      const key = toDateKey(day);
      if (key >= fromDay && key <= toDay) checkins[key] = (checkins[key] || 0) + 1;
    }
  }
  return {
    members: [...state.members, ...(state.archivedMembers || [])].map(toMember),
    planChanges: (state.planChanges || []).map((change) => ({ ...change, at: parseTime(change.changedAt), by: change.changedBy || null })),
    payments: [],
    expenses: [],
    trainers: (state.trainers || []).map((trainer) => ({ id: trainer.id, name: trainer.name, createdAt: parseTime(trainer.createdAt) })),
    checkins,
  };
}

module.exports = {
  addPayments,
  deletePayment,
  addOtherPayment,
  updatePaymentAmount,
  updatePaymentDate,
  updateAdmissionAmount,
  applyPlanChange,
  attendanceStatusRows,
  createCheckin,
  createMemberWithHistory,
  deleteExpense,
  clearTrainerFromMembers,
  deleteMember,
  deleteTrainer,
  getAllTrainers,
  getDailyLogRecords,
  getActivityRecords,
  insertActivity,
  getTrainerById,
  saveTrainer,
  findCheckinForDate,
  findMember,
  findMemberByCredentials,
  getAllExpenses,
  getAllMembers,
  getAttendanceRevision,
  getCheckinsByDate,
  getExpenseById,
  getMemberById,
  getSettings,
  listPlanChanges,
  saveExpense,
  memberCheckinHistory,
  moveMemberStartDate,
  saveMember,
  saveSettings,
  setMemberAttendance,
  syncAdmissionPayment,
};
