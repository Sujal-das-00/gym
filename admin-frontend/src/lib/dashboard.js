/* ---------------------------------------------------------------------------
 * Numbers for the dashboard, computed from what is already on the client:
 * member payments + attendance and the expense list. Money totals come from
 * the shared ledger so they always agree with the Expense Tracker / Insights.
 * ------------------------------------------------------------------------- */
import { getLedgerEntries, summarizeEntries } from "./ledger.js";
import { dateFormatter, localDateKey, monthKey, todayKey } from "./dates.js";

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Earnings of `month` from day 1 up to and including `lastDay`.
function earnedThrough(entries, month, lastDay) {
  return entries.reduce((sum, entry) => {
    if (entry.type !== "earning" || !entry.date.startsWith(month)) return sum;
    return Number(entry.date.slice(8, 10)) <= lastDay ? sum + entry.amount : sum;
  }, 0);
}

export function buildDashboard({ members, expenses, domain, now = new Date() }) {
  const today = todayKey();
  const month = monthKey(now);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = monthKey(prevMonthStart);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const dayOfMonth = now.getDate();

  // --- Money -------------------------------------------------------------
  const ledger = getLedgerEntries({ members, expenses, domain });
  const monthSummary = summarizeEntries(ledger.filter((entry) => entry.date.startsWith(month)));
  // Compare like with like: this month so far vs last month up to the same day.
  const previousToDate = earnedThrough(ledger, prevMonth, Math.min(dayOfMonth, daysInPrevMonth));
  const collectedDelta =
    previousToDate > 0 ? Math.round(((monthSummary.earned - previousToDate) / previousToDate) * 100) : null;

  // --- Members & fees ----------------------------------------------------
  let present = 0;
  let paid = 0; // paid this period (same rule as the Members "Paid" filter)
  let paidUp = 0; // paid this period and owes nothing older — the fee ring's "Paid up"
  let overdueAmount = 0;
  let joinedThisMonth = 0;
  const overdue = [];
  const attendanceByDay = new Map();

  members.forEach((member) => {
    if (domain.isPresentToday(member)) present += 1;
    const paidNow = domain.isPaidThisPeriod(member);
    if (paidNow) paid += 1;
    if (String(member.startDate || "").startsWith(month)) joinedThisMonth += 1;
    (member.attendance || []).forEach((day) => attendanceByDay.set(day, (attendanceByDay.get(day) || 0) + 1));

    const duePeriods = domain.getDueUnpaidPeriods(member);
    if (duePeriods.length) {
      const amount = duePeriods.length * Number(member.fee || 0);
      overdueAmount += amount;
      overdue.push({ member, amount, periods: duePeriods.length, since: localDateKey(domain.getDueDate(member)) });
    } else if (paidNow) {
      paidUp += 1;
    }
  });
  overdue.sort((a, b) => b.amount - a.amount || a.since.localeCompare(b.since));
  const total = members.length;

  // --- Attendance --------------------------------------------------------
  const week = Array.from({ length: 7 }, (unused, index) => {
    const date = addDays(now, index - 6);
    const key = localDateKey(date);
    return {
      key,
      count: attendanceByDay.get(key) || 0,
      holiday: domain.isHoliday(key),
      isToday: key === today,
      weekday: dateFormatter({ weekday: "short" }).format(date),
      label: dateFormatter({ weekday: "long", day: "numeric", month: "short" }).format(date),
    };
  });
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);
  let lastWeekTotal = 0;
  for (let offset = 7; offset < 14; offset += 1) {
    lastWeekTotal += attendanceByDay.get(localDateKey(addDays(now, -offset))) || 0;
  }

  let monthVisits = 0;
  let openDays = 0;
  let bestDay = null;
  for (let day = 1; day <= dayOfMonth; day += 1) {
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const count = attendanceByDay.get(key) || 0;
    monthVisits += count;
    if (!domain.isHoliday(key)) openDays += 1;
    if (count && (!bestDay || count > bestDay.count)) bestDay = { key, count };
  }

  return {
    month: {
      name: dateFormatter({ month: "long" }).format(now),
      prevName: dateFormatter({ month: "short" }).format(prevMonthStart),
      shortName: dateFormatter({ month: "short" }).format(now),
      daysInMonth,
      dayOfMonth,
    },
    money: {
      collected: monthSummary.earned,
      spent: monthSummary.spent,
      net: monthSummary.net,
      previousToDate,
      collectedDelta,
    },
    members: { total, present, paid, paidUp, joinedThisMonth, overdueCount: overdue.length, overdueAmount, overdue },
    attendance: {
      week,
      weekTotal,
      lastWeekTotal,
      weekDelta: lastWeekTotal > 0 ? Math.round(((weekTotal - lastWeekTotal) / lastWeekTotal) * 100) : null,
      monthVisits,
      dailyAverage: openDays ? monthVisits / openDays : 0,
      bestDay,
    },
  };
}
