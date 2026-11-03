import { useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Icon from "./Icon.jsx";
import StepProgress from "./StepProgress.jsx";
import ReviewCard from "./ReviewCard.jsx";
import { currency } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";

// Keep in sync with NOTE_MIN / NOTE_MAX in backend/src/services/paymentService.js.
const NOTE_MIN = 3;
const NOTE_MAX = 160;

// What the desk most often takes money for outside the monthly fee; a tap
// starts the note and the admin adds the detail.
const QUICK_NOTES = ["Supplements", "Part payment", "Personal training", "Locker", "Merchandise"];

/**
 * Money taken from a member who owes nothing: supplements, a part payment,
 * anything that is not a term or the admission fee. A note saying what it was
 * for is required, and the payment never changes what the member owes.
 *
 * Lives inside the fee sheet's form, so it has no <form> of its own and Enter
 * is handled here rather than submitting the sheet.
 */
export default function OtherPaymentForm({ member }) {
  const { addOtherPayment, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [amountText, setAmountText] = useState("");
  const [mode, setMode] = useState("cash");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  // 0 = enter it; 1 = review it, then record.
  const [step, setStep] = useState(0);
  const noteRef = useRef(null);
  const amountRef = useRef(null);

  const cleanNote = note.replace(/\s+/g, " ").trim();
  const amount = Math.round(Number(amountText) * 100) / 100;
  const noteError = cleanNote.length < NOTE_MIN ? `Say what this is for (at least ${NOTE_MIN} letters).` : "";
  const amountOk = Number.isFinite(amount) && amount > 0;
  const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || mode;
  const canSubmit = !noteError && amountOk && !busy;

  const reset = () => {
    setOpen(false);
    setNote("");
    setAmountText("");
    setMode("cash");
    setTouched(false);
    setStep(0);
  };

  const goNext = () => {
    setTouched(true);
    if (noteError || !amountOk) {
      (noteError ? noteRef : amountRef).current?.focus();
      return;
    }
    setStep(1);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await addOtherPayment(member.id, { amount, note: cleanNote, mode });
      reset();
    } catch (error) {
      showToast(error?.message || "Could not record this payment. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (step === 0) goNext();
    else submit();
  };

  const startNote = (text) => {
    setNote(text);
    window.requestAnimationFrame(() => {
      const input = noteRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(text.length, text.length);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="other-pay-open"
        onClick={() => {
          setOpen(true);
          window.requestAnimationFrame(() => noteRef.current?.focus());
        }}
      >
        <span className="other-pay-ico" aria-hidden="true">
          <Icon name="add" />
        </span>
        <span>
          <strong>Record another payment</strong>
          <small>Supplements, a part payment, anything outside the fee</small>
        </span>
        <Icon name="chevron_right" className="other-pay-go" />
      </button>
    );
  }

  return (
    <section className="other-pay" aria-label="Record another payment">
      <header className="other-pay-head">
        <h3>{step === 1 ? "Review payment" : "Another payment"}</h3>
        <button type="button" className="other-pay-cancel" disabled={busy} onClick={reset}>
          Cancel
        </button>
      </header>
      <StepProgress steps={["Payment", "Review"]} current={step} compact />

      {step === 1 ? (
        <>
          <ReviewCard
            title="Payment summary"
            subtitle=""
            rows={[
              { label: "Member", value: member.name },
              { label: "What it is for", value: cleanNote },
              { label: "Paid by", value: modeLabel },
            ]}
            total={{ label: "Received now", value: currency(amount) }}
          />
          <div className="other-pay-actions">
            <button type="button" className="sheet-secondary" disabled={busy} onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className={"sheet-confirm" + (busy ? " is-busy" : "")} disabled={!canSubmit} onClick={submit}>
              {busy ? "Saving..." : `Record ${currency(amount)}`}
            </button>
          </div>
        </>
      ) : (
        <>

      <div className="mf-field">
        <label htmlFor="otherPayNote" className="mf-label-row">
          What is this for?
          <em>Required</em>
        </label>
        <input
          ref={noteRef}
          id="otherPayNote"
          type="text"
          maxLength={NOTE_MAX}
          autoComplete="off"
          placeholder="e.g. Whey protein, 1 kg"
          value={note}
          aria-invalid={touched && noteError ? "true" : undefined}
          aria-describedby="otherPayNoteHint"
          className={touched && noteError ? "has-error" : undefined}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => note && setTouched(true)}
          onKeyDown={onEnter}
        />
        <div className="other-pay-chips" role="group" aria-label="Quick notes">
          {QUICK_NOTES.map((text) => (
            <button key={text} type="button" className={"other-pay-chip" + (cleanNote === text ? " active" : "")} onClick={() => startNote(text)}>
              {text}
            </button>
          ))}
        </div>
        <small id="otherPayNoteHint" className={"field-hint" + (touched && noteError ? " is-error" : "")}>
          {touched && noteError ? noteError : ""}
          <span className="other-pay-count">
            {cleanNote.length}/{NOTE_MAX}
          </span>
        </small>
      </div>

      <label className="mf-field">
        Amount received
        <span className="affix-input">
          <span className="affix" aria-hidden="true">
            ₹
          </span>
          <input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            onKeyDown={onEnter}
          />
        </span>
      </label>

      <div className="mf-field">
        <span className="mf-label" id="otherPayModeLabel">
          Paid by
        </span>
        <div className="pay-modes" role="radiogroup" aria-labelledby="otherPayModeLabel">
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

      <button type="button" className="sheet-confirm" disabled={!canSubmit} onClick={goNext}>
        {noteError ? "Add a note to continue" : !amountOk ? "Enter the amount received" : "Next"}
      </button>
        </>
      )}
    </section>
  );
}
