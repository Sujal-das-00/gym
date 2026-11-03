/* ---------------------------------------------------------------------------
 * Existing-member onboarding: a member who joined before being entered into
 * GymBoo, with their past terms reconciled one of two ways — each term marked
 * paid or unpaid, or one opening balance covering everything up to today.
 *
 * The server (backend/src/services/onboardingService.js) re-checks every rule
 * here; this module only lets the form say what is missing before it saves,
 * and show the resulting dues.
 * ------------------------------------------------------------------------- */
import { displayDate, localDateKey, todayKey } from "./dates.js";

// Keep in sync with MAX_HISTORY_MONTHS / TERM_WARNING_THRESHOLD in onboardingService.js.
export const MAX_HISTORY_MONTHS = 24;
export const TERM_WARNING_THRESHOLD = 12;

// The earliest joining date allowed: the same day MAX_HISTORY_MONTHS earlier.
export function earliestJoiningDate(today = todayKey()) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, month - 1 - MAX_HISTORY_MONTHS, day);
  if (date.getDate() !== day) date.setDate(0);
  return localDateKey(date);
}

// One past term as the form starts it: nothing answered yet. The amount and
// term fee start at the plan fee because that is what is usually typed.
export function blankAnswer(fee) {
  const amount = Number(fee) > 0 ? String(fee) : "";
  return { status: "", amount, paidInFull: true, termFee: amount, date: "", dateUnknown: false, mode: "" };
}

export function blankHistory() {
  return {
    method: "periods",
    answers: {},
    openingBalance: "",
    // paid: null until the admin says whether one was paid (nothing assumed).
    admission: { paid: null, amount: "", date: "", dateUnknown: false, mode: "" },
  };
}

// "02 Aug – 31 Aug 2026": the days a term covers, its last day inclusive.
export function termRange(domain, member, period) {
  const start = domain.periodStartDate(period);
  const end = domain.periodEndDate(member, period);
  end.setDate(end.getDate() - 1);
  return `${displayDate(localDateKey(start)).slice(0, 6)} – ${displayDate(localDateKey(end))}`;
}

const termStartKey = (period) => (String(period).length === 7 ? `${period}-01` : String(period));

function dateProblem(entry, label, startDate, today) {
  if (entry.dateUnknown) return "";
  if (!entry.date) return `Enter when ${label} was paid, or tick "Don't know the date".`;
  if (entry.date > today) return `${label} can't be paid on a future date.`;
  if (entry.date < startDate) return `${label} can't be paid before the joining date.`;
  return "";
}

/**
 * The first thing stopping this history from being saved, in words, or "".
 * Every term must be answered: nothing is assumed paid or unpaid.
 */
export function joiningDateProblem(startDate, today = todayKey()) {
  if (!startDate) return "Enter the original joining date.";
  if (startDate >= today) return "An existing member joined before today. Add them as a new member instead.";
  if (startDate < earliestJoiningDate(today)) {
    return `The joining date can be at most ${MAX_HISTORY_MONTHS} months back (${displayDate(earliestJoiningDate(today))}).`;
  }
  return "";
}

export function historyProblem({ startDate, terms, history, domain, member, today = todayKey() }) {
  const joining = joiningDateProblem(startDate, today);
  if (joining) return joining;

  if (history.method === "periods") {
    const unanswered = terms.filter((period) => !history.answers[period]?.status).length;
    if (unanswered) return `Mark every past payment as paid or unpaid (${unanswered} left).`;
    for (const period of terms) {
      const answer = history.answers[period];
      if (answer.status !== "paid") continue;
      const label = termRange(domain, member, period);
      const amount = Number(answer.amount);
      if (!(amount > 0)) return `Enter the amount received for ${label}.`;
      if (Number(member.fee) > 0 && amount > Number(member.fee)) {
        return `The amount for ${label} can't be more than the monthly fee (₹${Number(member.fee)}).`;
      }
      const problem = dateProblem(answer, label, startDate, today);
      if (problem) return problem;
    }
  } else {
    const balance = Number(history.openingBalance);
    if (!(balance > 0)) return "Enter the total amount due.";
  }

  if (history.admission.paid === null || history.admission.paid === undefined) {
    return "Say whether an admission fee was paid.";
  }
  if (history.admission.paid) {
    if (!(Number(history.admission.amount) > 0)) return "Enter the admission fee that was paid.";
    // The date is optional: left empty, the fee is dated on the joining date.
    const problem = dateProblem({ ...history.admission, dateUnknown: !history.admission.date }, "The admission fee", startDate, today);
    if (problem) return problem;
  }
  return "";
}

// The member as the server will store them, so the form can show the dues,
// status and totals before saving.
export function previewMember({ member, terms, history, cutover }) {
  const payments = [];
  if (history.method === "periods") {
    for (const period of terms) {
      const answer = history.answers[period];
      const amount = Number(answer?.amount);
      if (answer?.status !== "paid" || !(amount > 0)) continue;
      payments.push({
        kind: "membership",
        billingPeriod: period,
        amount,
        periodFee: Math.max(amount, Number(member.fee) || 0),
        date: answer.dateUnknown || !answer.date ? termStartKey(period) : answer.date,
        dateKnown: !answer.dateUnknown && Boolean(answer.date),
      });
    }
  }
  if (history.admission.paid && Number(history.admission.amount) > 0) {
    payments.push({ kind: "admission", billingPeriod: "admission", amount: Number(history.admission.amount) });
  }
  const opening = history.method === "opening";
  return {
    ...member,
    planStartDate: "",
    onboardingType: "existing",
    openingBalance: opening ? Number(history.openingBalance) || 0 : 0,
    openingBalanceAdmission: 0,
    billingCutover: opening ? cutover : "",
    payments,
  };
}

// The `onboarding` block POST /api/members expects for an existing member.
export function onboardingPayload({ terms, history, fee = 0 }) {
  const admission = history.admission.paid
    ? { paid: true, date: history.admission.date || null, mode: history.admission.mode }
    : { paid: false };
  if (history.method === "opening") {
    return {
      type: "existing",
      method: "opening",
      openingBalance: Number(history.openingBalance),
      admission,
    };
  }
  return {
    type: "existing",
    method: "periods",
    periods: terms.map((period) => {
      const answer = history.answers[period];
      if (answer.status !== "paid") return { period, status: "unpaid" };
      return {
        period,
        status: "paid",
        amount: Number(answer.amount),
        paidInFull: Number(answer.amount) >= fee,
        ...(Number(answer.amount) >= fee ? {} : { termFee: fee }),
        date: answer.dateUnknown ? null : answer.date,
        mode: answer.mode,
      };
    }),
    admission,
  };
}

// The first term billed normally after an opening balance: the next term start
// after today, on the joining-date schedule (matches nextPeriodStartKey on the server).
export function openingCutover(domain, member) {
  return localDateKey(domain.nextPeriodStartDate(member));
}

