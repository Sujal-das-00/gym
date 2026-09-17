import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { currency } from "../lib/dates.js";

// Matches the payment_mode enum in backend/schema.sql.
const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export default function FeeDialog() {
  const { feeDialog, closeFeeDialog, setSelectedBillingPeriods, members, domain, collectFees, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("cash");

  const member = members.find((item) => item.id === feeDialog.memberId);
  const unpaidPeriods = member ? domain.getUnpaidPeriods(member) : [];
  const selected = new Set(feeDialog.selectedPeriods);
  const total = feeDialog.selectedPeriods.length * Number(member?.fee || 0);
  const periodUnit = member ? domain.getPeriodUnitLabel(member) : "month";

  const togglePeriod = (period, checked) => {
    const next = new Set(feeDialog.selectedPeriods);
    if (checked) next.add(period);
    else next.delete(period);
    setSelectedBillingPeriods([...next].sort());
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!member || !feeDialog.selectedPeriods.length || busy) return;
    const labels = feeDialog.selectedPeriods.map((period) => domain.getBillingPeriodLabel(period, member)).join(", ");
    const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;
    const ok = confirm(
      "Collect " + currency(total) + " from " + member.name + " for " + labels + " by " + modeLabel + "?",
    );
    if (!ok) return;
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
    <Dialog className="fee-dialog" id="feeDialog" open={feeDialog.open} onClose={closeFeeDialog}>
      <form className="fee-dialog-panel" id="feeCollectionForm" method="dialog" onSubmit={onSubmit}>
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Fee collection</p>
            <h2 id="feeDialogTitle">{member ? `Collect fee from ${member.name}` : "Collect fee"}</h2>
            <p id="feeDialogMeta">
              {unpaidPeriods.length
                ? `${unpaidPeriods.length} unpaid ${periodUnit}${unpaidPeriods.length === 1 ? "" : "s"}`
                : `No pending ${periodUnit}s`}
            </p>
          </div>
          <button className="icon-button" id="closeFeeDialog" aria-label="Close" type="button" onClick={closeFeeDialog}>
            ×
          </button>
        </div>
        <div className="fee-month-summary">
          <strong id="feeSelectedTotal">{currency(total)}</strong>
          <span id="feeSelectedCount">
            {feeDialog.selectedPeriods.length} {periodUnit}
            {feeDialog.selectedPeriods.length === 1 ? "" : "s"} selected
          </span>
        </div>
        <div className="fee-month-list" id="feeMonthList">
          {unpaidPeriods.length ? (
            unpaidPeriods.map((period) => (
              <label className="fee-month-option" key={period}>
                <input
                  type="checkbox"
                  value={period}
                  checked={selected.has(period)}
                  onChange={(event) => togglePeriod(period, event.target.checked)}
                />
                <span>{domain.getBillingPeriodLabel(period, member)}</span>
                <strong>{currency(member?.fee)}</strong>
              </label>
            ))
          ) : (
            <p className="history-empty">All dues are collected up to the current billing cycle.</p>
          )}
        </div>
        <label className="fee-mode-field" htmlFor="feePaymentMode">
          <span>Payment mode</span>
          <select
            id="feePaymentMode"
            name="paymentMode"
            onChange={(event) => setMode(event.target.value)}
            value={mode}
          >
            {PAYMENT_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button className="secondary-action" id="cancelFeeDialog" type="button" onClick={closeFeeDialog}>
            Cancel
          </button>
          <button
            className={"primary-action" + (busy ? " is-busy" : "")}
            id="confirmFeeCollection"
            type="submit"
            disabled={busy || feeDialog.selectedPeriods.length === 0}
          >
            Collect selected
          </button>
        </div>
      </form>
    </Dialog>
  );
}
