/* ---------------------------------------------------------------------------
 * The gym's money ledger.
 *
 * Every rupee the gym moves is already on the client: member payments live on
 * `member.payments`, spending lives in `expenses`. This module turns those two
 * shapes into one list of comparable entries, then slices it by date, by day
 * and by category. Both the Expense Tracker and the Insights screen read from
 * here so their totals can never disagree.
 * ------------------------------------------------------------------------- */
import { toDateKey } from "./dates.js";

/**
 * One flat, newest-first list of every earning and expense.
 *
 * An earning is a collected payment (a membership term or a joining charge);
 * `title` names who paid and `detail` what it was for. An expense is a recorded
 * cost; `title` is its description and `detail` its category label.
 */
export function buildLedgerEntries({ members = [], expenses = [], domain }) {
  const entries = [];

  members.forEach((member) => {
    (member.payments || []).forEach((payment) => {
      entries.push({
        type: "earning",
        id: payment.id,
        memberId: member.id,
        date: toDateKey(payment.date),
        amount: Number(payment.amount || 0),
        title: member.name,
        category: domain.isAdmissionPayment(payment) ? "admission-fee" : "membership-fee",
        detail: domain.getPaymentLabel(payment, member),
        mode: payment.mode || "",
      });
    });
  });

  expenses.forEach((expense) => {
    entries.push({
      type: "expense",
      id: expense.id,
      date: toDateKey(expense.date),
      amount: Number(expense.amount || 0),
      title: expense.title || domain.expenseCategoryLabel(expense.category),
      category: expense.category,
      detail: domain.expenseCategoryLabel(expense.category),
      mode: expense.mode || "",
    });
  });

  return sortByDateDesc(entries);
}

export function sortByDateDesc(entries) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

/** Inclusive on both ends; an empty bound means "open". */
export function filterEntriesByDate(entries, startDate, endDate) {
  return entries.filter((entry) => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;
    return true;
  });
}

/** Money in, money out, and what's left. */
export function summarizeEntries(entries) {
  let earned = 0;
  let spent = 0;
  let earningCount = 0;
  let expenseCount = 0;
  for (const entry of entries) {
    if (entry.type === "expense") {
      spent += entry.amount;
      expenseCount += 1;
    } else {
      earned += entry.amount;
      earningCount += 1;
    }
  }
  return { earned, spent, net: earned - spent, earningCount, expenseCount, count: entries.length };
}

// Earnings before expenses, largest first — so a day reads as "what came in,
// then what went out".
function sortWithinDay(entries) {
  return [...entries].sort(
    (a, b) => Number(a.type === "expense") - Number(b.type === "expense") || b.amount - a.amount,
  );
}

/**
 * One row per day that saw money move, newest first. Days with no activity are
 * left out rather than padded — an empty row tells the admin nothing.
 */
export function groupEntriesByDay(entries) {
  const byDay = new Map();
  for (const entry of entries) {
    if (!byDay.has(entry.date)) byDay.set(entry.date, []);
    byDay.get(entry.date).push(entry);
  }
  return [...byDay.entries()]
    .map(([date, dayEntries]) => ({
      date,
      entries: sortWithinDay(dayEntries),
      ...summarizeEntries(dayEntries),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Where the money came from / went to: one row per category, largest first,
 * with each row's share of the side's total so the split is readable at a glance.
 */
export function groupEntriesByCategory(entries, labelFor) {
  const byCategory = new Map();
  let total = 0;
  for (const entry of entries) {
    const current = byCategory.get(entry.category) || { category: entry.category, amount: 0, count: 0 };
    current.amount += entry.amount;
    current.count += 1;
    byCategory.set(entry.category, current);
    total += entry.amount;
  }
  return [...byCategory.values()]
    .map((row) => ({ ...row, label: labelFor(row.category), share: total ? row.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Members ranked by what they actually paid in the period. */
export function topPayingMembers(entries, limit = 5) {
  const byMember = new Map();
  for (const entry of entries) {
    if (entry.type !== "earning" || !entry.memberId) continue;
    const current = byMember.get(entry.memberId) || { memberId: entry.memberId, name: entry.title, amount: 0, count: 0 };
    current.amount += entry.amount;
    current.count += 1;
    byMember.set(entry.memberId, current);
  }
  return [...byMember.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, limit);
}
