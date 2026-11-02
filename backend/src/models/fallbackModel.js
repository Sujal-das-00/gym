const crypto = require("crypto");
const { nowIso, todayKey, toDateKey } = require("../utils/date");
const { normalizeMember, normalizePaymentMode, normalizePhone, publicMember } = require("../utils/member");
const { normalizeSettings } = require("../utils/settings");
const { ADMISSION_PERIOD_KEY } = require("../utils/billing");
const store = require("../services/memoryStore");

// Stored rows keep reversed payments for the record; the member as read
// leaves them out of `payments` (so they pay nothing) and lists every
// transaction with its allocations, like memberModel.hydrateMembers.
function hydrateStored(raw) {
  if (!raw) return publicMember(null);
  const rows = raw.payments || [];
  return publicMember({
    ...raw,
    payments: rows.filter((payment) => !payment.reversedAt),
    transactions: (raw.transactions || []).map((tx) => ({
      ...tx,
      allocations: rows
        .filter((payment) => payment.transactionId === tx.id)
        .map(({ billingPeriod, amount, periodFee, date }) => ({ billingPeriod, amount, periodFee, date })),
    })),
  });
}

function getAllMembers() {
  return store.getState().members.map(hydrateStored).sort((a, b) => a.name.localeCompare(b.name));
}

// Member functions mirror memberModel's (gymId, ...) signatures; the JSON
// fallback is single-tenant, so gymId is accepted and ignored.
function getMemberById(gymId, id) {
  return hydrateStored(store.getState().members.find((member) => member.id === id) || null);
}

function findMember(gymId, identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  const phone = normalizePhone(value);
  const member = store.getState().members.find((item) => {
    return String(item.id || "").toLowerCase() === value || String(item.gymId || "").toLowerCase() === value || (phone && normalizePhone(item.phone) === phone);
  });
  return hydrateStored(member || null);
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
  return hydrateStored(member || null);
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
  if (index >= 0) {
    rows[index] = { ...normalized, payments: rows[index].payments || [], transactions: rows[index].transactions || [] };
  } else {
    rows.push({ ...normalized, transactions: [] });
  }
  store.persist();
  return hydrateStored(rows[index >= 0 ? index : rows.length - 1]);
}

/* ---- Payment transactions (mirror paymentModel / memberModel) ------------ */

const storedMember = (memberId) => store.getState().members.find((item) => item.id === memberId);

// The JSON store has no `conn`: writes land in memory and the caller persists.
function insertTransaction(conn, gymId, memberId, tx, allocations) {
  const target = storedMember(memberId);
  if (!target) throw Object.assign(new Error("Member not found"), { status: 404 });
  const id = tx.id || crypto.randomUUID();
  target.transactions ||= [];
  target.payments ||= [];
  target.transactions.push({
    id,
    amount: Number(tx.amount || 0),
    date: tx.date,
    dateKnown: Boolean(tx.dateKnown),
    mode: normalizePaymentMode(tx.mode),
    reference: String(tx.reference || "").slice(0, 80),
    note: String(tx.note || "").slice(0, 300),
    requestId: tx.requestId || "",
    source: tx.source || "desk",
    status: "active",
    reversedAt: "",
    reversedBy: null,
    reversalReason: "",
    replacesId: tx.replacesId || "",
    replacedById: "",
    enteredBy: tx.enteredBy?.id ? { ...tx.enteredBy } : null,
    createdAt: nowIso(),
  });
  for (const allocation of allocations) {
    const date = allocation.date || tx.date;
    target.payments.push({
      id: crypto.randomUUID(),
      date,
      month: date.slice(0, 7),
      billingMonth: allocation.billingMonth || "",
      billingPeriod: allocation.billingPeriod,
      amount: Number(allocation.amount || 0),
      periodFee: Number(allocation.periodFee ?? allocation.amount ?? 0),
      kind: "membership",
      mode: normalizePaymentMode(tx.mode),
      dateKnown: Boolean(tx.dateKnown),
      transactionId: id,
    });
  }
  return id;
}

function addTransaction(gymId, memberId, tx, allocations) {
  const id = insertTransaction(null, gymId, memberId, tx, allocations);
  store.persist();
  return id;
}

function findTransaction(conn, gymId, memberId, id) {
  return hydrateStored(storedMember(memberId) || null)?.transactions.find((tx) => tx.id === id) || null;
}

function findTransactionByRequest(conn, gymId, requestId) {
  for (const member of store.getState().members) {
    const tx = (member.transactions || []).find((item) => item.requestId === requestId);
    if (tx) return { id: tx.id, memberId: member.id };
  }
  return null;
}

function reverseTransaction(conn, gymId, id, { by, reason, replacedById = null }) {
  for (const member of store.getState().members) {
    const tx = (member.transactions || []).find((item) => item.id === id);
    if (!tx) continue;
    if (tx.status !== "active") return false;
    const now = nowIso();
    Object.assign(tx, {
      status: "reversed",
      reversedAt: now,
      reversedBy: { id: String(by?.id || ""), name: String(by?.name || "") },
      reversalReason: reason,
      replacedById: replacedById || "",
    });
    for (const payment of member.payments || []) if (payment.transactionId === id) payment.reversedAt = now;
    return true;
  }
  return false;
}

function updateTransactionDetails(conn, gymId, tx, changes, by) {
  const target = (store.getState().members.find((member) => (member.transactions || []).some((item) => item.id === tx.id)) || {});
  const stored = (target.transactions || []).find((item) => item.id === tx.id);
  if (!stored) return;
  const state = store.getState();
  state.paymentCorrections ||= [];
  for (const [field, value] of Object.entries(changes)) {
    if (!["mode", "reference", "note"].includes(field)) continue;
    state.paymentCorrections.push({
      id: crypto.randomUUID(),
      transactionId: tx.id,
      field,
      from: String(tx[field] || ""),
      to: String(value || ""),
      changedBy: { id: String(by?.id || ""), name: String(by?.name || ""), role: String(by?.role || "") },
      changedAt: nowIso(),
    });
    stored[field] = value;
  }
  if ("mode" in changes) for (const payment of target.payments || []) if (payment.transactionId === tx.id) payment.mode = changes.mode;
}

function listCorrections(gymId, transactionId) {
  return (store.getState().paymentCorrections || [])
    .filter((item) => item.transactionId === transactionId)
    .map(({ field, from, to, changedBy, changedAt }) => ({ field, from, to, changedBy, changedAt }));
}

// One request at a time touches payments, and a failed one leaves the member's
// payments exactly as they were (the JSON store has no DB transaction).
let paymentQueue = Promise.resolve();
function withMemberLock(gymId, memberId, work) {
  const run = async () => {
    const target = storedMember(memberId);
    if (!target) throw Object.assign(new Error("Member not found"), { status: 404 });
    const state = store.getState();
    const snapshot = JSON.stringify({
      payments: target.payments || [],
      transactions: target.transactions || [],
      corrections: state.paymentCorrections || [],
    });
    try {
      const result = await work(null, getMemberById(gymId, memberId));
      store.persist();
      return result;
    } catch (error) {
      const saved = JSON.parse(snapshot);
      target.payments = saved.payments;
      target.transactions = saved.transactions;
      state.paymentCorrections = saved.corrections;
      throw error;
    }
  };
  const next = paymentQueue.then(run, run);
  paymentQueue = next.catch(() => {});
  return next;
}

// Mirrors memberModel.createMemberWithHistory; everything lands in one persist().
function createMemberWithHistory(gymId, member, payments, enteredBy = null) {
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
    payments: payments
      .filter((payment) => payment.kind === "admission")
      .map((payment) => ({
        id: crypto.randomUUID(),
        date: payment.date,
        month: payment.date.slice(0, 7),
        billingMonth: "",
        billingPeriod: payment.billingPeriod,
        amount: payment.amount,
        periodFee: null,
        kind: "admission",
        mode: normalizePaymentMode(payment.mode),
        dateKnown: Boolean(payment.dateKnown),
      })),
  });
  rows.push({ ...normalized, transactions: [] });
  for (const payment of payments) {
    if (payment.kind === "admission") continue;
    insertTransaction(null, gymId, normalized.id, { ...payment, source: "onboarding", enteredBy }, [payment]);
  }
  store.persist();
  return hydrateStored(rows[rows.length - 1]);
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
  for (const tx of target.transactions || []) {
    if (tx.dateKnown !== false) continue;
    const dates = (target.payments || []).filter((payment) => payment.transactionId === tx.id).map((payment) => payment.date).sort();
    if (dates.length) tx.date = dates[0];
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
  // A new member's row is kept in place too; its date follows the joining date.
  if (recorded && amount > 0) {
    const date = toDateKey(member.startDate || todayKey());
    Object.assign(recorded, {
      amount,
      date,
      month: date.slice(0, 7),
      mode: normalizePaymentMode(member.admissionMode) || recorded.mode,
    });
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
  if (payments.length) {
    insertTransaction(
      null,
      gymId,
      member.id,
      {
        amount: payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount || 0) * 100), 0) / 100,
        date: toDateKey(payments[0].date || todayKey()),
        dateKnown: true,
        mode: payments[0].mode,
        source: "plan_change",
        enteredBy: change.changedBy,
      },
      payments.map((payment) => ({
        billingPeriod: payment.billingPeriod,
        billingMonth: String(payment.billingPeriod).length === 7 ? payment.billingPeriod : "",
        amount: Number(payment.amount || 0),
        periodFee: Number(payment.periodFee ?? payment.amount ?? 0),
      })),
    );
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

module.exports = {
  applyPlanChange,
  attendanceStatusRows,
  createCheckin,
  addTransaction,
  createMemberWithHistory,
  findTransaction,
  findTransactionByRequest,
  insertTransaction,
  listCorrections,
  reverseTransaction,
  updateTransactionDetails,
  withMemberLock,
  deleteExpense,
  clearTrainerFromMembers,
  deleteMember,
  deleteTrainer,
  getAllTrainers,
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
