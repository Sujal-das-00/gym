const crypto = require("crypto");
const { nowIso, toDateKey, todayKey } = require("./date");
const { PAYMENT_MODES } = require("../config/constants");

// Canonical phone form: digits only, without the Indian trunk/country prefixes,
// so "+91 98765 43210", "919876543210", "09876543210" and "9876543210" are all
// the same number. Applied on save AND on lookup so the same number written a
// different way can never register twice or miss a check-in match.
// Keep in sync with normalizePhone in admin-frontend/script.js.
function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    const rest = digits.slice(2).replace(/^0+/, "");
    if (rest.length === 10) digits = rest;
  }
  return digits;
}

// Anything unrecognised (including the blank left by older rows) becomes "",
// which every caller treats as "mode not recorded".
function normalizePaymentMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return PAYMENT_MODES.includes(mode) ? mode : "";
}

function normalizeMember(member) {
  const gymId = String(member.gymId || member.gym_id || member.id || `GYM${Date.now().toString().slice(-6)}`)
    .trim()
    .toUpperCase();

  return {
    id: String(member.id || crypto.randomUUID()),
    gymId,
    name: String(member.name || "Unnamed member").trim(),
    phone: normalizePhone(member.phone),
    address: String(member.address || "").trim(),
    fee: Number(member.fee || 0),
    // One-off joining charge, collected before the first membership term. 0 when
    // the gym doesn't charge one (the default).
    admissionFee: Math.max(0, Number(member.admissionFee || member.admission_fee || 0)),
    // Not a members-table column — carried only through the save flow so the
    // admission payment row can be written with the mode the admin picked.
    admissionMode: normalizePaymentMode(member.admissionMode || member.admission_mode),
    membershipType: (member.membershipType || member.membership_type) === "package" ? "package" : "monthly",
    packageMonths: Math.max(1, Math.round(Number(member.packageMonths || member.package_months || 1))),
    collectionTiming: ["at-join", "fixed-day"].includes(member.collectionTiming || member.collection_timing)
      ? member.collectionTiming || member.collection_timing
      : "",
    startDate: toDateKey(member.startDate || member.start_date || todayKey()),
    // Set by a plan change: billing periods count from here instead of startDate
    // (which stays the joining date). "" = the plan was never changed.
    planStartDate: member.planStartDate || member.plan_start_date ? toDateKey(member.planStartDate || member.plan_start_date) : "",
    // "existing" = joined before being entered into GymBoo; startDate is then
    // the original joining date and createdAt the registration.
    onboardingType: (member.onboardingType || member.onboarding_type) === "existing" ? "existing" : "new",
    // Owed at registration when the gym entered one balance instead of each
    // past term; openingBalanceAdmission is the admission-fee part of it.
    openingBalance: Math.max(0, Number(member.openingBalance ?? member.opening_balance ?? 0) || 0),
    openingBalanceAdmission: Math.max(0, Number(member.openingBalanceAdmission ?? member.opening_balance_admission ?? 0) || 0),
    // With an opening balance: the first term billed normally ("" = none).
    billingCutover: member.billingCutover || member.billing_cutover ? toDateKey(member.billingCutover || member.billing_cutover) : "",
    photo: String(member.photo || ""),
    // trainers.id of the assigned trainer; "" when none.
    trainerId: String(member.trainerId ?? member.trainer_id ?? "").trim().slice(0, 64),
    attendance: Array.isArray(member.attendance) ? [...new Set(member.attendance.map(toDateKey))].sort() : [],
    // Dates the member checked in while their membership was expired (flagged red in the admin panel).
    expiredCheckins: Array.isArray(member.expiredCheckins) ? [...new Set(member.expiredCheckins.map(toDateKey))].sort() : [],
    payments: Array.isArray(member.payments)
      ? member.payments.map((payment) => ({
          ...payment,
          date: toDateKey(payment.date || payment.payment_date || todayKey()),
          month: String(payment.month || payment.month_key || todayKey().slice(0, 7)),
          billingPeriod: String(payment.billingPeriod || payment.billing_period || payment.billingMonth || payment.billing_month || payment.month || ""),
          billingMonth: String(
            payment.billingMonth ||
              payment.billing_month ||
              (String(payment.billingPeriod || payment.billing_period || "").length === 7
                ? payment.billingPeriod || payment.billing_period
                : ""),
          ),
          amount: Number(payment.amount || 0),
          // null: recorded before part payments, so it paid its period in full.
          periodFee: (payment.periodFee ?? payment.period_fee ?? null) === null ? null : Number(payment.periodFee ?? payment.period_fee),
          kind: payment.kind === "admission" ? "admission" : "membership",
          mode: normalizePaymentMode(payment.mode || payment.payment_mode),
          // false: entered later without its collection date; `date` is then the
          // start of the term it paid (see payments.date_known).
          dateKnown: ![false, 0, "0"].includes(payment.dateKnown ?? payment.date_known ?? true),
          transactionId: String(payment.transactionId || payment.transaction_id || ""),
        }))
      : [],
    // Money received (see payment_transactions), reversed ones included, for
    // the admin history. `payments` above holds only what still counts.
    transactions: Array.isArray(member.transactions) ? member.transactions : [],
    // Old-plan terms a plan change or restart kept as balance due (read from
    // member_plan_changes.dues_detail, never written through a member save).
    carriedTerms: Array.isArray(member.carriedTerms)
      ? member.carriedTerms
          .filter((term) => term && term.period)
          .map((term) => ({ period: String(term.period), fee: Number(term.fee || 0), changeId: String(term.changeId || "") }))
      : [],
    createdAt: String(member.createdAt || member.created_at || nowIso()),
  };
}

// "2 Aug 2026" from a date key, independent of the server's locale.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function displayDateKey(key) {
  const [year, month, day] = String(key || "").slice(0, 10).split("-").map(Number);
  return year && month && day ? `${day} ${MONTHS[month - 1]} ${year}` : "";
}

// One line describing how a member came into GymBoo, for the activity log
// (Phase 2). Registration is read from createdAt, the joining date from
// startDate, so an existing member's two dates never get mixed up.
function describeOnboarding(member) {
  // createdAt is a UTC ISO time; name the local day it was registered on.
  const createdAt = Date.parse(member?.createdAt || "");
  const registered = Number.isFinite(createdAt) ? displayDateKey(toDateKey(new Date(createdAt))) : "";
  if (member?.onboardingType !== "existing") return `New member added — Joined: ${displayDateKey(member?.startDate)}.`;
  return `Existing member added — Original joining date: ${displayDateKey(member.startDate)}. Registered in GymBoo: ${registered}.`;
}

function publicMember(member) {
  // Callers pass a lookup result straight through, so "not found" has to survive
  // as null rather than being normalized into a blank member.
  if (!member) return null;
  return normalizeMember(member);
}

// What a member (member app, kiosk) sees of their own record: only payments
// that count, as paid receipts. Reversals, who entered a payment and internal
// notes stay with the gym.
function memberFacing(member) {
  const view = publicMember(member);
  if (!view) return view;
  view.transactions = view.transactions
    .filter((tx) => tx.status === "active")
    .map(({ id, amount, date, dateKnown, mode, reference, allocations }) => ({ id, amount, date, dateKnown, mode, reference, allocations }));
  return view;
}

module.exports = {
  describeOnboarding,
  memberFacing,
  normalizeMember,
  normalizePaymentMode,
  normalizePhone,
  publicMember,
};
