import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { currency, todayKey } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";

export default function ExpenseDialog() {
  const { expenseDialog, closeExpenseDialog, saveExpense, deleteExpense, showToast } = useApp();
  const expense = expenseDialog.expense;
  const [category, setCategory] = useState("trainer-payment");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => todayKey());
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("cash");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expenseDialog.open) return;
    setCategory(expense?.category || "trainer-payment");
    setAmount(expense?.amount || "");
    setDate(expense?.date || todayKey());
    setTitle(expense?.title || "");
    setMode(expense?.mode || "cash");
    setBusy(false);
  }, [expenseDialog.open, expense]);

  const onSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      category,
      amount: Number(amount),
      date: date || todayKey(),
      title: title.trim(),
      mode,
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      showToast("Enter an amount greater than zero");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await saveExpense(payload, expense?.id || null);
      closeExpenseDialog();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!expense?.id || busy) return;
    if (!confirm(`Delete this ${currency(expense.amount || 0)} expense?`)) return;
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      closeExpenseDialog();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="member-dialog" id="expenseDialog" open={expenseDialog.open} onClose={closeExpenseDialog}>
      <form className="member-form" id="expenseForm" method="dialog" onSubmit={onSubmit}>
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Expense tracker</p>
            <h2 id="expenseDialogTitle">{expense ? "Edit expense" : "Add expense"}</h2>
          </div>
          <button className="icon-button" id="closeExpenseDialog" aria-label="Close" type="button" onClick={closeExpenseDialog}>
            ×
          </button>
        </div>

        <div className="form-grid">
          <label>
            Category
            <select
              id="expenseCategoryInput"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="trainer-payment">Trainer payment</option>
              <option value="rent">Rent</option>
              <option value="equipment">Equipment</option>
              <option value="utilities">Utilities (electricity, water)</option>
              <option value="maintenance">Maintenance &amp; repairs</option>
              <option value="miscellaneous">Miscellaneous</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Amount
            <input
              id="expenseAmountInput"
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Date
            <input
              id="expenseDateInput"
              name="date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Paid via
            <select
              id="expenseModeInput"
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              {PAYMENT_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Description
            <input
              id="expenseTitleInput"
              name="title"
              placeholder="e.g. October rent, treadmill repair, trainer salary"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className={"secondary-action" + (busy ? " is-busy" : "")}
            id="deleteExpense"
            type="button"
            style={{ display: expense ? "inline-block" : "none" }}
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
          <button className={"primary-action" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            Save expense
          </button>
        </div>
      </form>
    </Dialog>
  );
}
