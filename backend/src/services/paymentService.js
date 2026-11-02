const crypto = require("crypto");
const { normalizePaymentMode } = require("../utils/member");
const {
  OPENING_PERIOD_KEY,
  advanceTerm,
  billablePeriodKeys,
  carriedDues,
  collectionTiming,
  getPeriodLedger,
  nextTermKey,
  openingBalanceDue,
  paymentPeriodKey,
} = require("../utils/billing");
const { createHttpError } = require("../utils/http");
const { todayKey } = require("../utils/date");
const { fromPaise, parseAmount, rupees: rupeesFromPaise, toPaise } = require("../utils/money");
const { publicMember } = require("../utils/member");
const { repo } = require("../models");

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;
const roundRupees = (amount) => Math.round(Number(amount) * 100) / 100;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_ID = /^[A-Za-z0-9-]{8,36}$/;

/**
 * Checks fee payments from the desk against what each period still owes, and
 * stamps every row with the period's full fee (periodFee). That is what lets a
 * period be paid in parts: it counts as paid once its rows add up to the fee.
 *
 * A payment without an amount pays whatever is left on its period. Several
 * rows for the same period in one request are checked against each other.
 * An existing member's opening balance is paid the same way, with the
 * "opening-balance" key and whatever is left of that balance as its charge.
 *
 * Used for the older request body ({ payments: [...] }), which is then
 * recorded as one transaction with these as its allocations.
 */
function preparePeriodPayments(member, payments) {
  if (!payments.length) throw createHttpError(400, "Choose what this payment is for.");
  const ledger = getPeriodLedger(member);
  const left = new Map();
  return payments.map((payment) => {
    if (payment?.kind === "admission") throw createHttpError(400, "The admission fee is set on the member's profile.");
    const period = String(paymentPeriodKey(payment || {}) || "");
    if (!period) throw createHttpError(400, "Choose what this payment is for.");
    const opening = period === OPENING_PERIOD_KEY;
    if (opening && !left.has(period) && !(openingBalanceDue(member) > 0)) {
      throw createHttpError(409, "The opening balance is already cleared. Reload to see the latest.");
    }
    const entry = opening ? null : ledger.get(period);
    if (entry?.settled) throw createHttpError(409, `${period} is already paid in full. Reload to see the latest.`);

    const charge = opening ? Number(member.openingBalance || 0) : entry ? entry.charge : Number(member.fee || 0);
    const owed = opening ? openingBalanceDue(member) : roundRupees(charge - (entry?.paid || 0));
    const remaining = left.has(period) ? left.get(period) : owed;
    const amount = payment.amount === undefined || payment.amount === null || payment.amount === "" ? remaining : roundRupees(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw createHttpError(400, "Enter the amount received.");
    if (amount === 0 && remaining > 0) throw createHttpError(400, "Enter the amount received.");
    if (amount > remaining) {
      const what = opening ? "the opening balance" : period;
      throw createHttpError(400, `${rupees(amount)} is more than the ${rupees(remaining)} left on ${what}.`);
    }
    left.set(period, roundRupees(remaining - amount));

    return {
      ...payment,
      kind: "membership",
      billingPeriod: period,
      billingMonth: opening ? "" : payment.billingMonth,
      amount,
      periodFee: charge,
      mode: normalizePaymentMode(payment.mode) || "cash",
    };
  });
}

/* ---- Outstanding debts and allocation ----------------------------------- */

const termStartKey = (period) => (String(period).length === 7 ? `${period}-01` : String(period));

/**
 * Everything a payment can go toward right now, oldest first and in paise:
 * the opening balance (owed from before GymBoo, so the oldest debt), then
 * old-plan terms kept as balance due at a plan change or restart, then each
 * payable term with something left on it. Terms that haven't started, and a
 * pay-after-term member's running term, are not payable, with one exception:
 * `renewAhead` adds the single next term (see advanceTerm), last of all.
 */
function outstandingDebts(member, settings, { renewAhead = false } = {}) {
  const debts = [];
  const opening = toPaise(openingBalanceDue(member));
  if (opening > 0) {
    debts.push({ period: OPENING_PERIOD_KEY, chargePaise: toPaise(member.openingBalance), balancePaise: opening });
  }
  const ledger = getPeriodLedger(member);
  const carried = carriedDues(member, ledger)
    .filter((due) => due.balance > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  for (const due of carried) {
    debts.push({ period: due.period, chargePaise: toPaise(due.charge), balancePaise: toPaise(due.balance), carried: true });
  }
  for (const period of billablePeriodKeys(member, settings)) {
    const entry = ledger.get(period);
    if (entry?.settled) continue;
    const chargePaise = toPaise(entry ? entry.charge : member.fee);
    const balancePaise = chargePaise - toPaise(entry ? entry.paid : 0);
    // A ₹0-fee term (a gym that charges no fee) is still marked done with a
    // ₹0 record, as it always has been.
    if (balancePaise > 0 || chargePaise === 0) debts.push({ period, chargePaise, balancePaise: Math.max(0, balancePaise) });
  }
  if (renewAhead) {
    const ahead = advanceTerm(member, settings);
    if (!ahead) {
      throw createHttpError(
        400,
        collectionTiming(member, settings) === "fixed-day"
          ?"This member pays after each term ends, so a term can't be paid ahead."
          : "The next term is already paid. Only one term can be paid ahead.",
      );
    }
    debts.push({ period: ahead.period, chargePaise: toPaise(ahead.charge), balancePaise: toPaise(ahead.balance), advance: true });
  }
  return debts;
}

/**
 * A term paid ahead is a renewal: the terms already due come first. Under
 * FIFO that is automatic; a manual split that pays ahead while leaving a due
 * term unpaid is refused. (Balances from before, like the opening balance or
 * kept old-plan dues, don't hold a renewal up.)
 */
function checkAheadOrder(debts, lines) {
  const ahead = debts.find((debt) => debt.advance);
  if (!ahead || !lines.some((line) => line.period === ahead.period && line.paise > 0)) return;
  const paid = new Map(lines.map((line) => [line.period, line.paise]));
  const left = debts.some(
    (debt) => !debt.advance && !debt.carried && debt.period !== OPENING_PERIOD_KEY && debt.balancePaise > (paid.get(debt.period) || 0),
  );
  if (left) throw createHttpError(400, "Clear the terms already due before paying the next term ahead.");
}

const debtLabel = (period) => (period === OPENING_PERIOD_KEY ? "the opening balance" : period);

/**
 * Splits `amountPaise` over the debts. "fifo" fills the oldest first; "manual"
 * uses exactly the lines the admin chose, each within its term's balance and
 * together equal to the payment (no money is left unallocated, and none is
 * moved to another term behind the admin's back).
 */
function allocate(debts, amountPaise, method, lines) {
  // ₹0 only ever marks ₹0-fee terms done: the ones chosen, or all of them.
  if (amountPaise === 0) {
    const free = debts.filter((debt) => debt.chargePaise === 0);
    const chosen = Array.isArray(lines) && lines.length ? lines.map((line) => String(line?.billingPeriod || "")) : free.map((debt) => debt.period);
    if (!chosen.length || !chosen.every((period) => free.some((debt) => debt.period === period))) {
      throw createHttpError(400, "Enter the amount received above ₹0.");
    }
    return free.filter((debt) => chosen.includes(debt.period)).map((debt) => ({ ...debt, paise: 0 }));
  }
  const owedPaise = debts.reduce((sum, debt) => sum + debt.balancePaise, 0);
  if (!(owedPaise > 0)) throw createHttpError(400, "Nothing is owed right now, so there is nothing to record.");
  if (amountPaise > owedPaise) {
    throw createHttpError(400, `${rupeesFromPaise(amountPaise)} is more than the ${rupeesFromPaise(owedPaise)} owed.`);
  }

  if (method !== "manual") {
    const result = [];
    let left = amountPaise;
    for (const debt of debts) {
      if (!left) break;
      if (!debt.balancePaise) continue;
      const paise = Math.min(debt.balancePaise, left);
      result.push({ ...debt, paise });
      left -= paise;
    }
    return result;
  }

  if (!Array.isArray(lines) || !lines.length) throw createHttpError(400, "Choose what this payment is for.");
  const byPeriod = new Map(debts.map((debt) => [debt.period, debt]));
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const period = String(line?.billingPeriod || "");
    const debt = byPeriod.get(period);
    if (!debt) throw createHttpError(400, `${period || "That term"} has nothing owed that can be paid now.`);
    if (seen.has(period)) throw createHttpError(400, `${debtLabel(period)} is listed more than once.`);
    seen.add(period);
    const paise = parseAmount(line.amount, `the amount for ${debtLabel(period)}`);
    if (paise > debt.balancePaise) {
      throw createHttpError(
        400,
        `${rupeesFromPaise(paise)} is more than the ${rupeesFromPaise(debt.balancePaise)} left on ${debtLabel(period)}.`,
      );
    }
    result.push({ ...debt, paise });
  }
  const allocated = result.reduce((sum, line) => sum + line.paise, 0);
  if (allocated !== amountPaise) {
    throw createHttpError(
      400,
      allocated < amountPaise
        ? `${rupeesFromPaise(amountPaise - allocated)} of this payment isn't allocated to a term.`
        : `The terms add up to ${rupeesFromPaise(allocated)}, more than the ${rupeesFromPaise(amountPaise)} received.`,
    );
  }
  // Oldest first in the record, whatever order they were picked in.
  const order = new Map(debts.map((debt, index) => [debt.period, index]));
  return result.sort((a, b) => order.get(a.period) - order.get(b.period));
}

/* ---- Reading the request ------------------------------------------------- */

// `undefined` means "today"; null or "" means the date wasn't recorded.
function readCollectionDate(value, today = todayKey()) {
  if (value === undefined) return today;
  if (value === null || value === "") return null;
  const date = String(value);
  if (!DATE_KEY.test(date) || Number.isNaN(Date.parse(date))) throw createHttpError(400, "Enter a valid collection date.");
  if (date > today) throw createHttpError(400, "A payment can't be collected on a future date.");
  return date;
}

function readDetails(body, fallback = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const mode = has("mode") ? normalizePaymentMode(body.mode) : fallback.mode || "";
  if (has("mode") && body.mode && !mode) throw createHttpError(400, "Choose how the payment was made.");
  const reference = has("reference") ? String(body.reference || "").trim() : fallback.reference || "";
  const note = has("note") ? String(body.note || "").trim() : fallback.note || "";
  if (reference.length > 80) throw createHttpError(400, "The reference can be at most 80 characters.");
  if (note.length > 300) throw createHttpError(400, "The note can be at most 300 characters.");
  return { mode, reference, note };
}

function readReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 3) throw createHttpError(400, "Give a reason (at least 3 characters).");
  if (reason.length > 300) throw createHttpError(400, "The reason can be at most 300 characters.");
  return reason;
}

const actor = (user) => ({
  id: String(user?.id || ""),
  name: String(user?.name || user?.email || "").slice(0, 160),
  role: String(user?.role || ""),
});

/**
 * The transaction and its allocation rows for an allocation. A recorded date
 * dates every row; an unrecorded one files each row under its own term's
 * start (the opening balance always has a recorded date), and the
 * transaction under the earliest of those.
 */
function buildTransaction({ lines, date, details, source, user, requestId = null, id, replacesId = null }) {
  if (!date && lines.some((line) => line.period === OPENING_PERIOD_KEY)) {
    throw createHttpError(400, "A payment toward the opening balance needs the date it was collected.");
  }
  const allocations = lines.map((line) => ({
    billingPeriod: line.period,
    billingMonth: line.period.length === 7 ? line.period : "",
    amount: fromPaise(line.paise),
    periodFee: fromPaise(line.chargePaise),
    date: date || termStartKey(line.period),
  }));
  const tx = {
    id: id || crypto.randomUUID(),
    amount: fromPaise(lines.reduce((sum, line) => sum + line.paise, 0)),
    date: date || allocations.map((allocation) => allocation.date).sort()[0],
    dateKnown: Boolean(date),
    mode: details.mode || "cash",
    reference: details.reference,
    note: details.note,
    requestId,
    source,
    replacesId,
    enteredBy: actor(user),
  };
  return { tx, allocations };
}

/* ---- Operations ---------------------------------------------------------- */

/**
 * Records money received from a member as one transaction, allocated oldest
 * debt first ("fifo", the default) or to the terms the admin chose
 * ("manual"). The member row is locked for the whole read-allocate-write, so
 * two devices can't both spend the same balance; a retried submit (same
 * requestId) returns the first result instead of recording twice.
 *
 * body: { requestId, amount, date, mode, reference, note, allocation, allocations, renewAhead }
 *   or the older { payments: [{ billingPeriod, amount, mode }] } (manual, today).
 */
async function recordPayment(gymId, memberId, body, user) {
  const settings = await repo().getSettings(gymId);
  const legacy = Array.isArray(body.payments);
  const today = todayKey();
  const requestId = body.requestId ? String(body.requestId) : null;
  if (requestId && !REQUEST_ID.test(requestId)) throw createHttpError(400, "Invalid request id.");
  const date = legacy ? today : readCollectionDate(body.date, today);
  const details = legacy ? readDetails({ mode: body.payments[0]?.mode || "cash" }) : readDetails(body);
  const amountPaise = legacy ? null : parseAmount(body.amount, "the amount received", { allowZero: true });

  const result = await repo().withMemberLock(gymId, memberId, async (conn, member) => {
    if (requestId) {
      const earlier = await repo().findTransactionByRequest(conn, gymId, requestId);
      if (earlier) {
        if (earlier.memberId !== member.id) throw createHttpError(409, "This payment was already recorded for another member.");
        return { transactionId: earlier.id, repeated: true };
      }
    }
    if (date && date < member.startDate) throw createHttpError(400, "A payment can't be collected before the joining date.");
    const debts = outstandingDebts(member, settings, { renewAhead: !legacy && body.renewAhead === true });
    let lines;
    if (legacy) {
      const rows = preparePeriodPayments(member, body.payments);
      const total = rows.reduce((sum, row) => sum + toPaise(row.amount), 0);
      lines = allocate(debts, total, "manual", rows.map((row) => ({ billingPeriod: row.billingPeriod, amount: row.amount })));
    } else {
      lines = allocate(debts, amountPaise, body.allocation, body.allocations);
    }
    checkAheadOrder(debts, lines);
    const { tx, allocations } = buildTransaction({ lines, date, details, source: "desk", user, requestId });
    await repo().insertTransaction(conn, gymId, member.id, tx, allocations);
    return { transactionId: tx.id, repeated: false };
  });

  const member = publicMember(await repo().getMemberById(gymId, memberId));
  const transaction = member.transactions.find((item) => item.id === result.transactionId) || null;
  return { member, transaction, repeated: result.repeated };
}

// Terms closed by a plan change, or covered by an opening balance's cut-over,
// are no longer billed: un-paying one would make that debt disappear. Returns
// why a transaction can't be reversed, or "".
function closedTermsProblem(member, tx) {
  const closedBy = member.planStartDate ? "plan" : member.billingCutover ? "opening" : "";
  if (!closedBy) return "";
  const start = member.planStartDate || member.billingCutover;
  // Old-plan terms kept as balance due are still billed: un-paying one leaves it owed.
  const kept = new Set((member.carriedTerms || []).map((term) => term.period));
  const closed = tx.allocations.some((allocation) => {
    const period = allocation.billingPeriod;
    if (period === OPENING_PERIOD_KEY || kept.has(period)) return false;
    return period.length === 7 ? period < start.slice(0, 7) : period < start;
  });
  if (!closed) return "";
  return closedBy === "plan"
    ? `This payment is for terms closed by the plan change on ${start}. Reversing it would drop that debt from billing, so it can't be reversed here.`
    : `This payment is for terms covered by the opening balance (billing restarted on ${start}). Reversing it would drop that debt from billing, so it can't be reversed here.`;
}

async function lockedTransaction(conn, gymId, member, transactionId) {
  const tx = await repo().findTransaction(conn, gymId, member.id, String(transactionId || ""));
  if (!tx) throw createHttpError(404, "Payment not found");
  if (tx.status === "reversed") {
    throw createHttpError(
      409,
      tx.replacedById ? "This payment was already corrected. Correct its replacement instead." : "This payment is already reversed.",
    );
  }
  return tx;
}

async function respond(gymId, memberId, transactionId) {
  const member = publicMember(await repo().getMemberById(gymId, memberId));
  return { member, transaction: member.transactions.find((item) => item.id === transactionId) || null };
}

/** Edits a payment's method, reference or note in place, logging each change. */
async function editPaymentDetails(gymId, memberId, transactionId, body, user) {
  await repo().withMemberLock(gymId, memberId, async (conn, member) => {
    const tx = await lockedTransaction(conn, gymId, member, transactionId);
    const next = readDetails(body, tx);
    const changes = {};
    for (const field of ["mode", "reference", "note"]) {
      if (Object.prototype.hasOwnProperty.call(body, field) && next[field] !== tx[field]) changes[field] = next[field];
    }
    if (!Object.keys(changes).length) throw createHttpError(400, "Nothing was changed.");
    await repo().updateTransactionDetails(conn, gymId, tx, changes, actor(user));
  });
  return respond(gymId, memberId, transactionId);
}

/**
 * Reverses a payment: it stays on record (who, when, why) but no longer pays
 * its terms, so they are owed again and it leaves the income figures.
 */
async function reversePayment(gymId, memberId, transactionId, body, user) {
  const reason = readReason(body.reason);
  await repo().withMemberLock(gymId, memberId, async (conn, member) => {
    const tx = await lockedTransaction(conn, gymId, member, transactionId);
    const problem = closedTermsProblem(member, tx);
    if (problem) throw createHttpError(409, problem);
    if (!(await repo().reverseTransaction(conn, gymId, tx.id, { by: actor(user), reason }))) {
      throw createHttpError(409, "This payment is already reversed.");
    }
  });
  return respond(gymId, memberId, transactionId);
}

/**
 * Corrects a payment's amount, collection date or allocation: the original is
 * reversed ("Corrected: <reason>") and a replacement recorded with the right
 * values, linked both ways, in one DB transaction. If the replacement can't be
 * recorded, the original is left exactly as it was.
 */
async function correctPayment(gymId, memberId, transactionId, body, user) {
  const settings = await repo().getSettings(gymId);
  const reason = readReason(body.reason);
  const date = readCollectionDate(body.date);
  const amountPaise = parseAmount(body.amount, "the corrected amount", { allowZero: true });
  const replacementId = crypto.randomUUID();
  await repo().withMemberLock(gymId, memberId, async (conn, member) => {
    const tx = await lockedTransaction(conn, gymId, member, transactionId);
    const problem = closedTermsProblem(member, tx);
    if (problem) throw createHttpError(409, problem);
    if (date && date < member.startDate) throw createHttpError(400, "A payment can't be collected before the joining date.");
    // Balances as if the original had never been recorded.
    const without = { ...member, payments: member.payments.filter((payment) => payment.transactionId !== tx.id) };
    // A payment that renewed a term ahead can be corrected onto that term again.
    const paidAhead = tx.allocations.some((allocation) => allocation.billingPeriod === nextTermKey(member, settings));
    const debts = outstandingDebts(without, settings, { renewAhead: body.renewAhead === true || paidAhead });
    const lines = allocate(debts, amountPaise, body.allocation, body.allocations);
    checkAheadOrder(debts, lines);
    const { tx: replacement, allocations } = buildTransaction({
      lines,
      date,
      details: readDetails(body, tx),
      source: "correction",
      user,
      id: replacementId,
      replacesId: tx.id,
    });
    if (!(await repo().reverseTransaction(conn, gymId, tx.id, { by: actor(user), reason: `Corrected: ${reason}`, replacedById: replacementId }))) {
      throw createHttpError(409, "This payment is already reversed.");
    }
    await repo().insertTransaction(conn, gymId, member.id, replacement, allocations);
  });
  return respond(gymId, memberId, replacementId);
}

module.exports = {
  allocate,
  checkAheadOrder,
  closedTermsProblem,
  correctPayment,
  editPaymentDetails,
  outstandingDebts,
  preparePeriodPayments,
  recordPayment,
  reversePayment,
};
