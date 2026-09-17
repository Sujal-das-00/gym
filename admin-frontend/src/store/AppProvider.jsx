import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext } from "./AppContext.jsx";
import { api, clearToken, fetchMe, jsonRequest, logout as apiLogout, setApiContext } from "../lib/api.js";
import { ACTIVE_GYM_KEY, DEFAULT_SETTINGS, VIEW_COPY } from "../lib/constants.js";
import { localDateKey, monthKey, todayKey } from "../lib/dates.js";
import { createDomain, getBillingPeriodKeys } from "../lib/billing.js";
import { applyTheme, normalizeTheme } from "../lib/theme.js";
import { loadTrainers as readTrainers, persistTrainers } from "../lib/trainers.js";
import { normalizePhone } from "../lib/format.js";

const CLOSED_MEMBER_DIALOG = { open: false, member: null };
const CLOSED_TRAINER_DIALOG = { open: false, trainer: null };
const CLOSED_EXPENSE_DIALOG = { open: false, expense: null };
const CLOSED_FEE_DIALOG = { open: false, memberId: "", selectedPeriods: [] };

function generateGymId(members) {
  const existing = new Set(members.map((member) => member.gymId || member.id).filter(Boolean));
  let next = members.length + 1001;
  let id = "GYM" + next;
  while (existing.has(id)) {
    next += 1;
    id = "GYM" + next;
  }
  return id;
}

export function AppProvider({ children }) {
  /* ---- Auth + multi-gym context (multi-tenant separation) ---------------- */
  const [user, setUser] = useState(null);
  const [gymId, setGymId] = useState("");
  const [gyms, setGyms] = useState([]);
  const [authChecked, setAuthChecked] = useState(false);

  /* ---- Server data ------------------------------------------------------ */
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Bumped only when settings arrive from the server, so the Settings form knows
  // to re-seed its draft without doing so on every in-place tweak.
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [trainers, setTrainers] = useState(() => readTrainers());
  const [dataReady, setDataReady] = useState(false);

  /* ---- Shared UI state -------------------------------------------------- */
  const [activeView, setActiveViewState] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState("");
  // Shared because the detail dialog's calendar renders the month of the date
  // picked on the Mark Attendance sheet, exactly as the original did.
  const [attendanceDate, setAttendanceDate] = useState(() => todayKey());
  const [trainerAttendanceDate, setTrainerAttendanceDate] = useState(() => todayKey());
  const [pendingAttendanceRemovalId, setPendingAttendanceRemovalId] = useState("");
  const [selectedHistoryMemberId, setSelectedHistoryMemberId] = useState("");
  const [selectedPaymentMemberId, setSelectedPaymentMemberId] = useState("");

  /* ---- Dialogs ---------------------------------------------------------- */
  const [memberDialog, setMemberDialog] = useState(CLOSED_MEMBER_DIALOG);
  const [trainerDialog, setTrainerDialog] = useState(CLOSED_TRAINER_DIALOG);
  const [expenseDialog, setExpenseDialog] = useState(CLOSED_EXPENSE_DIALOG);
  const [feeDialog, setFeeDialog] = useState(CLOSED_FEE_DIALOG);
  const [detailMemberId, setDetailMemberId] = useState("");
  // The day whose earning/expense breakdown the Insights screen is showing ("" = closed).
  const [dayLedgerDate, setDayLedgerDate] = useState("");
  const [gymsDialogOpen, setGymsDialogOpen] = useState(false);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);

  /* ---- Poller bookkeeping (was `state.*` scratch fields) ---------------- */
  const attendanceRevision = useRef(-1);
  const pollingDate = useRef("");
  const toastTimer = useRef(null);
  const membersRef = useRef(members);
  membersRef.current = members;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const userRef = useRef(user);
  userRef.current = user;
  const gymIdRef = useRef(gymId);
  gymIdRef.current = gymId;

  const domain = useMemo(() => createDomain(settings), [settings]);

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  /* ---- api() needs the live auth context -------------------------------- */
  const signOut = useCallback(() => {
    setUser(null);
    setGymId("");
    setDataReady(false);
    clearToken();
  }, []);

  useEffect(() => {
    setApiContext({
      getUser: () => userRef.current,
      getGymId: () => gymIdRef.current,
      onUnauthorized: () => signOut(),
    });
  }, [signOut]);

  /* ---- Theme ------------------------------------------------------------ */
  useEffect(() => {
    applyTheme(normalizeTheme(settings.theme));
  }, [settings.theme]);

  useEffect(() => {
    document.body.classList.toggle("auth-locked", !user);
  }, [user]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", drawerOpen);
  }, [drawerOpen]);

  /* ---- Drawer ----------------------------------------------------------- */
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((open) => !open), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const setView = useCallback((view) => {
    setActiveViewState(VIEW_COPY[view] ? view : "dashboard");
    setDayLedgerDate("");
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ---- Loading + one-time record migrations ----------------------------- */
  const persistAllMembers = useCallback(async (rows) => {
    await Promise.all(
      rows.map((member) =>
        api("/api/members/" + encodeURIComponent(member.id), jsonRequest("PUT", member)),
      ),
    );
  }, []);

  const loadGymData = useCallback(async () => {
    const loadedSettings = { ...DEFAULT_SETTINGS, ...(await api("/api/settings")) };
    setSettings(loadedSettings);
    setSettingsRevision((revision) => revision + 1);

    let rows = await api("/api/members");
    let changed = false;

    // migratePaymentMonths: older payments only carried a calendar month.
    rows = rows.map((member) => {
      const billingPeriods = getBillingPeriodKeys(loadedSettings, member);
      let memberChanged = false;
      const payments = (member.payments || []).map((payment, index) => {
        if (payment.billingPeriod) return payment;
        memberChanged = true;
        return {
          ...payment,
          billingPeriod: payment.billingMonth || billingPeriods[index] || payment.month || monthKey(),
        };
      });
      if (!memberChanged) return member;
      changed = true;
      return { ...member, payments };
    });

    // ensureMemberGymIds + ensureMemberTrainerFields.
    const withIds = [];
    rows.forEach((member) => {
      let next = member;
      if (!next.gymId) {
        const gymCode = next.id?.startsWith("GYM") ? next.id : generateGymId(withIds.concat(rows));
        next = { ...next, gymId: gymCode };
        changed = true;
      }
      if (typeof next.trainerId !== "string") {
        next = { ...next, trainerId: String(next.trainerId || "") };
        changed = true;
      }
      withIds.push(next);
    });
    rows = withIds;

    setMembers(rows);
    if (changed) persistAllMembers(rows).catch(() => {});

    try {
      setExpenses(await api("/api/expenses"));
    } catch {
      setExpenses([]);
    }
    setDataReady(true);
  }, [persistAllMembers]);

  /* ---- Auth flows ------------------------------------------------------- */
  const loadGyms = useCallback(async () => {
    try {
      const rows = await api("/api/gyms");
      setGyms(rows);
      return rows;
    } catch {
      setGyms([]);
      return [];
    }
  }, []);

  const applyAuthedUser = useCallback(
    async (nextUser) => {
      setUser(nextUser);
      userRef.current = nextUser;

      let activeGymId = "";
      if (nextUser.role === "super_admin") {
        const rows = await loadGyms();
        const stored = localStorage.getItem(ACTIVE_GYM_KEY) || "";
        activeGymId = rows.some((gym) => gym.id === stored) ? stored : rows[0] ? rows[0].id : "";
        setGymId(activeGymId);
        gymIdRef.current = activeGymId;
        if (!activeGymId) {
          showToast("Create your first gym to get started.");
          setGymsDialogOpen(true);
          return;
        }
      } else {
        activeGymId = nextUser.tenantId || (nextUser.gym && nextUser.gym.id) || "";
        setGymId(activeGymId);
        gymIdRef.current = activeGymId;
      }

      try {
        await loadGymData();
      } catch (error) {
        showToast(error.message || "Unable to load backend data");
      }
    },
    [loadGymData, loadGyms, showToast],
  );

  const selectGym = useCallback(
    async (nextGymId) => {
      setGymId(nextGymId);
      gymIdRef.current = nextGymId;
      localStorage.setItem(ACTIVE_GYM_KEY, nextGymId);
      try {
        await loadGymData();
        setView(activeView || "dashboard");
      } catch (error) {
        showToast(error.message || "Unable to load gym data");
      }
    },
    [activeView, loadGymData, setView, showToast],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    signOut();
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (me) await applyAuthedUser(me);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount, mirroring bootAuth() in the original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Members ---------------------------------------------------------- */
  const saveMemberRecord = useCallback(async (member) => {
    const path = member.id ? "/api/members/" + encodeURIComponent(member.id) : "/api/members";
    return api(path, jsonRequest(member.id ? "PUT" : "POST", member));
  }, []);

  const saveMember = useCallback(
    async (payload) => {
      const wasEditing = Boolean(payload.id);
      const saved = await saveMemberRecord(payload);
      setMembers((rows) => (wasEditing ? rows.map((m) => (m.id === saved.id ? saved : m)) : [...rows, saved]));
      if (!wasEditing) {
        setSelectedHistoryMemberId((id) => id || saved.id);
        setSelectedPaymentMemberId((id) => id || saved.id);
      }
      showToast(wasEditing ? "Member updated" : "Member added");
      return saved;
    },
    [saveMemberRecord, showToast],
  );

  const deleteMember = useCallback(
    async (memberId) => {
      await api("/api/members/" + encodeURIComponent(memberId), { method: "DELETE" });
      setMembers((rows) => rows.filter((item) => item.id !== memberId));
      setDetailMemberId((id) => (id === memberId ? "" : id));
      showToast("Member deleted");
    },
    [showToast],
  );

  const setMemberAttendanceStatus = useCallback(
    async (memberId, day, present) => {
      const member = membersRef.current.find((item) => item.id === memberId);
      if (!member || !day) return;
      const wasPresent = (member.attendance || []).includes(day);
      setPendingAttendanceRemovalId("");
      if (wasPresent === present) return;

      const withStatus = (rows, isPresent) =>
        rows.map((item) => {
          if (item.id !== memberId) return item;
          const attendance = new Set(item.attendance || []);
          if (isPresent) attendance.add(day);
          else attendance.delete(day);
          return { ...item, attendance: [...attendance].sort() };
        });

      setMembers((rows) => withStatus(rows, present));
      try {
        const result = await api("/api/attendance", jsonRequest("POST", { memberId, date: day, present }));
        attendanceRevision.current = result.revision;
        showToast(present ? "Checked in " + member.name : "Attendance removed for " + member.name);
      } catch (error) {
        setMembers((rows) => withStatus(rows, wasPresent));
        showToast(error.message);
      }
    },
    [showToast],
  );

  /* ---- Fee collection --------------------------------------------------- */
  const openFeeDialog = useCallback(
    (memberId) => {
      const member = membersRef.current.find((item) => item.id === memberId);
      if (!member) return;
      const currentDomain = createDomain(settingsRef.current);
      const unpaidPeriods = currentDomain.getUnpaidPeriods(member);
      const currentPeriod = currentDomain.getBillablePeriodKeys(member).at(-1);
      let selectedPeriods =
        currentPeriod && unpaidPeriods.includes(currentPeriod) ? [currentPeriod] : unpaidPeriods.slice(0, 1);
      if (!selectedPeriods.length && unpaidPeriods.length) selectedPeriods = [unpaidPeriods[0]];
      setFeeDialog({ open: true, memberId: member.id, selectedPeriods });
    },
    [],
  );

  const closeFeeDialog = useCallback(() => setFeeDialog(CLOSED_FEE_DIALOG), []);

  const setSelectedBillingPeriods = useCallback((periods) => {
    setFeeDialog((dialog) => ({ ...dialog, selectedPeriods: periods }));
  }, []);

  const collectFees = useCallback(
    async (member, periods, mode = "cash") => {
      const payments = periods.map((billingPeriod) => ({
        id: crypto.randomUUID(),
        date: todayKey(),
        month: monthKey(),
        billingMonth: String(billingPeriod).length === 7 ? billingPeriod : "",
        billingPeriod,
        amount: Number(member.fee),
        // How it was collected at the desk; shown on the member's invoice.
        mode,
      }));
      const saved = await api(
        "/api/members/" + encodeURIComponent(member.id) + "/payments",
        jsonRequest("POST", { payments }),
      );
      setMembers((rows) => rows.map((item) => (item.id === saved.id ? saved : item)));
      setSelectedPaymentMemberId(saved.id);
      closeFeeDialog();
      const unit = domain.getPeriodUnitLabel(member);
      showToast("Collected " + payments.length + " " + unit + (payments.length === 1 ? "" : "s") + " from " + saved.name);
    },
    [closeFeeDialog, domain, showToast],
  );

  /* ---- Expenses --------------------------------------------------------- */
  const saveExpense = useCallback(
    async (payload, editingId) => {
      const wasEditing = Boolean(editingId);
      const saved = await api(
        wasEditing ? "/api/expenses/" + encodeURIComponent(editingId) : "/api/expenses",
        jsonRequest(wasEditing ? "PUT" : "POST", payload),
      );
      setExpenses((rows) => (wasEditing ? rows.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...rows]));
      showToast(wasEditing ? "Expense updated" : "Expense recorded");
    },
    [showToast],
  );

  const deleteExpense = useCallback(
    async (expenseId) => {
      await api("/api/expenses/" + encodeURIComponent(expenseId), { method: "DELETE" });
      setExpenses((rows) => rows.filter((item) => item.id !== expenseId));
      showToast("Expense deleted");
    },
    [showToast],
  );

  /* ---- Settings --------------------------------------------------------- */
  const saveSettings = useCallback(async (nextSettings) => {
    const saved = await api("/api/settings", jsonRequest("PUT", nextSettings));
    setSettings((current) => ({ ...current, ...saved }));
    setSettingsRevision((revision) => revision + 1);
    return saved;
  }, []);

  /* ---- Trainers (localStorage only) ------------------------------------- */
  const commitTrainers = useCallback((rows) => {
    setTrainers(rows);
    persistTrainers(rows);
  }, []);

  const setTrainerAttendanceStatus = useCallback(
    (trainerId, day, present) => {
      if (!day) return;
      let found = false;
      const rows = trainers.map((trainer) => {
        if (trainer.id !== trainerId) return trainer;
        found = true;
        const attendance = new Set(trainer.attendance || []);
        if (present) attendance.add(day);
        else attendance.delete(day);
        return { ...trainer, attendance: [...attendance].sort() };
      });
      if (!found) return;
      commitTrainers(rows);
      showToast(present ? "Trainer marked present" : "Trainer marked absent");
    },
    [commitTrainers, showToast, trainers],
  );

  const saveTrainer = useCallback(
    (trainer, wasEditing) => {
      commitTrainers(
        wasEditing ? trainers.map((item) => (item.id === trainer.id ? trainer : item)) : [...trainers, trainer],
      );
      showToast(wasEditing ? "Trainer updated" : "Trainer added");
    },
    [commitTrainers, showToast, trainers],
  );

  const deleteTrainer = useCallback(
    (trainerId) => {
      commitTrainers(trainers.filter((item) => item.id !== trainerId));
      const cleared = membersRef.current.map((member) =>
        member.trainerId === trainerId ? { ...member, trainerId: "" } : member,
      );
      setMembers(cleared);
      persistAllMembers(cleared.filter((member) => member.trainerId === "")).catch(() => {});
      showToast("Trainer deleted");
    },
    [commitTrainers, persistAllMembers, showToast, trainers],
  );

  /* ---- Attendance sync (polling) ---------------------------------------- */
  const applyAttendanceStatus = useCallback((rows) => {
    const date = pollingDate.current || todayKey();
    setMembers((current) => {
      let changed = false;
      const next = current.map((member) => {
        const row = rows.find((item) => item.id === member.id || item.gymId === member.gymId);
        if (!row) return member;
        const attendance = new Set(member.attendance || []);
        const hadDate = attendance.has(date);
        if (row.present) attendance.add(date);
        else attendance.delete(date);
        if (hadDate === attendance.has(date)) return member;
        changed = true;
        return { ...member, attendance: [...attendance].sort() };
      });
      return changed ? next : current;
    });
  }, []);

  const refreshAttendanceStatus = useCallback(
    async (force = false) => {
      const date = attendanceDate || todayKey();
      if (pollingDate.current !== date) {
        pollingDate.current = date;
        attendanceRevision.current = -1;
      }
      const since = force ? -1 : attendanceRevision.current;
      const data = await api(
        "/api/attendance/status?date=" + encodeURIComponent(date) + "&since=" + encodeURIComponent(since),
      );
      attendanceRevision.current = data.revision;
      if (data.active && Array.isArray(data.rows)) applyAttendanceStatus(data.rows);
      return data;
    },
    [applyAttendanceStatus, attendanceDate],
  );

  const findLocalMemberByQr = useCallback((row) => {
    const rowId = String(row.memberId || row.gymId || "").toLowerCase();
    const rowPhone = normalizePhone(row.phone);
    return membersRef.current.find(
      (member) =>
        String(member.id || "").toLowerCase() === rowId ||
        String(member.gymId || "").toLowerCase() === rowId ||
        normalizePhone(member.phone) === rowPhone,
    );
  }, []);

  const value = {
    // auth
    user,
    gymId,
    gyms,
    authChecked,
    applyAuthedUser,
    selectGym,
    loadGyms,
    logout,
    signOut,
    gymsDialogOpen,
    setGymsDialogOpen,
    staffDialogOpen,
    setStaffDialogOpen,
    // data
    members,
    trainers,
    expenses,
    settings,
    setSettings,
    settingsRevision,
    dataReady,
    domain,
    generateGymId: () => generateGymId(membersRef.current),
    // views
    activeView,
    setView,
    drawerOpen,
    toggleDrawer,
    closeDrawer,
    toast,
    showToast,
    // shared selections
    attendanceDate,
    setAttendanceDate,
    trainerAttendanceDate,
    setTrainerAttendanceDate,
    pendingAttendanceRemovalId,
    setPendingAttendanceRemovalId,
    selectedHistoryMemberId,
    setSelectedHistoryMemberId,
    selectedPaymentMemberId,
    setSelectedPaymentMemberId,
    // dialogs
    memberDialog,
    openMemberDialog: (member = null) => setMemberDialog({ open: true, member }),
    closeMemberDialog: () => setMemberDialog(CLOSED_MEMBER_DIALOG),
    trainerDialog,
    openTrainerDialog: (trainer = null) => setTrainerDialog({ open: true, trainer }),
    closeTrainerDialog: () => setTrainerDialog(CLOSED_TRAINER_DIALOG),
    expenseDialog,
    openExpenseDialog: (expense = null) => setExpenseDialog({ open: true, expense }),
    closeExpenseDialog: () => setExpenseDialog(CLOSED_EXPENSE_DIALOG),
    feeDialog,
    openFeeDialog,
    closeFeeDialog,
    setSelectedBillingPeriods,
    detailMemberId,
    openDetail: (memberId) => setDetailMemberId(memberId),
    closeDetail: () => setDetailMemberId(""),
    dayLedgerDate,
    openDayLedger: (date) => setDayLedgerDate(date),
    closeDayLedger: () => setDayLedgerDate(""),
    // actions
    saveMember,
    deleteMember,
    setMemberAttendanceStatus,
    collectFees,
    saveExpense,
    deleteExpense,
    saveSettings,
    saveTrainer,
    deleteTrainer,
    setTrainerAttendanceStatus,
    refreshAttendanceStatus,
    findLocalMemberByQr,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
