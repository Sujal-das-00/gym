const crypto = require("crypto");
const { exec, query } = require("../config/database");
const { referralConfig } = require("../config/env");
const { createHttpError } = require("../utils/http");
const gymModel = require("../models/gymModel");
const referralModel = require("../models/referralModel");
const platformSettings = require("../models/platformSettingsModel");

// Yearly server & maintenance fee. It applies to one-time (lifetime) licence gyms; a monthly
// subscription already covers hosting and a free trial owes nothing.
//
// By default (editable in the console's Settings) the fee is due in the 1-15 January window, starting the year after the licence
// was activated. A gym can instead have a custom due date and/or a custom yearly price.
// A custom due date is day one: the owner sees "plan expired, pay the maintenance fee" and
// has GRACE_DAYS to pay. After that the account is put on hold until the fee is recorded.
// Paying moves a custom due date on a year.
const MODES = ["cash", "upi", "card", "bank", "cheque", "other"];
const GRACE_DAYS = 15;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, "0");
const toIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (iso, days) => toIso(new Date(fromIso(iso).getTime() + days * 86400000));
const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function addYear(iso) {
  const d = fromIso(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return toIso(d);
}
const validDate = (s) => DATE_RE.test(s) && toIso(fromIso(s)) === s;

function parseSettings(body, gym) {
  let maintenancePrice = gym.maintenancePrice;
  if (body.maintenancePrice !== undefined) {
    if (body.maintenancePrice === null || String(body.maintenancePrice).trim() === "") maintenancePrice = null;
    else {
      maintenancePrice = Math.round(Number(body.maintenancePrice) * 100) / 100;
      if (!Number.isFinite(maintenancePrice) || maintenancePrice < 1 || maintenancePrice > 1000000) {
        throw createHttpError(400, "Yearly maintenance price must be between ₹1 and ₹10,00,000, or empty for the standard price");
      }
    }
  }
  let maintenanceDue = gym.maintenanceDue;
  if (body.maintenanceDue !== undefined) {
    const raw = body.maintenanceDue === null ? "" : String(body.maintenanceDue).trim();
    if (!raw) maintenanceDue = null;
    else if (!validDate(raw)) throw createHttpError(400, "Maintenance due date must be a valid date");
    else maintenanceDue = raw;
  }
  return { maintenancePrice, maintenanceDue };
}

// Pure: where a gym stands on maintenance, given its payments (newest first or any order).
function compute(gym, payments, defaults, now = today()) {
  if (gym.licence !== "lifetime") return { applicable: false };
  const amount = gym.maintenancePrice != null ? gym.maintenancePrice : defaults.price;
  const custom = Boolean(gym.maintenanceDue);
  let start;
  let end;
  if (custom) {
    start = gym.maintenanceDue;
    end = addDays(start, GRACE_DAYS);
  } else {
    const paid = new Set(payments.map((p) => p.periodYear));
    const licensedYear = Number((gym.licensedOn || now).slice(0, 4));
    let year = licensedYear + 1;
    while (paid.has(year)) year += 1;
    start = `${year}-${defaults.start}`;
    end = `${year}-${defaults.end}`;
  }
  // upcoming -> due (day one up to the last date) -> overdue (past it; account on hold)
  let status = "upcoming";
  if (now > end) status = "overdue";
  else if (now >= start) status = "due";
  return {
    applicable: true,
    amount,
    customPrice: gym.maintenancePrice != null,
    customDate: custom,
    windowStart: start,
    dueBy: end,
    periodYear: Number(start.slice(0, 4)),
    locked: status === "overdue" && end >= (defaults.enforceFrom || "0000-00-00"),
    status,
    daysUntilDue: daysBetween(now, end),
    lastPaidOn: payments.map((p) => p.paidOn).filter(Boolean).sort().pop() || null,
  };
}

function mapPayment(row) {
  return {
    id: row.id,
    periodYear: Number(row.period_year),
    amount: Number(row.amount),
    paidOn: row.paid_on_str,
    mode: row.payment_mode,
    ref: row.payment_ref,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function listPayments(tenantId) {
  const rows = await query(
    "SELECT *, DATE_FORMAT(paid_on, '%Y-%m-%d') AS paid_on_str FROM maintenance_payments WHERE tenant_id = ? ORDER BY paid_on DESC, created_at DESC",
    [tenantId],
  );
  return rows.map(mapPayment);
}

async function statusFor(gym) {
  return compute(gym, await listPayments(gym.id), await platformSettings.getMaintenanceDefaults());
}

// Super-admin records money received. amount defaults to the amount currently due.
async function recordPayment(tenantId, body) {
  const gym = await gymModel.getGymById(tenantId);
  if (!gym) throw createHttpError(404, "Gym not found");
  const payments = await listPayments(tenantId);
  const status = compute(gym, payments, await platformSettings.getMaintenanceDefaults());
  if (!status.applicable) throw createHttpError(400, "Maintenance applies to gyms with the one-time licence");
  const raw = body.amount === undefined || String(body.amount).trim() === "" ? status.amount : Number(body.amount);
  const amount = Math.round(raw * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw createHttpError(400, "Enter a valid amount");
  const paidOn = String(body.paidOn || today()).trim();
  if (!validDate(paidOn)) throw createHttpError(400, "Enter a valid payment date");
  const mode = MODES.includes(body.mode) ? body.mode : "upi";
  await exec(
    "INSERT INTO maintenance_payments (id, tenant_id, period_year, amount, paid_on, payment_mode, payment_ref, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [crypto.randomUUID(), tenantId, status.periodYear, amount, paidOn, mode, String(body.ref || "").trim().slice(0, 60), String(body.note || "").trim().slice(0, 255)],
  );
  // A custom due date rolls forward a year; the default January window moves on by itself
  // because this year is now paid.
  if (status.customDate) {
    await exec("UPDATE gyms SET maintenance_due = ? WHERE id = ?", [addYear(status.windowStart), tenantId]);
  }
  // The super-admin can pick the next due day by hand, which also makes it a custom date.
  const nextDue = String(body.nextDue || "").trim();
  if (nextDue) {
    if (!validDate(nextDue)) throw createHttpError(400, "Next due date must be a valid date");
    await exec("UPDATE gyms SET maintenance_due = ? WHERE id = ?", [nextDue, tenantId]);
  }
  return statusFor(await gymModel.getGymById(tenantId));
}

// For the access gate: is this gym's account on hold for unpaid maintenance?
async function isLocked(gym) {
  if (gym.licence !== "lifetime") return false;
  return Boolean((await statusFor(gym)).locked);
}

// The owner's Plan & Billing page: plan, maintenance standing, and every payment to us.
async function getBilling(tenantId) {
  const gym = await gymModel.getGymById(tenantId);
  if (!gym) throw createHttpError(404, "Gym not found");
  const [purchases, payments, defaults] = await Promise.all([
    referralModel.listPurchases({ tenantId }),
    listPayments(tenantId),
    platformSettings.getMaintenanceDefaults(),
  ]);
  const history = [];
  for (const p of purchases) {
    if (p.status === "pending" && !p.claimedAt) continue; // only a quote so far
    history.push({
      id: p.id,
      kind: "licence",
      title: p.plan === "lifetime" ? "Lifetime License" : "Monthly Subscription",
      amount: p.amount,
      date: p.decidedAt || p.claimedAt || p.createdAt,
      status: p.status === "approved" ? "paid" : p.status === "rejected" ? "rejected" : "verifying",
      ref: p.paymentRef,
    });
  }
  for (const m of payments) {
    history.push({
      id: m.id,
      kind: "maintenance",
      title: `Server & maintenance ${m.periodYear}`,
      amount: m.amount,
      date: m.paidOn,
      status: "paid",
      ref: m.ref,
      mode: m.mode,
    });
  }
  history.sort((a, b) => new Date(b.date) - new Date(a.date));
  const upi = await platformSettings.getUpi();
  return {
    upi: upi.id ? { id: upi.id, name: upi.name } : null,
    access: gymModel.accessOf(gym),
    maintenance: compute(gym, payments, defaults),
    history,
    totalPaid: history.filter((h) => h.status === "paid").reduce((sum, h) => sum + h.amount, 0),
    supportEmail: referralConfig().supportEmail,
  };
}

module.exports = { compute, getBilling, isLocked, listPayments, parseSettings, recordPayment, statusFor };
