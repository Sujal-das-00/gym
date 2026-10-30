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
  currency,
  dateFormatter,
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
    const weekday = dateFormatter({ weekday: "long" }).format(date);
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

// Where billing periods count from: the start of the current plan once it has
// been changed (planStartDate), otherwise the joining date. startDate itself
// stays the joining date. Keep in sync with backend/src/utils/billing.js.
export function billingStartKey(member) {
  return member?.planStartDate || member?.startDate || "";
}

export function getBillingPeriodKeys(settings, member) {
  if (!billingStartKey(member)) return [];
  const start = parseDateKey(billingStartKey(member));
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

/**
 * What has been paid toward each billing period: Map<period, { paid, charge, settled }>.
 *
 * A period can be paid in parts, so each membership row carries the period's
 * full fee (periodFee). The period is settled once its rows add up to that fee.
 * Rows from before part payments have no periodFee — each was a full payment and
 * settles its period alone. Keep in sync with backend/src/utils/billing.js.
 */
export function getPeriodLedger(member) {
  const ledger = new Map();
  for (const payment of member?.payments || []) {
    if (isAdmissionPayment(payment)) continue;
    const period = getPaymentPeriodKey(payment);
    if (!period) continue;
    const entry = ledger.get(period) || { paid: 0, charge: null, legacy: false };
    entry.paid += Number(payment.amount || 0);
    if (payment.periodFee === null || payment.periodFee === undefined) entry.legacy = true;
    else entry.charge = Number(payment.periodFee);
    ledger.set(period, entry);
  }
  for (const entry of ledger.values()) {
    entry.settled = entry.legacy || entry.paid >= entry.charge;
    if (entry.charge === null) entry.charge = entry.paid;
  }
  return ledger;
}

// A membership payment that covered only part of its period's fee.
export function isPartPayment(payment) {
  if (isAdmissionPayment(payment) || payment?.periodFee === null || payment?.periodFee === undefined) return false;
  return Number(payment.amount || 0) < Number(payment.periodFee);
}

/**
 * What every payment list adds to a part payment, so they all read the same:
 * the period's full fee, then what is still owed on that period now — or that
 * it has since been paid off. Empty for full and admission payments.
 * ["of ₹1,000", "₹200 due"]
 */
export function getPartPaymentNotes(member, payment) {
  if (!isPartPayment(payment)) return [];
  const left = getPeriodDue(member, getPaymentPeriodKey(payment)).balance;
  return [`of ${currency(payment.periodFee)}`, left > 0 ? `${currency(left)} due` : "balance cleared"];
}

// Periods paid in full.
export function getPaidPeriodSet(member) {
  const paid = new Set();
  for (const [period, entry] of getPeriodLedger(member)) if (entry.settled) paid.add(period);
  return paid;
}

/**
 * One unpaid period as the fee sheet shows it: its full fee, what is already
 * paid toward it, and what is left.
 */
export function getPeriodDue(member, period) {
  const entry = getPeriodLedger(member).get(period);
  const charge = entry ? entry.charge : Number(member?.fee || 0);
  const paid = entry ? entry.paid : 0;
  return { period, charge, paid, balance: entry?.settled ? 0 : Math.max(0, charge - paid) };
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

// Periods with part of the fee paid. The member keeps training on these; what
// is left is carried to their next payment rather than making them overdue.
export function getPartPaidPeriods(settings, member) {
  const ledger = getPeriodLedger(member);
  return getUnpaidPeriods(settings, member).filter((period) => ledger.has(period));
}

// Rupees left on part-paid periods.
export function getBalanceDue(settings, member) {
  return getPartPaidPeriods(settings, member).reduce((sum, period) => sum + getPeriodDue(member, period).balance, 0);
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
  const start = parseDateKey(billingStartKey(member));
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
  // A part-paid period's balance is shown on its own; the due date is the next
  // period still to pay for.
  const ledger = getPeriodLedger(member);
  const unpaid = getUnpaidPeriods(settings, member).filter((period) => !ledger.has(period));
  if (getCollectionTiming(settings, member) === "fixed-day") {
    // Payment is collected after the period, so it falls due when the period ends.
    if (unpaid.length) return periodEndDate(settings, member, unpaid[0]);
    const periods = getBillingPeriodKeys(settings, member);
    const last = periods[periods.length - 1];
    // No period yet (plan starts later): the first one is owed when it ends.
    return periodEndDate(settings, member, last || billingStartKey(member));
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
  // A plan change set for the next renewal: the old plan's term runs until then,
  // and a change is only saved once that term is paid (or waived).
  if (!currentPeriod && isPlanChangeAhead(member)) return true;
  return Boolean(currentPeriod && getPaidPeriodSet(member).has(currentPeriod));
}

// True while a changed plan hasn't started yet.
export function isPlanChangeAhead(member) {
  return Boolean(member?.planStartDate && member.planStartDate > todayKey());
}

/* ---- Plan changes ------------------------------------------------------- */
// Same rules as backend/src/services/planChangeService.js — the dialog shows
// what the server will enforce.

const periodStartKey = (period) => (String(period).length === 7 ? period + "-01" : String(period));

/**
 * Unpaid periods of the current plan that start before `effectiveDate`. Billing
 * restarts from that date, so the change must collect or waive these.
 */
export function unsettledBeforeChange(settings, member, effectiveDate) {
  const paid = getPaidPeriodSet(member);
  return getBillingPeriodKeys(settings, member).filter(
    (period) => periodStartKey(period) < effectiveDate && !paid.has(period),
  );
}

// The latest date a new plan may start: the current period's renewal (or today).
export function latestPlanChangeDate(settings, member) {
  const renewal = localDateKey(nextPeriodStartDate(settings, member));
  const today = todayKey();
  return renewal > today ? renewal : today;
}

// The key the new plan's first period will have (see getBillingPeriodKeys).
export function firstPlanPeriodKey(settings, plan, effectiveDate) {
  if (plan.membershipType !== "package" && getBillingCycleMode(settings) === "month-start") return effectiveDate.slice(0, 7);
  return effectiveDate;
}

export function planLabel(plan) {
  return plan.membershipType === "package" ? `${getPackageMonths(plan)}-month package` : "Monthly";
}

export function collectionTimingLabel(timing) {
  return timing === "fixed-day" ? "After the period" : "Upfront";
}

// Unpaid periods that are already due (past their collection point) — the ones
// that make a member count as overdue. Part-paid periods are not among them:
// what is left on those is a balance (getBalanceDue), not a lapsed membership.
export function getDueUnpaidPeriods(settings, member) {
  const ledger = getPeriodLedger(member);
  const unpaid = getUnpaidPeriods(settings, member).filter((period) => !ledger.has(period));
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

// Everything owed right now: overdue periods plus balances from part payments.
export function getOutstandingAmount(settings, member) {
  return getOverdueAmount(settings, member) + getBalanceDue(settings, member);
}

export const FEE_STATUS_LABELS = { overdue: "Overdue", balance: "Balance due", paid: "Paid", pending: "Pending" };

/**
 * One word for where a member stands on fees, shared by every list:
 * "overdue" (a period is due with nothing paid), "balance" (part paid, the
 * rest carried forward), "paid" (this period paid in full) or "pending".
 */
export function getFeeStatus(settings, member) {
  if (isOverdue(settings, member)) return "overdue";
  if (getBalanceDue(settings, member) > 0) return "balance";
  if (isPaidThisPeriod(settings, member)) return "paid";
  return "pending";
}

/**
 * Spreads an amount over periods oldest first, filling each one's balance
 * before moving on — what the fee sheet records when less than the full total
 * is paid. Periods the amount doesn't reach get nothing.
 */
export function allocatePayment(dues, amount) {
  let left = Math.max(0, Number(amount) || 0);
  return dues.map((due) => {
    const pay = Math.min(due.balance, left);
    left = Math.round((left - pay) * 100) / 100;
    return { ...due, pay, after: Math.round((due.balance - pay) * 100) / 100 };
  });
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
  // A member's billing schedule only changes with settings (fixed for this
  // domain), the member record (replaced, never mutated, on every edit) or the
  // date. So each answer is worked out once per member per day and shared by
  // every list row, filter count and dialog that asks — rather than walking the
  // whole period history again for each of them on every render.
  // Cached arrays and sets are shared: callers must copy before changing them.
  let cacheDay = "";
  let cache = new WeakMap();
  const perMember = (compute) => {
    const slot = Symbol();
    return (member) => {
      if (!member || typeof member !== "object") return compute(settings, member);
      const today = todayKey();
      if (today !== cacheDay) {
        cacheDay = today;
        cache = new WeakMap();
      }
      let entry = cache.get(member);
      if (!entry) {
        entry = {};
        cache.set(member, entry);
      }
      if (!(slot in entry)) entry[slot] = compute(settings, member);
      return entry[slot];
    };
  };

  const holidayDates = new Set(getHolidayDates(settings));
  const weeklyHolidays = new Set(getWeeklyHolidays(settings));

  return {
    settings,
    getWeeklyHolidays: () => getWeeklyHolidays(settings),
    getHolidayDates: () => getHolidayDates(settings),
    // Same rule as isHoliday(), with the settings lists parsed once.
    isHoliday: (dayKey) => {
      const key = String(dayKey || "").slice(0, 10);
      return holidayDates.has(key) || weeklyHolidays.has(parseDateKey(key).getDay());
    },
    holidayReason: (dayKey) => holidayReason(settings, dayKey),
    getBillingCycleMode: () => getBillingCycleMode(settings),
    getBillingCycleDays: () => getBillingCycleDays(settings),
    getDefaultCollectionTiming: () => getDefaultCollectionTiming(settings),
    getCollectionTiming: (member) => getCollectionTiming(settings, member),
    getMembershipType,
    getPackageMonths,
    getMembershipLabel,
    billingStartKey,
    isPlanChangeAhead,
    getBillingAmountLabel,
    getPeriodUnitLabel,
    getBillingPeriodLabel: (periodKey, member = null) => getBillingPeriodLabel(settings, periodKey, member),
    getBillingPeriodKeys: perMember(getBillingPeriodKeys),
    getPaymentPeriodKey,
    isAdmissionPayment,
    getPaymentLabel: (payment, member = null) => getPaymentLabel(settings, payment, member),
    getPaidPeriodSet: perMember((unused, member) => getPaidPeriodSet(member)),
    getPeriodDue,
    isPartPayment,
    getPartPaymentNotes,
    getPartPaidPeriods: perMember(getPartPaidPeriods),
    getBalanceDue: perMember(getBalanceDue),
    getOutstandingAmount: perMember(getOutstandingAmount),
    getFeeStatus: perMember(getFeeStatus),
    getBillablePeriodKeys: perMember(getBillablePeriodKeys),
    getUnpaidPeriods: perMember(getUnpaidPeriods),
    periodStartDate,
    periodEndDate: (member, periodKey) => periodEndDate(settings, member, periodKey),
    nextPeriodStartDate: (member) => nextPeriodStartDate(settings, member),
    // A Date is mutable, so it is rebuilt each call; the key form is cached.
    getDueDate: (member) => getDueDate(settings, member),
    getDueDateKey: perMember(getDueDateKey),
    isPaidThisPeriod: perMember(isPaidThisPeriod),
    getDueUnpaidPeriods: perMember(getDueUnpaidPeriods),
    getOverdueAmount: perMember(getOverdueAmount),
    isOverdue: perMember(isOverdue),
    isPresentToday,
    getMonthlyAttendance,
    hasAttendance,
    hasTrainerAttendance,
    expenseCategoryLabel,
    paymentModeLabel,
  };
}
