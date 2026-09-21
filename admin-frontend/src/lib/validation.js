// Client-side form validation for the member and trainer dialogs.
// The backend still validates everything it stores — these checks exist so the
// admin sees a precise, inline message instead of a generic save failure.
import { normalizePhone } from "./format.js";

export const PHONE_DIGITS = 10;
export const PHONE_PREFIX = "+91";

// Everything the gym keys off a phone number (check-in match, member login)
// compares the 10-digit national form, so that is what the inputs collect.
// Pasting "+91 98765 43210" or "09876543210" still lands on the right digits.
export function toPhoneDigits(value) {
  return normalizePhone(value).slice(0, PHONE_DIGITS);
}

export function isValidPhone(value) {
  return /^[6-9]\d{9}$/.test(toPhoneDigits(value));
}

export function phoneError(value, { required = true } = {}) {
  const digits = toPhoneDigits(value);
  if (!digits) return required ? "Enter a mobile number." : "";
  if (digits.length < PHONE_DIGITS) return `Mobile number needs ${PHONE_DIGITS} digits (${digits.length} so far).`;
  if (!isValidPhone(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
  return "";
}

function requiredText(value, label, { min = 2, max = 80 } = {}) {
  const text = String(value || "").trim();
  if (!text) return `${label} is required.`;
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (text.length > max) return `${label} must be under ${max} characters.`;
  return "";
}

function amountError(value, label, { required = true, max = 1000000 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return required ? `${label} is required.` : "";
  const amount = Number(text);
  if (!Number.isFinite(amount)) return `${label} must be a number.`;
  if (amount < 0) return `${label} cannot be negative.`;
  if (amount > max) return `${label} looks too large. Check the amount.`;
  return "";
}

// A start date far in the past or future is almost always a typo in the year,
// and it silently shifts every billing period that follows.
function startDateError(value) {
  const text = String(value || "").trim();
  if (!text) return "Start date is required.";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Enter a valid start date.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxAhead = new Date(today);
  maxAhead.setFullYear(maxAhead.getFullYear() + 1);
  const minBack = new Date(today);
  minBack.setFullYear(minBack.getFullYear() - 10);
  if (date > maxAhead) return "Start date cannot be more than a year ahead.";
  if (date < minBack) return "Start date cannot be more than 10 years back.";
  return "";
}

// `others` is the rest of the members list (the one being edited excluded), used
// to catch the duplicate the backend would otherwise reject after a round trip.
export function validateMember(values, others = []) {
  const errors = {};

  const gymId = String(values.gymId || "").trim().toUpperCase();
  if (!gymId) errors.gymId = "Gym ID is required.";
  else if (!/^[A-Z0-9-]{3,40}$/.test(gymId)) errors.gymId = "Use 3-40 letters, numbers or hyphens - no spaces or symbols.";
  else if (others.some((item) => String(item.gymId || item.id || "").trim().toUpperCase() === gymId)) {
    errors.gymId = "Another member already uses this Gym ID.";
  }

  errors.name = requiredText(values.name, "Name");

  const phone = phoneError(values.phone);
  if (phone) errors.phone = phone;
  else {
    const digits = toPhoneDigits(values.phone);
    if (others.some((item) => normalizePhone(item.phone) === digits)) {
      errors.phone = "Another member is already registered with this number.";
    }
  }

  errors.address = requiredText(values.address, "Address", { min: 4, max: 200 });

  const fee = amountError(values.fee, "Fee amount");
  if (fee) errors.fee = fee;
  else if (Number(values.fee) <= 0) errors.fee = "Fee amount must be more than 0.";

  errors.admissionFee = amountError(values.admissionFee, "Admission fee", { required: false });

  if (values.membershipType === "package") {
    const months = Number(values.packageMonths);
    if (!String(values.packageMonths ?? "").trim()) errors.packageMonths = "Package months is required.";
    else if (!Number.isFinite(months) || months < 1) errors.packageMonths = "Package must be at least 1 month.";
    else if (months > 60) errors.packageMonths = "Package cannot be longer than 60 months.";
    else if (!Number.isInteger(months)) errors.packageMonths = "Package months must be a whole number.";
  }

  errors.startDate = startDateError(values.startDate);

  return stripEmpty(errors);
}

export function validateTrainer(values, others = []) {
  const errors = {};

  errors.name = requiredText(values.name, "Name");

  const phone = phoneError(values.phone);
  if (phone) errors.phone = phone;
  else {
    const digits = toPhoneDigits(values.phone);
    if (others.some((item) => normalizePhone(item.phone) === digits)) {
      errors.phone = "Another trainer is already registered with this number.";
    }
  }

  errors.specialty = requiredText(values.specialty, "Specialty", { min: 2, max: 60 });
  errors.shift = requiredText(values.shift, "Shift", { min: 2, max: 60 });

  const bio = String(values.bio || "").trim();
  if (bio.length > 500) errors.bio = "Notes must be under 500 characters.";

  return stripEmpty(errors);
}

function stripEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => Boolean(message)));
}

export function firstErrorField(errors, order) {
  return order.find((field) => errors[field]) || "";
}
