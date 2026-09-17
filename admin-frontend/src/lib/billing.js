/* ---------------------------------------------------------------------------
 * Billing, holiday and attendance domain logic.
 *
 * Ported function-for-function from the original admin-frontend/script.js. The
 * only change is mechanical: functions that used to read the `state.settings`
 * global now take `settings` as their first argument. `createDomain(settings)`
 * at the bottom binds them all, so callers read the same as the original
 * (`domain.isOverdue(member)`).
 * ------------------------------------------------------------------------- */
import {
  addMonths,
  displayDate,
  localDateKey,
  monthKey,
  monthLabelFromKey,
  parseDateKey,
  todayKey,
} from "./dates.js";
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "./constants.js";

export function getWeeklyHolidays(settings) {
  const days = Array.isArray(settings.weeklyHolidays) ? settings.weeklyHolidays : [];
  return days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

export function getHolidayDates(settings) {
  const dates = Array.isArray(settings.holidayDates) ? settings.holidayDates : [];
  return dates.map((date) => String(date || "").slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

export function isHoliday(settings, dayKey) {
  const key = String(dayKey || "").slice(0, 10);
  if (getHolidayDates(settings).includes(key)) return true;
  const day = parseDateKey(key).getDay();
  return getWeeklyHolidays(settings).includes(day);
}

// Why a date is a holiday, for banners: "" when it isn't one.
export function holidayReason(settings, dayKey) {
  const key = String(dayKey || "").slice(0, 10);
  if (getHolidayDates(settings).includes(key)) return "marked as a holiday in Settings";
  const date = parseDateKey(key);
  if (getWeeklyHolidays(settings).includes(date.getDay())) {
    const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(date);
    return `every ${weekday} is a weekly holiday in Settings`;
  }
  return "";
}

export function getBillingCycleMode(settings) {
  const mode = settings.billingCycleMode || "month-start";
  return ["month-start", "30-days", "custom-days"].includes(mode) ? mode : "month-start";
}

export function getBillingCycleDays(settings) {
  if (getBillingCycleMode(settings) === "30-days") return 30;
  const days = Number(settings.customBillingDays || 25);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 25;
}

export function getDefaultCollectionTiming(settings) {
  const mode = settings.defaultCollectionTiming || "at-join";
  return mode === "fixed-day" ? "fixed-day" : "at-join";
}

export function getCollectionTiming(settings, member) {
  const mode = member?.collectionTiming || getDefaultCollectionTiming(settings);
  return mode === "fixed-day" ? "fixed-day" : "at-join";
}

export function getMembershipType(member) {
  return member?.membershipType === "package" ? "package" : "monthly";
}

export function getPackageMonths(member) {
  const months = Number(member?.packageMonths || 1);
  return Number.isFinite(months) && months > 0 ? Math.round(months) : 1;
}

export function getMembershipLabel(member) {
  if (getMembershipType(member) === "package") {
    const months = getPackageMonths(member);
    return `${months}-month package`;
  }
  return "Monthly membership";
}

export function getBillingAmountLabel(member) {
  return getMembershipType(member) === "package" ? "Package fee" : "Monthly fee";
}

export function getPeriodUnitLabel(member) {
  return getMembershipType(member) === "package" ? "package" : "month";
}

export function formatBillingPeriodRange(startKey, months) {
  const start = parseDateKey(startKey);
  if (Number.isNaN(start.getTime())) return displayDate(startKey);
  const end = addMonths(start, months);
  end.setDate(end.getDate() - 1);
  return `${displayDate(startKey)} to ${displayDate(localDateKey(end))}`;
}

export function getBillingPeriodLabel(settings, periodKey, member = null) {
  if (member && getMembershipType(member) === "package") {
    return formatBillingPeriodRange(periodKey, getPackageMonths(member));
  }
  // "Collect after the period" bills fall due at the END of each period, so name
  // them by that due date — join 10 Jul on a 10-day cycle → first bill "20 Jul",
  // not "10 Jul" (the period's start), which reads as billing from the join day.
  if (member && getCollectionTiming(settings, member) === "fixed-day") {
    return displayDate(localDateKey(periodEndDate(settings, member, periodKey)));
  }
  if (String(periodKey || "").length === 7) return monthLabelFromKey(periodKey);
  return displayDate(periodKey);
}

export function getBillingPeriodKeys(settings, member) {
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

  if (getBillingCycleMode(settings) === "month-start") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= end) {
      periods.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return periods;
  }

  const cycleDays = getBillingCycleDays(settings);
  const cursor = new Date(start);
  while (cursor <= today) {
    periods.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + cycleDays);
  }
  return periods;
}

export function getPaymentPeriodKey(payment) {
  return payment.billingPeriod || payment.billingMonth || payment.month;
}

// The one-off joining charge is stored as a payment with this literal in place
// of a billing period, so it shows up as an earning without ever counting as a
// paid membership term. Keep in sync with ADMISSION_PERIOD_KEY in
// backend/src/utils/billing.js.
export const ADMISSION_PERIOD_KEY = "admission";

export function isAdmissionPayment(payment) {
  return payment?.kind === "admission" || payment?.billingPeriod === ADMISSION_PERIOD_KEY;
}

// What a payment row is for: "Admission fee", or the billing period it settles.
export function getPaymentLabel(settings, payment, member = null) {
  if (isAdmissionPayment(payment)) return "Admission fee";
  return getBillingPeriodLabel(settings, getPaymentPeriodKey(payment), member);
}

export function getPaidPeriodSet(member) {
  return new Set(
    (member.payments || [])
      .filter((payment) => !isAdmissionPayment(payment))
      .map(getPaymentPeriodKey)
      .filter(Boolean),
  );
}

// Periods the member can actually be billed for right now. "Collect at join"
// members pay in advance, so a period is billable from the day it starts (join
// 1 Jul on a 20-day cycle → 3 payable cycles by day 40). "Collect after the
// period" members train first and pay at the end, so a period only becomes
// billable once it has fully ended (same member → 2 payable cycles by day 40;
// the in-progress third cycle is not owed yet).
export function getBillablePeriodKeys(settings, member) {
  const periods = getBillingPeriodKeys(settings, member);
  if (getCollectionTiming(settings, member) !== "fixed-day") return periods;
  const today = todayKey();
  return periods.filter((period) => localDateKey(periodEndDate(settings, member, period)) <= today);
}

export function getUnpaidPeriods(settings, member) {
  const paidPeriods = getPaidPeriodSet(member);
  return getBillablePeriodKeys(settings, member).filter((period) => !paidPeriods.has(period));
}

export function periodStartDate(periodKey) {
  const key = String(periodKey || "");
  return parseDateKey(key.length === 7 ? key + "-01" : key);
}

// The date a period rolls over into the next one (its renewal / end-of-term date).
export function periodEndDate(settings, member, periodKey) {
  const start = periodStartDate(periodKey);
  if (Number.isNaN(start.getTime())) return start;
  if (getMembershipType(member) === "package") return addMonths(start, getPackageMonths(member));
  if (getBillingCycleMode(settings) === "month-start") return addMonths(start, 1);
  const end = new Date(start);
  end.setDate(end.getDate() + getBillingCycleDays(settings));
  return end;
}

// Date after the last generated period — i.e. when the next, not-yet-started period begins.
export function nextPeriodStartDate(settings, member) {
  const start = parseDateKey(member.startDate);
  const count = getBillingPeriodKeys(settings, member).length;
  if (getMembershipType(member) === "package") {
    return addMonths(start, count * getPackageMonths(member));
  }
  if (getBillingCycleMode(settings) === "month-start") {
    return addMonths(new Date(start.getFullYear(), start.getMonth(), 1), count);
  }
  const next = new Date(start);
  next.setDate(next.getDate() + count * getBillingCycleDays(settings));
  return next;
}

export function getDueDate(settings, member) {
  const unpaid = getUnpaidPeriods(settings, member);
  if (getCollectionTiming(settings, member) === "fixed-day") {
    // Payment is collected after the period, so it falls due when the period ends.
    if (unpaid.length) return periodEndDate(settings, member, unpaid[0]);
    const periods = getBillingPeriodKeys(settings, member);
    const last = periods[periods.length - 1];
    return last ? periodEndDate(settings, member, last) : nextPeriodStartDate(settings, member);
  }
  // at-join: payment is due at the start of each period.
  if (unpaid.length) return periodStartDate(unpaid[0]);
  return nextPeriodStartDate(settings, member);
}

export function getDueDateKey(settings, member) {
  return localDateKey(getDueDate(settings, member));
}

export function isPaidThisPeriod(settings, member) {
  // For "collect after the period" members the latest billable period is the
  // last one that has ended — the in-progress one is not owed yet.
  const periods = getBillablePeriodKeys(settings, member);
  const currentPeriod = periods[periods.length - 1];
  return Boolean(currentPeriod && getPaidPeriodSet(member).has(currentPeriod));
}

// Unpaid periods that are already due (past their collection point) — the ones
// that make a member count as overdue and add up to the amount they owe.
export function getDueUnpaidPeriods(settings, member) {
  const unpaid = getUnpaidPeriods(settings, member);
  if (getCollectionTiming(settings, member) === "fixed-day") {
    // Only overdue once a period has fully ended without payment; the in-progress period is not yet due.
    const today = todayKey();
    return unpaid.filter((period) => localDateKey(periodEndDate(settings, member, period)) < today);
  }
  return unpaid.filter((period) => period < todayKey() || (period.length === 7 && period < monthKey()));
}

export function getOverdueAmount(settings, member) {
  return getDueUnpaidPeriods(settings, member).length * Number(member.fee || 0);
}

export function isOverdue(settings, member) {
  return getDueUnpaidPeriods(settings, member).length > 0;
}

export function isPresentToday(member) {
  return (member.attendance || []).includes(todayKey());
}

export function getMonthlyAttendance(member) {
  const currentMonth = monthKey();
  return (member.attendance || []).filter((day) => day.startsWith(currentMonth)).length;
}

export function hasAttendance(member, day) {
  return (member.attendance || []).includes(day);
}

export function hasTrainerAttendance(trainer, day) {
  return (trainer.attendance || []).includes(day);
}

export function expenseCategoryLabel(value) {
  if (value === "membership-fee") return "Membership fee";
  if (value === "admission-fee") return "Admission fee";
  return EXPENSE_CATEGORIES.find((category) => category.value === value)?.label || "Other";
}

// "" (mode not recorded) renders as nothing rather than a guessed label.
export function paymentModeLabel(value) {
  return PAYMENT_MODES.find((mode) => mode.value === value)?.label || "";
}

/**
 * Binds every settings-dependent helper above to one settings object so callers
 * can use the original, settings-free signatures.
 */
export function createDomain(settings) {
  return {
    settings,
    getWeeklyHolidays: () => getWeeklyHolidays(settings),
    getHolidayDates: () => getHolidayDates(settings),
    isHoliday: (dayKey) => isHoliday(settings, dayKey),
    holidayReason: (dayKey) => holidayReason(settings, dayKey),
    getBillingCycleMode: () => getBillingCycleMode(settings),
    getBillingCycleDays: () => getBillingCycleDays(settings),
    getDefaultCollectionTiming: () => getDefaultCollectionTiming(settings),
    getCollectionTiming: (member) => getCollectionTiming(settings, member),
    getMembershipType,
    getPackageMonths,
    getMembershipLabel,
    getBillingAmountLabel,
    getPeriodUnitLabel,
    getBillingPeriodLabel: (periodKey, member = null) => getBillingPeriodLabel(settings, periodKey, member),
    getBillingPeriodKeys: (member) => getBillingPeriodKeys(settings, member),
    getPaymentPeriodKey,
    isAdmissionPayment,
    getPaymentLabel: (payment, member = null) => getPaymentLabel(settings, payment, member),
    getPaidPeriodSet,
    getBillablePeriodKeys: (member) => getBillablePeriodKeys(settings, member),
    getUnpaidPeriods: (member) => getUnpaidPeriods(settings, member),
    periodStartDate,
    periodEndDate: (member, periodKey) => periodEndDate(settings, member, periodKey),
    nextPeriodStartDate: (member) => nextPeriodStartDate(settings, member),
    getDueDate: (member) => getDueDate(settings, member),
    getDueDateKey: (member) => getDueDateKey(settings, member),
    isPaidThisPeriod: (member) => isPaidThisPeriod(settings, member),
    getDueUnpaidPeriods: (member) => getDueUnpaidPeriods(settings, member),
    getOverdueAmount: (member) => getOverdueAmount(settings, member),
    isOverdue: (member) => isOverdue(settings, member),
    isPresentToday,
    getMonthlyAttendance,
    hasAttendance,
    hasTrainerAttendance,
    expenseCategoryLabel,
    paymentModeLabel,
  };
}
