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

function getPaidPeriodSet(member) {
  return new Set(
    (member.payments || []).map((payment) => payment.billingPeriod || payment.billingMonth || payment.month).filter(Boolean),
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

// Mirrors the admin frontend's isOverdue(): the membership counts as expired once a
// billing period is due without payment — that is when renewal has lapsed.
function isMembershipExpired(member, settings) {
  const unpaid = getUnpaidPeriods(member, settings);
  if (collectionTiming(member, settings) === "fixed-day") {
    // Only overdue once a period has fully ended without payment; the in-progress period is not yet due.
    const today = todayKey();
    return unpaid.some((period) => localDateKey(periodEndDate(member, settings, period)) < today);
  }
  return unpaid.some((period) => period < todayKey() || (period.length === 7 && period < monthKey()));
}

module.exports = {
  isMembershipExpired,
};
