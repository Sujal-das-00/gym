import { useEffect, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import PaymentHistoryItem from "../components/PaymentHistoryItem.jsx";
import OtherPaymentForm from "../components/OtherPaymentForm.jsx";
import StepProgress from "../components/StepProgress.jsx";
import ReviewCard from "../components/ReviewCard.jsx";
import { currency, displayDate, localDateKey } from "../lib/dates.js";
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
  // 0 = choose what is being paid and how; 1 = review it, then record.
  const [step, setStep] = useState(0);
  // Paying part of the running term before it ends ("after the period" members).
  const [advance, setAdvance] = useState(false);
  const amountRef = useRef(null);

  // Every new sheet starts on a full cash payment, the most common at the desk.
  useEffect(() => {
    if (!feeDialog.open) return;
    setMode("cash");
    setIsPart(false);
    setAmountText("");
    setStep(0);
    setAdvance(false);
  }, [feeDialog.open, feeDialog.memberId]);

  const member = members.find((item) => item.id === feeDialog.memberId);
  // An existing member's opening balance is listed first: it is the oldest debt.
  const openingLine = member ? domain.getOpeningBalanceLine(member) : null;
  const advanceTerm = member ? domain.getAdvanceTerm(member) : "";
  const unpaidPeriods = member
    ? [...(openingLine ? [openingLine.period] : []), ...domain.getUnpaidPeriods(member), ...(advance && advanceTerm ? [advanceTerm] : [])]
    : [];
  const advanceEnds = advanceTerm ? displayDate(localDateKey(domain.periodEndDate(member, advanceTerm))) : "";
  const duePeriods = new Set(member ? domain.getDueUnpaidPeriods(member) : []);
  const selected = new Set(feeDialog.selectedPeriods);
  const periodUnit = member ? domain.getPeriodUnitLabel(member) : "month";
  const allSelected = unpaidPeriods.length > 0 && unpaidPeriods.every((period) => selected.has(period));
  const status = member ? domain.getFeeStatus(member) : "";
  const isMonthly = member ? domain.getMembershipType(member) === "monthly" : false;
  const lastDueKey = member ? domain.getLastPaymentDueKey(member) : "";
  const history = member ? [...(member.payments || [])].reverse().slice(0, HISTORY_LIMIT) : [];
  const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;

  const dues = member
    ? unpaidPeriods.map((period) => (period === openingLine?.period ? openingLine : domain.getPeriodDue(member, period)))
    : [];
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

  const startAdvance = () => {
    setAdvance(true);
    setIsPart(true);
    setAmountText("");
    setSelectedBillingPeriods([advanceTerm]);
    window.requestAnimationFrame(() => amountRef.current?.focus());
  };
  const stopAdvance = () => {
    setAdvance(false);
    setIsPart(false);
    setAmountText("");
    setSelectedBillingPeriods([]);
  };

  const choosePart = (part) => {
    setIsPart(part);
    // Focus after the field has rendered.
    if (part) window.requestAnimationFrame(() => amountRef.current?.focus());
  };

  const reviewing = step === 1 && dues.length > 0;
  const goNext = () => {
    if (canSubmit) setStep(1);
  };

  // The review step is the confirmation, so there is no extra prompt. Enter on
  // the first step moves to the review instead of recording.
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!member || !canSubmit) return;
    if (!reviewing) return goNext();
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
    if (due === openingLine) {
      const admission = Number(member.openingBalanceAdmission || 0);
      return {
        text: ["From before GymBoo", admission > 0 ? `includes ${currency(admission)} admission fee` : ""].filter(Boolean).join(" · "),
        className: due.paid > 0 ? "is-part" : "",
      };
    }
    if (due.period === advanceTerm) return { text: `Not due yet · due on ${advanceEnds}`, className: "" };
    if (due.paid > 0) return { text: `${currency(due.paid)} of ${currency(due.charge)} paid`, className: "is-part" };
    if (duePeriods.has(due.period)) return { text: "Overdue", className: "is-due" };
    return { text: "Current", className: "" };
  };

  const nextLabel = !chosen.length
    ? `Select a ${periodUnit}`
    : tooMuch
      ? `More than ${currency(total)} selected`
      : isPart && !(amount > 0)
        ? "Enter the amount received"
        : "Next";
  const recordLabel = `Record ${currency(amount)}${carried > 0 ? ` · ${currency(carried)} balance` : ""}`;

  return (
    <Dialog className="sheet" id="feeDialog" open={feeDialog.open} onClose={closeFeeDialog}>
      {member ? (
        <form className="sheet-panel" id="feeCollectionForm" method="dialog" onSubmit={onSubmit}>
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            {reviewing ? (
              <button className="sheet-back" type="button" aria-label="Back to edit the payment" onClick={() => setStep(0)}>
                <Icon name="arrow_back" />
              </button>
            ) : null}
            <h2 id="feeDialogTitle">{reviewing ? "Review payment" : "Collect payment"}</h2>
            <button className="sheet-close" id="closeFeeDialog" aria-label="Close" type="button" onClick={closeFeeDialog}>
              <Icon name="close" />
            </button>
          </header>

          {dues.length ? <StepProgress steps={["Payment", "Review"]} current={step} /> : null}

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

            {reviewing ? (
              <>
                <ReviewCard
                  title="Payment summary"
                  rows={[
                    ...plan.map((line) => ({
                      label: domain.getBillingPeriodLabel(line.period, member),
                      value: line.pay > 0 || line.balance === 0 ? currency(line.pay) : "Not paid now",
                      hint:
                        line.after > 0 && line.pay > 0
                          ? `${currency(line.after)} balance left`
                          : line.pay > 0 || line.balance === 0
                            ? "Paid in full"
                            : "Stays due",
                      skipped: line.pay === 0 && line.balance > 0,
                    })),
                    { label: "Mode", value: modeLabel },
                    ...(carried > 0 && !tooMuch ? [{ label: "Balance carried forward", value: currency(carried), tone: "due" }] : []),
                  ]}
                  total={{ label: "Received now", value: currency(Math.min(amount, total)) }}
                  notes={[
                    advance && carried > 0 ? `The other ${currency(carried)} is still due on ${advanceEnds}.` : "",
                    untouched.length && amount > 0
                      ? `${untouched.map((line) => domain.getBillingPeriodLabel(line.period, member)).join(", ")} ${
                          untouched.length === 1 ? "isn't" : "aren't"
                        } reached by this amount and will stay due.`
                      : "",
                  ]}
                />
              </>
            ) : (
              <>

            {dues.length && !advance ? (
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
                <>
                  <p className="sheet-note">
                    <Icon name="check_circle" />
                    All dues are collected up to the current {periodUnit}.
                  </p>
                  <dl className="plan-summary next-due">
                    {isMonthly ? (
                      <div>
                        <dt>Last payment due</dt>
                        <dd>{lastDueKey ? displayDate(lastDueKey) : "None yet"}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Next payment due</dt>
                      <dd>{displayDate(domain.getDueDateKey(member))}</dd>
                    </div>
                    <div>
                      <dt>Billing cycle</dt>
                      <dd>
                        {domain.getCollectionTiming(member) === "fixed-day" ? "End" : "Start"} of the {periodUnit}
                      </dd>
                    </div>
                  </dl>
                  {advanceTerm ? (
                    <button type="button" className="other-pay-open" onClick={startAdvance}>
                      <span className="other-pay-ico" aria-hidden="true">
                        <Icon name="payments" />
                      </span>
                      <span>
                        <strong>Part-pay this {periodUnit} now</strong>
                        <small>Pay what they can now. The rest is due on {advanceEnds}.</small>
                      </span>
                      <Icon name="chevron_right" className="other-pay-go" />
                    </button>
                  ) : null}
                </>
              )}
              {advance ? (
                <button type="button" className="sheet-link" onClick={stopAdvance}>
                  Not paying early
                </button>
              ) : null}
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

              </>
            ) : null}

            {/* Money outside the fee (supplements, ...): open to every member, owing or not. */}
            <OtherPaymentForm member={member} />

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
              </>
            )}
          </div>

          {dues.length ? (
            <footer className={"sheet-foot" + (reviewing ? " is-split" : "")}>
              {reviewing ? (
                <button className="sheet-secondary" type="button" disabled={busy} onClick={() => setStep(0)}>
                  Back
                </button>
              ) : null}
              {reviewing ? (
                <button key="record" className={"sheet-confirm" + (busy ? " is-busy" : "")} id="confirmFeeCollection" type="submit" disabled={!canSubmit}>
                  {recordLabel}
                </button>
              ) : (
                <button key="next" className="sheet-confirm" id="nextFeeStep" type="button" disabled={!canSubmit} onClick={goNext}>
                  {capitalize(nextLabel)}
                </button>
              )}
            </footer>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  );
}
