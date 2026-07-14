const { normalizeExpense } = require("../utils/expense");
const { repo } = require("../models");

function validateExpense(expense) {
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
    const error = new Error("Enter an expense amount greater than zero");
    error.status = 400;
    throw error;
  }
}

async function listExpenses(req, res) {
  res.json(await repo().getAllExpenses(req.gymId));
}

async function postExpense(req, res) {
  const expense = normalizeExpense({ ...(req.body || {}), id: "" });
  validateExpense(expense);
  res.status(201).json(await repo().saveExpense(req.gymId, expense));
}

async function putExpense(req, res) {
  const existing = await repo().getExpenseById(req.gymId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  const expense = normalizeExpense({ ...existing, ...(req.body || {}), id: existing.id });
  validateExpense(expense);
  return res.json(await repo().saveExpense(req.gymId, expense));
}

async function deleteExpense(req, res) {
  const result = await repo().deleteExpense(req.gymId, req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Expense not found" });
  return res.json({ ok: true });
}

module.exports = {
  deleteExpense,
  listExpenses,
  postExpense,
  putExpense,
};
