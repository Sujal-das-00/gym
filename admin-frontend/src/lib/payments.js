/* ---------------------------------------------------------------------------
 * Payments as money received (transactions) and where it went (allocations).
 *
 * The server (backend/src/services/paymentService.js) is the authority: it
 * re-allocates, re-checks every amount and locks the member while it writes.
 * This module lets the Record payment, correction and history screens show
 * the same split and the same reasons before anything is saved, and gives
 * every money total one definition of "collected": each collection once,
 * reversed ones never.
 * ------------------------------------------------------------------------- */
import { OPENING_PERIOD_KEY, allocatePayment } from "./billing.js";
import { currency, todayKey } from "./dates.js";

export const termStartKey = (period) => (String(period).length === 7 ? `${period}-01` : String(period));
const toPaise = (value) => Math.round(Number(value) * 100);
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Everything collected from a member, once per collection: one entry per
 * active transaction (split per term when its date wasn't recorded, so each
 * part lands in that term's month), plus admission fees and any older row
 * that has no transaction. Reversed payments are not here.
 */
export function memberCollections(member) {
  const entries = [];
  const active = (member?.transactions || []).filter((tx) => tx.status === "active");
  const counted = new Set(active.map((tx) => tx.id));
  for (const tx of active) {
    if (tx.dateKnown !== false) {
      entries.push({ id: tx.id, transaction: tx, date: tx.date, amount: tx.amount, dateKnown: true, mode: tx.mode });
      continue;
    }
    for (const allocation of tx.allocations) {
      entries.push({
        id: `${tx.id}:${allocation.billingPeriod}`,
        transaction: tx,
        allocation,
        date: allocation.date || termStartKey(allocation.billingPeriod),
        amount: allocation.amount,
        dateKnown: false,
        mode: tx.mode,
      });
    }
  }
  for (const payment of member?.payments || []) {
    if (payment.transactionId && counted.has(payment.transactionId)) continue;
    entries.push({ id: payment.id, payment, date: payment.date, amount: payment.amount, dateKnown: payment.dateKnown !== false, mode: payment.mode });
  }
  return entries;
}

// The terms a transaction (or one undated part of it) paid, in words.
export function collectionTerms(domain, member, entry) {
  const allocations = entry.allocation ? [entry.allocation] : entry.transaction?.allocations || [];
  return allocations.map((allocation) => domain.getBillingPeriodLabel(allocation.billingPeriod, member)).join(", ");
}

/**
 * A member's payment history, newest first: every transaction (reversed and
 * corrected ones too, for the record) and the admission fee.
 */
export function paymentHistory(member) {
  const rows = (member?.transactions || []).map((tx) => ({ id: tx.id, transaction: tx, date: tx.date, createdAt: tx.createdAt }));
  const linked = new Set((member?.transactions || []).map((tx) => tx.id));
  for (const payment of member?.payments || []) {
    if (payment.transactionId && linked.has(payment.transactionId)) continue;
    rows.push({ id: payment.id, payment, date: payment.date, createdAt: "" });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * What a payment can go toward now, oldest first: the opening balance, then
 * old-plan terms kept as balance due, then each payable term with something
 * left (a ₹0-fee term too, so it can be marked done). `renewAhead` adds the
 * one next term, last (same rules as outstandingDebts() on the server).
 * Shaped like getPeriodDue(): { period, charge, paid, balance }.
 */
export function outstandingDebts(domain, member, { renewAhead = false } = {}) {
  if (!member) return [];
  const opening = domain.getOpeningBalanceLine(member);
  const kept = domain
    .getCarriedDues(member)
    .filter((due) => due.balance > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  const terms = domain.getUnpaidPeriods(member).map((period) => domain.getPeriodDue(member, period));
  const ahead = renewAhead ? domain.getAdvanceTerm(member) : null;
  return [
    ...(opening ? [opening] : []),
    ...kept,
    ...terms.filter((due) => due.balance > 0 || due.charge === 0),
    ...(ahead ? [ahead] : []),
  ];
}

// The member as if one transaction had never been recorded (for a correction).
export function withoutTransaction(member, transactionId) {
  return { ...member, payments: (member.payments || []).filter((payment) => payment.transactionId !== transactionId) };
}

// Oldest debt first, as the server will do it: [{ ...debt, pay, after }].
export function fifoLines(debts, amount) {
  return allocatePayment(
    debts.filter((debt) => debt.balance > 0),
    amount,
  );
}

export const debtLabel = (domain, member, period) =>
  period === OPENING_PERIOD_KEY ? "Opening balance" : domain.getBillingPeriodLabel(period, member);

/**
 * The first reason this payment can't be recorded yet, or "".
 * draft: { amountText, method, manual: { [period]: text }, date, dateUnknown }
 */
export function paymentProblem({ debts, draft, startDate, today = todayKey() }) {
  const owed = debts.reduce((sum, debt) => sum + toPaise(debt.balance), 0);
  const free = owed === 0 && debts.some((debt) => debt.charge === 0);
  if (!free) {
    const text = String(draft.amountText ?? "").trim();
    if (!AMOUNT.test(text)) return "Enter the amount received, up to 2 decimal places.";
    const amount = toPaise(text);
    if (!(amount > 0)) return "Enter the amount received above ₹0.";
    if (!(owed > 0)) return "Nothing is owed right now.";
    if (amount > owed) return `${currency(amount / 100)} is more than the ${currency(owed / 100)} owed.`;
    if (draft.method === "manual") {
      const ahead = debts.find((debt) => debt.advance);
      const due = (period) => toPaise(draft.manual[period] || 0);
      if (
        ahead &&
        due(ahead.period) > 0 &&
        debts.some((debt) => !debt.advance && !debt.carried && debt.period !== OPENING_PERIOD_KEY && toPaise(debt.balance) > due(debt.period))
      ) {
        return "Clear the terms already due before paying the next term ahead.";
      }
      let allocated = 0;
      for (const debt of debts) {
        const lineText = draft.manual[debt.period];
        if (lineText === undefined || lineText === "") continue;
        if (!AMOUNT.test(String(lineText).trim()) || !(toPaise(lineText) > 0)) return "Enter each chosen term's amount above ₹0.";
        if (toPaise(lineText) > toPaise(debt.balance)) return `More than the ${currency(debt.balance)} left on a term.`;
        allocated += toPaise(lineText);
      }
      if (allocated !== amount) {
        return allocated < amount
          ? `${currency((amount - allocated) / 100)} isn't allocated to a term yet.`
          : `The terms add up to more than the ${currency(amount / 100)} received.`;
      }
    }
  }
  if (draft.dateUnknown) {
    if (allocationLines({ debts, draft }).some((line) => line.period === OPENING_PERIOD_KEY && line.pay > 0)) {
      return "A payment toward the opening balance needs the date it was collected.";
    }
    return "";
  }
  if (!draft.date) return "Choose when it was paid, or tick “Don't know the date”.";
  if (draft.date > today) return "A payment can't be collected on a future date.";
  if (startDate && draft.date < startDate) return "A payment can't be collected before the joining date.";
  return "";
}

// The split this draft makes: FIFO preview, or the admin's own lines.
export function allocationLines({ debts, draft }) {
  const owed = debts.reduce((sum, debt) => sum + debt.balance, 0);
  if (owed === 0) return debts.filter((debt) => debt.charge === 0).map((debt) => ({ ...debt, pay: 0, after: 0 }));
  const amount = Math.round(Number(draft.amountText) * 100) / 100 || 0;
  if (draft.method !== "manual") return fifoLines(debts, Math.min(amount, owed)).filter((line) => line.pay > 0);
  return debts
    .filter((debt) => draft.manual[debt.period] !== undefined && draft.manual[debt.period] !== "")
    .map((debt) => {
      const pay = Math.round(Number(draft.manual[debt.period]) * 100) / 100 || 0;
      return { ...debt, pay, after: Math.max(0, Math.round((debt.balance - pay) * 100) / 100) };
    });
}

// The request body for recording (or correcting) a payment.
export function paymentBody({ debts, draft, requestId }) {
  const owed = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const body = {
    amount: owed === 0 ? 0 : Number(draft.amountText),
    date: draft.dateUnknown ? null : draft.date,
    mode: draft.mode,
    reference: draft.reference.trim(),
    note: draft.note.trim(),
    allocation: draft.method === "manual" && owed > 0 ? "manual" : "fifo",
  };
  if (debts.some((debt) => debt.advance)) body.renewAhead = true;
  if (requestId) body.requestId = requestId;
  if (body.allocation === "manual") {
    body.allocations = allocationLines({ debts, draft }).map((line) => ({ billingPeriod: line.period, amount: line.pay }));
  }
  return body;
}

/**
 * Why a transaction can't be reversed or corrected here, or "" (same rule as
 * closedTermsProblem() on the server): un-paying a term closed by a plan
 * change, or covered by an opening balance, would drop that debt from billing.
 */
export function closedTermsProblem(member, tx) {
  const start = member?.planStartDate || member?.billingCutover || "";
  if (!start || !tx) return "";
  // Old-plan terms kept as balance due are still billed: un-paying one leaves it owed.
  const kept = new Set((member.carriedTerms || []).map((term) => term.period));
  const closed = tx.allocations.some((allocation) => {
    const period = allocation.billingPeriod;
    if (period === OPENING_PERIOD_KEY || kept.has(period)) return false;
    return period.length === 7 ? period < start.slice(0, 7) : period < start;
  });
  if (!closed) return "";
  return member.planStartDate
    ? "This payment is for terms closed by a plan change. Reversing it would drop that debt from billing, so it can't be changed here."
    : "This payment is for terms covered by the opening balance. Reversing it would drop that debt from billing, so it can't be changed here.";
}

export const blankPaymentDraft = (amount = "") => ({
  amountText: amount ? String(amount) : "",
  method: "fifo",
  manual: {},
  date: todayKey(),
  dateUnknown: false,
  mode: "cash",
  reference: "",
  note: "",
});

