import { useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import { currency, displayDate, todayKey } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import {
  collectionTimingLabel,
  firstPlanPeriodKey,
  latestPlanChangeDate,
  planLabel,
  unsettledBeforeChange,
} from "../lib/billing.js";

// Quick picks for a package length, same as the member form.
const PACKAGE_PRESETS = [3, 6, 12];

/**
 * "Change plan" sheet. The new plan starts on a chosen date and billing counts
 * from there; anything unpaid on the old plan before that date is collected or
 * waived in the same step, so a member's dues never change silently. The
 * server writes the change and its log entry (who, when) together.
 */
export default function PlanDialog() {
  const { closePlanDialog, members } = useApp();
  const { planDialog } = useDialogs();
  const member = members.find((item) => item.id === planDialog.memberId);
  const open = planDialog.open && Boolean(member);
  return (
    <Dialog className="sheet member-form-sheet plan-sheet" id="planDialog" open={open} onClose={closePlanDialog}>
      {member ? <PlanForm key={member.id} member={member} /> : null}
    </Dialog>
  );
}

function PlanForm({ member }) {
  const { closePlanDialog, domain, settings, changePlan, showToast } = useApp();

  const currentTiming = domain.getCollectionTiming(member);
  const [membershipType, setMembershipType] = useState(domain.getMembershipType(member));
  const [packageMonths, setPackageMonths] = useState(String(domain.getPackageMonths(member)));
  const [fee, setFee] = useState(String(member.fee || ""));
  const [collectionTiming, setCollectionTiming] = useState(currentTiming);

  const today = todayKey();
  const earliest = domain.billingStartKey(member);
  const latest = latestPlanChangeDate(settings, member);
  const hasRenewalOption = latest > today;
  const [startChoice, setStartChoice] = useState(hasRenewalOption ? "renewal" : "today");
  const [customDate, setCustomDate] = useState(today);
  const [oldDues, setOldDues] = useState("collect");
  const [firstTermChoice, setFirstTermChoice] = useState(null);
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const isPackage = membershipType === "package";
  const months = Number(packageMonths);
  const feeValue = Number(fee);
  const plan = {
    membershipType,
    packageMonths: isPackage ? months : 1,
    fee: feeValue,
    collectionTiming,
  };

  const effectiveDate = startChoice === "today" ? today : startChoice === "renewal" ? latest : customDate;

  const errors = {};
  if (isPackage && !(Number.isInteger(months) && months >= 1 && months <= 60)) {
    errors.packageMonths = "Package length must be 1 to 60 whole months.";
  }
  if (!(feeValue > 0)) errors.fee = "Enter a fee of more than ₹0.";
  if (!effectiveDate || effectiveDate < earliest || effectiveDate > latest) {
    errors.date = `Pick a date from ${displayDate(earliest)} to ${displayDate(latest)}.`;
  }
  const unchanged =
    membershipType === domain.getMembershipType(member) &&
    (!isPackage || months === domain.getPackageMonths(member)) &&
    feeValue === Number(member.fee) &&
    collectionTiming === currentTiming;

  // Old-plan periods that would drop out of billing once it restarts on effectiveDate.
  const unsettled = errors.date ? [] : unsettledBeforeChange(settings, member, effectiveDate);
  // Part-paid periods only owe what is left on them.
  const duesAmount = unsettled.reduce((sum, period) => sum + domain.getPeriodDue(member, period).balance, 0);

  // First term of the new plan, for upfront plans; default on when it starts today or earlier.
  const firstKey = errors.date ? "" : firstPlanPeriodKey(settings, plan, effectiveDate);
  const firstAlreadyPaid =
    Boolean(firstKey) &&
    (domain.getPaidPeriodSet(member).has(firstKey) || (oldDues === "collect" && unsettled.includes(firstKey)));
  const canCollectFirst = collectionTiming === "at-join" && Boolean(firstKey) && !firstAlreadyPaid;
  const collectFirst = canCollectFirst && (firstTermChoice ?? effectiveDate <= today);

  const collectNow = (unsettled.length && oldDues === "collect" ? duesAmount : 0) + (collectFirst && feeValue > 0 ? feeValue : 0);
  const waived = unsettled.length && oldDues === "waive" ? duesAmount : 0;

  // What the member looks like after saving — drives the "next due" preview.
  let preview = null;
  if (!Object.keys(errors).length && !unchanged) {
    const planned = [];
    if (unsettled.length && oldDues === "collect") planned.push(...unsettled.map((billingPeriod) => ({ billingPeriod })));
    if (collectFirst) planned.push({ billingPeriod: firstKey });
    const next = {
      ...member,
      ...plan,
      planStartDate: effectiveDate,
      payments: [...(member.payments || []), ...planned.map((payment) => ({ ...payment, amount: 0, kind: "membership" }))],
    };
    preview = {
      dueKey: domain.getDueDateKey(next),
      owes: domain.getOverdueAmount(next),
    };
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (unchanged) {
      setFormError("Change the type, length, fee or collection to update the plan.");
      return;
    }
    const first = Object.values(errors)[0];
    if (first) {
      setFormError(first);
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      await changePlan(member.id, {
        ...plan,
        effectiveDate,
        oldDues: unsettled.length ? oldDues : undefined,
        collectFirstTerm: collectFirst,
        mode,
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

  return (
    <form className="sheet-panel" noValidate onSubmit={onSubmit}>
      <header className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        <h2>Change plan</h2>
        <button className="sheet-close" aria-label="Close" type="button" onClick={closePlanDialog}>
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
            <small>
              Now: {planLabel(member)} · {currency(member.fee)} · {collectionTimingLabel(currentTiming)}
            </small>
          </div>
        </div>

        <section className="sheet-section">
          <div className="sheet-section-head">
            <h3>New plan</h3>
          </div>
          <div className="mf-grid">
            <div className="mf-field wide">
              <span className="mf-label" id="planTypeLabel">
                Membership type
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="planTypeLabel">
                {[
                  ["monthly", "Monthly"],
                  ["package", "Package"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="planType"
                      checked={membershipType === value}
                      onChange={() => setMembershipType(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {isPackage ? (
              <div className="mf-field wide">
                <span className="mf-label">Package length</span>
                <div className="mf-months">
                  {PACKAGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={"pay-mode" + (String(preset) === packageMonths ? " active" : "")}
                      onClick={() => setPackageMonths(String(preset))}
                    >
                      {preset} mo
                    </button>
                  ))}
                  <span className={"affix-input mf-months-custom" + (errors.packageMonths ? " has-error" : "")}>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      inputMode="numeric"
                      aria-label="Package months"
                      value={packageMonths}
                      onChange={(event) => setPackageMonths(event.target.value)}
                    />
                    <span className="affix">months</span>
                  </span>
                </div>
              </div>
            ) : null}

            <label className="mf-field wide">
              {isPackage ? "Package fee" : "Monthly fee"}
              <span className={"affix-input" + (errors.fee && fee !== "" ? " has-error" : "")}>
                <span className="affix">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
              </span>
            </label>

            <div className="mf-field wide">
              <span className="mf-label" id="planTimingLabel">
                When is the fee collected?
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="planTimingLabel">
                {[
                  ["at-join", "Upfront"],
                  ["fixed-day", "After the period"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="planTiming"
                      checked={collectionTiming === value}
                      onChange={() => setCollectionTiming(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="sheet-section">
          <div className="sheet-section-head">
            <h3>New plan starts</h3>
          </div>
          <div className="segmented" role="radiogroup" aria-label="New plan starts">
            <label>
              <input type="radio" name="planStart" checked={startChoice === "today"} onChange={() => setStartChoice("today")} />
              <span>Today</span>
            </label>
            {hasRenewalOption ? (
              <label>
                <input
                  type="radio"
                  name="planStart"
                  checked={startChoice === "renewal"}
                  onChange={() => setStartChoice("renewal")}
                />
                <span>Renewal · {displayDate(latest).slice(0, 6)}</span>
              </label>
            ) : null}
            <label>
              <input type="radio" name="planStart" checked={startChoice === "custom"} onChange={() => setStartChoice("custom")} />
              <span>Other date</span>
            </label>
          </div>
          {startChoice === "custom" ? (
            <label className="mf-field">
              Start date
              <input
                type="date"
                min={earliest}
                max={latest}
                value={customDate}
                onChange={(event) => setCustomDate(event.target.value)}
                className={errors.date ? "has-error" : undefined}
              />
            </label>
          ) : null}
          <small className="field-hint">
            {startChoice === "renewal"
              ? `The current plan runs until ${displayDate(latest)}, then the new plan begins.`
              : "Billing restarts from this date on the new plan."}
            {effectiveDate !== earliest ? (
              <>
                {" "}
                Fixing a typo?{" "}
                <button
                  type="button"
                  className="sheet-link plan-inline-link"
                  onClick={() => {
                    setStartChoice("custom");
                    setCustomDate(earliest);
                  }}
                >
                  Apply from {displayDate(earliest)}
                </button>
              </>
            ) : null}
          </small>
        </section>

        {unsettled.length ? (
          <section className="sheet-section plan-dues" aria-live="polite">
            <div className="plan-dues-head">
              <Icon name="warning" />
              <div>
                <strong>{currency(duesAmount)} unpaid on the current plan</strong>
                <small>{unsettled.map((period) => domain.getBillingPeriodLabel(period, member)).join(", ")}</small>
              </div>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Unpaid dues">
              <label>
                <input type="radio" name="oldDues" checked={oldDues === "collect"} onChange={() => setOldDues("collect")} />
                <span>Collect now</span>
              </label>
              <label>
                <input type="radio" name="oldDues" checked={oldDues === "waive"} onChange={() => setOldDues("waive")} />
                <span>Waive</span>
              </label>
            </div>
            <small className="field-hint">
              {oldDues === "waive"
                ? "These periods won't be billed. The waived amount is recorded with the change."
                : "Recorded as paid today, at the old fee."}
            </small>
          </section>
        ) : null}

        {canCollectFirst ? (
          <label className="plan-check">
            <input
              type="checkbox"
              checked={collectFirst}
              onChange={(event) => setFirstTermChoice(event.target.checked)}
            />
            <span>
              <strong>Collect the first {isPackage ? "package" : "term"} now</strong>
              <small>
                {feeValue > 0 ? currency(feeValue) : "₹0"} for the term starting {displayDate(effectiveDate)}
              </small>
            </span>
          </label>
        ) : null}

        {collectNow > 0 ? (
          <div className="mf-field">
            <span className="mf-label" id="planModeLabel">
              Paid by
            </span>
            <div className="pay-modes" role="radiogroup" aria-labelledby="planModeLabel">
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

        <label className="mf-field">
          <span className="mf-label-row">
            Note
            <em>Optional</em>
          </span>
          <input
            maxLength={200}
            placeholder="e.g. Switched to 6-month offer"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {preview ? (
          <dl className="plan-summary">
            <div>
              <dt>New plan</dt>
              <dd>
                {planLabel(plan)} · {currency(feeValue)}
              </dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>{displayDate(effectiveDate)}</dd>
            </div>
            <div>
              <dt>{preview.owes > 0 ? "Overdue after change" : "Next due"}</dt>
              <dd className={preview.owes > 0 ? "is-due" : ""}>
                {preview.owes > 0 ? currency(preview.owes) : displayDate(preview.dueKey)}
              </dd>
            </div>
            {collectNow > 0 ? (
              <div>
                <dt>Collect now</dt>
                <dd>{currency(collectNow)}</dd>
              </div>
            ) : null}
            {waived > 0 ? (
              <div>
                <dt>Waived</dt>
                <dd>{currency(waived)}</dd>
              </div>
            ) : null}
            <p>
              <Icon name="history" />
              Logged with the date and time in Detailed Insights → Plan changes.
            </p>
          </dl>
        ) : null}

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>

      <footer className="sheet-foot">
        <button className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy || unchanged}>
          {busy ? "Saving..." : collectNow > 0 ? `Change plan · collect ${currency(collectNow)}` : "Change plan"}
        </button>
      </footer>
    </form>
  );
}
