import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Icon from "../components/Icon.jsx";
import { currency, dateFormatter, displayDate, todayKey } from "../lib/dates.js";
import { getPaymentPeriodKey } from "../lib/billing.js";

// Keep in sync with MAX_ADMISSION_FEE in backend/src/services/paymentService.js.
const MAX_ADMISSION_FEE = 1000000;

// What a payment's term can still take: its full fee less what its other
// payments already cover. Mirrors prepareAmountEdit on the server.
function roomFor(member, payment) {
  const period = getPaymentPeriodKey(payment);
  const charge = payment.periodFee ?? Math.max(Number(member.fee || 0), payment.amount);
  const others = (member.payments || [])
    .filter((item) => item.id !== payment.id && item.kind !== "admission" && getPaymentPeriodKey(item) === period)
    .reduce((sum, item) => sum + item.amount, 0);
  return { charge, room: Math.max(0, Math.round((charge - others) * 100) / 100) };
}

// What a payment paid for, short: "1 Sept – 30 Sept" for a term, else its kind.
function paymentTitle(member, payment, domain) {
  if (payment.kind === "admission") return "Admission fee";
  if (payment.kind === "other") return "Other payment";
  const period = getPaymentPeriodKey(payment);
  if (domain.isOpeningBalancePayment(payment)) return "Opening balance";
  const start = domain.periodStartDate(period);
  const end = domain.periodEndDate(member, period);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return domain.getPaymentLabel(payment, member);
  end.setDate(end.getDate() - 1);
  const short = (date) => dateFormatter({ day: "numeric", month: "short" }).format(date);
  const year = end.getFullYear() === new Date().getFullYear() ? "" : ` ${end.getFullYear()}`;
  return `${short(start)} – ${short(end)}${year}`;
}

function PaymentRow({ member, payment, domain, busy, error, onSave, onSaveDate, onDelete }) {
  const isAdmission = payment.kind === "admission";
  const isExtra = payment.kind === "other";
  const undated = payment.dateKnown === false;
  const unit = domain.getPeriodUnitLabel(member);
  // An extra payment's amount can't change (delete and record it again): only
  // its date is editable. An admission fee's amount and date both are.
  const amountEditable = !isExtra;
  const dateEditable = true;
  const canDelete = !isAdmission;
  const [open, setOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [date, setDate] = useState(undated ? "" : String(payment.date || "").slice(0, 10));
  const { charge, room } = amountEditable && !isAdmission ? roomFor(member, payment) : { charge: 0, room: isAdmission ? MAX_ADMISSION_FEE : 0 };
  const value = Number(amount);
  const amountChanged = amountEditable && value !== Number(payment.amount);
  const amountValid = !amountEditable || (value > 0 && value <= room);
  const short = amountEditable && !isAdmission && amountValid ? Math.round((room - value) * 100) / 100 : 0;
  const dateChanged = dateOpen && Boolean(date) && (undated || date !== String(payment.date || "").slice(0, 10));
  const notes = domain.getPartPaymentNotes(member, payment);

  const startEdit = () => {
    setOpen(true);
    // Nothing else to change on these, or nothing recorded yet: open the date straight away.
    setDateOpen(!amountEditable || undated);
  };
  const cancel = () => {
    setOpen(false);
    setDateOpen(false);
    setAmount(String(payment.amount));
    setDate(undated ? "" : String(payment.date || "").slice(0, 10));
  };
  const save = async () => {
    if (!amountValid) return;
    if (amountChanged && !(await onSave(payment, value))) return;
    if (dateChanged && !(await onSaveDate(payment, date))) return;
    setOpen(false);
    setDateOpen(false);
  };

  const meta = [
    undated ? "Date not recorded" : `Paid ${displayDate(String(payment.date || "").slice(0, 10))}`,
    domain.paymentModeLabel(payment.mode),
    ...notes,
  ].filter(Boolean);

  return (
    <li className={"payedit-row" + (open ? " is-editing" : "")}>
      <div className="payedit-main">
        <span className="payedit-copy">
          <strong>{paymentTitle(member, payment, domain)}</strong>
          <small>
            {undated ? <i className="undated-dot" aria-hidden="true" /> : null}
            {meta.join(" · ")}
          </small>
          {isExtra && payment.note ? <small className="pay-note">“{payment.note}”</small> : null}
        </span>
        <b className="payedit-amount">{currency(payment.amount)}</b>
        {!open && (amountEditable || dateEditable) ? (
          <button type="button" className="payedit-icon" aria-label="Edit payment" title="Edit" disabled={busy} onClick={startEdit}>
            <Icon name="edit" />
          </button>
        ) : null}
        {!open && canDelete ? (
          <button type="button" className="payedit-icon is-danger" aria-label="Delete payment" title="Delete" disabled={busy} onClick={() => onDelete(payment)}>
            <Icon name="delete" />
          </button>
        ) : null}
      </div>
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : null}

      {open ? (
        <div className="payedit-form">
          {amountEditable ? (
            <label className="mf-field">
              Amount received
              <span className="affix-input">
                <span className="affix">₹</span>
                <input
                  type="number"
                  min="1"
                  max={room}
                  step="1"
                  inputMode="numeric"
                  autoFocus
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value) > room ? String(room) : event.target.value)}
                />
              </span>
              <small className={"field-hint" + (short > 0 ? " is-due" : "")}>
                {isAdmission
                  ? "One-time joining charge. The member's profile shows the same amount."
                  : !(value > 0)
                  ? "Enter an amount, or delete this payment."
                  : short > 0
                    ? `${currency(short)} of the ${currency(charge)} fee stays due.`
                    : `Settles this ${unit} payment.`}
              </small>
            </label>
          ) : null}

          {dateOpen ? (
            <label className="mf-field">
              Paid on
              <input
                type="date"
                min={String(member.startDate || "").slice(0, 10)}
                max={todayKey()}
                autoFocus={!amountEditable}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              {undated ? (
                <small className="field-hint">Counted on {displayDate(String(payment.date).slice(0, 10))} until you set the day it was really collected.</small>
              ) : null}
            </label>
          ) : dateEditable ? (
            <button type="button" className="payedit-date-toggle" onClick={() => setDateOpen(true)}>
              <Icon name="event" />
              Change payment date
            </button>
          ) : null}

          <div className="payedit-actions">
            <button type="button" className="pay-mode" disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="pay-mode active" disabled={busy || !amountValid || !(amountChanged || dateChanged)} onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Edit or delete the payments recorded for one member (owners only). */
export default function PaymentEditDialog({ memberId, open, onClose }) {
  const { members, domain, editPayment, setPaymentDate, removePayment, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  // The last failure, shown under its payment as well as in a toast.
  const [failure, setFailure] = useState({ id: "", message: "" });
  const member = members.find((item) => item.id === memberId);
  // The admission fee is listed too (its amount is changed on the profile, but
  // an unrecorded collection date can be filled in here).
  const payments = member ? [...(member.payments || [])].reverse() : [];

  // ‹ Oct 2026 › — payments by the month they were taken (an undated one by its
  // term's start, which is what its date holds). "" shows every month.
  const monthOf = (payment) => String(payment.date || "").slice(0, 7);
  const months = [...new Set(payments.map(monthOf).filter(Boolean))].sort();
  const [month, setMonth] = useState("");
  useEffect(() => {
    if (open) setMonth(months.at(-1) || "");
    // Only when the sheet opens for a member: later edits keep the month picked.
  }, [open, memberId]);
  const shown = month ? payments.filter((payment) => monthOf(payment) === month) : payments;
  const stepMonth = (delta) => {
    const [year, mon] = (month || months.at(-1)).split("-").map(Number);
    const next = new Date(year, mon - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const monthName = (key) => dateFormatter({ month: "short", year: "numeric" }).format(new Date(`${key}-01T00:00:00`));

  const run = async (paymentId, action) => {
    setBusy(true);
    setFailure({ id: "", message: "" });
    try {
      await action();
      return true;
    } catch (error) {
      const message = error?.message || "Could not change this payment. Try again.";
      setFailure({ id: paymentId, message });
      showToast(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSave = (payment, amount) => run(payment.id, () => editPayment(member.id, payment.id, amount));
  const onSaveDate = (payment, date) => run(payment.id, () => setPaymentDate(member.id, payment.id, date));
  const onDelete = (payment) => {
    const label = payment.kind === "other" ? `“${payment.note}”` : domain.getPaymentLabel(payment, member);
    const effect =
      payment.kind === "other"
        ? "It was extra income, so what the member owes won't change."
        : `That ${domain.getPeriodUnitLabel(member)}'s payment will count as unpaid, and show as overdue if it is already due.`;
    if (!confirm(`Delete the ${currency(payment.amount)} payment for ${label}?\n\n${effect}`)) return;
    run(payment.id, () => removePayment(member.id, payment.id));
  };

  return (
    <Dialog className="sheet" id="paymentEditDialog" open={open && Boolean(member)} onClose={onClose}>
      <div className="sheet-panel">
        <header className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          <h2>Edit payments</h2>
          <button className="sheet-close" aria-label="Close" type="button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">
          {member ? <small className="field-hint payedit-who">{member.name}</small> : null}
          {months.length > 1 ? (
            <div className="payedit-months">
              <button type="button" className="day-step" aria-label="Previous month" disabled={!month || month <= months[0]} onClick={() => stepMonth(-1)}>
                <Icon name="chevron_left" />
              </button>
              <label className="day-pick">
                <strong>{month ? monthName(month) : "All months"}</strong>
                <small>
                  {shown.length} {shown.length === 1 ? "payment" : "payments"}
                </small>
                <input
                  type="month"
                  aria-label="Pick a month"
                  min={months[0]}
                  max={months.at(-1)}
                  value={month || months.at(-1)}
                  onChange={(event) => event.target.value && setMonth(event.target.value)}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                />
              </label>
              <button type="button" className="day-step" aria-label="Next month" disabled={!month || month >= months.at(-1)} onClick={() => stepMonth(1)}>
                <Icon name="chevron_right" />
              </button>
              <button type="button" className={"payedit-all" + (month ? "" : " is-on")} aria-pressed={!month} onClick={() => setMonth(month ? "" : months.at(-1))}>
                All
              </button>
            </div>
          ) : null}
          {payments.length ? (
            shown.length ? (
            <ul className="payedit-list">
              {shown.map((payment) => (
                <PaymentRow
                  key={payment.id + ":" + payment.amount + ":" + payment.dateKnown}
                  member={member}
                  payment={payment}
                  domain={domain}
                  busy={busy}
                  error={failure.id === payment.id ? failure.message : ""}
                  onSave={onSave}
                  onSaveDate={onSaveDate}
                  onDelete={onDelete}
                />
              ))}
            </ul>
            ) : (
              <p className="contact-empty">No payments in {monthName(month)}.</p>
            )
          ) : (
            <p className="member-empty">No payments recorded yet.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
