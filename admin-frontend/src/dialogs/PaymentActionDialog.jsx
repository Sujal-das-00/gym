import { useEffect, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Icon from "../components/Icon.jsx";
import PaymentFields from "../components/PaymentFields.jsx";
import { currency, displayDate, localDateKey } from "../lib/dates.js";
import { DATE_NOT_RECORDED } from "../lib/billing.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import {
  allocationLines,
  blankPaymentDraft,
  closedTermsProblem,
  outstandingDebts,
  paymentBody,
  paymentProblem,
  withoutTransaction,
} from "../lib/payments.js";

const FIELD_LABELS = { mode: "Method", reference: "Reference", note: "Note" };

/**
 * What a gym owner can do with one recorded payment (the server allows only
 * owners too):
 *  - Edit details: method, reference, note — changed in place, every change logged.
 *  - Correct: amount, date or terms — the original is reversed and a
 *    replacement recorded with it, in one step; the original stays on record.
 *  - Reverse: the payment stops counting, its terms are owed again.
 */
export default function PaymentActionDialog() {
  const { closePaymentAction } = useApp();
  const { paymentAction } = useDialogs();
  return (
    <Dialog className="sheet" id="paymentActionDialog" open={paymentAction.open} onClose={closePaymentAction}>
      <PaymentAction key={paymentAction.transactionId} memberId={paymentAction.memberId} transactionId={paymentAction.transactionId} />
    </Dialog>
  );
}

function PaymentAction({ memberId, transactionId }) {
  const { closePaymentAction, members, domain, editPaymentDetails, correctPayment, reversePayment, listPaymentCorrections, showToast } =
    useApp();
  const member = members.find((item) => item.id === memberId);
  const tx = member?.transactions.find((item) => item.id === transactionId);
  const [view, setView] = useState("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(() => ({ mode: tx?.mode || "", reference: tx?.reference || "", note: tx?.note || "" }));
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState(() => ({
    ...blankPaymentDraft(tx?.amount || ""),
    date: tx?.dateKnown ? tx.date : blankPaymentDraft().date,
    dateUnknown: tx ? !tx.dateKnown : false,
    mode: tx?.mode || "cash",
    reference: tx?.reference || "",
    note: tx?.note || "",
  }));
  const [edits, setEdits] = useState([]);

  useEffect(() => {
    if (!tx) return;
    listPaymentCorrections(memberId, tx.id)
      .then(setEdits)
      .catch(() => setEdits([]));
    // Once per payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, transactionId]);

  if (!member || !tx) return null;

  const terms = tx.allocations.map((allocation) => domain.getBillingPeriodLabel(allocation.billingPeriod, member)).join(", ");
  const blocked = closedTermsProblem(member, tx);
  // Balances as if this payment had never been recorded: what the correction can pay.
  const without = withoutTransaction(member, tx.id);
  // A payment that renewed the next term ahead can be corrected onto it again.
  const paidAhead = tx.allocations.some((allocation) => allocation.billingPeriod === domain.nextTermKey(member));
  const debts = outstandingDebts(domain, without, { renewAhead: paidAhead });
  const problem = view === "correct" ? paymentProblem({ debts, draft, startDate: member.startDate }) : "";
  const reasonOk = reason.trim().length >= 3;

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
      showToast(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const detailChanges = Object.fromEntries(
    Object.entries(details).filter(([field, value]) => String(value || "").trim() !== String(tx[field] || "")),
  );

  return (
    <div className="sheet-panel">
      <header className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        {view !== "menu" ? (
          <button className="sheet-back" type="button" aria-label="Back" onClick={() => setView("menu")}>
            <Icon name="arrow_back" />
          </button>
        ) : null}
        <h2>{{ menu: "Payment", details: "Edit details", correct: "Correct payment", reverse: "Reverse payment" }[view]}</h2>
        <button className="sheet-close" aria-label="Close" type="button" onClick={closePaymentAction}>
          <Icon name="close" />
        </button>
      </header>

      <div className="sheet-body">
        <div className="sheet-member">
          <span className="pay-action-ico" aria-hidden="true">
            <Icon name="receipt_long" />
          </span>
          <div>
            <strong>
              {currency(tx.amount)} · {member.name}
            </strong>
            <small>
              {[terms, tx.dateKnown ? displayDate(tx.date) : DATE_NOT_RECORDED, domain.paymentModeLabel(tx.mode)]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </div>
        </div>

        {view === "menu" ? (
          <>
            <div className="member-kind">
              <button type="button" className="member-kind-option" onClick={() => setView("details")}>
                <Icon name="edit_note" />
                <span>
                  <strong>Edit details</strong>
                  <small>Method, reference or note. Every change is logged.</small>
                </span>
                <Icon name="chevron_right" className="member-kind-go" />
              </button>
              <button type="button" className="member-kind-option" disabled={Boolean(blocked)} onClick={() => setView("correct")}>
                <Icon name="edit" />
                <span>
                  <strong>Correct amount, date or terms</strong>
                  <small>The original is kept as reversed and replaced with the right values.</small>
                </span>
                <Icon name="chevron_right" className="member-kind-go" />
              </button>
              <button type="button" className="member-kind-option is-danger" disabled={Boolean(blocked)} onClick={() => setView("reverse")}>
                <Icon name="undo" />
                <span>
                  <strong>Reverse payment</strong>
                  <small>It stops counting as collected, and its terms are owed again.</small>
                </span>
                <Icon name="chevron_right" className="member-kind-go" />
              </button>
            </div>
            {blocked ? (
              <p className="sheet-note">
                <Icon name="lock" />
                {blocked}
              </p>
            ) : null}
            <EditLog edits={edits} />
          </>
        ) : null}

        {view === "details" ? (
          <section className="sheet-section">
            <div className="pay-modes" role="radiogroup" aria-label="Payment method">
              {PAYMENT_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={details.mode === option.value}
                  className={"pay-mode" + (details.mode === option.value ? " active" : "")}
                  onClick={() => setDetails({ ...details, mode: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="mf-field">
              Reference
              <input maxLength={80} value={details.reference} onChange={(event) => setDetails({ ...details, reference: event.target.value })} />
            </label>
            <label className="mf-field">
              Note
              <input maxLength={300} value={details.note} onChange={(event) => setDetails({ ...details, note: event.target.value })} />
            </label>
            <small className="field-hint">The amount, date and terms stay as they are. Use Correct to change those.</small>
          </section>
        ) : null}

        {view === "correct" ? (
          <>
            {debts.length ? (
              <PaymentFields member={without} debts={debts} draft={draft} onChange={setDraft} domain={domain} />
            ) : (
              <p className="sheet-note">Nothing would be owed without this payment, so there is nothing to correct it to.</p>
            )}
            <ReasonField reason={reason} onChange={setReason} label="Why is it being corrected?" />
            {problem ? <p className="pay-hint is-error">{problem}</p> : null}
          </>
        ) : null}

        {view === "reverse" ? (
          <>
            <p className="plan-dues">
              {currency(tx.amount)} will no longer count as collected, and {terms || "its terms"} will be owed again. The payment stays in
              the history as reversed.
            </p>
            <ReasonField reason={reason} onChange={setReason} label="Why is it being reversed?" />
          </>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {view === "details" ? (
        <footer className="sheet-foot">
          <button
            className={"sheet-confirm" + (busy ? " is-busy" : "")}
            type="button"
            disabled={busy || !Object.keys(detailChanges).length}
            onClick={() => run(() => editPaymentDetails(member.id, tx.id, detailChanges))}
          >
            {busy ? "Saving…" : "Save details"}
          </button>
        </footer>
      ) : null}
      {view === "correct" ? (
        <footer className="sheet-foot">
          <button
            className={"sheet-confirm" + (busy ? " is-busy" : "")}
            type="button"
            disabled={busy || Boolean(problem) || !reasonOk || !debts.length}
            onClick={() =>
              run(() => correctPayment(member.id, tx.id, { ...paymentBody({ debts, draft }), reason: reason.trim() }))
            }
          >
            {busy ? "Correcting…" : `Correct to ${currency(allocationLines({ debts, draft }).reduce((sum, line) => sum + line.pay, 0))}`}
          </button>
        </footer>
      ) : null}
      {view === "reverse" ? (
        <footer className="sheet-foot">
          <button
            className={"sheet-confirm is-danger" + (busy ? " is-busy" : "")}
            type="button"
            disabled={busy || !reasonOk}
            onClick={() => run(() => reversePayment(member.id, tx.id, { reason: reason.trim() }))}
          >
            {busy ? "Reversing…" : `Reverse ${currency(tx.amount)}`}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function ReasonField({ reason, onChange, label }) {
  return (
    <label className="mf-field">
      {label}
      <textarea rows="2" maxLength={300} value={reason} onChange={(event) => onChange(event.target.value)} />
      <small className="field-hint">Required. Kept with the payment for the record.</small>
    </label>
  );
}

// Earlier edits of method / reference / note, oldest first.
function EditLog({ edits }) {
  if (!edits.length) return null;
  return (
    <section className="sheet-section">
      <div className="sheet-section-head">
        <h3>Changes</h3>
      </div>
      <ul className="pay-edit-log">
        {edits.map((edit, index) => (
          <li key={index}>
            {FIELD_LABELS[edit.field] || edit.field}: {edit.from || "—"} → {edit.to || "—"}
            <small>
              {[edit.changedBy?.name, edit.changedAt ? displayDate(localDateKey(new Date(edit.changedAt))) : ""].filter(Boolean).join(" · ")}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
