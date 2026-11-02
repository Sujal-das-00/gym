const crypto = require("crypto");
const { getBillingPeriodKeys, nextPeriodStartKey, periodStartDate } = require("../utils/billing");
const { nowIso, toDateKey, todayKey } = require("../utils/date");
const { createHttpError } = require("../utils/http");
const { normalizePaymentMode, publicMember } = require("../utils/member");
const { repo } = require("../models");
const { assertUniqueMember, mergeMemberPayload } = require("./memberService");

// How far back an existing member's joining date may go, and the number of
// past terms above which the admin is asked to double-check it.
const MAX_HISTORY_MONTHS = 24;
const TERM_WARNING_THRESHOLD = 12;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const roundRupees = (amount) => Math.round(Number(amount) * 100) / 100;
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

// The same calendar day `months` months earlier, clamped to the month's end.
function monthsBefore(key, months) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1 - months, day);
  if (date.getDate() !== day) date.setDate(0);
  return toDateKey(date);
}

// The day an unrecorded payment is reported on: the start of the term it paid
// (the 1st for calendar-month terms), never the day it was typed in.
function termStartKey(period) {
  return toDateKey(periodStartDate(period));
}

// A collection date: "" / null means "not recorded". A recorded one must fall
// between the joining date and today.
function readCollectionDate(value, startDate, today, label) {
  if (value === null || value === undefined || value === "") return null;
  const date = String(value);
  if (!DATE_KEY.test(date) || Number.isNaN(Date.parse(date))) throw createHttpError(400, `Enter a valid date for ${label}.`);
  if (date > today) throw createHttpError(400, `${label} can't be paid on a future date.`);
  if (date < startDate) throw createHttpError(400, `${label} can't be paid before the joining date.`);
  return date;
}

/**
 * One payment row per term marked paid. Every term that has started must be
 * answered exactly once, paid or unpaid — nothing is assumed for the admin.
 *
 * "Paid in full" settles the term at the amount actually collected (the gym
 * may have charged less then). Otherwise the term's fee (default: the current
 * plan fee) is what the term cost, and the rest stays on it as a balance.
 */
function termPayments(member, terms, answers, today) {
  if (!Array.isArray(answers)) throw createHttpError(400, "Mark every past term as paid or unpaid.");
  const byPeriod = new Map();
  for (const answer of answers) {
    const period = String(answer?.period || "");
    if (!terms.includes(period)) throw createHttpError(400, `${period || "A term"} is not one of this member's terms.`);
    if (byPeriod.has(period)) throw createHttpError(400, `${period} is listed more than once.`);
    byPeriod.set(period, answer);
  }
  const missing = terms.filter((period) => !byPeriod.has(period));
  if (missing.length) throw createHttpError(400, `Mark every past term as paid or unpaid (${missing.join(", ")} missing).`);

  const payments = [];
  for (const period of terms) {
    const answer = byPeriod.get(period);
    if (answer.status === "unpaid") continue;
    if (answer.status !== "paid") throw createHttpError(400, `Mark ${period} as paid or unpaid.`);

    const amount = roundRupees(answer.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw createHttpError(400, `Enter the amount received for ${period}.`);
    let periodFee = amount;
    if (answer.paidInFull === false) {
      periodFee = roundRupees(answer.termFee ?? member.fee);
      if (!Number.isFinite(periodFee) || periodFee <= 0) throw createHttpError(400, `Enter the fee for ${period}.`);
      if (amount >= periodFee) {
        throw createHttpError(400, `${rupees(amount)} covers the ${rupees(periodFee)} fee for ${period}: tick "Paid in full".`);
      }
    }
    const date = readCollectionDate(answer.date, member.startDate, today, period);
    payments.push({
      kind: "membership",
      billingPeriod: period,
      billingMonth: period.length === 7 ? period : "",
      date: date || termStartKey(period),
      dateKnown: Boolean(date),
      amount,
      periodFee,
      mode: normalizePaymentMode(answer.mode),
    });
  }
  return payments;
}

/**
 * Adds a member who joined before being entered into GymBoo, with their past
 * terms reconciled one way: each term paid or unpaid ("periods"), or a single
 * opening balance covering every term up to today ("opening").
 *
 * Joining date (startDate) and registration (createdAt) stay separate. Nothing
 * is dated on the day of entry unless the admin says it was collected that day.
 */
async function createExistingMember(gymId, payload, user = null) {
  const onboarding = payload.onboarding || {};
  const settings = await repo().getSettings(gymId);
  const today = todayKey();

  const startDate = String(payload.startDate || "");
  if (!DATE_KEY.test(startDate) || Number.isNaN(Date.parse(startDate))) {
    throw createHttpError(400, "Enter the member's original joining date.");
  }
  if (startDate >= today) throw createHttpError(400, "An existing member joined before today. Add them as a new member instead.");
  const earliest = monthsBefore(today, MAX_HISTORY_MONTHS);
  if (startDate < earliest) {
    throw createHttpError(400, `The joining date can be at most ${MAX_HISTORY_MONTHS} months back (${earliest}).`);
  }

  const method = onboarding.method;
  if (method !== "periods" && method !== "opening") throw createHttpError(400, "Choose how to enter the member's past payments.");
  const hasOpening = onboarding.openingBalance !== undefined && onboarding.openingBalance !== null && onboarding.openingBalance !== "";
  if ((method === "periods" && hasOpening) || (method === "opening" && Array.isArray(onboarding.periods) && onboarding.periods.length)) {
    throw createHttpError(400, "Use either term-by-term history or an opening balance, not both.");
  }

  const admission = onboarding.admission || {};
  const member = await mergeMemberPayload(null, { ...payload, admissionFee: admission.paid ? payload.admissionFee : 0 });
  member.id = crypto.randomUUID();
  member.createdAt = nowIso();
  member.onboardingType = "existing";
  member.planStartDate = "";
  if (!member.collectionTiming) member.collectionTiming = settings.defaultCollectionTiming;
  await assertUniqueMember(gymId, member);
  if (admission.paid && !(member.admissionFee > 0)) throw createHttpError(400, "Enter the admission fee that was paid.");

  // The member's own terms from the original joining date up to today, from
  // the gym's billing engine: 30-day terms, calendar months or packages,
  // whichever this gym and plan use.
  const terms = getBillingPeriodKeys(member, settings);
  const payments = [];

  if (method === "periods") {
    member.openingBalance = 0;
    member.openingBalanceAdmission = 0;
    member.billingCutover = "";
    payments.push(...termPayments(member, terms, onboarding.periods, today));
  } else {
    const openingBalance = roundRupees(onboarding.openingBalance);
    if (!Number.isFinite(openingBalance) || openingBalance <= 0) throw createHttpError(400, "Enter the opening balance owed.");
    const admissionPart = roundRupees(onboarding.openingBalanceAdmission || 0);
    if (!Number.isFinite(admissionPart) || admissionPart < 0 || admissionPart > openingBalance) {
      throw createHttpError(400, "The admission-fee part can't be more than the opening balance.");
    }
    if (admissionPart > 0 && admission.paid) {
      throw createHttpError(400, "The admission fee can't be both paid and part of the opening balance.");
    }
    member.openingBalance = openingBalance;
    member.openingBalanceAdmission = admissionPart;
    // Every term started by today is covered by the opening balance, the one
    // running now included; billing carries on from the next one.
    member.billingCutover = nextPeriodStartKey(member, settings);
  }

  if (admission.paid) {
    const date = readCollectionDate(admission.date, member.startDate, today, "The admission fee");
    payments.push({
      kind: "admission",
      billingPeriod: "admission",
      billingMonth: "",
      date: date || member.startDate,
      dateKnown: Boolean(date),
      amount: member.admissionFee,
      mode: normalizePaymentMode(admission.mode),
    });
  }

  const enteredBy = user ? { id: user.id, name: user.name || user.email || "", role: user.role } : null;
  const saved = await repo().createMemberWithHistory(gymId, member, payments, enteredBy);
  const warnings =
    terms.length > TERM_WARNING_THRESHOLD
      ? [`${terms.length} terms have passed since ${startDate}. Check the joining date is right.`]
      : [];
  return { member: publicMember(saved), warnings };
}

module.exports = {
  MAX_HISTORY_MONTHS,
  TERM_WARNING_THRESHOLD,
  createExistingMember,
};
