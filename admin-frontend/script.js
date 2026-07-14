const API_BASE = "";
const TRAINERS_STORAGE_KEY = "gym-admin-trainers-v1";
const AUTH_TOKEN_KEY = "gym-admin-token";

// The session cookie is HttpOnly, but some setups don't deliver it back (opening
// the app on a different host than you logged in on — localhost vs 127.0.0.1 —
// SameSite, or Secure over http). We keep the JWT here too and send it as a
// Bearer header, which the backend accepts as an equivalent to the cookie.
function getToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // localStorage unavailable (private mode) — cookie auth still applies.
  }
}

function clearToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

// Keep in sync with EXPENSE_CATEGORIES in backend/src/utils/expense.js.
const EXPENSE_CATEGORIES = [
  { value: "trainer-payment", label: "Trainer payment" },
  { value: "rent", label: "Rent" },
  { value: "equipment", label: "Equipment" },
  { value: "utilities", label: "Utilities" },
  { value: "maintenance", label: "Maintenance" },
  { value: "miscellaneous", label: "Miscellaneous" },
  { value: "other", label: "Other" },
];

const state = {
  members: [],
  trainers: [],
  expenses: [],
  settings: {
    gymName: "Gym Admin",
    logo: "",
    billingCycleMode: "30-days",
    customBillingDays: 25,
    defaultCollectionTiming: "at-join",
    allowExpiredCheckin: true,
    weeklyHolidays: [0],
    holidayDates: [],
    theme: {
      primary: "#11784a",
      primaryDark: "#073f2d",
      accent: "#4f46e5",
      danger: "#c43d32",
      background: "#f6f8f5",
      panel: "#ffffff",
      text: "#17201b",
    },
  },
  activeFilter: "all",
  search: "",
  editingId: null,
  editingTrainerId: null,
  editingExpenseId: null,
  financeTypeFilter: "all",
  financeCategoryFilter: "all",
  detailId: null,
  stagedPhoto: "",
  stagedTrainerPhoto: "",
  attendanceDate: "",
  attendanceSearch: "",
  activeView: "dashboard",
  selectedHistoryMemberId: "",
  selectedPaymentMemberId: "",
  paymentSearch: "",
  paymentStatusFilter: "all",
  trainerSearch: "",
  trainerStatusFilter: "all",
  trainerAttendanceDate: "",
  collectingMemberId: "",
  selectedBillingPeriods: [],
  historySearch: "",
  historyStatusFilter: "all",
  toastTimer: null,
  checkinConfig: null,
  checkinPollTimer: null,
  attendancePollTimer: null,
  attendanceRevision: -1,
  pollingDate: "",
  knownCheckinIds: new Set(),
  pendingAttendanceRemovalId: "",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseDateKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day);
}

function toDateKey(value) {
  if (!value) return todayKey();
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return localDateKey(value);
  return String(value).slice(0, 10);
}

const els = {
  views: document.querySelectorAll("[data-view-panel]"),
  navLinks: document.querySelectorAll(".nav-link[data-view]"),
  viewTriggers: document.querySelectorAll("[data-view]"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  menuToggle: document.querySelector("#menuToggle"),
  sidebar: document.querySelector("#adminSidebar"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileTitle: document.querySelector("#mobileTitle"),
  mobileAddMember: document.querySelector("#mobileAddMember"),
  sidebarGymName: document.querySelector("#sidebarGymName"),
  headerGymName: document.querySelector("#headerGymName"),
  brandLogo: document.querySelector("#brandLogo"),
  settingsLogoPreview: document.querySelector("#settingsLogoPreview"),
  settingsForm: document.querySelector("#settingsForm"),
  gymNameInput: document.querySelector("#gymNameInput"),
  gymLogoInput: document.querySelector("#gymLogoInput"),
  customBillingDaysInput: document.querySelector("#customBillingDaysInput"),
  billingCycleInputs: document.querySelectorAll("input[name='billingCycleMode']"),
  defaultCollectionTimingInputs: document.querySelectorAll("input[name='defaultCollectionTiming']"),
  allowExpiredCheckinInputs: document.querySelectorAll("input[name='allowExpiredCheckin']"),
  collectionTimingInputs: document.querySelectorAll("input[name='collectionTiming']"),
  weeklyHolidayInputs: document.querySelectorAll("input[name='weeklyHoliday']"),
  holidayDateInput: document.querySelector("#holidayDateInput"),
  addHolidayDate: document.querySelector("#addHolidayDate"),
  holidayDateList: document.querySelector("#holidayDateList"),
  themeInputs: document.querySelectorAll("[data-theme-color]"),
  todayLabel: document.querySelector("#todayLabel"),
  sideAddMember: document.querySelector("#sideAddMember"),
  summaryVisits: document.querySelector("#summaryVisits"),
  summaryRate: document.querySelector("#summaryRate"),
  summaryActive: document.querySelector("#summaryActive"),
  totalMembers: document.querySelector("#totalMembers"),
  overdueMembers: document.querySelector("#overdueMembers"),
  paidMembers: document.querySelector("#paidMembers"),
  todayPresent: document.querySelector("#todayPresent"),
  activeTrainerCount: document.querySelector("#activeTrainerCount"),
  totalTrainerCount: document.querySelector("#totalTrainerCount"),
  monthLabel: document.querySelector("#monthLabel"),
  toast: document.querySelector("#toast"),
  attendanceDate: document.querySelector("#attendanceDate"),
  attendanceSearch: document.querySelector("#attendanceSearch"),
  historySearch: document.querySelector("#historySearch"),
  historyStartDate: document.querySelector("#historyStartDate"),
  historyEndDate: document.querySelector("#historyEndDate"),
  historyStatusFilter: document.querySelector("#historyStatusFilter"),
  exportAttendanceCsv: document.querySelector("#exportAttendanceCsv"),
  historyMemberGrid: document.querySelector("#historyMemberGrid"),
  historyReport: document.querySelector("#historyReport"),
  selectedDatePresent: document.querySelector("#selectedDatePresent"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  attendanceList: document.querySelector("#attendanceList"),
  attendanceHolidayNote: document.querySelector("#attendanceHolidayNote"),
  attendanceHistoryLabel: document.querySelector("#attendanceHistoryLabel"),
  attendanceHistoryList: document.querySelector("#attendanceHistoryList"),
  attendanceEmpty: document.querySelector("#attendanceEmpty"),
  memberList: document.querySelector("#memberList"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  tabs: document.querySelectorAll(".tab"),
  openAddMember: document.querySelector("#openAddMember"),
  emptyAddMember: document.querySelector("#emptyAddMember"),
  openAddTrainer: document.querySelector("#openAddTrainer"),
  emptyAddTrainer: document.querySelector("#emptyAddTrainer"),
  memberDialog: document.querySelector("#memberDialog"),
  detailDialog: document.querySelector("#detailDialog"),
  feeDialog: document.querySelector("#feeDialog"),
  feeCollectionForm: document.querySelector("#feeCollectionForm"),
  feeDialogTitle: document.querySelector("#feeDialogTitle"),
  feeDialogMeta: document.querySelector("#feeDialogMeta"),
  feeSelectedTotal: document.querySelector("#feeSelectedTotal"),
  feeSelectedCount: document.querySelector("#feeSelectedCount"),
  feeMonthList: document.querySelector("#feeMonthList"),
  closeFeeDialog: document.querySelector("#closeFeeDialog"),
  cancelFeeDialog: document.querySelector("#cancelFeeDialog"),
  trainerDialog: document.querySelector("#trainerDialog"),
  trainerForm: document.querySelector("#trainerForm"),
  trainerDialogTitle: document.querySelector("#trainerDialogTitle"),
  closeTrainerDialog: document.querySelector("#closeTrainerDialog"),
  deleteTrainer: document.querySelector("#deleteTrainer"),
  trainerPhotoInput: document.querySelector("#trainerPhotoInput"),
  trainerPhotoPreview: document.querySelector("#trainerPhotoPreview"),
  trainerNameInput: document.querySelector("#trainerNameInput"),
  trainerPhoneInput: document.querySelector("#trainerPhoneInput"),
  trainerSpecialtyInput: document.querySelector("#trainerSpecialtyInput"),
  trainerShiftInput: document.querySelector("#trainerShiftInput"),
  trainerStatusInput: document.querySelector("#trainerStatusInput"),
  trainerBioInput: document.querySelector("#trainerBioInput"),
  trainerSearch: document.querySelector("#trainerSearch"),
  trainerStatusFilter: document.querySelector("#trainerStatusFilter"),
  trainerSummaryTotal: document.querySelector("#trainerSummaryTotal"),
  trainerSummaryActive: document.querySelector("#trainerSummaryActive"),
  trainerSummarySpecialties: document.querySelector("#trainerSummarySpecialties"),
  trainerSummaryPresent: document.querySelector("#trainerSummaryPresent"),
  trainerAttendanceDate: document.querySelector("#trainerAttendanceDate"),
  trainerAttendancePresent: document.querySelector("#trainerAttendancePresent"),
  trainerAttendanceLabel: document.querySelector("#trainerAttendanceLabel"),
  trainerAttendanceList: document.querySelector("#trainerAttendanceList"),
  trainerList: document.querySelector("#trainerList"),
  trainerEmptyState: document.querySelector("#trainerEmptyState"),
  confirmFeeCollection: document.querySelector("#confirmFeeCollection"),
  memberForm: document.querySelector("#memberForm"),
  closeDialog: document.querySelector("#closeDialog"),
  closeDetail: document.querySelector("#closeDetail"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteMember: document.querySelector("#deleteMember"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  gymIdInput: document.querySelector("#gymIdInput"),
  nameInput: document.querySelector("#nameInput"),
  phoneInput: document.querySelector("#phoneInput"),
  addressInput: document.querySelector("#addressInput"),
  feeInput: document.querySelector("#feeInput"),
  membershipTypeInputs: document.querySelectorAll("input[name='membershipType']"),
  packageMonthsField: document.querySelector("#packageMonthsField"),
  packageMonthsInput: document.querySelector("#packageMonthsInput"),
  startDateInput: document.querySelector("#startDateInput"),
  assignedTrainerInput: document.querySelector("#assignedTrainerInput"),
  detailPhoto: document.querySelector("#detailPhoto"),
  detailStatus: document.querySelector("#detailStatus"),
  detailName: document.querySelector("#detailName"),
  detailMeta: document.querySelector("#detailMeta"),
  detailFee: document.querySelector("#detailFee"),
  detailDueDate: document.querySelector("#detailDueDate"),
  detailAttendance: document.querySelector("#detailAttendance"),
  detailLastPayment: document.querySelector("#detailLastPayment"),
  editMember: document.querySelector("#editMember"),
  attendanceCalendar: document.querySelector("#attendanceCalendar"),
  calendarHint: document.querySelector("#calendarHint"),
  paymentHistory: document.querySelector("#paymentHistory"),
  feeCollectionList: document.querySelector("#feeCollectionList"),
  paymentSearch: document.querySelector("#paymentSearch"),
  paymentStartDate: document.querySelector("#paymentStartDate"),
  paymentEndDate: document.querySelector("#paymentEndDate"),
  paymentStatusFilter: document.querySelector("#paymentStatusFilter"),
  paymentCustomerCount: document.querySelector("#paymentCustomerCount"),
  paymentCustomerGrid: document.querySelector("#paymentCustomerGrid"),
  paymentCustomerDetail: document.querySelector("#paymentCustomerDetail"),
  checkinStatus: document.querySelector("#checkinStatus"),
  checkinStatusTitle: document.querySelector("#checkinStatusTitle"),
  checkinStatusHint: document.querySelector("#checkinStatusHint"),
  checkinRetry: document.querySelector("#checkinRetry"),
  checkinQrImage: document.querySelector("#checkinQrImage"),
  checkinUrlText: document.querySelector("#checkinUrlText"),
  copyCheckinUrl: document.querySelector("#copyCheckinUrl"),
  refreshCheckins: document.querySelector("#refreshCheckins"),
  checkinFeed: document.querySelector("#checkinFeed"),
  checkinFeedCount: document.querySelector("#checkinFeedCount"),
  financeCollected: document.querySelector("#financeCollected"),
  financeCollectedCount: document.querySelector("#financeCollectedCount"),
  financeExpenses: document.querySelector("#financeExpenses"),
  financeExpensesCount: document.querySelector("#financeExpensesCount"),
  financeNet: document.querySelector("#financeNet"),
  financeNetHint: document.querySelector("#financeNetHint"),
  financeOverdueAmount: document.querySelector("#financeOverdueAmount"),
  financeOverdueCount: document.querySelector("#financeOverdueCount"),
  financeRangeLabel: document.querySelector("#financeRangeLabel"),
  financeStartDate: document.querySelector("#financeStartDate"),
  financeEndDate: document.querySelector("#financeEndDate"),
  financeTypeFilter: document.querySelector("#financeTypeFilter"),
  financeCategoryFilter: document.querySelector("#financeCategoryFilter"),
  financeLedger: document.querySelector("#financeLedger"),
  financeOverdueLabel: document.querySelector("#financeOverdueLabel"),
  financeOverdueList: document.querySelector("#financeOverdueList"),
  openAddExpense: document.querySelector("#openAddExpense"),
  exportFinanceCsv: document.querySelector("#exportFinanceCsv"),
  expenseDialog: document.querySelector("#expenseDialog"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseDialogTitle: document.querySelector("#expenseDialogTitle"),
  closeExpenseDialog: document.querySelector("#closeExpenseDialog"),
  expenseCategoryInput: document.querySelector("#expenseCategoryInput"),
  expenseAmountInput: document.querySelector("#expenseAmountInput"),
  expenseDateInput: document.querySelector("#expenseDateInput"),
  expenseTitleInput: document.querySelector("#expenseTitleInput"),
  deleteExpense: document.querySelector("#deleteExpense"),
};

function todayKey() {
  return localDateKey();
}

function monthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

function daysBetween(startKey, endKey) {
  const days = [];
  const current = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  while (current <= end) {
    days.push(localDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getWeeklyHolidays() {
  const days = Array.isArray(state.settings.weeklyHolidays) ? state.settings.weeklyHolidays : [];
  return days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function getHolidayDates() {
  const dates = Array.isArray(state.settings.holidayDates) ? state.settings.holidayDates : [];
  return dates.map((date) => String(date || "").slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function isHoliday(dayKey) {
  const key = String(dayKey || "").slice(0, 10);
  if (getHolidayDates().includes(key)) return true;
  const day = parseDateKey(key).getDay();
  return getWeeklyHolidays().includes(day);
}

// Why a date is a holiday, for banners: "" when it isn't one.
function holidayReason(dayKey) {
  const key = String(dayKey || "").slice(0, 10);
  if (getHolidayDates().includes(key)) return "marked as a holiday in Settings";
  const date = parseDateKey(key);
  if (getWeeklyHolidays().includes(date.getDay())) {
    const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(date);
    return `every ${weekday} is a weekly holiday in Settings`;
  }
  return "";
}

function renderHolidaySettings() {
  const weekly = getWeeklyHolidays();
  els.weeklyHolidayInputs.forEach((input) => {
    input.checked = weekly.includes(Number(input.value));
  });
  renderHolidayDateList();
}

function renderHolidayDateList() {
  if (!els.holidayDateList) return;
  const dates = getHolidayDates();
  els.holidayDateList.innerHTML = dates.length
    ? dates
        .map(
          (date) => `
            <span class="holiday-chip">
              ${displayDate(date)}
              <button type="button" class="holiday-chip-remove" data-holiday-date="${date}" aria-label="Remove ${displayDate(date)}">×</button>
            </span>`,
        )
        .join("")
    : `<p class="holiday-empty">No specific holiday dates added.</p>`;
}

function addHolidayDate() {
  const value = String(els.holidayDateInput?.value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    showToast("Pick a valid date first");
    return;
  }
  const dates = new Set(getHolidayDates());
  dates.add(value);
  state.settings.holidayDates = [...dates].sort();
  if (els.holidayDateInput) els.holidayDateInput.value = "";
  renderHolidayDateList();
}

function removeHolidayDate(date) {
  state.settings.holidayDates = getHolidayDates().filter((item) => item !== date);
  renderHolidayDateList();
}

function getDefaultHistoryRange() {
  const now = new Date();
  return {
    start: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function displayDate(value) {
  if (!value) return "Not set";
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function api(path, options = {}) {
  const opts = { credentials: "include", ...options };
  opts.headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  // A super-admin operates on a chosen gym; every other role is locked to their own.
  if (authState.user && authState.user.role === "super_admin" && authState.gymId) {
    opts.headers["x-gym-id"] = authState.gymId;
  }
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error("Your session has expired. Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadMembers() {
  state.members = await api("/api/members");
  migratePaymentMonths();
  ensureMemberGymIds();
  ensureMemberTrainerFields();
}

async function loadExpenses() {
  state.expenses = await api("/api/expenses");
}

function normalizeTrainer(trainer = {}) {
  const id = trainer.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "trainer-" + Date.now());
  return {
    id,
    name: String(trainer.name || "").trim(),
    phone: String(trainer.phone || "").trim(),
    specialty: String(trainer.specialty || "").trim(),
    shift: String(trainer.shift || "").trim(),
    status: trainer.status === "inactive" ? "inactive" : "active",
    bio: String(trainer.bio || "").trim(),
    photo: trainer.photo || "",
    attendance: Array.isArray(trainer.attendance) ? [...new Set(trainer.attendance.map(toDateKey))].sort() : [],
    createdAt: trainer.createdAt || new Date().toISOString(),
  };
}

function loadTrainers() {
  try {
    const rows = JSON.parse(localStorage.getItem(TRAINERS_STORAGE_KEY) || "[]");
    state.trainers = Array.isArray(rows) ? rows.map(normalizeTrainer).filter((trainer) => trainer.name) : [];
  } catch {
    state.trainers = [];
  }
}

function persistTrainers() {
  localStorage.setItem(TRAINERS_STORAGE_KEY, JSON.stringify(state.trainers));
}


function ensureMemberTrainerFields() {
  let changed = false;
  state.members.forEach((member) => {
    if (typeof member.trainerId !== "string") {
      member.trainerId = String(member.trainerId || "");
      changed = true;
    }
  });
  if (changed) persistAllMembers();
}

function getTrainerById(id) {
  return state.trainers.find((trainer) => trainer.id === id) || null;
}

function getTrainerName(id) {
  return getTrainerById(id)?.name || "No trainer assigned";
}

function getAssignedMemberCount(trainerId) {
  return state.members.filter((member) => member.trainerId === trainerId).length;
}

function hasTrainerAttendance(trainer, day) {
  return (trainer.attendance || []).includes(day);
}

function setTrainerAttendanceStatus(trainerId, day, present) {
  const trainer = state.trainers.find((item) => item.id === trainerId);
  if (!trainer || !day) return;
  const attendance = new Set(trainer.attendance || []);
  if (present) attendance.add(day);
  else attendance.delete(day);
  trainer.attendance = [...attendance].sort();
  persistTrainers();
  render();
  showToast(present ? "Trainer marked present" : "Trainer marked absent");
}

function renderTrainerOptions(selectedId = "") {
  if (!els.assignedTrainerInput) return;
  const options = state.trainers
    .slice()
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name))
    .map((trainer) => `<option value="${escapeHtml(trainer.id)}">${escapeHtml(trainer.name)} - ${escapeHtml(trainer.specialty || "Trainer")}${trainer.status === "inactive" ? " (inactive)" : ""}</option>`)
    .join("");
  els.assignedTrainerInput.innerHTML = `<option value="">No trainer assigned</option>${options}`;
  els.assignedTrainerInput.value = selectedId || "";
}

function migratePaymentMonths() {
  let changed = false;
  state.members.forEach((member) => {
    const billingPeriods = getBillingPeriodKeys(member);
    (member.payments || []).forEach((payment, index) => {
      if (!payment.billingPeriod) {
        payment.billingPeriod = payment.billingMonth || billingPeriods[index] || payment.month || monthKey();
        changed = true;
      }
    });
  });
  if (changed) persistAllMembers();
}

async function persistAllMembers() {
  await Promise.all(state.members.map((member) => saveMemberRecord(member)));
}

async function loadSettings() {
  state.settings = { ...state.settings, ...(await api("/api/settings")) };
}

async function saveMemberRecord(member) {
  const path = member.id ? "/api/members/" + encodeURIComponent(member.id) : "/api/members";
  const method = member.id ? "PUT" : "POST";
  return api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(member),
  });
}

async function saveSettingsRecord() {
  state.settings = await api("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.settings),
  });
}

function generateGymId() {
  const existing = new Set(state.members.map((member) => member.gymId || member.id).filter(Boolean));
  let next = state.members.length + 1001;
  let id = "GYM" + next;
  while (existing.has(id)) {
    next += 1;
    id = "GYM" + next;
  }
  return id;
}

function ensureMemberGymIds() {
  let changed = false;
  state.members.forEach((member) => {
    if (!member.gymId) {
      member.gymId = member.id?.startsWith("GYM") ? member.id : generateGymId();
      changed = true;
    }
  });
  if (changed) persistAllMembers();
}

// Canonical phone form — digits only without the +91/91/0 prefixes, so every
// way of writing the same number compares equal.
// Keep in sync with normalizePhone in backend/src/utils/member.js.
function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    const rest = digits.slice(2).replace(/^0+/, "");
    if (rest.length === 10) digits = rest;
  }
  return digits;
}

function findLocalMemberByQr(row) {
  const rowId = String(row.memberId || row.gymId || "").toLowerCase();
  const rowPhone = normalizePhone(row.phone);
  return state.members.find((member) => {
    return (
      String(member.id || "").toLowerCase() === rowId ||
      String(member.gymId || "").toLowerCase() === rowId ||
      normalizePhone(member.phone) === rowPhone
    );
  });
}

async function fetchCheckins(date) {
  return api("/api/checkins?date=" + encodeURIComponent(date));
}

function applyAttendanceStatus(rows) {
  let changed = false;
  const date = state.pollingDate || state.attendanceDate || todayKey();
  rows.forEach((row) => {
    const member = state.members.find((item) => item.id === row.id || item.gymId === row.gymId);
    if (!member) return;
    const attendance = new Set(member.attendance || []);
    const hadDate = attendance.has(date);
    if (row.present) attendance.add(date);
    else attendance.delete(date);
    if (hadDate !== attendance.has(date)) {
      member.attendance = [...attendance].sort();
      changed = true;
    }
  });
  if (changed) render();
  return changed;
}

async function refreshAttendanceStatus(force = false) {
  const date = state.attendanceDate || todayKey();
  if (state.pollingDate !== date) {
    state.pollingDate = date;
    state.attendanceRevision = -1;
  }
  const since = force ? -1 : state.attendanceRevision;
  const data = await api("/api/attendance/status?date=" + encodeURIComponent(date) + "&since=" + encodeURIComponent(since));
  state.attendanceRevision = data.revision;
  if (data.active && Array.isArray(data.rows)) applyAttendanceStatus(data.rows);
  return data;
}

async function refreshCheckinView() {
  try {
    await refreshAttendanceStatus();
    const rows = await fetchCheckins(todayKey());
    setCheckinStatus("online");
    renderCheckinFeed(rows);
  } catch {
    setCheckinStatus("offline");
  }
}

const CHECKIN_STATUS_COPY = {
  checking: ["Checking check-in server...", "Looking for the shared backend service."],
  online: ["Check-in server is running", "Members can scan the QR to check in. Attendance updates automatically."],
  offline: [
    "Check-in server is offline",
    "Start it with: npm start - then press Retry.",
  ],
};

function setCheckinStatus(stateName) {
  if (!els.checkinStatus) return;
  els.checkinStatus.dataset.state = stateName;
  const [title, hint] = CHECKIN_STATUS_COPY[stateName] || CHECKIN_STATUS_COPY.checking;
  els.checkinStatusTitle.textContent = title;
  els.checkinStatusHint.textContent = hint;
}

async function loadCheckinConfig() {
  try {
    state.checkinConfig = await api("/api/config");
    setCheckinStatus("online");
  } catch {
    setCheckinStatus("offline");
    return;
  }
  const checkinUrl = state.checkinConfig.checkinUrl || state.checkinConfig.localUrl + "/checkin";
  els.checkinUrlText.textContent = checkinUrl;
  // v=2 busts browser caches holding the old (unscannable) QR rendering.
  const qrSrc = "/api/qr?v=2&url=" + encodeURIComponent(checkinUrl);
  if (els.checkinQrImage.getAttribute("src") !== qrSrc) {
    els.checkinQrImage.src = qrSrc;
  }
}

function timeText(iso) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function renderCheckinFeed(rows) {
  if (!els.checkinFeed) return;
  els.checkinFeedCount.textContent = rows.length + " check-in" + (rows.length === 1 ? "" : "s");
  if (!rows.length) {
    els.checkinFeed.innerHTML = '<p class="history-empty">No check-ins yet today. Scanned entries will show up here.</p>';
    return;
  }
  els.checkinFeed.innerHTML = rows
    .map((row) => {
      const member = findLocalMemberByQr(row);
      const known = Boolean(member);
      const name = member?.name || row.memberName || "Unknown member";
      const isNew = !state.knownCheckinIds.has(row.id);
      return [
        '<div class="checkin-feed-row ' + (isNew ? 'is-new' : '') + '">',
        '<div class="feed-avatar ' + (known ? '' : 'unknown') + '">' + escapeHtml(getInitials(name)) + '</div>',
        '<div><strong>' + escapeHtml(name) + '</strong>',
        '<span>' + escapeHtml(row.gymId || row.memberId || '') + (known ? '' : ' · not in dashboard') + '</span></div>',
        '<time>' + escapeHtml(timeText(row.time)) + '</time>',
        '</div>',
      ].join('');
    })
    .join("");
  rows.forEach((row) => state.knownCheckinIds.add(row.id));
}

function startCheckinPolling() {
  stopCheckinPolling();
  if (!state.checkinConfig) loadCheckinConfig();
  refreshCheckinView();
  state.checkinPollTimer = window.setInterval(refreshCheckinView, 5000);
}

function stopCheckinPolling() {
  if (state.checkinPollTimer) {
    window.clearInterval(state.checkinPollTimer);
    state.checkinPollTimer = null;
  }
}

function startAttendancePolling() {
  stopAttendancePolling();
  refreshAttendanceStatus(true).catch(() => showToast("Attendance sync failed"));
  state.attendancePollTimer = window.setInterval(() => refreshAttendanceStatus().catch(() => {}), 5000);
}

function stopAttendancePolling() {
  if (state.attendancePollTimer) {
    window.clearInterval(state.attendancePollTimer);
    state.attendancePollTimer = null;
  }
}

function getInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function addMonths(date, months) {
  const copy = new Date(date);
  const originalDate = copy.getDate();
  copy.setMonth(copy.getMonth() + months);
  if (copy.getDate() < originalDate) copy.setDate(0);
  return copy;
}

function monthLabelFromKey(key) {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(parseDateKey(key + "-01"));
}


function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

function normalizeTheme(theme = {}) {
  const defaults = state.settings.theme || {};
  return {
    primary: isHexColor(theme.primary) ? theme.primary : defaults.primary || "#11784a",
    primaryDark: isHexColor(theme.primaryDark) ? theme.primaryDark : defaults.primaryDark || "#073f2d",
    accent: isHexColor(theme.accent) ? theme.accent : defaults.accent || "#4f46e5",
    danger: isHexColor(theme.danger) ? theme.danger : defaults.danger || "#c43d32",
    background: isHexColor(theme.background) ? theme.background : defaults.background || "#f6f8f5",
    panel: isHexColor(theme.panel) ? theme.panel : defaults.panel || "#ffffff",
    text: isHexColor(theme.text) ? theme.text : defaults.text || "#17201b",
  };
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mixHex(hex, mix = "#ffffff", amount = 0.88) {
  const base = hexToRgb(hex);
  const target = hexToRgb(mix);
  const channel = (key) => Math.round(base[key] * (1 - amount) + target[key] * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

function applyTheme() {
  const theme = normalizeTheme(state.settings.theme);
  state.settings.theme = theme;
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--ink", theme.text);
  root.style.setProperty("--green", theme.primary);
  root.style.setProperty("--green-dark", theme.primaryDark);
  root.style.setProperty("--green-deep", mixHex(theme.primaryDark, "#000000", 0.28));
  root.style.setProperty("--green-soft", mixHex(theme.primary));
  root.style.setProperty("--blue", theme.accent);
  root.style.setProperty("--blue-soft", mixHex(theme.accent));
  root.style.setProperty("--red", theme.danger);
  root.style.setProperty("--red-soft", mixHex(theme.danger));
  els.themeInputs.forEach((input) => {
    input.value = theme[input.dataset.themeColor] || input.value;
  });
}


function getBillingCycleMode() {
  const mode = state.settings.billingCycleMode || "month-start";
  return ["month-start", "30-days", "custom-days"].includes(mode) ? mode : "month-start";
}

function getBillingCycleDays() {
  if (getBillingCycleMode() === "30-days") return 30;
  const days = Number(state.settings.customBillingDays || 25);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 25;
}

function getDefaultCollectionTiming() {
  const mode = state.settings.defaultCollectionTiming || "at-join";
  return mode === "fixed-day" ? "fixed-day" : "at-join";
}

function getCollectionTiming(member) {
  const mode = member?.collectionTiming || getDefaultCollectionTiming();
  return mode === "fixed-day" ? "fixed-day" : "at-join";
}


function getMembershipType(member) {
  return member?.membershipType === "package" ? "package" : "monthly";
}

function getPackageMonths(member) {
  const months = Number(member?.packageMonths || 1);
  return Number.isFinite(months) && months > 0 ? Math.round(months) : 1;
}

function getMembershipLabel(member) {
  if (getMembershipType(member) === "package") {
    const months = getPackageMonths(member);
    return `${months}-month package`;
  }
  return "Monthly membership";
}

function getBillingAmountLabel(member) {
  return getMembershipType(member) === "package" ? "Package fee" : "Monthly fee";
}

function getPeriodUnitLabel(member) {
  return getMembershipType(member) === "package" ? "package" : "month";
}

function formatBillingPeriodRange(startKey, months) {
  const start = parseDateKey(startKey);
  if (Number.isNaN(start.getTime())) return displayDate(startKey);
  const end = addMonths(start, months);
  end.setDate(end.getDate() - 1);
  return `${displayDate(startKey)} to ${displayDate(localDateKey(end))}`;
}


function getBillingPeriodLabel(periodKey, member = null) {
  if (member && getMembershipType(member) === "package") {
    return formatBillingPeriodRange(periodKey, getPackageMonths(member));
  }
  // "Collect after the period" bills fall due at the END of each period, so name
  // them by that due date — join 10 Jul on a 10-day cycle → first bill "20 Jul",
  // not "10 Jul" (the period's start), which reads as billing from the join day.
  if (member && getCollectionTiming(member) === "fixed-day") {
    return displayDate(localDateKey(periodEndDate(member, periodKey)));
  }
  if (String(periodKey || "").length === 7) return monthLabelFromKey(periodKey);
  return displayDate(periodKey);
}

function getBillingPeriodKeys(member) {
  if (!member?.startDate) return [];
  const start = parseDateKey(member.startDate);
  if (Number.isNaN(start.getTime())) return [];
  const today = parseDateKey(todayKey());
  const periods = [];

  if (getMembershipType(member) === "package") {
    const cursor = new Date(start);
    const packageMonths = getPackageMonths(member);
    while (cursor <= today) {
      periods.push(localDateKey(cursor));
      const next = addMonths(cursor, packageMonths);
      cursor.setTime(next.getTime());
    }
    return periods;
  }

  if (getBillingCycleMode() === "month-start") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= end) {
      periods.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return periods;
  }

  const cycleDays = getBillingCycleDays();
  const cursor = new Date(start);
  while (cursor <= today) {
    periods.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + cycleDays);
  }
  return periods;
}

function getPaymentPeriodKey(payment) {
  return payment.billingPeriod || payment.billingMonth || payment.month;
}

function getPaidPeriodSet(member) {
  return new Set((member.payments || []).map(getPaymentPeriodKey).filter(Boolean));
}

// Periods the member can actually be billed for right now. "Collect at join"
// members pay in advance, so a period is billable from the day it starts (join
// 1 Jul on a 20-day cycle → 3 payable cycles by day 40). "Collect after the
// period" members train first and pay at the end, so a period only becomes
// billable once it has fully ended (same member → 2 payable cycles by day 40;
// the in-progress third cycle is not owed yet).
function getBillablePeriodKeys(member) {
  const periods = getBillingPeriodKeys(member);
  if (getCollectionTiming(member) !== "fixed-day") return periods;
  const today = todayKey();
  return periods.filter((period) => localDateKey(periodEndDate(member, period)) <= today);
}

function getUnpaidPeriods(member) {
  const paidPeriods = getPaidPeriodSet(member);
  return getBillablePeriodKeys(member).filter((period) => !paidPeriods.has(period));
}

function periodStartDate(periodKey) {
  const key = String(periodKey || "");
  return parseDateKey(key.length === 7 ? key + "-01" : key);
}

// The date a period rolls over into the next one (its renewal / end-of-term date).
function periodEndDate(member, periodKey) {
  const start = periodStartDate(periodKey);
  if (Number.isNaN(start.getTime())) return start;
  if (getMembershipType(member) === "package") return addMonths(start, getPackageMonths(member));
  if (getBillingCycleMode() === "month-start") return addMonths(start, 1);
  const end = new Date(start);
  end.setDate(end.getDate() + getBillingCycleDays());
  return end;
}

// Date after the last generated period — i.e. when the next, not-yet-started period begins.
function nextPeriodStartDate(member) {
  const start = parseDateKey(member.startDate);
  const count = getBillingPeriodKeys(member).length;
  if (getMembershipType(member) === "package") {
    return addMonths(start, count * getPackageMonths(member));
  }
  if (getBillingCycleMode() === "month-start") {
    return addMonths(new Date(start.getFullYear(), start.getMonth(), 1), count);
  }
  const next = new Date(start);
  next.setDate(next.getDate() + count * getBillingCycleDays());
  return next;
}

function getDueDate(member) {
  const unpaid = getUnpaidPeriods(member);
  if (getCollectionTiming(member) === "fixed-day") {
    // Payment is collected after the period, so it falls due when the period ends.
    if (unpaid.length) return periodEndDate(member, unpaid[0]);
    const periods = getBillingPeriodKeys(member);
    const last = periods[periods.length - 1];
    return last ? periodEndDate(member, last) : nextPeriodStartDate(member);
  }
  // at-join: payment is due at the start of each period.
  if (unpaid.length) return periodStartDate(unpaid[0]);
  return nextPeriodStartDate(member);
}

function getDueDateKey(member) {
  return localDateKey(getDueDate(member));
}

function isPaidThisPeriod(member) {
  // For "collect after the period" members the latest billable period is the
  // last one that has ended — the in-progress one is not owed yet.
  const periods = getBillablePeriodKeys(member);
  const currentPeriod = periods[periods.length - 1];
  return Boolean(currentPeriod && getPaidPeriodSet(member).has(currentPeriod));
}

// Unpaid periods that are already due (past their collection point) — the ones
// that make a member count as overdue and add up to the amount they owe.
function getDueUnpaidPeriods(member) {
  const unpaid = getUnpaidPeriods(member);
  if (getCollectionTiming(member) === "fixed-day") {
    // Only overdue once a period has fully ended without payment; the in-progress period is not yet due.
    const today = todayKey();
    return unpaid.filter((period) => localDateKey(periodEndDate(member, period)) < today);
  }
  return unpaid.filter((period) => period < todayKey() || (period.length === 7 && period < monthKey()));
}

function getOverdueAmount(member) {
  return getDueUnpaidPeriods(member).length * Number(member.fee || 0);
}

function isOverdue(member) {
  return getDueUnpaidPeriods(member).length > 0;
}

function isPresentToday(member) {
  return (member.attendance || []).includes(todayKey());
}

function getMonthlyAttendance(member) {
  const currentMonth = monthKey();
  return (member.attendance || []).filter((day) => day.startsWith(currentMonth)).length;
}

function photoMarkup(member, className = "member-photo") {
  if (member.photo) {
    return `<img class="${className}" src="${member.photo}" alt="${member.name} photo">`;
  }
  return `<div class="avatar-fallback" aria-hidden="true">${getInitials(member.name)}</div>`;
}

const VIEW_COPY = {
  dashboard: ["Welcome back, Admin!", "Here is what is happening at your gym today."],
  attendance: ["Mark Attendance", "Select a date and update daily member attendance."],
  checkin: ["QR Check-in", "Members scan the desk QR to mark their own attendance."],
  history: ["Attendance History", "Review attendance records for any selected date."],
  members: ["Members", "Search, edit, and manage all registered members."],
  payments: ["Payment History", "Review customer-wise payment records."],
  expenses: ["Expense Tracker", "Track every expense and earning of the gym in one ledger."],
  trainers: ["Trainers", "Manage trainer profiles, specialties, shifts, and contact details."],
  settings: ["Settings", "Update your gym profile and logo."],
};

function openDrawer() {
  document.body.classList.add("nav-open");
  if (els.menuToggle) els.menuToggle.setAttribute("aria-expanded", "true");
  if (els.sidebarScrim) els.sidebarScrim.hidden = false;
}

function closeDrawer() {
  document.body.classList.remove("nav-open");
  if (els.menuToggle) els.menuToggle.setAttribute("aria-expanded", "false");
  if (els.sidebarScrim) els.sidebarScrim.hidden = true;
}

function toggleDrawer() {
  if (document.body.classList.contains("nav-open")) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function setView(view) {
  state.activeView = VIEW_COPY[view] ? view : "dashboard";
  els.views.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === state.activeView));
  els.navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === state.activeView));
  const [title, subtitle] = VIEW_COPY[state.activeView];
  els.pageTitle.textContent = title;
  const navLabel = els.navLinks && [...els.navLinks].find((link) => link.dataset.view === state.activeView);
  const shortTitle = navLabel && navLabel.lastChild ? navLabel.lastChild.textContent.trim() : title;
  if (els.mobileTitle) els.mobileTitle.textContent = shortTitle || title;
  closeDrawer();
  if (state.activeView === "dashboard") {
    els.pageSubtitle.innerHTML = `Here is what is happening at <span id="headerGymName">${escapeHtml(state.settings.gymName || "your gym")}</span> today.`;
    els.headerGymName = document.querySelector("#headerGymName");
    renderBrand();
  } else {
    els.pageSubtitle.textContent = subtitle;
  }

  if (state.activeView === "checkin") {
    stopAttendancePolling();
    startCheckinPolling();
  } else if (state.activeView === "attendance") {
    stopCheckinPolling();
    startAttendancePolling();
  } else {
    stopCheckinPolling();
    stopAttendancePolling();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderBrand() {
  applyTheme();
  const name = state.settings.gymName || "Gym Admin";
  const initials = getInitials(name) || "GA";
  els.sidebarGymName.textContent = name;
  if (els.headerGymName) els.headerGymName.textContent = name;
  els.gymNameInput.value = name;
  els.billingCycleInputs.forEach((input) => {
    input.checked = input.value === getBillingCycleMode();
  });
  if (els.customBillingDaysInput) {
    els.customBillingDaysInput.value = String(getBillingCycleDays());
    els.customBillingDaysInput.disabled = getBillingCycleMode() !== "custom-days";
  }
  els.defaultCollectionTimingInputs.forEach((input) => {
    input.checked = input.value === getDefaultCollectionTiming();
  });
  els.allowExpiredCheckinInputs.forEach((input) => {
    input.checked = input.value === (state.settings.allowExpiredCheckin === false ? "deny" : "allow");
  });
  renderHolidaySettings();

  [els.brandLogo, els.settingsLogoPreview].forEach((node) => {
    if (!node) return;
    if (state.settings.logo) {
      node.innerHTML = `<img src="${state.settings.logo}" alt="${escapeHtml(name)} logo">`;
    } else {
      node.textContent = initials;
    }
  });

  els.todayLabel.textContent = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function renderStats() {
  const total = state.members.length;
  const overdue = state.members.filter(isOverdue).length;
  const paid = state.members.filter(isPaidThisPeriod).length;
  const present = state.members.filter(isPresentToday).length;
  const activeTrainers = state.trainers.filter((trainer) => trainer.status !== "inactive").length;
  const trainerPresent = state.trainers.filter((trainer) => hasTrainerAttendance(trainer, todayKey())).length;

  els.totalMembers.textContent = total;
  els.overdueMembers.textContent = overdue;
  els.paidMembers.textContent = paid;
  els.todayPresent.textContent = present;
  if (els.activeTrainerCount) els.activeTrainerCount.textContent = activeTrainers;
  if (els.totalTrainerCount) els.totalTrainerCount.textContent = state.trainers.length + " total trainer" + (state.trainers.length === 1 ? "" : "s");
  if (els.trainerSummaryPresent) els.trainerSummaryPresent.textContent = trainerPresent;
  els.monthLabel.textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const visits = state.members.reduce((count, member) => count + getMonthlyAttendance(member), 0);
  els.summaryVisits.textContent = visits;
  els.summaryActive.textContent = total;
  els.summaryRate.textContent = total ? `${Math.round((present / total) * 100)}%` : "0%";
}

function matchesFilter(member) {
  if (state.activeFilter === "overdue") return isOverdue(member);
  if (state.activeFilter === "paid") return isPaidThisPeriod(member);
  if (state.activeFilter === "present") return isPresentToday(member);
  return true;
}

function matchesSearch(member) {
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return [member.name, member.phone, member.address].some((value) =>
    String(value || "").toLowerCase().includes(query),
  );
}

function getVisibleMembers() {
  return state.members
    .filter((member) => matchesFilter(member) && matchesSearch(member))
    .sort((a, b) => {
      if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function showToast(message) {
  if (!els.toast) return;
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

// Lock a button while its request is in flight: shows a spinner and blocks
// repeat taps until the request settles.
function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}

function hasAttendance(member, day) {
  return (member.attendance || []).includes(day);
}

async function setMemberAttendanceStatus(memberId, day, present) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member || !day) return;
  const wasPresent = hasAttendance(member, day);
  if (wasPresent === present) {
    state.pendingAttendanceRemovalId = "";
    renderAttendanceSheet();
    return;
  }
  const attendance = new Set(member.attendance || []);
  if (present) attendance.add(day);
  else attendance.delete(day);
  member.attendance = [...attendance].sort();
  state.pendingAttendanceRemovalId = "";
  render();
  try {
    const result = await api("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, date: day, present }),
    });
    state.attendanceRevision = result.revision;
    showToast(present ? "Checked in " + member.name : "Attendance removed for " + member.name);
  } catch (error) {
    if (wasPresent) attendance.add(day);
    else attendance.delete(day);
    member.attendance = [...attendance].sort();
    render();
    showToast(error.message);
  }
}

function openFeeDialog(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  const unpaidPeriods = getUnpaidPeriods(member);
  state.collectingMemberId = member.id;
  const currentPeriod = getBillablePeriodKeys(member).at(-1);
  state.selectedBillingPeriods = currentPeriod && unpaidPeriods.includes(currentPeriod) ? [currentPeriod] : unpaidPeriods.slice(0, 1);
  if (!state.selectedBillingPeriods.length && unpaidPeriods.length) state.selectedBillingPeriods = [unpaidPeriods[0]];
  renderFeeDialog();
  els.feeDialog.showModal();
}

function closeFeeDialog() {
  els.feeDialog.close();
  state.collectingMemberId = "";
  state.selectedBillingPeriods = [];
}

function renderFeeDialog() {
  const member = state.members.find((item) => item.id === state.collectingMemberId);
  if (!member) return;
  const unpaidPeriods = getUnpaidPeriods(member);
  const selected = new Set(state.selectedBillingPeriods);
  const total = state.selectedBillingPeriods.length * Number(member.fee || 0);
  const periodUnit = getPeriodUnitLabel(member);
  els.feeDialogTitle.textContent = `Collect fee from ${member.name}`;
  els.feeDialogMeta.textContent = unpaidPeriods.length
    ? `${unpaidPeriods.length} unpaid ${periodUnit}${unpaidPeriods.length === 1 ? "" : "s"}`
    : `No pending ${periodUnit}s`;
  els.feeSelectedTotal.textContent = currency(total);
  els.feeSelectedCount.textContent = `${state.selectedBillingPeriods.length} ${periodUnit}${state.selectedBillingPeriods.length === 1 ? "" : "s"} selected`;
  els.confirmFeeCollection.disabled = state.selectedBillingPeriods.length === 0;
  els.feeMonthList.innerHTML = unpaidPeriods.length
    ? unpaidPeriods
        .map(
          (month) => `
            <label class="fee-month-option">
              <input type="checkbox" value="${month}" ${selected.has(month) ? "checked" : ""} />
              <span>${getBillingPeriodLabel(month, member)}</span>
              <strong>${currency(member.fee)}</strong>
            </label>
          `,
        )
        .join("")
    : `<p class="history-empty">All dues are collected up to the current billing cycle.</p>`;
}

async function collectSelectedFees(event) {
  event.preventDefault();
  const member = state.members.find((item) => item.id === state.collectingMemberId);
  if (!member || !state.selectedBillingPeriods.length) return;
  const labels = state.selectedBillingPeriods.map((period) => getBillingPeriodLabel(period, member)).join(", ");
  const total = currency(state.selectedBillingPeriods.length * Number(member.fee || 0));
  const ok = confirm("Collect " + total + " from " + member.name + " for " + labels + "?");
  if (!ok) return;
  const payments = state.selectedBillingPeriods.map((billingPeriod) => ({
    id: crypto.randomUUID(),
    date: todayKey(),
    month: monthKey(),
    billingMonth: String(billingPeriod).length === 7 ? billingPeriod : "",
    billingPeriod,
    amount: Number(member.fee),
  }));
  const collectedCount = payments.length;
  if (els.confirmFeeCollection?.disabled) return;
  setButtonBusy(els.confirmFeeCollection, true);
  try {
    const saved = await api("/api/members/" + encodeURIComponent(member.id) + "/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments }),
    });
    state.members = state.members.map((item) => (item.id === saved.id ? saved : item));
    state.selectedPaymentMemberId = saved.id;
    closeFeeDialog();
    render();
    showToast("Collected " + collectedCount + " " + getPeriodUnitLabel(member) + (collectedCount === 1 ? "" : "s") + " from " + saved.name);
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(els.confirmFeeCollection, false);
  }
}

function renderFees() {
  if (!els.feeCollectionList) return;
  const rows = state.members
    .slice()
    .sort((a, b) => Number(isPaidThisPeriod(a)) - Number(isPaidThisPeriod(b)) || Number(isOverdue(b)) - Number(isOverdue(a)) || a.name.localeCompare(b.name));

  els.feeCollectionList.innerHTML = rows.length
    ? rows
        .map((member) => {
          const paid = isPaidThisPeriod(member);
          const overdue = isOverdue(member);
          const unpaidPeriods = getUnpaidPeriods(member);
          const status = paid ? "Paid" : overdue ? "Overdue" : "Pending";
          const statusClass = paid ? "paid" : overdue ? "overdue" : "pending";
          return `
            <article class="billing-card ${paid ? "is-paid" : ""}">
              <div class="billing-card-head">
                ${photoMarkup(member)}
                <div>
                  <h3>${escapeHtml(member.name)}</h3>
                  <p>${escapeHtml(member.phone)} · ${escapeHtml(member.gymId || member.id || "")}</p>
                </div>
                <span class="badge ${statusClass}">${status}</span>
              </div>
              <div class="billing-meta">
                <div><span>${getBillingAmountLabel(member)}</span><strong>${currency(member.fee)}</strong></div>
                <div><span>Membership</span><strong>${getMembershipLabel(member)}</strong></div>
                <div><span>Pending ${getPeriodUnitLabel(member)}s</span><strong>${unpaidPeriods.length}</strong></div>
              </div>
              <button class="collect-fee-button" data-id="${member.id}" type="button" ${unpaidPeriods.length ? "" : "disabled"}>
                ${unpaidPeriods.length ? "Collect payment" : "No pending dues"}
              </button>
            </article>
          `;
        })
        .join("")
    : `<p class="history-empty">No members added yet.</p>`;
}

function getPaymentRange() {
  return {
    start: els.paymentStartDate?.value || "",
    end: els.paymentEndDate?.value || "",
  };
}

function memberPaymentsInRange(member) {
  const { start, end } = getPaymentRange();
  return (member.payments || []).filter((payment) => {
    if (start && payment.date < start) return false;
    if (end && payment.date > end) return false;
    return true;
  });
}

function getFilteredPaymentMembers() {
  const query = state.paymentSearch.trim().toLowerCase();
  return state.members
    .filter((member) => {
      const textMatch = [member.name, member.phone].some((value) => String(value || "").toLowerCase().includes(query));
      if (!textMatch) return false;
      if (state.paymentStatusFilter === "paid") return isPaidThisPeriod(member);
      if (state.paymentStatusFilter === "pending") return !isPaidThisPeriod(member);
      if (state.paymentStatusFilter === "overdue") return isOverdue(member);
      return true;
    })
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.name.localeCompare(b.name));
}

function renderPayments() {
  if (!els.paymentCustomerGrid || !els.paymentCustomerDetail) return;
  if (!state.selectedPaymentMemberId && state.members.length) {
    state.selectedPaymentMemberId = state.members[0].id;
  }

  const members = getFilteredPaymentMembers();
  const visibleMembers = members.slice(0, 120);
  els.paymentCustomerCount.textContent = `Customers (${members.length}${members.length > visibleMembers.length ? ", showing first 120" : ""})`;

  els.paymentCustomerGrid.innerHTML = visibleMembers.length
    ? visibleMembers
        .map((member) => {
          const payments = memberPaymentsInRange(member);
          const paid = isPaidThisPeriod(member);
          const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          return `
            <button class="payment-customer-card ${member.id === state.selectedPaymentMemberId ? "active" : ""} ${paid ? "is-paid" : "is-pending"}" data-id="${member.id}" type="button">
              ${photoMarkup(member)}
              <div>
                <h3>${escapeHtml(member.name)}</h3>
                <p class="customer-phone">${escapeHtml(member.phone)}</p>
                <span>${getMembershipLabel(member)} · <em class="customer-filtered">${payments.length} filtered ${payments.length === 1 ? "payment" : "payments"}</em></span>
              </div>
              <strong class="customer-amount">${currency(total)}</strong>
            </button>
          `;
        })
        .join("")
    : `<p class="history-empty">No customers match these filters.</p>`;

  const selectedMember = visibleMembers.find((item) => item.id === state.selectedPaymentMemberId) || visibleMembers[0];
  if (selectedMember && selectedMember.id !== state.selectedPaymentMemberId) {
    state.selectedPaymentMemberId = selectedMember.id;
    renderPayments();
    return;
  }
  renderPaymentCustomerDetail(selectedMember || null);
}

function renderPaymentCustomerDetail(member) {
  if (!member) {
    els.paymentCustomerDetail.innerHTML = `<p class="history-empty">Add a member to view payment history.</p>`;
    return;
  }
  const payments = [...memberPaymentsInRange(member)].reverse();
  const paid = isPaidThisPeriod(member);
  els.paymentCustomerDetail.innerHTML = `
    <div class="payment-detail-head ${paid ? "is-paid" : "is-pending"}">
      ${photoMarkup(member)}
      <div>
        <h3>${escapeHtml(member.name)}</h3>
        <p>${getMembershipLabel(member)} · <span class="payment-status ${paid ? "paid" : "pending"}">${paid ? "✓ Paid" : "⏳ Pending"}</span></p>
      </div>
      <strong class="payment-detail-amount">${currency(member.fee)}</strong>
    </div>
    <button class="collect-fee-button" data-id="${member.id}" type="button" ${getUnpaidPeriods(member).length ? "" : "disabled"}>
      ${getUnpaidPeriods(member).length ? "Add payment" : "No pending dues"}
    </button>
    <div class="payment-history-list">
      ${payments.length
        ? payments
            .map(
              (payment) => `
                <div class="payment-history-row">
                  <div>
                    <strong>${currency(payment.amount)}</strong>
                    <span>${getBillingPeriodLabel(getPaymentPeriodKey(payment), member)}</span>
                  </div>
                  <span>${displayDate(payment.date)}</span>
                </div>
              `,
            )
            .join("")
        : `<p class="history-empty">No payments collected for this customer yet.</p>`}
    </div>
  `;
}


/* ---------------------------------------------------------------------------
 * Expense tracker: gym earnings (collected payments) vs expenses in one ledger,
 * plus overdue dues so pending money is visible next to the money spent.
 * ------------------------------------------------------------------------- */
function expenseCategoryLabel(value) {
  if (value === "membership-fee") return "Membership fee";
  return EXPENSE_CATEGORIES.find((category) => category.value === value)?.label || "Other";
}

function renderFinanceCategoryOptions() {
  if (!els.financeCategoryFilter) return;
  els.financeCategoryFilter.innerHTML =
    `<option value="all">All categories</option>` +
    `<option value="membership-fee">Membership fees</option>` +
    EXPENSE_CATEGORIES.map((category) => `<option value="${category.value}">${escapeHtml(category.label)}</option>`).join("");
  els.financeCategoryFilter.value = state.financeCategoryFilter;
}

function getFinanceRange() {
  return {
    start: els.financeStartDate?.value || "",
    end: els.financeEndDate?.value || "",
  };
}

function inFinanceRange(date) {
  const { start, end } = getFinanceRange();
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

// Every money movement in the selected range: collected member payments come in
// as earnings, recorded expenses go out. Newest first.
function getLedgerEntries() {
  const entries = [];
  state.members.forEach((member) => {
    (member.payments || []).forEach((payment) => {
      entries.push({
        type: "earning",
        id: payment.id,
        memberId: member.id,
        date: toDateKey(payment.date),
        amount: Number(payment.amount || 0),
        title: member.name,
        category: "membership-fee",
        detail: getBillingPeriodLabel(getPaymentPeriodKey(payment), member),
      });
    });
  });
  state.expenses.forEach((expense) => {
    entries.push({
      type: "expense",
      id: expense.id,
      date: toDateKey(expense.date),
      amount: Number(expense.amount || 0),
      title: expense.title || expenseCategoryLabel(expense.category),
      category: expense.category,
      detail: expenseCategoryLabel(expense.category),
    });
  });
  return entries.filter((entry) => inFinanceRange(entry.date)).sort((a, b) => b.date.localeCompare(a.date));
}

function filterLedgerEntries(entries) {
  return entries.filter((entry) => {
    if (state.financeTypeFilter !== "all" && entry.type !== state.financeTypeFilter) return false;
    if (state.financeCategoryFilter !== "all" && entry.category !== state.financeCategoryFilter) return false;
    return true;
  });
}

function getOverdueRows() {
  return state.members
    .map((member) => ({
      member,
      periods: getDueUnpaidPeriods(member).length,
      amount: getOverdueAmount(member),
    }))
    .filter((row) => row.periods > 0)
    .sort((a, b) => b.amount - a.amount || a.member.name.localeCompare(b.member.name));
}

function renderFinance() {
  if (!els.financeLedger) return;
  const entries = getLedgerEntries();
  const earnings = entries.filter((entry) => entry.type === "earning");
  const expenses = entries.filter((entry) => entry.type === "expense");
  const earnedTotal = earnings.reduce((sum, entry) => sum + entry.amount, 0);
  const expenseTotal = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const net = earnedTotal - expenseTotal;
  const overdueRows = getOverdueRows();
  const overdueTotal = overdueRows.reduce((sum, row) => sum + row.amount, 0);

  els.financeCollected.textContent = currency(earnedTotal);
  els.financeCollectedCount.textContent = `${earnings.length} payment${earnings.length === 1 ? "" : "s"} received`;
  els.financeExpenses.textContent = currency(expenseTotal);
  els.financeExpensesCount.textContent = `${expenses.length} expense${expenses.length === 1 ? "" : "s"} recorded`;
  els.financeNet.textContent = (net < 0 ? "−" : "") + currency(Math.abs(net));
  els.financeNet.classList.toggle("is-negative", net < 0);
  els.financeNetHint.textContent = net < 0 ? "Spending more than collected" : "Collected minus expenses";
  els.financeOverdueAmount.textContent = currency(overdueTotal);
  els.financeOverdueCount.textContent = `${overdueRows.length} member${overdueRows.length === 1 ? "" : "s"} overdue`;

  const { start, end } = getFinanceRange();
  els.financeRangeLabel.textContent = start || end
    ? `${start ? displayDate(start) : "Beginning"} to ${end ? displayDate(end) : "today"}`
    : "All records";

  const visible = filterLedgerEntries(entries);
  els.financeLedger.innerHTML = visible.length
    ? visible
        .map((entry) => {
          const sign = entry.type === "expense" ? "−" : "+";
          const dataAttr = entry.type === "expense" ? `data-expense-id="${entry.id}"` : `data-member-id="${entry.memberId}"`;
          return `
            <button class="ledger-row ${entry.type === "expense" ? "is-expense" : "is-earning"}" ${dataAttr} type="button">
              <span class="ledger-ico" aria-hidden="true">
                <span class="material-symbols-outlined">${entry.type === "expense" ? "arrow_outward" : "south_west"}</span>
              </span>
              <span class="ledger-copy">
                <strong>${escapeHtml(entry.title)}</strong>
                <span>${escapeHtml(entry.detail)} · ${displayDate(entry.date)}</span>
              </span>
              <strong class="ledger-amount">${sign} ${currency(entry.amount)}</strong>
            </button>
          `;
        })
        .join("")
    : `<p class="history-empty">No earnings or expenses match these filters. Use "Add expense" to record rent, trainer payments, or anything else.</p>`;

  els.financeOverdueLabel.textContent = overdueRows.length
    ? `${overdueRows.length} member${overdueRows.length === 1 ? "" : "s"} owe ${currency(overdueTotal)} in total.`
    : "Members with pending dues.";
  els.financeOverdueList.innerHTML = overdueRows.length
    ? overdueRows
        .map(
          ({ member, periods, amount }) => `
            <article class="finance-overdue-row">
              ${photoMarkup(member)}
              <div class="finance-overdue-copy">
                <h3>${escapeHtml(member.name)}</h3>
                <p>${periods} unpaid ${getPeriodUnitLabel(member)}${periods === 1 ? "" : "s"} · due since ${displayDate(getDueDateKey(member))}</p>
              </div>
              <div class="finance-overdue-actions">
                <strong>${currency(amount)}</strong>
                <button class="secondary-action" data-collect-id="${member.id}" type="button">Collect</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="history-empty">No overdue members. Every collected payment shows up in the ledger as an earning.</p>`;
}

function openExpenseDialog(expense = null) {
  state.editingExpenseId = expense?.id || null;
  els.expenseDialogTitle.textContent = expense ? "Edit expense" : "Add expense";
  els.expenseCategoryInput.value = expense?.category || "trainer-payment";
  els.expenseAmountInput.value = expense?.amount || "";
  els.expenseDateInput.value = expense?.date || todayKey();
  els.expenseTitleInput.value = expense?.title || "";
  els.deleteExpense.style.display = expense ? "inline-block" : "none";
  els.expenseDialog.showModal();
}

function closeExpenseDialogBox() {
  els.expenseDialog.close();
  els.expenseForm.reset();
  state.editingExpenseId = null;
}

async function submitExpense(event) {
  event.preventDefault();
  const payload = {
    category: els.expenseCategoryInput.value,
    amount: Number(els.expenseAmountInput.value),
    date: els.expenseDateInput.value || todayKey(),
    title: els.expenseTitleInput.value.trim(),
  };
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    showToast("Enter an amount greater than zero");
    return;
  }
  const wasEditing = Boolean(state.editingExpenseId);
  const submitButton = els.expenseForm.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  setButtonBusy(submitButton, true);
  try {
    const saved = await api(
      wasEditing ? "/api/expenses/" + encodeURIComponent(state.editingExpenseId) : "/api/expenses",
      {
        method: wasEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    state.expenses = wasEditing
      ? state.expenses.map((expense) => (expense.id === saved.id ? saved : expense))
      : [saved, ...state.expenses];
    closeExpenseDialogBox();
    renderFinance();
    showToast(wasEditing ? "Expense updated" : "Expense recorded");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function deleteCurrentExpense() {
  if (!state.editingExpenseId || els.deleteExpense?.disabled) return;
  const expense = state.expenses.find((item) => item.id === state.editingExpenseId);
  const confirmed = confirm(`Delete this ${currency(expense?.amount || 0)} expense?`);
  if (!confirmed) return;
  setButtonBusy(els.deleteExpense, true);
  try {
    await api("/api/expenses/" + encodeURIComponent(state.editingExpenseId), { method: "DELETE" });
    state.expenses = state.expenses.filter((item) => item.id !== state.editingExpenseId);
    closeExpenseDialogBox();
    renderFinance();
    showToast("Expense deleted");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(els.deleteExpense, false);
  }
}

function exportFinanceCsv() {
  const entries = filterLedgerEntries(getLedgerEntries());
  if (!entries.length) {
    showToast("No records to export");
    return;
  }
  const csvRows = [
    ["Date", "Type", "Category", "Description", "Amount"],
    ...entries.map((entry) => [
      displayDate(entry.date),
      entry.type === "expense" ? "Expense" : "Earning",
      expenseCategoryLabel(entry.category),
      entry.title,
      (entry.type === "expense" ? -entry.amount : entry.amount).toString(),
    ]),
  ];
  const csv = csvRows
    .map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gym-earnings-expenses.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported");
}

function getHistoryRange() {
  const fallback = getDefaultHistoryRange();
  return {
    start: els.historyStartDate?.value || fallback.start,
    end: els.historyEndDate?.value || fallback.end,
  };
}

function getHistoryRows(member) {
  if (!member) return [];
  const { start, end } = getHistoryRange();
  const attendance = new Set(member.attendance || []);
  const expiredCheckins = new Set(member.expiredCheckins || []);
  return daysBetween(start, end).map((day) => {
    const holiday = isHoliday(day);
    const present = attendance.has(day);
    const expired = present && expiredCheckins.has(day);
    return {
      date: day,
      status: holiday ? "holiday" : expired ? "expired" : present ? "present" : "absent",
      present,
      holiday,
      expired,
    };
  });
}

function filterHistoryRows(rows) {
  const status = state.historyStatusFilter;
  if (status === "all") return rows;
  // "present" includes expired check-ins — the member was in the gym either way.
  if (status === "present") return rows.filter((row) => row.present && !row.holiday);
  return rows.filter((row) => row.status === status);
}

function renderHistory() {
  if (!els.historyMemberGrid || !els.historyReport) return;
  if (!state.selectedHistoryMemberId && state.members.length) {
    state.selectedHistoryMemberId = state.members[0].id;
  }

  const query = state.historySearch.trim().toLowerCase();
  const members = state.members
    .filter((member) => [member.name, member.phone].some((value) => String(value || "").toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name));

  els.historyMemberGrid.innerHTML = members.length
    ? members
        .map((member) => {
          const rows = getHistoryRows(member);
          const present = rows.filter((row) => row.present).length;
          const holidays = rows.filter((row) => row.holiday).length;
          const expired = rows.filter((row) => row.expired).length;
          return `
            <button class="history-member-card ${member.id === state.selectedHistoryMemberId ? "active" : ""}" data-id="${member.id}" type="button">
              ${photoMarkup(member)}
              <div>
                <h3>${escapeHtml(member.name)}</h3>
                <p>${escapeHtml(member.phone)} · ${escapeHtml(member.gymId || member.id || "")}</p>
                <span>${present} present · ${holidays} holidays${expired ? ` · <em class="expired-flag">${expired} expired</em>` : ""}</span>
              </div>
            </button>
          `;
        })
        .join("")
    : `<p class="history-empty">No members match this filter.</p>`;

  const selectedMember = members.find((member) => member.id === state.selectedHistoryMemberId) || members[0];
  if (selectedMember && selectedMember.id !== state.selectedHistoryMemberId) {
    state.selectedHistoryMemberId = selectedMember.id;
    renderHistory();
    return;
  }

  renderHistoryReport(selectedMember || null);
}

function renderHistoryReport(member) {
  if (!member) {
    els.historyReport.innerHTML = `<p class="history-empty">Add a member to view individual attendance history.</p>`;
    els.attendanceHistoryLabel.textContent = "No member selected.";
    return;
  }

  const rows = getHistoryRows(member);
  const visibleRows = filterHistoryRows(rows);
  const present = rows.filter((row) => row.present).length;
  const holidays = rows.filter((row) => row.holiday).length;
  const absent = rows.filter((row) => row.status === "absent").length;
  const expiredVisits = rows.filter((row) => row.expired).length;
  const workingDays = rows.length - holidays;
  const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;

  els.attendanceHistoryLabel.textContent = `${member.name} · ${displayDate(getHistoryRange().start)} to ${displayDate(getHistoryRange().end)}`;
  els.historyReport.innerHTML = `
    <div class="history-report-head">
      ${photoMarkup(member)}
      <div>
        <h3>${escapeHtml(member.name)}</h3>
        <p>${escapeHtml(member.phone)} · ${escapeHtml(member.address)}</p>
      </div>
    </div>
    <div class="history-stat-grid">
      <article><span>Present</span><strong>${present}</strong></article>
      <article><span>Absent</span><strong>${absent}</strong></article>
      <article><span>Holidays</span><strong>${holidays}</strong></article>
      <article><span>Attendance rate</span><strong>${rate}%</strong></article>
      ${expiredVisits ? `<article class="expired-stat"><span>Expired check-ins</span><strong>${expiredVisits}</strong></article>` : ""}
    </div>
    <div class="attendance-chart" aria-label="Attendance chart">
      ${rows
        .map(
          (row) => `<span class="chart-day ${row.status}" title="${displayDate(row.date)} · ${row.status}"></span>`,
        )
        .join("")}
    </div>
    <div class="history-date-list">
      ${visibleRows
        .map(
          (row) => `
            <div class="history-date-row">
              <span>${displayDate(row.date)}</span>
              <strong class="${row.status}">${row.status}</strong>
            </div>
          `,
        )
        .join("") || `<p class="history-empty">No dates match this filter.</p>`}
    </div>
  `;
}

function exportHistoryCsv() {
  const member = state.members.find((item) => item.id === state.selectedHistoryMemberId);
  if (!member) {
    showToast("Select a member first");
    return;
  }
  const rows = filterHistoryRows(getHistoryRows(member));
  const csvRows = [
    ["Member", "Phone", "Date", "Status"],
    ...rows.map((row) => [member.name, member.phone, displayDate(row.date), row.status]),
  ];
  const csv = csvRows
    .map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${member.name.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported");
}

function renderAttendanceSheet() {
  if (!els.attendanceList) return;
  const selectedDate = state.attendanceDate || todayKey();
  const attendanceQuery = state.attendanceSearch.trim().toLowerCase();
  const attendanceMembers = state.members.filter((member) =>
    [member.name, member.phone].some((value) => String(value || "").toLowerCase().includes(attendanceQuery)),
  );
  const presentMembers = state.members.filter((member) => hasAttendance(member, selectedDate));
  const notCheckedInCount = Math.max(state.members.length - presentMembers.length, 0);

  els.selectedDatePresent.textContent = `${presentMembers.length} checked in`;
  els.selectedDateLabel.textContent = `${notCheckedInCount} pending | ${displayDate(selectedDate)}`;

  if (els.attendanceHolidayNote) {
    const reason = holidayReason(selectedDate);
    els.attendanceHolidayNote.hidden = !reason;
    els.attendanceHolidayNote.textContent = reason
      ? `🌴 ${displayDate(selectedDate)} is a gym holiday — ${reason}. Check-ins are still recorded if the gym opens.`
      : "";
  }

  const noAttendanceMatches = state.members.length > 0 && attendanceMembers.length === 0;
  els.attendanceEmpty.classList.toggle("show", state.members.length === 0);
  els.attendanceList.style.display = attendanceMembers.length || noAttendanceMatches ? "grid" : "none";
  els.attendanceList.innerHTML = noAttendanceMatches
    ? `<p class="history-empty">No members match this search.</p>`
    : attendanceMembers
        .slice()
        .sort((a, b) => {
          const aPresent = hasAttendance(a, selectedDate);
          const bPresent = hasAttendance(b, selectedDate);
          if (aPresent !== bPresent) return aPresent ? 1 : -1;
          return a.name.localeCompare(b.name);
        })
        .map((member) => {
          const present = hasAttendance(member, selectedDate);
          const expired = present && (member.expiredCheckins || []).includes(selectedDate);
          const confirmRemoval = state.pendingAttendanceRemovalId === member.id && present;
          const actionMarkup = present
            ? confirmRemoval
              ? `
                <div class="attendance-confirm-actions" role="group" aria-label="Confirm attendance correction for ${escapeHtml(member.name)}">
                  <button class="attendance-button danger" data-action="remove" data-id="${member.id}" type="button">Confirm absent</button>
                  <button class="attendance-button ghost" data-action="cancel" data-id="${member.id}" type="button">Cancel</button>
                </div>
              `
              : `<button class="attendance-button correction" data-action="request-remove" data-id="${member.id}" type="button">Mark absent</button>`
            : `<button class="attendance-button mark-present" data-action="mark-present" data-id="${member.id}" type="button">Mark present</button>`;
          return `
            <article class="attendance-row ${present ? (expired ? "is-present is-expired" : "is-present") : "is-pending"}">
              ${photoMarkup(member)}
              <div class="attendance-member-copy">
                <h3>${escapeHtml(member.name)}</h3>
                <p>${escapeHtml(member.phone)}</p>
              </div>
              <div class="attendance-status-cell">
                <span class="attendance-status ${present ? (expired ? "expired" : "present") : "pending"}">
                  ${present ? (expired ? "Checked in — expired" : "Checked in") : "Not checked in"}
                </span>
                ${expired ? `<small>Membership had expired at check-in. Collect the renewal.</small>` : present ? `<small>Use absent only for a correction.</small>` : `<small>No attendance saved for this date.</small>`}
              </div>
              <div class="attendance-actions">
                ${actionMarkup}
              </div>
            </article>
          `;
        })
        .join("");

}

function trainerPhotoMarkup(trainer, className = "member-photo") {
  if (trainer.photo) {
    return `<img class="${className}" src="${escapeHtml(trainer.photo)}" alt="${escapeHtml(trainer.name)} photo">`;
  }
  return `<div class="avatar-fallback" aria-hidden="true">${getInitials(trainer.name)}</div>`;
}

function getVisibleTrainers() {
  const query = state.trainerSearch.trim().toLowerCase();
  return state.trainers
    .filter((trainer) => {
      if (state.trainerStatusFilter !== "all" && trainer.status !== state.trainerStatusFilter) return false;
      if (!query) return true;
      return [trainer.name, trainer.phone, trainer.specialty, trainer.shift, trainer.bio].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );
    })
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));
}

function renderTrainers() {
  if (!els.trainerList) return;
  const trainers = getVisibleTrainers();
  const activeCount = state.trainers.filter((trainer) => trainer.status === "active").length;
  const specialtyCount = new Set(state.trainers.map((trainer) => trainer.specialty.toLowerCase()).filter(Boolean)).size;
  const selectedDate = state.trainerAttendanceDate || todayKey();
  const presentCount = state.trainers.filter((trainer) => hasTrainerAttendance(trainer, selectedDate)).length;

  els.trainerSummaryTotal.textContent = state.trainers.length;
  els.trainerSummaryActive.textContent = activeCount;
  els.trainerSummarySpecialties.textContent = specialtyCount;
  if (els.trainerSummaryPresent) els.trainerSummaryPresent.textContent = presentCount;

  els.trainerList.innerHTML = trainers
    .map((trainer) => {
      const statusClass = trainer.status === "inactive" ? "pending" : "present";
      return `
        <article class="trainer-card">
          <button class="trainer-card-main" data-id="${trainer.id}" type="button">
            ${trainerPhotoMarkup(trainer)}
            <div>
              <div class="trainer-card-headline">
                <h3>${escapeHtml(trainer.name)}</h3>
                <span class="badge ${statusClass}">${trainer.status === "inactive" ? "Inactive" : "Active"}</span>
              </div>
              <p>${escapeHtml(trainer.phone)} · ${escapeHtml(trainer.specialty)}</p>
              <p>${escapeHtml(trainer.shift)} · ${getAssignedMemberCount(trainer.id)} assigned member${getAssignedMemberCount(trainer.id) === 1 ? "" : "s"}</p>
              ${trainer.bio ? `<small>${escapeHtml(trainer.bio)}</small>` : ""}
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  renderTrainerAttendance();

  const noResults = state.trainers.length > 0 && trainers.length === 0;
  els.trainerEmptyState.classList.toggle("show", state.trainers.length === 0 || noResults);
  els.trainerList.style.display = trainers.length ? "grid" : "none";
  const emptyTitle = els.trainerEmptyState.querySelector("h3");
  const emptyCopy = els.trainerEmptyState.querySelector("p");
  if (emptyTitle && emptyCopy) {
    if (noResults) {
      emptyTitle.textContent = "No matching trainers";
      emptyCopy.textContent = "Try another search or status filter.";
    } else {
      emptyTitle.textContent = "No trainers found";
      emptyCopy.textContent = "It looks like you haven't added any trainers yet. Use the \"Add trainer\" button below to populate your roster.";
    }
  }
}


function renderTrainerAttendance() {
  if (!els.trainerAttendanceList) return;
  const selectedDate = state.trainerAttendanceDate || todayKey();
  const presentCount = state.trainers.filter((trainer) => hasTrainerAttendance(trainer, selectedDate)).length;
  els.trainerAttendancePresent.textContent = `${presentCount} checked in`;
  els.trainerAttendanceLabel.textContent = `${Math.max(state.trainers.length - presentCount, 0)} pending | ${displayDate(selectedDate)}`;

  els.trainerAttendanceList.innerHTML = state.trainers.length
    ? state.trainers
        .slice()
        .sort((a, b) => Number(hasTrainerAttendance(b, selectedDate)) - Number(hasTrainerAttendance(a, selectedDate)) || a.name.localeCompare(b.name))
        .map((trainer) => {
          const present = hasTrainerAttendance(trainer, selectedDate);
          return `
            <article class="trainer-attendance-row ${present ? "is-present" : "is-pending"}">
              ${trainerPhotoMarkup(trainer)}
              <div>
                <h3>${escapeHtml(trainer.name)}</h3>
                <p>${escapeHtml(trainer.specialty)} · ${escapeHtml(trainer.shift)}</p>
              </div>
              <span class="attendance-status ${present ? "present" : "pending"}">${present ? "Present" : "Not marked"}</span>
              <button class="attendance-button ${present ? "correction" : "mark-present"}" data-trainer-attendance-id="${trainer.id}" data-present="${present ? "0" : "1"}" type="button">
                ${present ? "Mark absent" : "Mark present"}
              </button>
            </article>
          `;
        })
        .join("")
    : ``;
}

function renderMembers() {
  const members = getVisibleMembers();
  els.memberList.innerHTML = members
    .map((member) => {
      const badges = [
        isOverdue(member)
          ? `<span class="badge overdue">Overdue</span>`
          : `<span class="badge pending">Due ${displayDate(getDueDateKey(member))}</span>`,
        isPaidThisPeriod(member) ? `<span class="badge paid">Paid</span>` : "",
        isPresentToday(member) ? `<span class="badge present">Present today</span>` : "",
      ].join("");

      return `
        <article class="member-card ${isOverdue(member) ? "is-overdue" : isPaidThisPeriod(member) ? "is-paid" : "is-pending"}">
          <button class="member-card-main" data-id="${member.id}" type="button">
            ${photoMarkup(member)}
            <div>
              <h3>${escapeHtml(member.name)}</h3>
              <p class="member-phone">${escapeHtml(member.phone)}</p>
              <p class="member-address">${escapeHtml(member.address)}</p>
              <p class="member-trainer">Trainer: ${escapeHtml(getTrainerName(member.trainerId))}</p>
            </div>
            <div class="member-badges">${badges}</div>
          </button>
          <div class="member-card-foot">
            <div class="member-fee">
              <strong>${currency(member.fee)}</strong>
              <span>${getMembershipLabel(member)}</span>
            </div>
            <button class="member-whatsapp-action" data-reminder-id="${member.id}" type="button" ${getUnpaidPeriods(member).length ? "" : "disabled"}>
              WhatsApp reminder
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  const noResults = state.members.length > 0 && members.length === 0;
  els.emptyState.classList.toggle("show", state.members.length === 0 || noResults);
  els.memberList.style.display = members.length ? "grid" : "none";
  const emptyTitle = els.emptyState.querySelector("h3");
  const emptyCopy = els.emptyState.querySelector("p");
  if (emptyTitle && emptyCopy) {
    if (noResults) {
      emptyTitle.textContent = "No matching members";
      emptyCopy.textContent = "Try a different search or filter.";
    } else {
      emptyTitle.textContent = "No members yet";
      emptyCopy.textContent = "Add the first person when they come in, then track attendance and fees from one place.";
    }
  }
}

function render() {
  renderBrand();
  renderStats();
  renderAttendanceSheet();
  renderMembers();
  renderTrainers();
  renderFees();
  renderPayments();
  renderFinance();
  renderHistory();
  if (state.detailId) renderDetail();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openMemberDialog(member = null) {
  state.editingId = member?.id || null;
  state.stagedPhoto = member?.photo || "";
  els.dialogTitle.textContent = member ? "Edit member" : "Add new member";
  els.gymIdInput.value = member?.gymId || member?.id || generateGymId();
  els.nameInput.value = member?.name || "";
  els.phoneInput.value = member?.phone || "";
  els.addressInput.value = member?.address || "";
  els.feeInput.value = member?.fee || "";
  els.membershipTypeInputs.forEach((input) => {
    input.checked = input.value === getMembershipType(member);
  });
  if (els.packageMonthsInput) els.packageMonthsInput.value = String(getPackageMonths(member));
  updateMembershipFields();
  const timing = getCollectionTiming(member);
  els.collectionTimingInputs.forEach((input) => {
    input.checked = input.value === timing;
  });
  els.startDateInput.value = member?.startDate || todayKey();
  renderTrainerOptions(member?.trainerId || "");
  els.photoPreview.src = state.stagedPhoto || "";
  els.photoPreview.alt = state.stagedPhoto ? "Member photo preview" : "";
  els.photoPreview.style.visibility = state.stagedPhoto ? "visible" : "hidden";
  els.deleteMember.style.display = member ? "inline-block" : "none";
  els.memberDialog.showModal();
}


function updateMembershipFields() {
  const selectedType = [...els.membershipTypeInputs].find((input) => input.checked)?.value || "monthly";
  const isPackage = selectedType === "package";
  if (els.packageMonthsField) els.packageMonthsField.hidden = !isPackage;
  if (els.packageMonthsInput) {
    els.packageMonthsInput.disabled = !isPackage;
    els.packageMonthsInput.required = isPackage;
  }
}


function openTrainerDialog(trainer = null) {
  state.editingTrainerId = trainer?.id || null;
  state.stagedTrainerPhoto = trainer?.photo || "";
  els.trainerDialogTitle.textContent = trainer ? "Edit trainer" : "Add trainer";
  els.trainerNameInput.value = trainer?.name || "";
  els.trainerPhoneInput.value = trainer?.phone || "";
  els.trainerSpecialtyInput.value = trainer?.specialty || "";
  els.trainerShiftInput.value = trainer?.shift || "";
  els.trainerStatusInput.value = trainer?.status || "active";
  els.trainerBioInput.value = trainer?.bio || "";
  els.trainerPhotoPreview.src = state.stagedTrainerPhoto || "";
  els.trainerPhotoPreview.alt = state.stagedTrainerPhoto ? "Trainer photo preview" : "";
  els.trainerPhotoPreview.style.visibility = state.stagedTrainerPhoto ? "visible" : "hidden";
  els.deleteTrainer.style.display = trainer ? "inline-block" : "none";
  els.trainerDialog.showModal();
}

function closeTrainerDialog() {
  els.trainerDialog.close();
  els.trainerForm.reset();
  state.editingTrainerId = null;
  state.stagedTrainerPhoto = "";
}

async function handleTrainerPhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.stagedTrainerPhoto = await readPhoto(file);
  els.trainerPhotoPreview.src = state.stagedTrainerPhoto;
  els.trainerPhotoPreview.alt = "Trainer photo preview";
  els.trainerPhotoPreview.style.visibility = "visible";
}

function saveTrainer(event) {
  event.preventDefault();
  const formData = new FormData(els.trainerForm);
  const payload = normalizeTrainer({
    id: state.editingTrainerId || undefined,
    name: formData.get("name"),
    phone: formData.get("phone"),
    specialty: formData.get("specialty"),
    shift: formData.get("shift"),
    status: formData.get("status"),
    bio: formData.get("bio"),
    photo: state.stagedTrainerPhoto,
    attendance: state.trainers.find((trainer) => trainer.id === state.editingTrainerId)?.attendance || [],
    createdAt: state.trainers.find((trainer) => trainer.id === state.editingTrainerId)?.createdAt,
  });
  const wasEditing = Boolean(state.editingTrainerId);
  state.trainers = wasEditing
    ? state.trainers.map((trainer) => (trainer.id === payload.id ? payload : trainer))
    : [...state.trainers, payload];
  persistTrainers();
  closeTrainerDialog();
  render();
  showToast(wasEditing ? "Trainer updated" : "Trainer added");
}

function deleteCurrentTrainer() {
  if (!state.editingTrainerId) return;
  const trainer = state.trainers.find((item) => item.id === state.editingTrainerId);
  const confirmed = confirm("Delete " + (trainer?.name || "this trainer") + "?");
  if (!confirmed) return;
  state.trainers = state.trainers.filter((item) => item.id !== state.editingTrainerId);
  state.members.forEach((member) => {
    if (member.trainerId === state.editingTrainerId) member.trainerId = "";
  });
  persistTrainers();
  persistAllMembers();
  closeTrainerDialog();
  render();
  showToast("Trainer deleted");
}

function closeMemberDialog() {
  els.memberDialog.close();
  els.memberForm.reset();
  state.editingId = null;
  state.stagedPhoto = "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale and re-encode in the browser before upload: the host rejects request
// bodies over ~1MB, and full-resolution photos also make uploads painfully slow.
async function readPhoto(file, maxDimension = 1024, quality = 0.8) {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      let out = "";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL("image/webp", quality);
      if (!out.startsWith("data:image/webp")) {
        // Browser can't encode webp: keep transparency for logo-like sources, else use jpeg on white.
        if (["image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.type)) {
          out = canvas.toDataURL("image/png");
        } else {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL("image/jpeg", quality);
        }
      }
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl); // not decodable here; the server will validate it
    img.src = dataUrl;
  });
}

async function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.stagedPhoto = await readPhoto(file);
  els.photoPreview.src = state.stagedPhoto;
  els.photoPreview.alt = "Member photo preview";
  els.photoPreview.style.visibility = "visible";
}

async function handleLogoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.settings.logo = await readPhoto(file, 512);
  try {
    await saveSettingsRecord();
    renderBrand();
    showToast("Logo updated");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveGymSettings(event) {
  event.preventDefault();
  state.settings.gymName = els.gymNameInput.value.trim() || "Gym Admin";
  state.settings.billingCycleMode = [...els.billingCycleInputs].find((input) => input.checked)?.value || "month-start";
  state.settings.customBillingDays = Math.max(1, Math.round(Number(els.customBillingDaysInput.value || 25)));
  state.settings.defaultCollectionTiming = [...els.defaultCollectionTimingInputs].find((input) => input.checked)?.value === "fixed-day" ? "fixed-day" : "at-join";
  state.settings.allowExpiredCheckin = [...els.allowExpiredCheckinInputs].find((input) => input.checked)?.value !== "deny";
  state.settings.weeklyHolidays = [...els.weeklyHolidayInputs]
    .filter((input) => input.checked)
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
  state.settings.holidayDates = getHolidayDates();
  state.settings.theme = normalizeTheme(
    [...els.themeInputs].reduce((theme, input) => {
      theme[input.dataset.themeColor] = input.value;
      return theme;
    }, {}),
  );
  const submitButton = els.settingsForm.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  setButtonBusy(submitButton, true);
  try {
    await saveSettingsRecord();
    applyTheme();
    renderBrand();
    // Billing cycle / collection timing changed: recompute due dates everywhere
    // (member cards, dashboard stats, payments), not just the detail modal.
    render();
    showToast("Settings saved");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function saveMember(event) {
  event.preventDefault();

  const formData = new FormData(els.memberForm);
  const payload = {
    id: state.editingId || "",
    gymId: String(formData.get("gymId") || "").trim().toUpperCase() || generateGymId(),
    name: String(formData.get("name")).trim(),
    phone: String(formData.get("phone")).trim(),
    address: String(formData.get("address")).trim(),
    fee: Number(formData.get("fee")),
    membershipType: String(formData.get("membershipType") || "monthly") === "package" ? "package" : "monthly",
    packageMonths: Math.max(1, Math.round(Number(formData.get("packageMonths") || 1))),
    collectionTiming: String(formData.get("collectionTiming") || "") === "fixed-day" ? "fixed-day" : "at-join",
    startDate: String(formData.get("startDate")),
    trainerId: String(formData.get("trainerId") || ""),
    photo: state.stagedPhoto,
  };

  const wasEditing = Boolean(state.editingId);
  const submitButton = els.memberForm.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  setButtonBusy(submitButton, true);
  try {
    const saved = await saveMemberRecord(payload);
    if (wasEditing) {
      state.members = state.members.map((member) => (member.id === saved.id ? saved : member));
    } else {
      state.members.push(saved);
      state.selectedHistoryMemberId ||= saved.id;
      state.selectedPaymentMemberId ||= saved.id;
    }
    closeMemberDialog();
    render();
    showToast(wasEditing ? "Member updated" : "Member added");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function deleteCurrentMember() {
  if (!state.editingId) return;
  if (els.deleteMember?.disabled) return;
  const member = state.members.find((item) => item.id === state.editingId);
  const confirmed = confirm("Delete " + (member?.name || "this member") + "?");
  if (!confirmed) return;
  setButtonBusy(els.deleteMember, true);
  try {
    await api("/api/members/" + encodeURIComponent(state.editingId), { method: "DELETE" });
    state.members = state.members.filter((item) => item.id !== state.editingId);
    if (state.detailId === state.editingId) {
      state.detailId = null;
      els.detailDialog.close();
    }
    closeMemberDialog();
    render();
    showToast("Member deleted");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonBusy(els.deleteMember, false);
  }
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.detailId);
}

function openDetail(memberId) {
  state.detailId = memberId;
  renderDetail();
  els.detailDialog.showModal();
}

function closeDetail() {
  state.detailId = null;
  els.detailDialog.close();
}

function renderDetail() {
  const member = getActiveMember();
  if (!member) return;

  if (member.photo) {
    els.detailPhoto.src = member.photo;
    els.detailPhoto.style.display = "block";
  } else {
    els.detailPhoto.src = "";
    els.detailPhoto.style.display = "none";
  }

  els.detailStatus.textContent = isOverdue(member)
    ? "Payment overdue"
    : isPaidThisPeriod(member)
      ? "Paid this period"
      : "Active member";
  els.detailName.textContent = member.name;
  els.detailMeta.textContent = `${member.phone} · ${member.address} · Trainer: ${getTrainerName(member.trainerId)}`;
  els.detailFee.textContent = currency(member.fee);
  els.detailDueDate.textContent = displayDate(getDueDateKey(member));
  els.detailAttendance.textContent = `${getMonthlyAttendance(member)} days`;
  els.detailLastPayment.textContent = getLastPaymentText(member);
  renderCalendar(member);
  renderPaymentHistory(member);
}

function getLastPaymentText(member) {
  const payments = member.payments || [];
  if (!payments.length) return "No payment";
  return displayDate(payments[payments.length - 1].date);
}

function sendReminder(memberId = state.detailId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member || !getUnpaidPeriods(member).length) return;
  // wa.me needs the full international number; stored numbers are the bare
  // 10-digit local form, so put the Indian country code back for the link.
  const digits = normalizePhone(member.phone);
  const phone = digits.length === 10 ? "91" + digits : digits;
  const message = encodeURIComponent(
    `Hello ${member.name}, your gym fee of ${currency(member.fee)} is due on ${displayDate(
      getDueDateKey(member),
    )}. Please clear it soon. Thank you.`,
  );
  window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
}

function renderCalendar(member) {
  const current = parseDateKey(state.attendanceDate || todayKey());
  const year = current.getFullYear();
  const month = current.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const attendance = new Set(member.attendance || []);
  const today = todayKey();

  els.calendarHint.textContent = `${new Intl.DateTimeFormat("en-IN", {
    month: "long",
  }).format(current)} attendance for ${member.name}`;

  els.attendanceCalendar.innerHTML = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = localDateKey(new Date(year, month, day));
    const classes = ["day-cell"];
    if (attendance.has(key)) classes.push("present");
    // Holiday shading follows the Settings panel (weekly days + specific dates);
    // a check-in on a holiday still renders as present.
    else if (isHoliday(key)) classes.push("holiday");
    if (key === today) classes.push("today");
    return `<button class="${classes.join(" ")}" data-day="${key}" type="button">${day}</button>`;
  }).join("");
}

function toggleCalendarDay(day) {
  const member = getActiveMember();
  if (!member) return;
  setMemberAttendanceStatus(member.id, day, !hasAttendance(member, day));
}

function renderPaymentHistory(member) {
  const payments = [...(member.payments || [])].reverse();
  if (!payments.length) {
    els.paymentHistory.innerHTML = `<p class="muted">No payments recorded yet.</p>`;
    return;
  }
  els.paymentHistory.innerHTML = payments
    .map(
      (payment) => `
        <div class="payment-row">
          <strong>${currency(payment.amount)}</strong>
          <span>${displayDate(payment.date)}</span>
        </div>
      `,
    )
    .join("");
}

function bindEvents() {
  els.openAddMember.addEventListener("click", () => openMemberDialog());
  els.sideAddMember.addEventListener("click", () => openMemberDialog());
  if (els.menuToggle) els.menuToggle.addEventListener("click", toggleDrawer);
  if (els.sidebarScrim) els.sidebarScrim.addEventListener("click", closeDrawer);
  if (els.mobileAddMember) els.mobileAddMember.addEventListener("click", () => openMemberDialog());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
      closeDrawer();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && document.body.classList.contains("nav-open")) {
      closeDrawer();
    }
  });
  els.viewTriggers.forEach((link) => {
    link.addEventListener("click", () => setView(link.dataset.view));
  });
  els.emptyAddMember.addEventListener("click", () => openMemberDialog());
  els.openAddTrainer.addEventListener("click", () => openTrainerDialog());
  els.emptyAddTrainer.addEventListener("click", () => openTrainerDialog());
  els.closeDialog.addEventListener("click", closeMemberDialog);
  els.closeTrainerDialog.addEventListener("click", closeTrainerDialog);
  els.closeDetail.addEventListener("click", closeDetail);
  els.closeFeeDialog.addEventListener("click", closeFeeDialog);
  els.cancelFeeDialog.addEventListener("click", closeFeeDialog);
  els.feeCollectionForm.addEventListener("submit", collectSelectedFees);
  els.feeMonthList.addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox']");
    if (!input) return;
    const selected = new Set(state.selectedBillingPeriods);
    if (input.checked) {
      selected.add(input.value);
    } else {
      selected.delete(input.value);
    }
    state.selectedBillingPeriods = [...selected].sort();
    renderFeeDialog();
  });
  els.memberForm.addEventListener("submit", saveMember);
  els.trainerForm.addEventListener("submit", saveTrainer);
  els.photoInput.addEventListener("change", handlePhotoChange);
  els.trainerPhotoInput.addEventListener("change", handleTrainerPhotoChange);
  els.gymLogoInput.addEventListener("change", handleLogoChange);
  els.settingsForm.addEventListener("submit", saveGymSettings);
  els.billingCycleInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (els.customBillingDaysInput) els.customBillingDaysInput.disabled = input.value !== "custom-days";
    });
  });
  els.membershipTypeInputs.forEach((input) => {
    input.addEventListener("change", updateMembershipFields);
  });
  if (els.addHolidayDate) els.addHolidayDate.addEventListener("click", addHolidayDate);
  if (els.holidayDateList) {
    els.holidayDateList.addEventListener("click", (event) => {
      const date = event.target.closest("[data-holiday-date]")?.dataset.holidayDate;
      if (date) removeHolidayDate(date);
    });
  }
  els.deleteMember.addEventListener("click", deleteCurrentMember);
  els.deleteTrainer.addEventListener("click", deleteCurrentTrainer);
  els.editMember.addEventListener("click", () => {
    const member = getActiveMember();
    if (member) openMemberDialog(member);
  });

  els.attendanceDate.addEventListener("change", (event) => {
    state.attendanceDate = event.target.value || todayKey();
    state.pendingAttendanceRemovalId = "";
    render();
    refreshAttendanceStatus(true).catch(() => showToast("Attendance sync failed"));
  });
  els.attendanceSearch.addEventListener("input", (event) => {
    state.attendanceSearch = event.target.value;
    state.pendingAttendanceRemovalId = "";
    renderAttendanceSheet();
  });

  els.historyStartDate.addEventListener("change", render);
  els.historyEndDate.addEventListener("change", render);
  els.historyStatusFilter.addEventListener("change", (event) => {
    state.historyStatusFilter = event.target.value;
    renderHistory();
  });
  els.historySearch.addEventListener("input", (event) => {
    state.historySearch = event.target.value;
    renderHistory();
  });
  els.historyMemberGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".history-member-card");
    if (!card) return;
    state.selectedHistoryMemberId = card.dataset.id;
    renderHistory();
  });
  els.exportAttendanceCsv.addEventListener("click", exportHistoryCsv);

  if (els.feeCollectionList) {
    els.feeCollectionList.addEventListener("click", (event) => {
      const button = event.target.closest(".collect-fee-button");
      if (button && !button.disabled) openFeeDialog(button.dataset.id);
    });
  }
  els.paymentSearch.addEventListener("input", (event) => {
    state.paymentSearch = event.target.value;
    renderPayments();
  });
  els.paymentStatusFilter.addEventListener("change", (event) => {
    state.paymentStatusFilter = event.target.value;
    renderPayments();
  });
  els.paymentStartDate.addEventListener("change", renderPayments);
  els.paymentEndDate.addEventListener("change", renderPayments);

  els.paymentCustomerGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".payment-customer-card");
    if (!card) return;
    state.selectedPaymentMemberId = card.dataset.id;
    renderPayments();
  });
  els.paymentCustomerDetail.addEventListener("click", (event) => {
    const button = event.target.closest(".collect-fee-button");
    if (button && !button.disabled) openFeeDialog(button.dataset.id);
  });

  els.openAddExpense.addEventListener("click", () => openExpenseDialog());
  els.closeExpenseDialog.addEventListener("click", closeExpenseDialogBox);
  els.expenseForm.addEventListener("submit", submitExpense);
  els.deleteExpense.addEventListener("click", deleteCurrentExpense);
  els.exportFinanceCsv.addEventListener("click", exportFinanceCsv);
  els.financeStartDate.addEventListener("change", renderFinance);
  els.financeEndDate.addEventListener("change", renderFinance);
  els.financeTypeFilter.addEventListener("change", (event) => {
    state.financeTypeFilter = event.target.value;
    renderFinance();
  });
  els.financeCategoryFilter.addEventListener("change", (event) => {
    state.financeCategoryFilter = event.target.value;
    renderFinance();
  });
  els.financeLedger.addEventListener("click", (event) => {
    const expenseRow = event.target.closest("[data-expense-id]");
    if (expenseRow) {
      const expense = state.expenses.find((item) => item.id === expenseRow.dataset.expenseId);
      if (expense) openExpenseDialog(expense);
      return;
    }
    const earningRow = event.target.closest("[data-member-id]");
    if (earningRow && state.members.some((member) => member.id === earningRow.dataset.memberId)) {
      openDetail(earningRow.dataset.memberId);
    }
  });
  els.financeOverdueList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collect-id]");
    if (button) openFeeDialog(button.dataset.collectId);
  });

  els.attendanceList.addEventListener("click", (event) => {
    const button = event.target.closest(".attendance-button");
    if (!button) return;
    const memberId = button.dataset.id;
    const day = state.attendanceDate || todayKey();
    if (button.dataset.action === "mark-present") {
      setMemberAttendanceStatus(memberId, day, true);
      return;
    }
    if (button.dataset.action === "request-remove") {
      state.pendingAttendanceRemovalId = memberId;
      renderAttendanceSheet();
      return;
    }
    if (button.dataset.action === "remove") {
      setMemberAttendanceStatus(memberId, day, false);
      return;
    }
    if (button.dataset.action === "cancel") {
      state.pendingAttendanceRemovalId = "";
      renderAttendanceSheet();
    }
  });

  els.checkinRetry.addEventListener("click", () => {
    setCheckinStatus("checking");
    loadCheckinConfig();
    refreshCheckinView();
  });
  els.refreshCheckins.addEventListener("click", refreshCheckinView);
  els.copyCheckinUrl.addEventListener("click", async () => {
    const url = els.checkinUrlText.textContent.trim();
    if (!url || url.startsWith("Loading")) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Check-in URL copied");
    } catch {
      showToast("Copy failed — select the URL manually");
    }
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderMembers();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeFilter = tab.dataset.filter;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      renderMembers();
    });
  });

  els.trainerSearch.addEventListener("input", (event) => {
    state.trainerSearch = event.target.value;
    renderTrainers();
  });

  els.trainerStatusFilter.addEventListener("change", (event) => {
    state.trainerStatusFilter = event.target.value;
    renderTrainers();
  });

  els.trainerAttendanceDate.addEventListener("change", (event) => {
    state.trainerAttendanceDate = event.target.value || todayKey();
    renderTrainers();
  });

  els.trainerAttendanceList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trainer-attendance-id]");
    if (!button) return;
    setTrainerAttendanceStatus(button.dataset.trainerAttendanceId, state.trainerAttendanceDate || todayKey(), button.dataset.present === "1");
  });

  els.trainerList.addEventListener("click", (event) => {
    const card = event.target.closest(".trainer-card-main");
    if (!card) return;
    const trainer = state.trainers.find((item) => item.id === card.dataset.id);
    if (trainer) openTrainerDialog(trainer);
  });

  els.memberList.addEventListener("click", (event) => {
    const reminder = event.target.closest(".member-whatsapp-action");
    if (reminder) {
      event.stopPropagation();
      if (!reminder.disabled) sendReminder(reminder.dataset.reminderId);
      return;
    }
    const card = event.target.closest(".member-card-main");
    if (card) openDetail(card.dataset.id);
  });

  els.attendanceCalendar.addEventListener("click", (event) => {
    const button = event.target.closest(".day-cell");
    if (button) toggleCalendarDay(button.dataset.day);
  });
}

async function init() {
  state.attendanceDate = todayKey();
  state.trainerAttendanceDate = todayKey();
  els.attendanceDate.value = state.attendanceDate;
  if (els.trainerAttendanceDate) els.trainerAttendanceDate.value = state.trainerAttendanceDate;
  const defaultHistoryRange = getDefaultHistoryRange();
  els.historyStartDate.value = defaultHistoryRange.start;
  els.historyEndDate.value = defaultHistoryRange.end;
  if (els.financeStartDate) els.financeStartDate.value = defaultHistoryRange.start;
  if (els.financeEndDate) els.financeEndDate.value = defaultHistoryRange.end;
  renderFinanceCategoryOptions();
  bindEvents();
  loadTrainers();
  try {
    await loadSettings();
    await loadMembers();
    await loadExpenses().catch(() => {
      state.expenses = [];
    });
    render();
    setView("dashboard");
  } catch (error) {
    showToast(error.message || "Unable to load backend data");
    render();
  }
}

/* ---------------------------------------------------------------------------
 * Authentication + multi-gym context (multi-tenant separation).
 * Only admins/staff log in. A super-admin picks which gym to manage; gym admins
 * and staff are locked to their own gym server-side.
 * ------------------------------------------------------------------------- */
const authState = { user: null, gymId: "", gyms: [] };
let appStarted = false;
const ACTIVE_GYM_KEY = "gym-admin-active-gym";

function authEl(id) {
  return document.getElementById(id);
}

function roleLabel(role) {
  if (role === "super_admin") return "Owner";
  if (role === "gym_admin") return "Admin";
  return "Staff";
}

function showLogin() {
  authState.user = null;
  authState.gymId = "";
  appStarted = false;
  clearToken();
  if (authEl("loginOverlay")) authEl("loginOverlay").hidden = false;
  if (authEl("authBar")) authEl("authBar").hidden = true;
  document.body.classList.add("auth-locked");
}

function hideLogin() {
  if (authEl("loginOverlay")) authEl("loginOverlay").hidden = true;
  document.body.classList.remove("auth-locked");
}

async function fetchMe() {
  try {
    const token = getToken();
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) return null;
    return (await res.json()).user;
  } catch {
    return null;
  }
}

function setupRoleUi() {
  const role = authState.user ? authState.user.role : "";
  authEl("gymSelect").hidden = role !== "super_admin";
  authEl("gymsBtn").hidden = role !== "super_admin";
  authEl("staffBtn").hidden = !(role === "super_admin" || role === "gym_admin");
  authEl("authUser").textContent = authState.user ? `${authState.user.email} · ${roleLabel(role)}` : "";
}

function renderGymSelect() {
  const select = authEl("gymSelect");
  select.innerHTML = authState.gyms
    .map((gym) => `<option value="${gym.id}">${escapeHtml(gym.name)}${gym.status === "suspended" ? " (suspended)" : ""}</option>`)
    .join("");
  if (authState.gymId) select.value = authState.gymId;
}

async function loadGyms() {
  try {
    authState.gyms = await api("/api/gyms");
  } catch {
    authState.gyms = [];
  }
}

async function reloadGymData() {
  try {
    await loadSettings();
    await loadMembers();
    await loadExpenses().catch(() => {
      state.expenses = [];
    });
    render();
    setView(state.activeView || "dashboard");
  } catch (error) {
    showToast(error.message || "Unable to load gym data");
  }
}

async function startApp() {
  if (!authState.gymId) return;
  if (!appStarted) {
    appStarted = true;
    await init();
  } else {
    await reloadGymData();
  }
}

async function applyAuthedUser(user) {
  authState.user = user;
  hideLogin();
  authEl("authBar").hidden = false;
  setupRoleUi();

  if (user.role === "super_admin") {
    await loadGyms();
    const stored = localStorage.getItem(ACTIVE_GYM_KEY) || "";
    authState.gymId = authState.gyms.some((gym) => gym.id === stored)
      ? stored
      : authState.gyms[0]
        ? authState.gyms[0].id
        : "";
    renderGymSelect();
    if (!authState.gymId) {
      showToast("Create your first gym to get started.");
      openGyms();
      return;
    }
  } else {
    authState.gymId = user.tenantId || (user.gym && user.gym.id) || "";
  }
  await startApp();
}

function openGyms() {
  renderGymsList();
  authEl("gymFormError").hidden = true;
  authEl("gymsDialog").showModal();
}

function renderGymsList() {
  const list = authEl("gymsList");
  if (!authState.gyms.length) {
    list.innerHTML = `<p class="auth-list-empty">No gyms yet. Create one above.</p>`;
    return;
  }
  list.innerHTML = authState.gyms
    .map(
      (gym) => `
        <div class="auth-list-row">
          <div><strong>${escapeHtml(gym.name)}</strong><small> /checkin/${escapeHtml(gym.slug)}${gym.status === "suspended" ? " · suspended" : ""}</small></div>
          <div style="display:flex; gap:6px;">
            <button class="auth-chip" data-select-gym="${gym.id}" type="button">Manage</button>
            <button class="auth-chip${gym.status === "suspended" ? "" : " danger"}" data-toggle-gym="${gym.id}" data-status="${gym.status}" type="button">${gym.status === "suspended" ? "Activate" : "Suspend"}</button>
          </div>
        </div>`,
    )
    .join("");

  list.querySelectorAll("[data-select-gym]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      authState.gymId = btn.getAttribute("data-select-gym");
      localStorage.setItem(ACTIVE_GYM_KEY, authState.gymId);
      renderGymSelect();
      authEl("gymsDialog").close();
      await startApp();
    }),
  );
  list.querySelectorAll("[data-toggle-gym]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-toggle-gym");
      const next = btn.getAttribute("data-status") === "suspended" ? "active" : "suspended";
      try {
        await api(`/api/gyms/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
        await loadGyms();
        renderGymSelect();
        renderGymsList();
      } catch (error) {
        showToast(error.message);
      }
    }),
  );
}

async function onCreateGym(event) {
  event.preventDefault();
  const errorEl = authEl("gymFormError");
  errorEl.hidden = true;
  const payload = {
    gymName: authEl("newGymName").value.trim(),
    slug: authEl("newGymSlug").value.trim(),
    adminEmail: authEl("newGymAdminEmail").value.trim(),
    adminPassword: authEl("newGymAdminPassword").value,
    adminName: authEl("newGymAdminName").value.trim(),
  };
  const submitButton = authEl("createGymSubmit");
  if (submitButton?.disabled) return;
  setButtonBusy(submitButton, true);
  try {
    const result = await api("/api/gyms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    authEl("createGymForm").reset();
    await loadGyms();
    authState.gymId = result.gym.id;
    localStorage.setItem(ACTIVE_GYM_KEY, authState.gymId);
    renderGymSelect();
    renderGymsList();
    showToast(`Gym "${result.gym.name}" created.`);
    if (!appStarted) {
      authEl("gymsDialog").close();
      await startApp();
    }
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.hidden = false;
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function openStaff() {
  authEl("staffFormError").hidden = true;
  authEl("staffDialog").showModal();
  await loadStaff();
}

async function loadStaff() {
  const list = authEl("staffList");
  try {
    const staff = await api("/api/staff");
    list.innerHTML = staff.length
      ? staff
          .map((u) => `<div class="auth-list-row"><div><strong>${escapeHtml(u.name || u.email)}</strong><small> ${escapeHtml(u.email)} · ${roleLabel(u.role)}</small></div></div>`)
          .join("")
      : `<p class="auth-list-empty">No staff yet.</p>`;
  } catch (error) {
    list.innerHTML = `<p class="auth-list-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function onCreateStaff(event) {
  event.preventDefault();
  const errorEl = authEl("staffFormError");
  errorEl.hidden = true;
  const submitButton = authEl("createStaffForm").querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  setButtonBusy(submitButton, true);
  try {
    await api("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: authEl("newStaffName").value.trim(),
        email: authEl("newStaffEmail").value.trim(),
        password: authEl("newStaffPassword").value,
        role: authEl("newStaffRole").value,
      }),
    });
    authEl("createStaffForm").reset();
    await loadStaff();
    showToast("Staff account created.");
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.hidden = false;
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function bindAuthEvents() {
  authEl("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = authEl("loginError");
    const submit = authEl("loginSubmit");
    errorEl.hidden = true;
    setButtonBusy(submit, true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEl("loginEmail").value.trim(), password: authEl("loginPassword").value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token);
      authEl("loginPassword").value = "";
      await applyAuthedUser(data.user);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      setButtonBusy(submit, false);
    }
  });

  authEl("logoutBtn").addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore network errors on logout
    }
    clearToken();
    showLogin();
  });

  authEl("gymSelect").addEventListener("change", async (event) => {
    authState.gymId = event.target.value;
    localStorage.setItem(ACTIVE_GYM_KEY, authState.gymId);
    await startApp();
  });

  authEl("gymsBtn").addEventListener("click", openGyms);
  authEl("gymsClose").addEventListener("click", () => authEl("gymsDialog").close());
  authEl("staffBtn").addEventListener("click", openStaff);
  authEl("staffClose").addEventListener("click", () => authEl("staffDialog").close());
  authEl("createGymForm").addEventListener("submit", onCreateGym);
  authEl("createStaffForm").addEventListener("submit", onCreateStaff);
}

async function bootAuth() {
  bindAuthEvents();
  const user = await fetchMe();
  if (!user) {
    showLogin();
    return;
  }
  await applyAuthedUser(user);
}

bootAuth();
