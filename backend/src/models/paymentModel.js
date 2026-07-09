const crypto = require("crypto");
const { exec } = require("../config/database");
const { todayKey, toDateKey } = require("../utils/date");

function mapPaymentRow(row) {
  return {
    id: row.id,
    date: toDateKey(row.payment_date),
    month: row.month_key,
    billingMonth: row.billing_month || "",
    billingPeriod: row.billing_period,
    amount: Number(row.amount || 0),
  };
}

async function addPayments(member, payments = []) {
  for (const payment of payments) {
    const billingPeriod = String(payment.billingPeriod || payment.billingMonth || payment.month || todayKey().slice(0, 7));
    await exec(
      `INSERT INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id || crypto.randomUUID(),
        member.id,
        toDateKey(payment.date || todayKey()),
        String(payment.month || todayKey().slice(0, 7)),
        String(payment.billingMonth || (billingPeriod.length === 7 ? billingPeriod : "")),
        billingPeriod,
        Number(payment.amount || member.fee || 0),
      ],
    );
  }
}

async function importPayment(member, payment) {
  const billingPeriod = payment.billingPeriod || payment.month || todayKey().slice(0, 7);
  await exec(
    `INSERT IGNORE INTO payments (id, member_id, payment_date, month_key, billing_month, billing_period, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id || crypto.randomUUID(),
      member.id,
      toDateKey(payment.date),
      payment.month || todayKey().slice(0, 7),
      payment.billingMonth || "",
      billingPeriod,
      Number(payment.amount || member.fee || 0),
    ],
  );
}

module.exports = {
  addPayments,
  importPayment,
  mapPaymentRow,
};
