// Money as whole paise. Amounts are stored as DECIMAL(10,2) and arrive as
// numbers or strings; every payment check and allocation is done on integers
// so ₹0.10 + ₹0.20 is exactly ₹0.30 and no balance drifts by a paisa.
const { createHttpError } = require("./http");

// Up to 8 digits before the point and 2 after: what DECIMAL(10,2) can hold.
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

function toPaise(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

function fromPaise(paise) {
  return paise / 100;
}

// "₹1,234.50" / "₹1,000" for messages.
function rupees(paise) {
  const value = fromPaise(paise);
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * A positive amount typed by the admin, in paise. Rejects zero, negatives,
 * non-numbers and more than two decimal places instead of rounding them away.
 */
function parseAmount(value, label = "the amount", { allowZero = false } = {}) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!AMOUNT.test(text)) throw createHttpError(400, `Enter ${label} in rupees, up to 2 decimal places.`);
  const paise = toPaise(text);
  if (!(paise > 0) && !(allowZero && paise === 0)) throw createHttpError(400, `Enter ${label} above ₹0.`);
  return paise;
}

module.exports = { fromPaise, parseAmount, rupees, toPaise };
