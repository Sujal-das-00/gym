import { currency, todayKey } from "../lib/dates.js";
import { OPENING_PERIOD_KEY } from "../lib/billing.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { allocationLines, debtLabel } from "../lib/payments.js";
import Icon from "./Icon.jsx";

/**
 * The fields of one payment: amount, when it was received, how, and which
 * debts it settles. Shared by Record payment and Correct payment. `draft` is
 * a blankPaymentDraft(); every change goes back through `onChange`.
 */
export default function PaymentFields({ member, debts, draft, onChange, domain }) {
  const set = (change) => onChange({ ...draft, ...change });
  const owed = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const lines = allocationLines({ debts, draft });
  const touchesOpening = lines.some((line) => line.period === OPENING_PERIOD_KEY && line.pay > 0);
  const noFee = owed === 0;

  // Choosing terms starts from the oldest-first split, so it only needs editing.
  const chooseManual = () => {
    const start = Object.fromEntries(
      allocationLines({ debts, draft: { ...draft, method: "fifo" } }).map((line) => [line.period, String(line.pay)]),
    );
    set({ method: "manual", manual: start });
  };
  const toggleTerm = (debt) => {
    const manual = { ...draft.manual };
    if (manual[debt.period] !== undefined) delete manual[debt.period];
    else manual[debt.period] = String(debt.balance);
    set({ manual });
  };

  if (noFee) {
    return (
      <p className="sheet-note">
        <Icon name="info" />
        No fee is charged for {debts.length === 1 ? "this term" : "these terms"}. Recording marks{" "}
        {debts.map((debt) => debtLabel(domain, member, debt.period)).join(", ")} as done.
      </p>
    );
  }

  return (
    <>
      <section className="sheet-section">
        <div className="sheet-section-head">
          <h3 id="payAmountLabel">1. Amount received</h3>
        </div>
        <div className="pay-amount">
          <label className="affix-input">
            <span className="affix" aria-hidden="true">₹</span>
            <input
              id="feeAmount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              aria-labelledby="payAmountLabel"
              value={draft.amountText}
              onChange={(event) => set({ amountText: event.target.value })}
            />
          </label>
          <p className="pay-hint">
            Up to {currency(owed)}
            {debts.some((debt) => debt.advance) ? " with the next term" : " owed"}. Anything left stays as a balance.
          </p>
        </div>
      </section>

      <section className="sheet-section">
        <div className="sheet-section-head">
          <h3 id="payDateLabel">2. Paid on</h3>
        </div>
        <div className="pay-date">
          <input
            type="date"
            aria-labelledby="payDateLabel"
            min={member.startDate}
            max={todayKey()}
            value={draft.date}
            disabled={draft.dateUnknown}
            onChange={(event) => set({ date: event.target.value })}
          />
          {touchesOpening ? (
            <small className="field-hint">A payment toward the opening balance needs its date.</small>
          ) : (
            <label className="history-unknown">
              <input
                type="checkbox"
                checked={draft.dateUnknown}
                onChange={(event) => set({ dateUnknown: event.target.checked })}
              />
              Don&apos;t know the date (counted in each term&apos;s month)
            </label>
          )}
        </div>
      </section>

      <section className="sheet-section">
        <div className="sheet-section-head">
          <h3 id="payModeLabel">3. How was it paid?</h3>
        </div>
        <div className="pay-modes" role="radiogroup" aria-labelledby="payModeLabel">
          {PAYMENT_MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={draft.mode === option.value}
              className={"pay-mode" + (draft.mode === option.value ? " active" : "")}
              onClick={() => set({ mode: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mf-grid">
          <label className="mf-field">
            <span className="mf-label-row">
              Reference
              <em>Optional</em>
            </span>
            <input
              maxLength={80}
              placeholder="UPI / cheque no."
              value={draft.reference}
              onChange={(event) => set({ reference: event.target.value })}
            />
          </label>
          <label className="mf-field">
            <span className="mf-label-row">
              Note
              <em>Optional</em>
            </span>
            <input maxLength={300} value={draft.note} onChange={(event) => set({ note: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="sheet-section">
        <div className="sheet-section-head">
          <h3>4. What does it pay for?</h3>
        </div>
        <div className="segmented" role="radiogroup" aria-label="How to allocate the payment">
          <label>
            <input type="radio" name="payAllocation" checked={draft.method !== "manual"} onChange={() => set({ method: "fifo" })} />
            <span>Oldest debt first</span>
          </label>
          <label>
            <input type="radio" name="payAllocation" checked={draft.method === "manual"} onChange={chooseManual} />
            <span>Choose terms</span>
          </label>
        </div>
        <div className="pay-periods" id="feeMonthList">
          {debts.map((debt) => {
            const line = lines.find((item) => item.period === debt.period);
            const chosen = draft.method === "manual" && draft.manual[debt.period] !== undefined;
            const label = debtLabel(domain, member, debt.period);
            return (
              <div key={debt.period} className={"pay-period" + ((draft.method === "manual" ? chosen : line?.pay > 0) ? " is-checked" : "")}>
                {draft.method === "manual" ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={chosen}
                    aria-label={`Pay ${label}`}
                    className="pay-check"
                    onClick={() => toggleTerm(debt)}
                  >
                    <Icon name="check" />
                  </button>
                ) : (
                  <span className="pay-check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                )}
                <span className="pay-period-copy">
                  <strong>
                    {label}
                    {debt.paid > 0 ? <em className="pay-tag">Balance</em> : null}
                    {debt.carried ? <em className="pay-tag">Earlier plan</em> : null}
                    {debt.advance ? <em className="pay-tag">In advance</em> : null}
                  </strong>
                  <small className={line?.pay > 0 ? "" : "is-muted"}>
                    {line?.pay > 0
                      ? line.after > 0
                        ? `${currency(line.pay)} now · ${currency(line.after)} left`
                        : "Paid in full"
                      : `${currency(debt.balance)} due · not paid by this`}
                  </small>
                </span>
                {chosen ? (
                  <span className="affix-input pay-line-amount">
                    <span className="affix" aria-hidden="true">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      aria-label={`Amount for ${label}`}
                      value={draft.manual[debt.period]}
                      onChange={(event) => set({ manual: { ...draft.manual, [debt.period]: event.target.value } })}
                    />
                  </span>
                ) : (
                  <span className="pay-period-amount">{currency(debt.balance)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
