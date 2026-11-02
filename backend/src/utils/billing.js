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

// Where billing periods count from: the start of the current plan when it has
// been changed (planStartDate), else the first term after an opening balance
// (billingCutover: every term before it is covered by that balance), else the
// joining date. Mirrors billingStartKey() in admin-frontend/src/lib/billing.js.
function billingStartKey(member) {
  return member?.planStartDate || member?.billingCutover || member?.startDate || "";
}

function getBillingPeriodKeys(member, settings) {
  if (!billingStartKey(member)) return [];
  const start = parseDateKey(billingStartKey(member));
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

// Packages and day cycles name each period by its exact start date; only
// month-start monthly billing names periods by calendar month.
function isDateKeyedSchedule(member, settings) {
  return membershipType(member) === "package" || billingCycleMode(settings) !== "month-start";
}

// Every period key of a date-keyed schedule from the billing start onwards,
// stepped exactly as getBillingPeriodKeys steps it.
function* datedPeriodKeys(member, settings) {
  const cursor = parseDateKey(billingStartKey(member));
  if (Number.isNaN(cursor.getTime())) return;
  const months = packageMonths(member);
  const cycleDays = billingCycleDays(settings);
  while (true) {
    yield localDateKey(cursor);
    if (membershipType(member) === "package") cursor.setTime(addMonths(cursor, months).getTime());
    else cursor.setDate(cursor.getDate() + cycleDays);
  }
}

/**
 * Membership payments to re-key when the billing start moves (a corrected
 * joining date): Map<paymentId, newPeriodKey>.
 *
 * A date-keyed payment names its period by start date, so once the start
 * moves nothing matches it any more: the money stops counting and the member
 * shows overdue. Each paid term instead becomes the term with the same number
 * on the new schedule (the 1st term stays the 1st). Month-keyed periods still
 * mean the same calendar month and are left alone, as are rows that were not
 * on the old schedule.
 */
function shiftedPaymentPeriods(previous, next, settings) {
  const moves = new Map();
  if (!isDateKeyedSchedule(next, settings) || billingStartKey(previous) === billingStartKey(next)) return moves;
  const payments = (previous?.payments || []).filter((payment) => !isAdmissionPayment(payment) && !isOpeningBalancePayment(payment));
  const keys = payments.map(paymentPeriodKey).filter((key) => String(key || "").length === 10);
  if (!keys.length) return moves;
  const latest = keys.reduce((max, key) => (key > max ? key : max));

  const renamed = new Map();
  const nextKeys = datedPeriodKeys(next, settings);
  for (const oldKey of datedPeriodKeys(previous, settings)) {
    if (oldKey > latest) break;
    renamed.set(oldKey, nextKeys.next().value);
  }
  for (const payment of payments) {
    const target = renamed.get(paymentPeriodKey(payment));
    if (target && target !== paymentPeriodKey(payment)) moves.set(payment.id, target);
  }
  return moves;
}

// Admission-fee rows are stored in payments with this literal as their billing
// period; it is never a real period key, so they can't mark a period paid.
const ADMISSION_PERIOD_KEY = "admission";

function isAdmissionPayment(payment) {
  return payment?.kind === "admission" || payment?.billingPeriod === ADMISSION_PERIOD_KEY;
}

// Payments toward an existing member's opening balance carry this literal as
// their billing period. Like admission, it is never a real period key, so they
// can't mark a term paid; they only reduce openingBalanceDue().
const OPENING_PERIOD_KEY = "opening-balance";

function isOpeningBalancePayment(payment) {
  return payment?.billingPeriod === OPENING_PERIOD_KEY;
}

// What is still owed on the opening balance (0 for every member without one).
// Kept apart from overdue terms: it never expires the membership or blocks
// check-in. Mirrors getOpeningBalanceDue() in admin-frontend/src/lib/billing.js.
function openingBalanceDue(member) {
  const owed = Number(member?.openingBalance || 0);
  if (!(owed > 0)) return 0;
  const paid = (member?.payments || [])
    .filter(isOpeningBalancePayment)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.max(0, Math.round((owed - paid) * 100) / 100);
}

function paymentPeriodKey(payment) {
  return payment.billingPeriod || payment.billingMonth || payment.month;
}

/**
 * What has been paid toward each billing period: Map<period, { paid, charge, settled }>.
 *
 * A period can be paid in parts, so each membership row stores the period's
 * full fee (periodFee) next to the amount taken. The period is settled once its
 * rows add up to that fee. Rows saved before part payments existed have no
 * periodFee: each of those was a full payment, so it settles its period alone.
 * Mirrors getPeriodLedger() in admin-frontend/src/lib/billing.js.
 */
function getPeriodLedger(member) {
  const ledger = new Map();
  for (const payment of member?.payments || []) {
    if (isAdmissionPayment(payment) || isOpeningBalancePayment(payment)) continue;
    const period = paymentPeriodKey(payment);
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

// Periods paid in full.
function getPaidPeriodSet(member) {
  const paid = new Set();
  for (const [period, entry] of getPeriodLedger(member)) if (entry.settled) paid.add(period);
  return paid;
}

// What is still owed on one period: its full fee when nothing is paid yet.
function periodBalance(member, period, ledger = getPeriodLedger(member)) {
  const entry = ledger.get(period);
  if (!entry) return Number(member?.fee || 0);
  return entry.settled ? 0 : Math.max(0, entry.charge - entry.paid);
}

function getUnpaidPeriods(member, settings) {
  const paid = getPaidPeriodSet(member);
  return getBillingPeriodKeys(member, settings).filter((period) => !paid.has(period));
}

// Periods the member can be billed for today: every started period for an
// upfront member; for a pay-after-term member only the ones that have ended
// (the running one isn't owed yet). Mirrors getBillablePeriodKeys() in
// admin-frontend/src/lib/billing.js.
function billablePeriodKeys(member, settings) {
  const periods = getBillingPeriodKeys(member, settings);
  if (collectionTiming(member, settings) !== "fixed-day") return periods;
  const today = todayKey();
  return periods.filter((period) => localDateKey(periodEndDate(member, settings, period)) <= today);
}

// Periods with something paid toward them but not the whole fee. The member
// keeps training on these; the rest is carried to their next payment.
function partPaidPeriods(member, settings) {
  const ledger = getPeriodLedger(member);
  return getBillingPeriodKeys(member, settings).filter((period) => ledger.has(period) && !ledger.get(period).settled);
}

// Rupees still owed on part-paid periods.
function balanceDue(member, settings) {
  const ledger = getPeriodLedger(member);
  return partPaidPeriods(member, settings).reduce((sum, period) => sum + periodBalance(member, period, ledger), 0);
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

// The day the next, not-yet-started period begins: the renewal date of the
// period running now, or the plan start itself while that is still ahead.
function nextPeriodStartKey(member, settings) {
  const periods = getBillingPeriodKeys(member, settings);
  const last = periods[periods.length - 1];
  return last ? localDateKey(periodEndDate(member, settings, last)) : billingStartKey(member);
}

// Unpaid periods that are already PAST their collection point — the ones a member
// actually owes money for right now. Mirrors getDueUnpaidPeriods() in
// admin-frontend/src/lib/billing.js; keep the two in sync, because this is what
// the fee-reminder notification quotes back to the member.
// A part-paid period is not here: the gym took part of the fee and let the
// member carry the rest, so it shows as a balance (balanceDue), not as lapsed.
function dueUnpaidPeriods(member, settings) {
  const ledger = getPeriodLedger(member);
  const unpaid = getUnpaidPeriods(member, settings).filter((period) => !ledger.has(period));
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

// Rupees the member owes today: one fee per already-due unpaid period, plus
// what is left on part-paid periods and on an opening balance. The one-off
// admission charge is deliberately excluded, matching the "Outstanding" amount
// the admin panel shows (getOutstandingAmount).
function memberOutstanding(member, settings) {
  return (
    dueUnpaidPeriods(member, settings).length * Number(member?.fee || 0) +
    balanceDue(member, settings) +
    openingBalanceDue(member)
  );
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
  const ledger = getPeriodLedger(member);
  const balance = balanceDue(member, settings);
  const today = parseDateKey(todayKey());

  // A member can be expired from an OLD unpaid period while the period in
  // progress hasn't ended yet — "next due" must point at that old debt (the
  // oldest overdue due date), not silently at the current period's still-
  // future renewal, or the card would say "overdue" but show 0 days overdue.
  // Part-paid periods carry a balance instead (see dueUnpaidPeriods).
  const overdueDates = unpaid
    .filter((period) => !ledger.has(period))
    .map((period) => periodDueDate(member, settings, period))
    .filter((due) => !Number.isNaN(due.getTime()) && due < today)
    .sort((a, b) => a - b);

  const current = periods[periods.length - 1] || "";
  const start = periodStartDate(current);
  const currentEnd = current ? periodEndDate(member, settings, current) : new Date(NaN);

  const opening = openingBalanceDue(member);

  // Billing that starts later leaves no period yet: a plan change set for the
  // next renewal (the old plan's paid term runs until then, and the change is
  // refused while that term is unpaid), or an opening balance covering every
  // term up to its cut-over. Count down to that start.
  if (!current && billingStartKey(member) > todayKey()) {
    const due = periodDueDate(member, settings, billingStartKey(member));
    const left = Math.max(0, daysBetween(today, due));
    return {
      amount: Number(member?.fee || 0),
      planLabel: membershipType(member) === "package" ? `${packageMonths(member)}-month package` : "Monthly",
      nextDueDate: localDateKey(due),
      daysLeft: left,
      daysOverdue: 0,
      cycleDays: Math.max(1, left),
      unpaidPeriods: 0,
      balanceDue: balance,
      openingBalanceDue: opening,
      expired: false,
    };
  }
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
    // Left over from part payments, collected with the next payment.
    balanceDue: balance,
    // Owed from before the member was entered into GymBoo; never expires them.
    openingBalanceDue: opening,
    expired,
  };
}

module.exports = {
  ADMISSION_PERIOD_KEY,
  OPENING_PERIOD_KEY,
  balanceDue,
  billablePeriodKeys,
  billingStartKey,
  collectionTiming,
  dueUnpaidPeriods,
  getBillingPeriodKeys,
  getPaidPeriodSet,
  getPeriodLedger,
  isAdmissionPayment,
  isMembershipExpired,
  isOpeningBalancePayment,
  memberBillingSummary,
  memberOutstanding,
  nextPeriodStartKey,
  openingBalanceDue,
  partPaidPeriods,
  paymentPeriodKey,
  periodBalance,
  periodStartDate,
  shiftedPaymentPeriods,
};
