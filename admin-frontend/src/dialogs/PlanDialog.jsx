import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import Options, { billingTermOptions } from "../components/OptionCards.jsx";
import ReviewCard from "../components/ReviewCard.jsx";
import { currency, dateFormatter, displayDate, localDateKey, monthLabelFromKey, parseDateKey } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { collectionTimingLabel, planChangeWindow, planLabel, quotePlanChange } from "../lib/billing.js";

// Package lengths offered as one tap; any other length is typed in.
const PACKAGE_PRESETS = [3, 6, 12];

const STEP_NAMES = ["new plan", "start date and payment", "summary"];

const monthsLabel = (count) => (count === 1 ? "1 month" : `${count} months`);

// "3 Nov", with the year only when it isn't this year.
function shortDate(key) {
  const date = parseDateKey(key);
  if (Number.isNaN(date.getTime())) return "";
  const options =
    date.getFullYear() === new Date().getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" };
  return dateFormatter(options).format(date);
}

// What one term of the new plan covers: "Nov 2026" for a calendar month, else "3 Nov – 2 Feb".
function termRange(domain, member, plan, key) {
  if (key.length === 7) return monthLabelFromKey(key);
  const end = domain.periodEndDate({ ...member, ...plan }, key);
  end.setDate(end.getDate() - 1);
  return `${shortDate(key)} – ${shortDate(localDateKey(end))}`;
}

/**
 * "Change plan" sheet, in three short steps: what the new plan is, when it
 * starts and what is collected with it, then a summary to check before saving.
 * The server writes the change, any payment and the log entry (who, when)
 * together; quotePlanChange() works out beforehand exactly what it will record.
 */
export default function PlanDialog() {
  const { closePlanDialog, members } = useApp();
  const { planDialog } = useDialogs();
  const member = members.find((item) => item.id === planDialog.memberId);
  const open = planDialog.open && Boolean(member);
  return (
    <Dialog className="sheet cp-sheet" id="planDialog" open={open} onClose={closePlanDialog}>
      {member ? <PlanForm key={member.id} member={member} /> : null}
    </Dialog>
  );
}

function PlanForm({ member }) {
  const { closePlanDialog, domain, settings, changePlan, showToast } = useApp();
  const current = {
    membershipType: domain.getMembershipType(member),
    packageMonths: domain.getPackageMonths(member),
    fee: Number(member.fee || 0),
    collectionTiming: domain.getCollectionTiming(member),
  };
  const dates = useMemo(() => planChangeWindow(settings, member), [settings, member]);

  // 0 = the new plan; 1 = when it starts and what is collected; 2 = summary, then save.
  const [step, setStep] = useState(0);
  const [membershipType, setMembershipType] = useState(current.membershipType);
  const [months, setMonths] = useState(String(current.packageMonths));
  const [customLength, setCustomLength] = useState(false);
  // null until a fee is typed: it then follows the plan picked (the current
  // fee for the current plan, empty for any other, so an old price never
  // carries over to a different plan unnoticed).
  const [feeText, setFeeText] = useState(null);
  const [collectionTiming, setCollectionTiming] = useState(null);
  const [startChoice, setStartChoice] = useState(dates.renewal > dates.today ? "renewal" : "today");
  const [customDate, setCustomDate] = useState(dates.today < dates.earliest ? dates.earliest : dates.today);
  const [oldDues, setOldDues] = useState(null);
  const [firstTermChoice, setFirstTermChoice] = useState(null);
  const [mode, setMode] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  // Steps where Next was tried with something missing: their unanswered parts turn red.
  const [tried, setTried] = useState({});
  const bodyRef = useRef(null);
  const feeRef = useRef(null);
  const monthsRef = useRef(null);
  const dateRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  const isPackage = membershipType === "package";
  const monthCount = Number(months);
  const sameShape = membershipType === current.membershipType && (!isPackage || monthCount === current.packageMonths);
  const fee = feeText ?? (sameShape && current.fee > 0 ? String(current.fee) : "");
  const effectiveDate = startChoice === "today" ? dates.today : startChoice === "renewal" ? dates.renewal : customDate;

  const quote = quotePlanChange(settings, member, {
    membershipType,
    packageMonths: months,
    fee,
    collectionTiming,
    effectiveDate,
    oldDues,
    collectFirstTerm: firstTermChoice,
  });
  const { plan, errors } = quote;
  const planBlocker = errors.packageMonths || errors.fee || errors.timing || (quote.unchanged ? "Nothing changed yet" : "");
  const blocker =
    planBlocker || errors.date || errors.oldDues || errors.firstTerm || (quote.collectNow > 0 && !mode ? "Select a payment mode" : "");
  const unit = isPackage ? "package" : "month";
  const oldUnit = domain.getPeriodUnitLabel(member);
  const dueLabels = quote.dues.map((due) => domain.getBillingPeriodLabel(due.period, member));
  const duesText =
    dueLabels.length <= 3 ? dueLabels.join(", ") : `${dueLabels.length} unpaid ${oldUnit}s · ${dueLabels[0]} – ${dueLabels.at(-1)}`;

  /* ---- Step 1: the plan ---- */
  const lengths = [
    ...new Set([...PACKAGE_PRESETS, ...(current.membershipType === "package" ? [current.packageMonths] : [])]),
  ].sort((a, b) => a - b);
  const planChoices = [
    { key: "monthly", label: "Monthly" },
    ...lengths.map((count) => ({ key: `p${count}`, label: monthsLabel(count), months: count })),
  ];
  const currentKey = current.membershipType === "package" ? `p${current.packageMonths}` : "monthly";
  const activeKey = !isPackage ? "monthly" : !customLength && lengths.includes(monthCount) ? `p${monthCount}` : "custom";
  const validMonths = isPackage && !errors.packageMonths;
  const feeLabel = !isPackage ? "Monthly fee" : validMonths ? `Fee for ${monthsLabel(monthCount)}` : "Package fee";
  const perMonth = validMonths && monthCount > 1 && !errors.fee ? `${currency(plan.fee / monthCount)} a month` : "";

  const pickPlan = (choice) => {
    setCustomLength(false);
    setMembershipType(choice.months ? "package" : "monthly");
    if (choice.months) setMonths(String(choice.months));
    // Any other plan starts with an empty fee: put the cursor there.
    if (feeText === null && choice.key !== currentKey) window.requestAnimationFrame(() => feeRef.current?.focus());
  };
  const pickCustom = () => {
    if (!isPackage) setMonths("");
    setCustomLength(true);
    setMembershipType("package");
    window.requestAnimationFrame(() => monthsRef.current?.focus());
  };
  const stepMonths = (delta) => {
    const from = Number.isInteger(monthCount) ? monthCount : 0;
    setMonths(String(Math.min(60, Math.max(1, from + delta))));
  };

  /* ---- Step 2: start and payment ---- */
  const hasStarted = dates.earliest <= dates.today;
  const startOptions = [
    hasStarted && { key: "today", label: "Today", date: dates.today },
    dates.renewal > dates.today && { key: "renewal", label: hasStarted ? "At renewal" : "Scheduled", date: dates.renewal },
    dates.earliest < dates.latest && { key: "other", label: "Other date", date: startChoice === "other" ? customDate : "" },
  ].filter(Boolean);
  const earliestLabel = member.planStartDate ? "Plan start" : member.billingCutover ? "Billing start" : "Joining date";

  const chooseStart = (key) => {
    setStartChoice(key);
    if (key !== "other") return;
    window.requestAnimationFrame(() => {
      try {
        dateRef.current?.showPicker?.();
      } catch {
        dateRef.current?.focus();
      }
    });
  };

  const changed = {
    shape: planLabel(plan) !== planLabel(current),
    fee: plan.fee !== current.fee,
    timing: plan.collectionTiming !== current.collectionTiming,
  };
  const lineCount = (quote.dues.length ? 1 : 0) + (quote.firstTerm ? 1 : 0);
  const outcome = !quote.preview
    ? null
    : quote.preview.owes > 0
      ? { icon: "error", label: "Overdue after the change", value: currency(quote.preview.owes), due: true }
      : quote.preview.packageEndKey && !(quote.firstTerm && !quote.firstTerm.collect)
        ? { icon: "event_available", label: "Package ends on", value: displayDate(quote.preview.packageEndKey) }
        : { icon: "event", label: "Next payment due", value: displayDate(quote.preview.dueKey) };

  const modeLabel = PAYMENT_MODES.find((option) => option.value === mode)?.label || "";
  const summaryRows = quote.preview
    ? [
        { label: "Member", value: member.name, hint: member.phone || "" },
        { label: "Current plan", value: planLabel(current), hint: `${currency(current.fee)} · ${collectionTimingLabel(current.collectionTiming)}` },
        { label: "New plan", value: planLabel(plan), hint: `${currency(plan.fee)} · ${collectionTimingLabel(plan.collectionTiming)}` },
        { label: `New ${isPackage ? "package" : "plan"} starts`, value: displayDate(effectiveDate) },
        ...(quote.dues.length
          ? [{ label: "Previous dues", value: currency(quote.duesAmount), hint: oldDues === "waive" ? "Waived" : "Collected now" }]
          : []),
        ...(quote.firstTerm
          ? [
              {
                label: `First ${unit}`,
                value: currency(quote.firstTerm.amount),
                hint: quote.firstTerm.collect ? "Collected now" : `Due from ${displayDate(effectiveDate)}`,
              },
            ]
          : []),
        ...(quote.collectNow > 0 ? [{ label: "Paid by", value: modeLabel || "Not selected", tone: mode ? "" : "due" }] : []),
        { label: outcome.label, value: outcome.value, tone: outcome.due ? "due" : "" },
        ...(note.trim() ? [{ label: "Note", value: note.trim() }] : []),
      ]
    : null;

  const goTo = (next) => {
    setFormError("");
    setStep(next);
  };
  // Every blocking problem shows in two places: inline above the button and as a toast.
  const stopWith = (message) => {
    setTried((current) => ({ ...current, [step]: true }));
    setFormError(message);
    showToast(message);
  };
  const stepBlocker = step === 0 ? planBlocker : blocker;
  // Once what was missing is answered, its message goes away by itself.
  useEffect(() => {
    if (!stepBlocker) setFormError((current) => (tried[step] ? "" : current));
  }, [stepBlocker, step, tried]);
  const show = (index, error) => Boolean(tried[index] && error);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (step === 0) {
      if (planBlocker) stopWith(planBlocker);
      else goTo(1);
      return;
    }
    if (blocker) {
      stopWith(blocker);
      return;
    }
    if (step === 1) {
      goTo(2);
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      await changePlan(member.id, {
        ...plan,
        effectiveDate,
        oldDues: quote.dues.length ? oldDues : undefined,
        collectFirstTerm: Boolean(quote.firstTerm?.collect),
        mode: mode || "cash",
        note: note.trim(),
      });
      closePlanDialog();
    } catch (error) {
      const message = error?.message || "Could not change the plan. Check your connection and try again.";
      setFormError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  // Enter in a field leaves the field on the payment step instead of moving on
  // or saving: only the buttons do that.
  const onKeyDown = (event) => {
    if (step === 1 && event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.target.blur();
    }
  };

  const saveLabel = busy
    ? "Saving..."
    : quote.collectNow > 0
      ? `Confirm · Collect ${currency(quote.collectNow)}`
      : "Confirm plan change";

  return (
    <form className="sheet-panel" noValidate onSubmit={onSubmit} onKeyDown={onKeyDown}>
      <header className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        {step > 0 ? (
          <button className="sheet-back" type="button" aria-label="Back" onClick={() => goTo(step - 1)}>
            <Icon name="arrow_back" />
          </button>
        ) : null}
        <h2>Change plan</h2>
        <button className="sheet-close" aria-label="Close" type="button" onClick={closePlanDialog}>
          <Icon name="close" />
        </button>
      </header>
      <div className="cp-progress" aria-hidden="true">
        {STEP_NAMES.map((name, index) => (
          <span key={name} className={index <= step ? "is-on" : ""} />
        ))}
      </div>
      <p className="cp-sr" aria-live="polite">
        Step {step + 1} of {STEP_NAMES.length}: {STEP_NAMES[step]}
      </p>

      <div className="sheet-body cp-body" ref={bodyRef}>
        {step === 0 ? (
          <div className="cp-step" key="plan">
            <div className="sheet-member">
              <span className="contact-avatar">
                <Photo person={member} />
              </span>
              <div>
                <strong>{member.name}</strong>
                <small>
                  Now: {planLabel(current)} · {currency(current.fee)} · {collectionTimingLabel(current.collectionTiming)}
                </small>
              </div>
            </div>

            <section className="cp-section">
              <h3 className="cp-label" id="cpPlanLabel">
                New plan
              </h3>
              <div className="cp-chips" role="radiogroup" aria-labelledby="cpPlanLabel">
                {planChoices.map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    role="radio"
                    aria-checked={activeKey === choice.key}
                    className={"cp-chip" + (activeKey === choice.key ? " is-active" : "")}
                    onClick={() => pickPlan(choice)}
                  >
                    {choice.label}
                    {choice.key === currentKey ? <span className="cp-now">Now</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={activeKey === "custom"}
                  className={"cp-chip" + (activeKey === "custom" ? " is-active" : "")}
                  onClick={pickCustom}
                >
                  Custom
                </button>
              </div>
              {activeKey === "custom" ? (
                <div className={"cp-stepper" + (errors.packageMonths && months !== "" ? " has-error" : "")}>
                  <button type="button" aria-label="One month less" disabled={!(monthCount > 1)} onClick={() => stepMonths(-1)}>
                    <Icon name="remove" />
                  </button>
                  <label>
                    <input
                      ref={monthsRef}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="60"
                      step="1"
                      placeholder="0"
                      aria-label="Package length in months"
                      value={months}
                      onChange={(event) => setMonths(event.target.value)}
                    />
                    <span>{monthCount === 1 ? "month" : "months"}</span>
                  </label>
                  <button type="button" aria-label="One month more" disabled={monthCount >= 60} onClick={() => stepMonths(1)}>
                    <Icon name="add" />
                  </button>
                </div>
              ) : null}
            </section>

            <section className="cp-section">
              <div className="cp-label-row">
                <label className="cp-label" htmlFor="cpFee">
                  {feeLabel}
                </label>
                {perMonth ? <span className="cp-aside">{perMonth}</span> : null}
              </div>
              <div className={"cp-fee" + (errors.fee && (fee !== "" || show(0, errors.fee)) ? " has-error" : "")}>
                <span aria-hidden="true">₹</span>
                <input
                  id="cpFee"
                  ref={feeRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={fee}
                  onChange={(event) => setFeeText(event.target.value)}
                />
              </div>
            </section>

            <section className="cp-section">
              <h3 className="cp-label">Set the billing terms</h3>
              <Options
                name="cpTiming"
                label="Billing terms"
                value={collectionTiming}
                onChange={setCollectionTiming}
                options={billingTermOptions(unit)}
                invalid={show(0, errors.timing)}
              />
            </section>
          </div>
        ) : step === 1 ? (
          <div className="cp-step" key="start">
            <div className="cp-summary">
              <div className="cp-summary-head">
                <span className="contact-avatar">
                  <Photo person={member} />
                </span>
                <strong>{member.name}</strong>
                <button type="button" className="cp-edit" onClick={() => goTo(0)}>
                  <Icon name="edit" />
                  Edit
                </button>
              </div>
              <div className="cp-shift">
                <div className="cp-shift-side is-old">
                  <small>Now</small>
                  <strong>{planLabel(current)}</strong>
                  <span>
                    {currency(current.fee)} · {collectionTimingLabel(current.collectionTiming)}
                  </span>
                </div>
                <Icon name="arrow_forward" className="cp-shift-arrow" />
                <div className="cp-shift-side is-new">
                  <small>New</small>
                  <strong className={changed.shape ? "" : "is-same"}>{planLabel(plan)}</strong>
                  <span>
                    <em className={changed.fee ? "is-changed" : ""}>{currency(plan.fee)}</em>
                    {" · "}
                    <em className={changed.timing ? "is-changed" : ""}>{collectionTimingLabel(plan.collectionTiming)}</em>
                  </span>
                </div>
              </div>
            </div>

            <section className="cp-section">
              <h3 className="cp-question" id="cpStartLabel">
                <Icon name="event" />
                From when does the new {isPackage ? "package" : "plan"} start?
              </h3>
              <div className="cp-dates" role="radiogroup" aria-labelledby="cpStartLabel">
                {startOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={startChoice === option.key}
                    className={"cp-date" + (startChoice === option.key ? " is-active" : "")}
                    onClick={() => chooseStart(option.key)}
                  >
                    <small>{option.label}</small>
                    {option.date ? <strong>{shortDate(option.date)}</strong> : <Icon name="calendar_month" />}
                  </button>
                ))}
              </div>
              {startChoice === "other" ? (
                <div className="cp-other">
                  <input
                    ref={dateRef}
                    type="date"
                    min={dates.earliest}
                    max={dates.latest}
                    value={customDate}
                    aria-label="Start date"
                    className={errors.date ? "has-error" : undefined}
                    onChange={(event) => setCustomDate(event.target.value)}
                  />
                  {dates.earliest < dates.today && customDate !== dates.earliest ? (
                    <button type="button" className="cp-quick" onClick={() => setCustomDate(dates.earliest)}>
                      {earliestLabel} · {shortDate(dates.earliest)}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            {lineCount ? (
              <section className="cp-section">
                <h3 className="cp-label">
                  <Icon name="payments" />
                  Payment
                </h3>
                <div className="cp-bill">
                  {quote.dues.length ? (
                    <div className={"cp-line" + (oldDues === "waive" ? " is-waived" : "")}>
                      <div className="cp-line-head">
                        <strong>Settle payments of last plan due</strong>
                        <b>{currency(quote.duesAmount)}</b>
                      </div>
                      <small>{duesText}</small>
                      <Options
                        name="cpOldDues"
                        label="Settle payments of last plan due"
                        value={oldDues}
                        onChange={setOldDues}
                        invalid={show(1, errors.oldDues)}
                        options={[
                          { key: "collect", icon: "payments", title: `Collect ${currency(quote.duesAmount)} now` },
                          { key: "waive", icon: "money_off", title: "Remove / waive the previous fees" },
                        ]}
                      />
                    </div>
                  ) : null}
                  {quote.firstTerm ? (
                    <div className="cp-line">
                      <div className="cp-line-head">
                        <strong>
                          Collect the first {unit}&apos;s payment of {currency(quote.firstTerm.amount)}?
                        </strong>
                      </div>
                      <small>{termRange(domain, member, plan, quote.firstTerm.period)}</small>
                      <Options
                        name="cpFirstTerm"
                        label={`Collect the first ${unit}'s payment`}
                        value={firstTermChoice === null ? null : firstTermChoice ? "yes" : "no"}
                        onChange={(value) => setFirstTermChoice(value === "yes")}
                        invalid={show(1, errors.firstTerm)}
                        options={[
                          { key: "yes", icon: "check_circle", title: "Yes, collect now" },
                          { key: "no", icon: "schedule", title: "No, keep it due" },
                        ]}
                      />
                    </div>
                  ) : null}
                  {quote.collectNow > 0 ? (
                    <div className="cp-pay">
                      {lineCount > 1 ? (
                        <div className="cp-total">
                          <span>Collect now</span>
                          <b>{currency(quote.collectNow)}</b>
                        </div>
                      ) : null}
                      <div className={"pay-modes" + (show(1, !mode) ? " has-error" : "")} role="radiogroup" aria-label="Payment mode">
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
                  ) : null}
                </div>
              </section>
            ) : null}

            {noteOpen || note ? (
              <label className="cp-note">
                <span className="cp-label">Note</span>
                <input
                  maxLength={200}
                  autoFocus={!note}
                  placeholder="e.g. Switched to the 6-month offer"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            ) : (
              <button type="button" className="cp-add-note" onClick={() => setNoteOpen(true)}>
                <Icon name="add" />
                Add a note
              </button>
            )}
          </div>
        ) : (
          <div className="cp-step" key="summary">
            {summaryRows ? (
              <ReviewCard
                title="Summary"
                subtitle="Check everything, then confirm the change."
                rows={summaryRows}
                total={{ label: "Collect now", value: currency(quote.collectNow) }}
                notes={["Logged with the date and time in Detailed Insights → Plan changes."]}
              />
            ) : null}
          </div>
        )}

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>

      <footer className={"sheet-foot" + (step === 2 ? " is-split" : "")}>
        {step === 2 ? (
          <button className="sheet-secondary" type="button" disabled={busy} onClick={() => goTo(1)}>
            Back
          </button>
        ) : null}
        {step === 0 ? (
          <button key="next" className="sheet-confirm" type="submit">
            Next
          </button>
        ) : step === 1 ? (
          <button key="review" className="sheet-confirm" type="submit">
            Review summary
          </button>
        ) : (
          <button key="save" className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy || Boolean(blocker)}>
            {saveLabel}
          </button>
        )}
      </footer>
    </form>
  );
}
