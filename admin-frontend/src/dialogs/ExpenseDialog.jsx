import { useEffect, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Icon from "../components/Icon.jsx";
import { currency, todayKey } from "../lib/dates.js";
import { CATEGORY_ICONS, EXPENSE_CATEGORIES, PAYMENT_MODES } from "../lib/constants.js";

export default function ExpenseDialog() {
  const { closeExpenseDialog, saveExpense, deleteExpense, showToast } = useApp();
  const { expenseDialog } = useDialogs();
  const expense = expenseDialog.expense;
  const [category, setCategory] = useState("trainer-payment");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => todayKey());
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [amountError, setAmountError] = useState("");

  useEffect(() => {
    if (!expenseDialog.open) return;
    setCategory(expense?.category || "trainer-payment");
    setAmount(expense?.amount || "");
    setDate(expense?.date || todayKey());
    setTitle(expense?.title || "");
    setMode(expense?.mode || "cash");
    setBusy(false);
    setAmountError("");
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
      setAmountError("Enter an amount greater than zero.");
      document.getElementById("expenseAmountInput")?.focus();
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
    <Dialog className="sheet member-form-sheet" id="expenseDialog" open={expenseDialog.open} onClose={closeExpenseDialog}>
      <form className="sheet-panel" id="expenseForm" method="dialog" noValidate onSubmit={onSubmit}>
        <header className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          <h2 id="expenseDialogTitle">{expense ? "Edit expense" : "Add expense"}</h2>
          <button className="sheet-close" id="closeExpenseDialog" aria-label="Close" type="button" onClick={closeExpenseDialog}>
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet-body">
          <label className={"amount-hero" + (amountError ? " has-error" : "")}>
            <span>Amount spent</span>
            <span className="amount-hero-field">
              <b aria-hidden="true">₹</b>
              <input
                id="expenseAmountInput"
                name="amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0"
                aria-invalid={amountError ? "true" : undefined}
                aria-describedby={amountError ? "expenseAmountInput-error" : undefined}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (amountError) setAmountError("");
                }}
              />
            </span>
            {amountError ? (
              <small className="field-error" id="expenseAmountInput-error" role="alert">
                {amountError}
              </small>
            ) : null}
          </label>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3 id="expenseCategoryLabel">Category</h3>
            </div>
            <div className="category-grid" role="radiogroup" aria-labelledby="expenseCategoryLabel">
              {EXPENSE_CATEGORIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  className={"category-tile" + (category === option.value ? " active" : "")}
                  onClick={() => setCategory(option.value)}
                >
                  <Icon name={CATEGORY_ICONS[option.value] || "receipt_long"} />
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="sheet-section">
            <div className="mf-grid">
              <label className="mf-field">
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
              <label className="mf-field">
                <span className="mf-label-row">
                  Note
                  <em>Optional</em>
                </span>
                <input
                  id="expenseTitleInput"
                  name="title"
                  maxLength={120}
                  placeholder="e.g. October rent"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <div className="mf-field wide">
                <span className="mf-label" id="expenseModeLabel">
                  Paid via
                </span>
                <div className="pay-modes" role="radiogroup" aria-labelledby="expenseModeLabel">
                  {PAYMENT_MODES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={mode === option.value}
                      className={"pay-mode" + (mode === option.value ? " active" : "")}
                      onClick={() => setMode(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="sheet-foot mf-foot">
          {expense ? (
            <button
              className={"mf-delete" + (busy ? " is-busy" : "")}
              id="deleteExpense"
              type="button"
              disabled={busy}
              onClick={onDelete}
              aria-label="Delete expense"
            >
              <Icon name="delete" />
            </button>
          ) : null}
          <button className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            {busy ? "Saving..." : expense ? "Save changes" : Number(amount) > 0 ? `Add ${currency(amount)} expense` : "Add expense"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
