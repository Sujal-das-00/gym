const { normalizeExpense } = require("../utils/expense");
const { repo } = require("../models");
const { changes, record } = require("../services/auditService");

const EXPENSE_FIELDS = ["title", "category", "amount", "date", "mode"];
const snapshot = (expense) => Object.fromEntries(EXPENSE_FIELDS.map((field) => [field, expense?.[field] ?? ""]));

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
  const saved = await repo().saveExpense(req.gymId, expense);
  await record(req.gymId, req.user, "expense_added", { amount: saved.amount, details: snapshot(saved) });
  res.status(201).json(saved);
}

async function putExpense(req, res) {
  const existing = await repo().getExpenseById(req.gymId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  const expense = normalizeExpense({ ...existing, ...(req.body || {}), id: existing.id });
  validateExpense(expense);
  const saved = await repo().saveExpense(req.gymId, expense);
  const changed = changes(existing, saved, EXPENSE_FIELDS);
  if (changed.length) await record(req.gymId, req.user, "expense_edited", { amount: saved.amount, details: { ...snapshot(saved), changes: changed } });
  return res.json(saved);
}

async function deleteExpense(req, res) {
  const existing = await repo().getExpenseById(req.gymId, req.params.id);
  const result = await repo().deleteExpense(req.gymId, req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Expense not found" });
  if (existing) await record(req.gymId, req.user, "expense_deleted", { amount: existing.amount, details: snapshot(existing) });
  return res.json({ ok: true });
}

module.exports = {
  deleteExpense,
  listExpenses,
  postExpense,
  putExpense,
};
