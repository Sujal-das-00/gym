const crypto = require("crypto");
const { todayKey, toDateKey } = require("./date");

// Keep in sync with EXPENSE_CATEGORIES in admin-frontend/script.js.
const EXPENSE_CATEGORIES = [
  "trainer-payment",
  "rent",
  "equipment",
  "utilities",
  "maintenance",
  "miscellaneous",
  "other",
];

function normalizeExpense(expense = {}) {
  const category = String(expense.category || "other").trim().toLowerCase();
  return {
    id: expense.id || crypto.randomUUID(),
    category: EXPENSE_CATEGORIES.includes(category) ? category : "other",
    title: String(expense.title || "").trim().slice(0, 160),
    amount: Number(expense.amount || 0),
    date: toDateKey(expense.date || todayKey()),
  };
}

module.exports = {
  EXPENSE_CATEGORIES,
  normalizeExpense,
};
