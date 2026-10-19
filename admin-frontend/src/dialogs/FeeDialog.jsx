import { useEffect, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import { currency, displayDate } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";

const HISTORY_LIMIT = 6;

/**
 * "Record payment" sheet: pick the unpaid periods, how it was paid, check the
 * summary, confirm. A bottom sheet on phones, a centred card on desktop.
 */
export default function FeeDialog() {
  const { closeFeeDialog, setSelectedBillingPeriods, members, domain, collectFees, showToast } = useApp();
  const { feeDialog } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("cash");

  // Every new sheet starts on cash, the most common desk payment.
  useEffect(() => {
    if (feeDialog.open) setMode("cash");
  }, [feeDialog.open, feeDialog.memberId]);

  const member = members.find((item) => item.id === feeDialog.memberId);
  const unpaidPeriods = member ? domain.getUnpaidPeriods(member) : [];
  const duePeriods = new Set(member ? domain.getDueUnpaidPeriods(member) : []);
  const selected = new Set(feeDialog.selectedPeriods);
  const fee = Number(member?.fee || 0);
  const total = feeDialog.selectedPeriods.length * fee;
  const periodUnit = member ? domain.getPeriodUnitLabel(member) : "month";
  const allSelected = unpaidPeriods.length > 0 && unpaidPeriods.every((period) => selected.has(period));
  const status = !member ? "" : duePeriods.size ? "overdue" : domain.isPaidThisPeriod(member) ? "paid" : "pending";
  const history = member ? [...(member.payments || [])].reverse().slice(0, HISTORY_LIMIT) : [];
  const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;

  const togglePeriod = (period) => {
    const next = new Set(feeDialog.selectedPeriods);
    if (next.has(period)) next.delete(period);
    else next.add(period);
    setSelectedBillingPeriods([...next].sort());
  };

  const toggleAll = () => setSelectedBillingPeriods(allSelected ? [] : [...unpaidPeriods]);

  // The summary card is the confirmation step, so there is no extra prompt.
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!member || !feeDialog.selectedPeriods.length || busy) return;
    setBusy(true);
    try {
      await collectFees(member, feeDialog.selectedPeriods, mode);
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="sheet" id="feeDialog" open={feeDialog.open} onClose={closeFeeDialog}>
      {member ? (
        <form className="sheet-panel" id="feeCollectionForm" method="dialog" onSubmit={onSubmit}>
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <h2 id="feeDialogTitle">Record payment</h2>
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
              <span className={"status-pill " + status}>
                {status === "overdue" ? "Overdue" : status === "paid" ? "Paid" : "Pending"}
              </span>
            </div>

            <section className="sheet-section">
              <div className="sheet-section-head">
                <h3>Select {periodUnit}s to record</h3>
                {unpaidPeriods.length > 1 ? (
                  <button type="button" className="sheet-link" onClick={toggleAll}>
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                ) : null}
              </div>
              {unpaidPeriods.length ? (
                <div className="pay-periods" id="feeMonthList">
                  {unpaidPeriods.map((period) => {
                    const checked = selected.has(period);
                    return (
                      <button
                        key={period}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        className={"pay-period" + (checked ? " is-checked" : "")}
                        onClick={() => togglePeriod(period)}
                      >
                        <span className="pay-check" aria-hidden="true">
                          <Icon name="check" />
                        </span>
                        <span className="pay-period-copy">
                          <strong>{domain.getBillingPeriodLabel(period, member)}</strong>
                          <small className={duePeriods.has(period) ? "is-due" : ""}>
                            {duePeriods.has(period) ? "Overdue" : "Current"}
                          </small>
                        </span>
                        <span className="pay-period-amount">{currency(fee)}</span>
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

            {unpaidPeriods.length ? (
              <>
                <section className="sheet-section">
                  <div className="sheet-section-head">
                    <h3 id="feeModeLabel">Payment mode</h3>
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

                <section className="pay-summary-card" aria-label="Summary">
                  <h3>Summary</h3>
                  <dl>
                    <div>
                      <dt>Paying</dt>
                      <dd>{member.name}</dd>
                    </div>
                    <div>
                      <dt>{periodUnit[0].toUpperCase() + periodUnit.slice(1)}s</dt>
                      <dd>
                        {feeDialog.selectedPeriods.length} × {currency(fee)}
                      </dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>{modeLabel}</dd>
                    </div>
                    <div className="pay-summary-total">
                      <dt>Total</dt>
                      <dd id="feeSelectedTotal">{currency(total)}</dd>
                    </div>
                  </dl>
                </section>
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
                    <li key={payment.id}>
                      <span>
                        <strong>{domain.getPaymentLabel(payment, member)}</strong>
                        <small>
                          {[displayDate(String(payment.date || "").slice(0, 10)), domain.paymentModeLabel(payment.mode)]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <strong>{currency(payment.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          {unpaidPeriods.length ? (
            <footer className="sheet-foot">
              <button
                className={"sheet-confirm" + (busy ? " is-busy" : "")}
                id="confirmFeeCollection"
                type="submit"
                disabled={busy || feeDialog.selectedPeriods.length === 0}
              >
                {feeDialog.selectedPeriods.length ? `Confirm payment · ${currency(total)}` : `Select a ${periodUnit}`}
              </button>
            </footer>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  );
}
