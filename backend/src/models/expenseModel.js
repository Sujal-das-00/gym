const { exec, query } = require("../config/database");
const { toDateKey } = require("../utils/date");
const { normalizePaymentMode } = require("../utils/member");

function mapExpenseRow(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    amount: Number(row.amount || 0),
    date: toDateKey(row.expense_date),
    mode: normalizePaymentMode(row.payment_mode),
  };
}

async function getAllExpenses(gymId) {
  const rows = await query(
    "SELECT * FROM expenses WHERE tenant_id = ? ORDER BY expense_date DESC, created_at DESC",
    [gymId],
  );
  return rows.map(mapExpenseRow);
}

async function getExpenseById(gymId, id) {
  const rows = await query("SELECT * FROM expenses WHERE tenant_id = ? AND id = ?", [gymId, id]);
  return rows[0] ? mapExpenseRow(rows[0]) : null;
}

async function saveExpense(gymId, expense) {
  await exec(
    `INSERT INTO expenses (id, tenant_id, category, title, amount, expense_date, payment_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       category = VALUES(category), title = VALUES(title), amount = VALUES(amount), expense_date = VALUES(expense_date),
       payment_mode = VALUES(payment_mode)`,
    [expense.id, gymId, expense.category, expense.title, expense.amount, expense.date, expense.mode || null],
  );
  return getExpenseById(gymId, expense.id);
}

async function deleteExpense(gymId, id) {
  return exec("DELETE FROM expenses WHERE tenant_id = ? AND id = ?", [gymId, id]);
}

module.exports = {
  deleteExpense,
  getAllExpenses,
  getExpenseById,
  saveExpense,
};
