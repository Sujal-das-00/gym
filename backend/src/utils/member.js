const crypto = require("crypto");
const { nowIso, toDateKey, todayKey } = require("./date");

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
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
    membershipType: (member.membershipType || member.membership_type) === "package" ? "package" : "monthly",
    packageMonths: Math.max(1, Math.round(Number(member.packageMonths || member.package_months || 1))),
    collectionTiming: ["at-join", "fixed-day"].includes(member.collectionTiming || member.collection_timing)
      ? member.collectionTiming || member.collection_timing
      : "",
    startDate: toDateKey(member.startDate || member.start_date || todayKey()),
    photo: String(member.photo || ""),
    attendance: Array.isArray(member.attendance) ? [...new Set(member.attendance.map(toDateKey))].sort() : [],
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
        }))
      : [],
    createdAt: String(member.createdAt || member.created_at || nowIso()),
  };
}

function publicMember(member) {
  return normalizeMember(member);
}

module.exports = {
  normalizeMember,
  normalizePhone,
  publicMember,
};
