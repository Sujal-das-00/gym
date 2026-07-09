const API_BASE = "";
const TRAINERS_STORAGE_KEY = "gym-admin-trainers-v1";

const state = {
  members: [],
  trainers: [],
  settings: {
    gymName: "Gym Admin",
    logo: "",
    billingCycleMode: "30-days",
    customBillingDays: 25,
    defaultCollectionTiming: "at-join",
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
  const res = await fetch(API_BASE + path, options);
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

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
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
  const checkinUrl = state.checkinConfig.localUrl + "/checkin";
  els.checkinUrlText.textContent = checkinUrl;
  const qrSrc = "/api/qr?url=" + encodeURIComponent(checkinUrl);
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

function getUnpaidPeriods(member) {
  const paidPeriods = getPaidPeriodSet(member);
  return getBillingPeriodKeys(member).filter((period) => !paidPeriods.has(period));
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
  const periods = getBillingPeriodKeys(member);
  const currentPeriod = periods[periods.length - 1];
  return Boolean(currentPeriod && getPaidPeriodSet(member).has(currentPeriod));
}

function isOverdue(member) {
  const unpaid = getUnpaidPeriods(member);
  if (getCollectionTiming(member) === "fixed-day") {
    // Only overdue once a period has fully ended without payment; the in-progress period is not yet due.
    const today = todayKey();
    return unpaid.some((period) => localDateKey(periodEndDate(member, period)) < today);
  }
  return unpaid.some((period) => period < todayKey() || (period.length === 7 && period < monthKey()));
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
  const currentPeriod = getBillingPeriodKeys(member).at(-1);
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
            <button class="payment-customer-card ${member.id === state.selectedPaymentMemberId ? "active" : ""}" data-id="${member.id}" type="button">
              ${photoMarkup(member)}
              <div>
                <h3>${escapeHtml(member.name)}</h3>
                <p>${payments.length} payments · ${currency(total)}</p>
                <span>${getMembershipLabel(member)} · ${paid ? "Paid" : "Pending"}</span>
              </div>
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
    <div class="payment-detail-head">
      ${photoMarkup(member)}
      <div>
        <h3>${escapeHtml(member.name)}</h3>
        <p>${escapeHtml(member.phone)} · ${currency(member.fee)} · ${getMembershipLabel(member)} · ${payments.length} filtered payments</p>
      </div>
      <button class="collect-fee-button compact-collect" data-id="${member.id}" type="button" ${getUnpaidPeriods(member).length ? "" : "disabled"}>
        ${getUnpaidPeriods(member).length ? "Add payment" : "No pending dues"}
      </button>
    </div>
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
  return daysBetween(start, end).map((day) => {
    const holiday = isHoliday(day);
    const present = attendance.has(day);
    return {
      date: day,
      status: holiday ? "holiday" : present ? "present" : "absent",
      present,
      holiday,
    };
  });
}

function filterHistoryRows(rows) {
  const status = state.historyStatusFilter;
  if (status === "all") return rows;
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
          return `
            <button class="history-member-card ${member.id === state.selectedHistoryMemberId ? "active" : ""}" data-id="${member.id}" type="button">
              ${photoMarkup(member)}
              <div>
                <h3>${escapeHtml(member.name)}</h3>
                <p>${escapeHtml(member.phone)} · ${escapeHtml(member.gymId || member.id || "")}</p>
                <span>${present} present · ${holidays} holidays</span>
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
            <article class="attendance-row ${present ? "is-present" : "is-pending"}">
              ${photoMarkup(member)}
              <div class="attendance-member-copy">
                <h3>${escapeHtml(member.name)}</h3>
                <p>${escapeHtml(member.phone)}</p>
              </div>
              <div class="attendance-status-cell">
                <span class="attendance-status ${present ? "present" : "pending"}">
                  ${present ? "Checked in" : "Not checked in"}
                </span>
                ${present ? `<small>Use absent only for a correction.</small>` : `<small>No attendance saved for this date.</small>`}
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
      emptyTitle.textContent = "No trainers yet";
      emptyCopy.textContent = "Add your first trainer profile with contact details, specialty, shift, and status.";
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
    : `<p class="history-empty">Add trainers first, then manual attendance will appear here.</p>`;
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
        <article class="member-card">
          <button class="member-card-main" data-id="${member.id}" type="button">
            ${photoMarkup(member)}
            <div>
              <h3>${escapeHtml(member.name)}</h3>
              <p>${escapeHtml(member.phone)} · ${currency(member.fee)} · ${getMembershipLabel(member)}</p>
              <p>${escapeHtml(member.address)}</p>
              <p>Trainer: ${escapeHtml(getTrainerName(member.trainerId))}</p>
              <div class="member-badges">${badges}</div>
            </div>
          </button>
          <button class="member-whatsapp-action" data-reminder-id="${member.id}" type="button" ${getUnpaidPeriods(member).length ? "" : "disabled"}>
            WhatsApp reminder
          </button>
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

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
  state.settings.logo = await readPhoto(file);
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
  try {
    await saveSettingsRecord();
    applyTheme();
    renderBrand();
    showToast("Settings saved");
  } catch (error) {
    showToast(error.message);
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
  }
}

async function deleteCurrentMember() {
  if (!state.editingId) return;
  const member = state.members.find((item) => item.id === state.editingId);
  const confirmed = confirm("Delete " + (member?.name || "this member") + "?");
  if (!confirmed) return;
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
  const phone = member.phone.replace(/\D/g, "");
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
  bindEvents();
  loadTrainers();
  try {
    await loadSettings();
    await loadMembers();
    render();
    setView("dashboard");
  } catch (error) {
    showToast(error.message || "Unable to load backend data");
    render();
  }
}

init();
