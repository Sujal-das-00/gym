import { useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import { currency, displayDate, todayKey } from "../lib/dates.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import {
  MEMBERSHIP_STATUS_LABELS,
  collectionTimingLabel,
  firstPlanPeriodKey,
  planLabel,
  unsettledBeforeChange,
} from "../lib/billing.js";

// Quick picks for a package length, same as the member form.
const PACKAGE_PRESETS = [3, 6, 12];

const TYPE_COPY = {
  upgrade: { label: "Upgrade", icon: "trending_up" },
  downgrade: { label: "Downgrade", icon: "trending_down" },
  change: { label: "Change", icon: "swap_horiz" },
  restart: { label: "Restart", icon: "restart_alt" },
};

const DUES_HINTS = {
  collect: "Recorded as paid today, at the old plan's fee.",
  carry: "Stays owed at the old fee as balance due. It shows in dues and reminders but doesn't expire the membership or block check-in.",
  waive: "These terms won't be billed. Each waived term stays listed in the membership history.",
};

/**
 * "Change plan" sheet, and "Restart membership" (mode "restart": the same
 * plan on a new cycle for a member coming back after a lapse).
 *
 * The rules are the server's (planChangeService.js), shown before saving:
 * the new plan starts no earlier than the current term and never takes over
 * a term that is already paid; a downgrade waits for the next renewal; an
 * immediate change starts a new cycle at the full new fee (no proration).
 * Anything unpaid on the old plan is collected, kept as balance due or
 * waived — an explicit choice. A review step shows the money before saving.
 */
export default function PlanDialog() {
  const { closePlanDialog, members } = useApp();
  const { planDialog } = useDialogs();
  const member = members.find((item) => item.id === planDialog.memberId);
  const open = planDialog.open && Boolean(member);
  return (
    <Dialog className="sheet member-form-sheet plan-sheet" id="planDialog" open={open} onClose={closePlanDialog}>
      {member ? <PlanForm key={member.id + planDialog.mode} member={member} restart={planDialog.mode === "restart"} /> : null}
    </Dialog>
  );
}

function PlanForm({ member, restart }) {
  const { closePlanDialog, domain, settings, changePlan, showToast } = useApp();

  const currentTiming = domain.getCollectionTiming(member);
  const currentPlan = {
    membershipType: domain.getMembershipType(member),
    packageMonths: domain.getPackageMonths(member),
    fee: Number(member.fee),
    collectionTiming: currentTiming,
  };
  const [membershipType, setMembershipType] = useState(currentPlan.membershipType);
  const [packageMonths, setPackageMonths] = useState(String(currentPlan.packageMonths));
  const [fee, setFee] = useState(String(member.fee || ""));
  const [collectionTiming, setCollectionTiming] = useState(currentTiming);

  const today = todayKey();
  const span = domain.planChangeWindow(member);
  const [startChoice, setStartChoice] = useState(restart ? "today" : span.latest > today ? "renewal" : "today");
  const [customDate, setCustomDate] = useState(today);
  const [oldDues, setOldDues] = useState("");
  const [firstTermChoice, setFirstTermChoice] = useState(null);
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  // One id per sheet: a double tap or a retry returns the first change.
  const requestId = useRef(crypto.randomUUID());

  const isPackage = membershipType === "package";
  const months = Number(packageMonths);
  const feeValue = Number(fee);
  const plan = restart
    ? currentPlan
    : { membershipType, packageMonths: isPackage ? months : 1, fee: feeValue, collectionTiming };
  const unchanged =
    !restart &&
    membershipType === currentPlan.membershipType &&
    (!isPackage || months === currentPlan.packageMonths) &&
    feeValue === currentPlan.fee &&
    collectionTiming === currentTiming;
  const changeType = restart ? "restart" : unchanged ? "" : domain.classifyPlanChange(currentPlan, plan);
  const isDowngrade = changeType === "downgrade";

  // A downgrade only ever starts at the next renewal.
  const effectiveDate = isDowngrade
    ? span.latest
    : startChoice === "today"
      ? today
      : startChoice === "renewal"
        ? span.latest
        : customDate;
  const dateProblem = (date) => domain.planChangeProblem(member, { plan, effectiveDate: date, restart });
  const todayBlocked = Boolean(dateProblem(today));

  const errors = {};
  if (!restart && isPackage && !(Number.isInteger(months) && months >= 1 && months <= 60)) {
    errors.packageMonths = "Package length must be 1 to 60 whole months.";
  }
  if (!restart && !(feeValue > 0)) errors.fee = "Enter a fee of more than ₹0.";
  if (!effectiveDate) errors.date = "Pick a start date.";
  else if (!errors.fee && !errors.packageMonths && changeType) {
    const problem = dateProblem(effectiveDate);
    if (problem) errors.date = problem;
  }

  // The new plan's first term, and old-plan terms that would drop out of billing.
  const firstKey = errors.date ? "" : firstPlanPeriodKey(settings, plan, effectiveDate);
  const unsettled = errors.date ? [] : unsettledBeforeChange(settings, member, effectiveDate, firstKey);
  // Part-paid periods only owe what is left on them.
  const duesAmount = unsettled.reduce((sum, period) => sum + domain.getPeriodDue(member, period).balance, 0);
  if (unsettled.length && !oldDues) errors.dues = `Choose what happens to the ${currency(duesAmount)} unpaid on the current plan.`;

  // First term of the new plan, for upfront plans; default on when it starts today or earlier.
  const firstAlreadyPaid = Boolean(firstKey) && domain.getPaidPeriodSet(member).has(firstKey);
  const canCollectFirst = plan.collectionTiming === "at-join" && Boolean(firstKey) && !firstAlreadyPaid;
  const collectFirst = canCollectFirst && (firstTermChoice ?? effectiveDate <= today);

  const collectedDues = unsettled.length && oldDues === "collect" ? duesAmount : 0;
  const firstTermAmount = collectFirst && plan.fee > 0 ? plan.fee : 0;
  const collectNow = collectedDues + firstTermAmount;
  const kept = unsettled.length && oldDues === "carry" ? duesAmount : 0;
  const waived = unsettled.length && oldDues === "waive" ? duesAmount : 0;
  // Balances the change doesn't touch: they stay owed exactly as they are.
  const otherBalances = domain.getOpeningBalanceDue(member) + domain.getCarriedBalanceDue(member);

  // What the member looks like after saving — drives the "next due" preview.
  let preview = null;
  if (!Object.keys(errors).length && (restart || !unchanged)) {
    const planned = [];
    if (oldDues === "collect") planned.push(...unsettled.map((billingPeriod) => ({ billingPeriod })));
    if (collectFirst) planned.push({ billingPeriod: firstKey });
    const next = {
      ...member,
      ...plan,
      planStartDate: effectiveDate,
      payments: [...(member.payments || []), ...planned.map((payment) => ({ ...payment, amount: 0, kind: "membership" }))],
    };
    preview = {
      dueKey: domain.getDueDateKey(next),
      packageEndKey: plan.membershipType === "package" ? domain.getPackageEndKey(next) : "",
      owes: domain.getOverdueAmount(next),
    };
  }

  const perMonth = (value) => currency(Math.round(value * 100) / 100);
  const before = domain.monthlyEquivalent(currentPlan);
  const after = restart || unchanged ? before : domain.monthlyEquivalent(plan);
  const status = domain.getMembershipStatus(member);
  const statusLine =
    status === "expired"
      ? `Expired · overdue since ${displayDate(domain.getDueDateKey(member))}`
      : `${MEMBERSHIP_STATUS_LABELS[status]} · renews ${displayDate(span.latest)}`;

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
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setBusy(true);
    try {
      await changePlan(member.id, {
        ...plan,
        effectiveDate,
        oldDues: unsettled.length ? oldDues : undefined,
        collectFirstTerm: collectFirst,
        mode,
        note: note.trim(),
        requestId: requestId.current,
        restart: restart || undefined,
      });
      closePlanDialog();
    } catch (error) {
      const message = error?.message || "Could not save. Check your connection and try again.";
      setFormError(message);
      showToast(message);
      setReviewing(false);
    } finally {
      setBusy(false);
    }
  };

  const typeCopy = TYPE_COPY[changeType];
  const title = restart ? "Restart membership" : "Change plan";

  return (
    <form className="sheet-panel" noValidate onSubmit={onSubmit}>
      <header className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        {reviewing ? (
          <button className="sheet-back" type="button" aria-label="Back to edit" disabled={busy} onClick={() => setReviewing(false)}>
            <Icon name="arrow_back" />
          </button>
        ) : null}
        <h2>{reviewing ? `Review · ${title.toLowerCase()}` : title}</h2>
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
            <small>{statusLine}</small>
          </div>
        </div>

        {reviewing ? (
          <ReviewCard
            {...{ restart, typeCopy, currentPlan, plan, effectiveDate, today, collectNow, collectedDues, firstTermAmount, kept, waived }}
            {...{ otherBalances, preview, unsettled, member, domain, perMonth, before, after, note }}
          />
        ) : (
          <>
            {restart ? (
              <p className="sheet-note">
                <Icon name="restart_alt" />
                Same plan, new cycle from the day {member.name.split(" ")[0]} starts again. Missed terms are not dropped
                silently: choose below whether to collect, keep or waive them.
              </p>
            ) : (
              <PlanFields
                {...{ membershipType, setMembershipType, isPackage, packageMonths, setPackageMonths, errors, fee, setFee }}
                {...{ collectionTiming, setCollectionTiming }}
              />
            )}

            {typeCopy && !restart ? (
              <p className={"plan-type is-" + changeType} aria-live="polite">
                <span className={"contact-tag plan-tag is-" + (changeType === "change" ? "same" : changeType)}>
                  <Icon name={typeCopy.icon} />
                  {typeCopy.label}
                </span>
                <small>
                  {perMonth(before)}/month → {perMonth(after)}/month
                  {changeType !== "change" ? ` (${after > before ? "+" : "−"}${perMonth(Math.abs(after - before))} a month)` : ""}
                </small>
              </p>
            ) : null}

            <section className="sheet-section">
              <div className="sheet-section-head">
                <h3>{restart ? "Starting again on" : "New plan starts"}</h3>
              </div>
              {isDowngrade ? (
                <p className="field-hint plan-fixed-date">
                  <strong>At the next renewal · {displayDate(span.latest)}</strong>
                  The current term runs to its end on the current plan. Nothing already paid is refunded or re-priced.
                </p>
              ) : (
                <>
                  <div className="segmented" role="radiogroup" aria-label={restart ? "Starting again on" : "New plan starts"}>
                    <label>
                      <input
                        type="radio"
                        name="planStart"
                        disabled={todayBlocked}
                        checked={startChoice === "today"}
                        onChange={() => setStartChoice("today")}
                      />
                      <span>{restart ? "Today" : "Now"}</span>
                    </label>
                    {!restart && span.latest > today ? (
                      <label>
                        <input
                          type="radio"
                          name="planStart"
                          checked={startChoice === "renewal"}
                          onChange={() => setStartChoice("renewal")}
                        />
                        <span>Renewal · {displayDate(span.latest).slice(0, 6)}</span>
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
                        min={span.earliest}
                        max={restart ? today : span.latest}
                        value={customDate}
                        onChange={(event) => setCustomDate(event.target.value)}
                        className={errors.date ? "has-error" : undefined}
                      />
                    </label>
                  ) : null}
                  <small className="field-hint">
                    {errors.date
                      ? errors.date
                      : restart
                        ? "A new cycle starts on this date at the current fee."
                        : startChoice === "renewal"
                          ? `The current plan runs until ${displayDate(span.latest)}, then the new plan begins.`
                          : "A new cycle starts on this date at the full new fee. Days left on a paid term are not credited."}
                  </small>
                </>
              )}
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
                  {[
                    ["collect", "Collect now"],
                    ["carry", "Keep as due"],
                    ["waive", "Waive"],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input type="radio" name="oldDues" checked={oldDues === value} onChange={() => setOldDues(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <small className="field-hint">{oldDues ? DUES_HINTS[oldDues] : "Choose one. Nothing is dropped without a choice."}</small>
              </section>
            ) : null}

            {canCollectFirst ? (
              <label className="plan-check">
                <input type="checkbox" checked={collectFirst} onChange={(event) => setFirstTermChoice(event.target.checked)} />
                <span>
                  <strong>Collect the first {plan.membershipType === "package" ? "package" : "term"} now</strong>
                  <small>
                    {plan.fee > 0 ? currency(plan.fee) : "₹0"} for the term starting {displayDate(effectiveDate)}
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
                placeholder={restart ? "e.g. Back after 2 months away" : "e.g. Switched to 6-month offer"}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </>
        )}

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>

      <footer className="sheet-foot">
        <button className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy || unchanged}>
          {busy
            ? "Saving..."
            : !reviewing
              ? "Review"
              : collectNow > 0
                ? `Confirm · collect ${currency(collectNow)}`
                : `Confirm ${restart ? "restart" : typeCopy?.label.toLowerCase() || "change"}`}
        </button>
      </footer>
    </form>
  );
}

function PlanFields({
  membershipType,
  setMembershipType,
  isPackage,
  packageMonths,
  setPackageMonths,
  errors,
  fee,
  setFee,
  collectionTiming,
  setCollectionTiming,
}) {
  return (
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
                <input type="radio" name="planType" checked={membershipType === value} onChange={() => setMembershipType(value)} />
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
  );
}

// The confirmation step: what changes, from when, and exactly what money moves.
function ReviewCard({
  restart,
  typeCopy,
  currentPlan,
  plan,
  effectiveDate,
  today,
  collectNow,
  collectedDues,
  firstTermAmount,
  kept,
  waived,
  otherBalances,
  preview,
  unsettled,
  member,
  domain,
  perMonth,
  before,
  after,
  note,
}) {
  return (
    <dl className="plan-summary plan-review">
      {typeCopy ? (
        <div>
          <dt>Type</dt>
          <dd>{typeCopy.label}</dd>
        </div>
      ) : null}
      {!restart ? (
        <div>
          <dt>Plan</dt>
          <dd>
            {planLabel(currentPlan)} · {currency(currentPlan.fee)} → {planLabel(plan)} · {currency(plan.fee)}
          </dd>
        </div>
      ) : (
        <div>
          <dt>Plan</dt>
          <dd>
            {planLabel(plan)} · {currency(plan.fee)} (unchanged)
          </dd>
        </div>
      )}
      {!restart && Math.round(before * 100) !== Math.round(after * 100) ? (
        <div>
          <dt>Per month</dt>
          <dd>
            {perMonth(before)} → {perMonth(after)}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>{restart ? "New cycle from" : "Takes effect"}</dt>
        <dd>
          {displayDate(effectiveDate)}
          {effectiveDate > today ? " (scheduled)" : ""}
        </dd>
      </div>
      <div>
        <dt>Recorded on</dt>
        <dd>{displayDate(today)}</dd>
      </div>
      {preview ? (
        <div>
          <dt>{preview.owes > 0 ? "Overdue after this" : preview.packageEndKey ? "Package ends on" : "Next due"}</dt>
          <dd className={preview.owes > 0 ? "is-due" : ""}>
            {preview.owes > 0 ? currency(preview.owes) : displayDate(preview.packageEndKey || preview.dueKey)}
          </dd>
        </div>
      ) : null}
      {collectedDues > 0 ? (
        <div>
          <dt>Old dues collected now</dt>
          <dd>{currency(collectedDues)}</dd>
        </div>
      ) : null}
      {firstTermAmount > 0 ? (
        <div>
          <dt>First term collected now</dt>
          <dd>{currency(firstTermAmount)}</dd>
        </div>
      ) : null}
      <div className="pay-summary-total">
        <dt>Collected now</dt>
        <dd>{currency(collectNow)}</dd>
      </div>
      {kept > 0 ? (
        <div>
          <dt>Kept as balance due</dt>
          <dd>{currency(kept)}</dd>
        </div>
      ) : null}
      {waived > 0 ? (
        <div>
          <dt>Waived</dt>
          <dd>{currency(waived)}</dd>
        </div>
      ) : null}
      {otherBalances > 0 ? (
        <div>
          <dt>Earlier balances (unchanged)</dt>
          <dd>{currency(otherBalances)}</dd>
        </div>
      ) : null}
      {unsettled.length ? (
        <div>
          <dt>Old-plan terms</dt>
          <dd>{unsettled.map((period) => domain.getBillingPeriodLabel(period, member)).join(", ")}</dd>
        </div>
      ) : null}
      {note.trim() ? (
        <div>
          <dt>Note</dt>
          <dd>{note.trim()}</dd>
        </div>
      ) : null}
      <p>
        <Icon name="history" />
        Earlier terms and payments stay as they are. The change is logged with who made it, in the membership history.
      </p>
    </dl>
  );
}
