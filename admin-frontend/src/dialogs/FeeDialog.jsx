import { useEffect, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import PaymentHistoryItem from "../components/PaymentHistoryItem.jsx";
import { currency } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { FEE_STATUS_LABELS, allocatePayment } from "../lib/billing.js";

const HISTORY_LIMIT = 6;

const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

/**
 * "Collect payment" sheet: pick what is being paid for, say whether the member
 * paid it all or only part, how they paid, check the summary, confirm. A bottom
 * sheet on phones, a centred card on desktop.
 *
 * A part payment is spread over the chosen periods oldest first. Whatever is
 * left stays on the member as a balance and comes back pre-selected the next
 * time this sheet opens.
 */
export default function FeeDialog() {
  const { closeFeeDialog, setSelectedBillingPeriods, members, domain, collectFees, showToast } = useApp();
  const { feeDialog } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("cash");
  const [isPart, setIsPart] = useState(false);
  const [amountText, setAmountText] = useState("");
  const amountRef = useRef(null);

  // Every new sheet starts on a full cash payment, the most common at the desk.
  useEffect(() => {
    if (!feeDialog.open) return;
    setMode("cash");
    setIsPart(false);
    setAmountText("");
  }, [feeDialog.open, feeDialog.memberId]);

  const member = members.find((item) => item.id === feeDialog.memberId);
  const unpaidPeriods = member ? domain.getUnpaidPeriods(member) : [];
  const duePeriods = new Set(member ? domain.getDueUnpaidPeriods(member) : []);
  const selected = new Set(feeDialog.selectedPeriods);
  const periodUnit = member ? domain.getPeriodUnitLabel(member) : "month";
  const allSelected = unpaidPeriods.length > 0 && unpaidPeriods.every((period) => selected.has(period));
  const status = member ? domain.getFeeStatus(member) : "";
  const history = member ? [...(member.payments || [])].reverse().slice(0, HISTORY_LIMIT) : [];
  const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;

  const dues = member ? unpaidPeriods.map((period) => domain.getPeriodDue(member, period)) : [];
  const chosen = dues.filter((due) => selected.has(due.period));
  const total = chosen.reduce((sum, due) => sum + due.balance, 0);
  const owedTotal = dues.reduce((sum, due) => sum + due.balance, 0);

  const typed = Number(amountText);
  const amount = isPart ? (amountText.trim() && Number.isFinite(typed) ? Math.round(typed * 100) / 100 : 0) : total;
  const tooMuch = isPart && amount > total;
  const plan = allocatePayment(chosen, Math.min(amount, total));
  const recorded = plan.filter((line) => line.pay > 0);
  const carried = Math.max(0, Math.round((total - amount) * 100) / 100);
  // Chosen periods a part payment doesn't reach are left as they are.
  const untouched = plan.filter((line) => line.pay === 0 && line.balance > 0);
  const canSubmit = chosen.length > 0 && !tooMuch && (amount > 0 || total === 0) && !busy;

  const togglePeriod = (period) => {
    const next = new Set(feeDialog.selectedPeriods);
    if (next.has(period)) next.delete(period);
    else next.add(period);
    setSelectedBillingPeriods([...next].sort());
  };

  const toggleAll = () => setSelectedBillingPeriods(allSelected ? [] : [...unpaidPeriods]);

  const choosePart = (part) => {
    setIsPart(part);
    // Focus after the field has rendered.
    if (part) window.requestAnimationFrame(() => amountRef.current?.focus());
  };

  // The summary card is the confirmation step, so there is no extra prompt.
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!member || !canSubmit) return;
    setBusy(true);
    try {
      await collectFees(member, total === 0 ? plan : recorded, mode);
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  const dueNote = (due) => {
    if (due.paid > 0) return { text: `${currency(due.paid)} of ${currency(due.charge)} paid`, className: "is-part" };
    if (duePeriods.has(due.period)) return { text: "Overdue", className: "is-due" };
    return { text: "Current", className: "" };
  };

  const confirmLabel = !chosen.length
    ? `Select a ${periodUnit}`
    : tooMuch
      ? `More than ${currency(total)} selected`
      : isPart && !(amount > 0)
        ? "Enter the amount received"
        : `Record ${currency(amount)}${carried > 0 ? ` · ${currency(carried)} balance` : ""}`;

  return (
    <Dialog className="sheet" id="feeDialog" open={feeDialog.open} onClose={closeFeeDialog}>
      {member ? (
        <form className="sheet-panel" id="feeCollectionForm" method="dialog" onSubmit={onSubmit}>
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <h2 id="feeDialogTitle">Collect payment</h2>
            <button className="sheet-close" id="closeFeeDialog" aria-label="Close" type="button" onClick={closeFeeDialog}>
              <Icon name="close" />
            </button>
          </header>

          <div className="sheet-body">
            <div className="sheet-member">
              <span className="contact-avatar">
                <Photo person={member} />
              </span>
              <div>
                <strong>{member.name}</strong>
                <small>{[member.phone, domain.getMembershipLabel(member)].filter(Boolean).join(" · ")}</small>
              </div>
              <span className={"status-pill " + status}>{FEE_STATUS_LABELS[status]}</span>
            </div>

            {dues.length ? (
              <p className={"pay-owed" + (duePeriods.size ? " is-due" : "")}>
                <span>Total owed</span>
                <strong>{currency(owedTotal)}</strong>
              </p>
            ) : null}

            <section className="sheet-section">
              <div className="sheet-section-head">
                <h3>1. What is this payment for?</h3>
                {unpaidPeriods.length > 1 ? (
                  <button type="button" className="sheet-link" onClick={toggleAll}>
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                ) : null}
              </div>
              {dues.length ? (
                <div className="pay-periods" id="feeMonthList">
                  {dues.map((due) => {
                    const checked = selected.has(due.period);
                    const note = dueNote(due);
                    return (
                      <button
                        key={due.period}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        className={"pay-period" + (checked ? " is-checked" : "")}
                        onClick={() => togglePeriod(due.period)}
                      >
                        <span className="pay-check" aria-hidden="true">
                          <Icon name="check" />
                        </span>
                        <span className="pay-period-copy">
                          <strong>
                            {domain.getBillingPeriodLabel(due.period, member)}
                            {due.paid > 0 ? <em className="pay-tag">Balance</em> : null}
                          </strong>
                          <small className={note.className}>{note.text}</small>
                        </span>
                        <span className="pay-period-amount">{currency(due.balance)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="sheet-note">
                  <Icon name="check_circle" />
                  All dues are collected up to the current {periodUnit}.
                </p>
              )}
            </section>

            {dues.length ? (
              <>
                <section className="sheet-section">
                  <div className="sheet-section-head">
                    <h3 id="feeAmountLabel">2. How much did they pay?</h3>
                  </div>
                  <div className="pay-split" role="radiogroup" aria-labelledby="feeAmountLabel">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!isPart}
                      className={"pay-split-option" + (!isPart ? " active" : "")}
                      onClick={() => choosePart(false)}
                    >
                      <strong>Full amount</strong>
                      <small>{currency(total)}</small>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isPart}
                      className={"pay-split-option" + (isPart ? " active" : "")}
                      onClick={() => choosePart(true)}
                    >
                      <strong>Part payment</strong>
                      <small>Rest stays as balance</small>
                    </button>
                  </div>

                  {isPart ? (
                    <div className="pay-amount">
                      <label className={"affix-input" + (tooMuch ? " has-error" : "")}>
                        <span className="affix" aria-hidden="true">₹</span>
                        <input
                          ref={amountRef}
                          id="feeAmount"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          placeholder={String(total)}
                          aria-label="Amount received"
                          aria-describedby="feeAmountHint"
                          value={amountText}
                          onChange={(event) => setAmountText(event.target.value)}
                        />
                      </label>
                      <p id="feeAmountHint" className={"pay-hint" + (tooMuch ? " is-error" : "")}>
                        {tooMuch
                          ? `That's more than the ${currency(total)} selected. Select more ${periodUnit}s to take it all.`
                          : amount > 0 && carried > 0
                            ? `${currency(carried)} stays as balance and is added to their next payment.`
                            : chosen.length > 1
                              ? `Applied to the oldest ${periodUnit} first.`
                              : `Enter what the member paid now, up to ${currency(total)}.`}
                      </p>
                    </div>
                  ) : null}
                </section>

                <section className="sheet-section">
                  <div className="sheet-section-head">
                    <h3 id="feeModeLabel">3. Payment mode</h3>
                  </div>
                  <div className="pay-modes" role="radiogroup" aria-labelledby="feeModeLabel">
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
                </section>

                {chosen.length ? (
                  <section className="pay-summary-card" aria-label="Summary">
                    <h3>Summary</h3>
                    <dl>
                      {plan.map((line) => (
                        <div key={line.period} className={line.pay === 0 && line.balance > 0 ? "is-skipped" : ""}>
                          <dt>{domain.getBillingPeriodLabel(line.period, member)}</dt>
                          <dd>
                            {line.pay > 0 || line.balance === 0 ? currency(line.pay) : "Not paid now"}
                            <small>
                              {line.after > 0 && line.pay > 0
                                ? `${currency(line.after)} balance left`
                                : line.pay > 0 || line.balance === 0
                                  ? "Paid in full"
                                  : "Stays due"}
                            </small>
                          </dd>
                        </div>
                      ))}
                      <div>
                        <dt>Mode</dt>
                        <dd>{modeLabel}</dd>
                      </div>
                      <div className="pay-summary-total">
                        <dt>Received now</dt>
                        <dd id="feeSelectedTotal">{currency(Math.min(amount, total))}</dd>
                      </div>
                      {carried > 0 && !tooMuch ? (
                        <div className="pay-summary-balance">
                          <dt>Balance carried forward</dt>
                          <dd>{currency(carried)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {untouched.length && !tooMuch && amount > 0 ? (
                      <p className="pay-hint">
                        {untouched.map((line) => domain.getBillingPeriodLabel(line.period, member)).join(", ")}{" "}
                        {untouched.length === 1 ? "isn't" : "aren't"} reached by this amount and will stay due.
                      </p>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : null}

            {history.length ? (
              <details className="sheet-history" open={!unpaidPeriods.length}>
                <summary>
                  Payment history
                  <Icon name="expand_more" />
                </summary>
                <ul>
                  {history.map((payment) => (
                    <PaymentHistoryItem key={payment.id} payment={payment} member={member} domain={domain} />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          {dues.length ? (
            <footer className="sheet-foot">
              <button
                className={"sheet-confirm" + (busy ? " is-busy" : "")}
                id="confirmFeeCollection"
                type="submit"
                disabled={!canSubmit}
              >
                {capitalize(confirmLabel)}
              </button>
            </footer>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  );
}
