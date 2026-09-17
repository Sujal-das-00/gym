// Server-side port of the admin frontend's billing-period math (admin-frontend/script.js).
// Keep the two in sync: the check-in gate must agree with the "Overdue" badge admins see.
const { todayKey } = require("./date");

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day);
}

function monthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

function addMonths(date, months) {
  const copy = new Date(date);
  const originalDate = copy.getDate();
  copy.setMonth(copy.getMonth() + months);
  if (copy.getDate() < originalDate) copy.setDate(0);
  return copy;
}

function billingCycleMode(settings) {
  const mode = settings?.billingCycleMode || "month-start";
  return ["month-start", "30-days", "custom-days"].includes(mode) ? mode : "month-start";
}

function billingCycleDays(settings) {
  if (billingCycleMode(settings) === "30-days") return 30;
  const days = Number(settings?.customBillingDays || 25);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 25;
}

function membershipType(member) {
  return member?.membershipType === "package" ? "package" : "monthly";
}

function packageMonths(member) {
  const months = Number(member?.packageMonths || 1);
  return Number.isFinite(months) && months > 0 ? Math.round(months) : 1;
}

function collectionTiming(member, settings) {
  const mode = member?.collectionTiming || settings?.defaultCollectionTiming || "at-join";
  return mode === "fixed-day" ? "fixed-day" : "at-join";
}

function getBillingPeriodKeys(member, settings) {
  if (!member?.startDate) return [];
  const start = parseDateKey(member.startDate);
  if (Number.isNaN(start.getTime())) return [];
  const today = parseDateKey(todayKey());
  const periods = [];

  if (membershipType(member) === "package") {
    const cursor = new Date(start);
    const months = packageMonths(member);
    while (cursor <= today) {
      periods.push(localDateKey(cursor));
      cursor.setTime(addMonths(cursor, months).getTime());
    }
    return periods;
  }

  if (billingCycleMode(settings) === "month-start") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= end) {
      periods.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return periods;
  }

  const cycleDays = billingCycleDays(settings);
  const cursor = new Date(start);
  while (cursor <= today) {
    periods.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + cycleDays);
  }
  return periods;
}

// Admission-fee rows are stored in payments with this literal as their billing
// period; it is never a real period key, so they can't mark a period paid.
const ADMISSION_PERIOD_KEY = "admission";

function isAdmissionPayment(payment) {
  return payment?.kind === "admission" || payment?.billingPeriod === ADMISSION_PERIOD_KEY;
}

function getPaidPeriodSet(member) {
  return new Set(
    (member.payments || [])
      .filter((payment) => !isAdmissionPayment(payment))
      .map((payment) => payment.billingPeriod || payment.billingMonth || payment.month)
      .filter(Boolean),
  );
}

function getUnpaidPeriods(member, settings) {
  const paid = getPaidPeriodSet(member);
  return getBillingPeriodKeys(member, settings).filter((period) => !paid.has(period));
}

// The date a period rolls over into the next one (its renewal / end-of-term date).
function periodEndDate(member, settings, periodKey) {
  const key = String(periodKey || "");
  const start = parseDateKey(key.length === 7 ? `${key}-01` : key);
  if (Number.isNaN(start.getTime())) return start;
  if (membershipType(member) === "package") return addMonths(start, packageMonths(member));
  if (billingCycleMode(settings) === "month-start") return addMonths(start, 1);
  const end = new Date(start);
  end.setDate(end.getDate() + billingCycleDays(settings));
  return end;
}

// Unpaid periods that are already PAST their collection point — the ones a member
// actually owes money for right now. Mirrors getDueUnpaidPeriods() in
// admin-frontend/src/lib/billing.js; keep the two in sync, because this is what
// the fee-reminder notification quotes back to the member.
function dueUnpaidPeriods(member, settings) {
  const unpaid = getUnpaidPeriods(member, settings);
  if (collectionTiming(member, settings) === "fixed-day") {
    // Only overdue once a period has fully ended without payment; the in-progress period is not yet due.
    const today = todayKey();
    return unpaid.filter((period) => localDateKey(periodEndDate(member, settings, period)) < today);
  }
  return unpaid.filter((period) => period < todayKey() || (period.length === 7 && period < monthKey()));
}

// Mirrors the admin frontend's isOverdue(): the membership counts as expired once a
// billing period is due without payment — that is when renewal has lapsed.
function isMembershipExpired(member, settings) {
  return dueUnpaidPeriods(member, settings).length > 0;
}

// Rupees the member owes today: one fee per already-due unpaid period. The
// one-off admission charge is deliberately excluded, matching the "Overdue"
// amount the admin dashboard shows (getOverdueAmount).
function memberOutstanding(member, settings) {
  return dueUnpaidPeriods(member, settings).length * Number(member?.fee || 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function periodStartDate(periodKey) {
  const key = String(periodKey || "");
  return parseDateKey(key.length === 7 ? `${key}-01` : key);
}

// The date a period's payment is actually due — matches the two branches of
// isMembershipExpired above: a fixed-day gym owes once the period ends, an
// at-join gym owes from the moment the period starts.
function periodDueDate(member, settings, periodKey) {
  return collectionTiming(member, settings) === "fixed-day"
    ? periodEndDate(member, settings, periodKey)
    : periodStartDate(periodKey);
}

/**
 * What the member app's home screen puts on its "next due" card: when the
 * oldest unpaid, already-due period fell due (if the member is behind — that's
 * the debt to clear first), otherwise when the period running now renews, and
 * how much of it is left.
 *
 * Derived here rather than in the check-in frontend so the period math keeps a
 * single home — the frontend never sees billingCycleMode at all.
 */
function memberBillingSummary(member, settings) {
  const periods = getBillingPeriodKeys(member, settings);
  const paid = getPaidPeriodSet(member);
  const unpaid = periods.filter((period) => !paid.has(period));
  const today = parseDateKey(todayKey());

  // A member can be expired from an OLD unpaid period while the period in
  // progress hasn't ended yet — "next due" must point at that old debt (the
  // oldest overdue due date), not silently at the current period's still-
  // future renewal, or the card would say "overdue" but show 0 days overdue.
  const overdueDates = unpaid
    .map((period) => periodDueDate(member, settings, period))
    .filter((due) => !Number.isNaN(due.getTime()) && due < today)
    .sort((a, b) => a - b);

  const current = periods[periods.length - 1] || "";
  const start = periodStartDate(current);
  const currentEnd = current ? periodEndDate(member, settings, current) : new Date(NaN);
  // Computed independently above from the same unpaid set and due-date rules
  // as isMembershipExpired, so this should always agree with the check-in
  // gate; fall back to the gate's own answer if the two ever disagree.
  const expired = overdueDates.length > 0 || isMembershipExpired(member, settings);
  const target = overdueDates.length ? overdueDates[0] : currentEnd;
  const dated = current && !Number.isNaN(start.getTime()) && !Number.isNaN(target.getTime());

  // Signed once, then split into "days left" (future) and "days overdue" (past)
  // so the app can show one or the other instead of clamping overdue to 0.
  const diff = dated ? daysBetween(today, target) : 0;

  return {
    amount: Number(member?.fee || 0),
    planLabel:
      membershipType(member) === "package" ? `${packageMonths(member)}-month package` : "Monthly",
    // Not overdue: the renewal date of the period in progress. Overdue: the
    // due date of the oldest unpaid period — the debt to clear first.
    nextDueDate: dated ? localDateKey(target) : "",
    daysLeft: dated ? Math.max(0, diff) : 0,
    daysOverdue: dated ? Math.max(0, -diff) : 0,
    // Length of the current period, so the card can draw it as a progress ring.
    cycleDays: dated ? Math.max(1, daysBetween(start, currentEnd)) : 0,
    unpaidPeriods: unpaid.length,
    expired,
  };
}

module.exports = {
  ADMISSION_PERIOD_KEY,
  dueUnpaidPeriods,
  isAdmissionPayment,
  isMembershipExpired,
  memberBillingSummary,
  memberOutstanding,
};
