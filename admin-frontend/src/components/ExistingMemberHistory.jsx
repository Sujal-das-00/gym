import { currency, displayDate, todayKey } from "../lib/dates.js";
import { FEE_STATUS_LABELS, collectionTimingLabel } from "../lib/billing.js";
import ReviewCard from "./ReviewCard.jsx";
import { PAYMENT_MODES } from "../lib/constants.js";
import { TERM_WARNING_THRESHOLD, blankAnswer, joiningDateProblem, openingCutover, previewMember, termRange } from "../lib/onboarding.js";
import Icon from "./Icon.jsx";
import OptionCards from "./OptionCards.jsx";

function ModeSelect({ id, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Method not recorded</option>
      {PAYMENT_MODES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// "Paid on" with a "Don't know the date" escape: an unknown date is reported
// in the term's month and labelled, never filled in with today.
function PaidOn({ id, entry, min, onChange, defaultDate = "" }) {
  return (
    <div className="mf-field history-paid-on">
      <label htmlFor={id}>Paid on</label>
      <input
        id={id}
        type="date"
        min={min}
        max={todayKey()}
        value={entry.date || defaultDate}
        disabled={entry.dateUnknown}
        onChange={(event) => onChange({ date: event.target.value })}
      />
      {defaultDate ? null : (
        <label className="history-unknown">
          <input
            type="checkbox"
            checked={entry.dateUnknown}
            onChange={(event) => onChange({ dateUnknown: event.target.checked, date: event.target.checked ? "" : entry.date })}
          />
          Don&apos;t know the date
        </label>
      )}
    </div>
  );
}

// Typed amounts can't go above the monthly fee.
const clampToFee = (value, fee) => (fee > 0 && Number(value) > fee ? String(fee) : value);

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];

// "First month payment", "Second month payment", ... ("13th month payment" after the twelfth).
function paymentTitle(index, unit) {
  const number = index + 1;
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${ORDINALS[index] || number + suffix} ${unit} payment`;
}

// Paid / Unpaid as two real buttons: green when paid, red when unpaid.
function StatusButtons({ value, label, onChange }) {
  return (
    <div className="hist-status" role="radiogroup" aria-label={label}>
      {[
        ["paid", "check", "Paid"],
        ["unpaid", "close", "Unpaid"],
      ].map(([status, icon, text]) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={value === status}
          className={"hist-status-btn is-" + status + (value === status ? " is-on" : "")}
          onClick={() => onChange(status)}
        >
          <Icon name={icon} />
          {text}
        </button>
      ))}
    </div>
  );
}

function TermRow({ period, title, label, answer, fee, startDate, onChange, missing }) {
  const id = "term-" + period;
  const balance = Math.max(0, fee - (Number(answer.amount) || 0));
  return (
    <li className={"history-term" + (answer.status ? " is-" + answer.status : "") + (missing ? " is-missing" : "")}>
      <div className="history-term-head">
        <span className="history-term-title">
          <strong>{title}</strong>
          <small>{label}</small>
        </span>
        <StatusButtons value={answer.status} label={`${title}, ${label}`} onChange={(status) => onChange({ status })} />
      </div>

      {answer.status === "paid" ? (
        <div className="history-term-body">
          <label className="mf-field">
            Amount received
            <span className={"affix-input" + (missing && !(Number(answer.amount) > 0) ? " has-error" : "")}>
              <span className="affix">₹</span>
              <input
                type="number"
                min="1"
                max={fee || undefined}
                step="1"
                inputMode="numeric"
                value={answer.amount}
                onChange={(event) => onChange({ amount: clampToFee(event.target.value, fee) })}
              />
            </span>
            <small className={"field-hint" + (balance > 0 ? " is-due" : "")}>
              {balance > 0
                ? `${currency(balance)} of the ${currency(fee)} fee stays as a balance due.`
                : `Fully paid (${currency(fee)}).`}
            </small>
          </label>
          <PaidOn id={id + "-date"} entry={answer} min={startDate} onChange={onChange} />
          <label className="mf-field history-full">
            Paid by
            <ModeSelect id={id + "-mode"} value={answer.mode} onChange={(mode) => onChange({ mode })} />
          </label>
        </div>
      ) : answer.status === "unpaid" ? (
        <small className="history-owed">
          <Icon name="error" />
          Owed at the current fee, {currency(fee)}
        </small>
      ) : missing ? (
        <small className="field-error">Mark this payment as paid or unpaid.</small>
      ) : null}
    </li>
  );
}

/**
 * Past payments for a member who joined before being entered into GymBoo.
 * `member` is the form's member-to-be (joining date and plan); every term it
 * has started since joining must be answered, or one opening balance given.
 */
export default function ExistingMemberHistory({ member, terms, history, onChange, domain, showErrors = false }) {
  const fee = Number(member.fee) || 0;
  const answerFor = (period) => history.answers[period] || blankAnswer(fee);
  const setAnswer = (period, change) =>
    onChange({ ...history, answers: { ...history.answers, [period]: { ...answerFor(period), ...change } } });
  const markAll = (status) =>
    onChange({
      ...history,
      answers: Object.fromEntries(terms.map((period) => [period, { ...answerFor(period), status }])),
    });
  const setAdmission = (change) => onChange({ ...history, admission: { ...history.admission, ...change } });

  const cutover = terms.length ? openingCutover(domain, member) : "";

  return (
    <>
      <section className="sheet-section" aria-labelledby="historyHead">
        <div className="sheet-section-head">
          <h3 id="historyHead">Past payments</h3>
        </div>
        {terms.length ? (
          <>
            <small className="field-hint">
              {terms.length} {terms.length === 1 ? "payment is" : "payments are"} due since joining on{" "}
              {displayDate(member.startDate)}. Mark what was paid.
            </small>
            <OptionCards
              name="historyMethod"
              label="How to enter past payments"
              value={history.method}
              onChange={(method) => onChange({ ...history, method })}
              options={[
                { key: "periods", icon: "calendar_view_month", title: `Mark each ${domain.getPeriodUnitLabel(member)} paid or unpaid` },
                { key: "opening", icon: "functions", title: "Enter the total amount due" },
              ]}
            />

            {terms.length > TERM_WARNING_THRESHOLD ? (
              <div className="plan-dues history-warning" role="note">
                <div className="plan-dues-head">
                  <Icon name="info" />
                  <span>
                    <strong>{terms.length} terms is a long history</strong>
                    <small>Check the joining date is right before marking each payment.</small>
                  </span>
                </div>
              </div>
            ) : null}

            {history.method === "periods" ? (
              <>
                <div className="history-bulk">
                  <span>{terms.filter((period) => history.answers[period]?.status).length} of {terms.length} marked</span>
                  <button type="button" className="history-bulk-btn" onClick={() => markAll("paid")}>
                    <Icon name="done_all" />
                    All paid
                  </button>
                  <button type="button" className="history-bulk-btn" onClick={() => markAll("unpaid")}>
                    <Icon name="remove_done" />
                    All unpaid
                  </button>
                </div>
                <ul className="history-terms">
                  {terms.map((period, index) => (
                    <TermRow
                      key={period}
                      period={period}
                      title={paymentTitle(index, domain.getPeriodUnitLabel(member))}
                      label={termRange(domain, member, period)}
                      answer={answerFor(period)}
                      fee={fee}
                      startDate={member.startDate}
                      onChange={(change) => setAnswer(period, change)}
                      missing={showErrors && (!history.answers[period]?.status || (history.answers[period].status === "paid" && !(Number(history.answers[period].amount) > 0)))}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <div className="mf-grid">
                <label className="mf-field wide">
                  Total due amount
                  <span className="affix-input">
                    <span className="affix">₹</span>
                    <input
                      id="openingBalanceInput"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      value={history.openingBalance}
                      onChange={(event) => onChange({ ...history, openingBalance: event.target.value })}
                    />
                  </span>
                </label>
                <small className="field-hint wide">
                  Covers every payment up to today, including the current one. Normal billing starts on{" "}
                  {displayDate(cutover)}. It shows as a balance due and never blocks check-in.
                </small>
              </div>
            )}
          </>
        ) : (
          <small className="field-hint">
            {member.startDate && !joiningDateProblem(member.startDate)
              ? `No payment has fallen due since joining on ${displayDate(member.startDate)}, so there is nothing to collect yet. The first payment is due on ${displayDate(domain.getDueDateKey(member))}.`
              : "Enter the original joining date to list the payments since then."}
          </small>
        )}
      </section>

      <section className="sheet-section" aria-labelledby="admissionHead">
        <div className="sheet-section-head">
          <h3 id="admissionHead">Admission fee</h3>
        </div>
        <OptionCards
          name="admissionPaid"
          label="Was an admission fee paid?"
          value={history.admission.paid === null || history.admission.paid === undefined ? null : history.admission.paid ? "yes" : "no"}
          onChange={(value) => setAdmission({ paid: value === "yes" })}
          options={[
            { key: "yes", icon: "receipt_long", title: "Admission fee was paid" },
            { key: "no", icon: "block", title: "No admission fee" },
          ]}
          invalid={showErrors && (history.admission.paid === null || history.admission.paid === undefined)}
        />
        {history.admission.paid ? (
          <div className="history-term is-paid history-term-body">
            <label className="mf-field">
              Amount paid
              <span className={"affix-input" + (showErrors && !(Number(history.admission.amount) > 0) ? " has-error" : "")}>
                <span className="affix">₹</span>
                <input
                  id="admissionFeeInput"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={history.admission.amount}
                  onChange={(event) => setAdmission({ amount: event.target.value })}
                />
              </span>
            </label>
            <PaidOn
              id="admissionPaidOn"
              entry={history.admission}
              min={member.startDate}
              onChange={setAdmission}
              defaultDate={member.startDate}
            />
            <label className="mf-field history-full">
              Paid by
              <ModeSelect id="admissionModeSelect" value={history.admission.mode} onChange={(mode) => setAdmission({ mode })} />
            </label>
          </div>
        ) : null}
      </section>

    </>
  );
}

/**
 * The last step of adding an existing member: everything entered, and what it
 * adds up to (paid, still owed, status), before anything is saved.
 * `person` is { name, phone, trainer } from the first screen.
 */
export function ExistingMemberReview({ member, terms, history, domain, person }) {
  const cutover = terms.length ? openingCutover(domain, member) : "";
  const preview = previewMember({ member, terms, history, cutover });
  const paidTotal = preview.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = domain.getOutstandingAmount(preview);
  const status = domain.getFeeStatus(preview);
  const answered = terms.map((period) => history.answers[period]?.status);
  const admission = history.admission;

  return (
    <ReviewCard
      title="Review before adding"
      subtitle="Check everything, then add the member."
      rows={[
        { label: "Member", value: person.name, hint: person.phone },
        { label: "Plan", value: domain.getMembershipLabel(member), hint: `${currency(member.fee)} · ${collectionTimingLabel(member.collectionTiming)}` },
        { label: "Trainer", value: person.trainer || "No trainer" },
        { label: "Original joining date", value: displayDate(member.startDate) },
        { label: "Registered in GymBoo", value: displayDate(todayKey()) },
        {
          label: "Past payments",
          value:
            history.method === "opening"
              ? `Owes ${currency(Number(history.openingBalance) || 0)} in total`
              : terms.length
                ? `${answered.filter((value) => value === "paid").length} paid · ${answered.filter((value) => value === "unpaid").length} unpaid`
                : "No payment is due yet",
          hint: history.method === "opening" ? `Normal billing starts ${displayDate(cutover)}` : terms.length ? `${terms.length} past ${terms.length === 1 ? "payment" : "payments"}` : "",
        },
        {
          label: "Admission fee",
          value: admission.paid && Number(admission.amount) > 0 ? currency(Number(admission.amount)) : "None paid",
          hint: admission.paid ? (admission.date ? `Paid ${displayDate(admission.date)}` : `Dated on joining, ${displayDate(member.startDate)}`) : "",
        },
        { label: "Outstanding", value: currency(outstanding), tone: outstanding > 0 ? "due" : "" },
        { label: "Status", value: FEE_STATUS_LABELS[status], tone: status === "overdue" ? "due" : "" },
      ]}
      total={{ label: "Total already paid", value: currency(paidTotal) }}
      notes={["These past payments are saved as history. No money is received today."]}
    />
  );
}
