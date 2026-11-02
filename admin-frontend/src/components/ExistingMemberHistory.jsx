import { currency, displayDate, todayKey } from "../lib/dates.js";
import { FEE_STATUS_LABELS } from "../lib/billing.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { TERM_WARNING_THRESHOLD, blankAnswer, openingCutover, previewMember, termRange } from "../lib/onboarding.js";
import Icon from "./Icon.jsx";

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
function PaidOn({ id, entry, min, onChange }) {
  return (
    <div className="mf-field history-paid-on">
      <label htmlFor={id}>Paid on</label>
      <input
        id={id}
        type="date"
        min={min}
        max={todayKey()}
        value={entry.date}
        disabled={entry.dateUnknown}
        onChange={(event) => onChange({ date: event.target.value })}
      />
      <label className="history-unknown">
        <input
          type="checkbox"
          checked={entry.dateUnknown}
          onChange={(event) => onChange({ dateUnknown: event.target.checked, date: event.target.checked ? "" : entry.date })}
        />
        Don&apos;t know the date
      </label>
    </div>
  );
}

function TermRow({ period, label, answer, fee, startDate, onChange }) {
  const id = "term-" + period;
  const balance = answer.paidInFull ? 0 : Math.max(0, Number(answer.termFee) - Number(answer.amount));
  return (
    <li className={"history-term" + (answer.status ? " is-" + answer.status : "")}>
      <div className="history-term-head">
        <strong>{label}</strong>
        <div className="segmented" role="radiogroup" aria-label={"Payment for " + label}>
          {["paid", "unpaid"].map((status) => (
            <label key={status}>
              <input
                type="radio"
                name={id}
                value={status}
                checked={answer.status === status}
                onChange={() => onChange({ status })}
              />
              <span>{status === "paid" ? "Paid" : "Unpaid"}</span>
            </label>
          ))}
        </div>
      </div>

      {answer.status === "paid" ? (
        <div className="history-term-body">
          <label className="mf-field">
            Amount received
            <span className="affix-input">
              <span className="affix">₹</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={answer.amount}
                onChange={(event) => onChange({ amount: event.target.value })}
              />
            </span>
          </label>
          <PaidOn id={id + "-date"} entry={answer} min={startDate} onChange={onChange} />
          <label className="mf-field">
            Paid by
            <ModeSelect id={id + "-mode"} value={answer.mode} onChange={(mode) => onChange({ mode })} />
          </label>
          <label className="plan-check history-full">
            <input
              type="checkbox"
              checked={answer.paidInFull}
              onChange={(event) => onChange({ paidInFull: event.target.checked })}
            />
            <span>
              <strong>Paid in full</strong>
              <small>
                {answer.paidInFull
                  ? "This term is settled at the amount received."
                  : "Untick only if part of this term is still owed."}
              </small>
            </span>
          </label>
          {answer.paidInFull ? null : (
            <label className="mf-field">
              Fee for this term
              <span className="affix-input">
                <span className="affix">₹</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={answer.termFee}
                  onChange={(event) => onChange({ termFee: event.target.value })}
                />
              </span>
              <small className="field-hint">
                {Number(answer.termFee) === Number(fee) ? `Using current plan fee ${currency(fee)}. ` : ""}
                {balance > 0 ? `${currency(balance)} stays as a balance due.` : ""}
              </small>
            </label>
          )}
        </div>
      ) : answer.status === "unpaid" ? (
        <small className="field-hint history-owed">Owed at current plan fee {currency(fee)}</small>
      ) : null}
    </li>
  );
}

/**
 * Past payments for a member who joined before being entered into GymBoo.
 * `member` is the form's member-to-be (joining date and plan); every term it
 * has started since joining must be answered, or one opening balance given.
 */
export default function ExistingMemberHistory({ member, terms, history, onChange, domain }) {
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
  const preview = previewMember({ member, terms, history, cutover });
  const paidTotal = preview.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = domain.getOutstandingAmount(preview);
  const status = domain.getFeeStatus(preview);

  return (
    <>
      <section className="sheet-section" aria-labelledby="historyHead">
        <div className="sheet-section-head">
          <h3 id="historyHead">Past payments</h3>
        </div>
        {terms.length ? (
          <>
            <small className="field-hint">
              {terms.length} {terms.length === 1 ? "term has" : "terms have"} started since joining on{" "}
              {displayDate(member.startDate)}. Mark what was paid; nothing is assumed.
            </small>
            <div className="segmented" role="radiogroup" aria-label="How to enter past payments">
              <label>
                <input
                  type="radio"
                  name="historyMethod"
                  checked={history.method === "periods"}
                  onChange={() => onChange({ ...history, method: "periods" })}
                />
                <span>Term by term</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="historyMethod"
                  checked={history.method === "opening"}
                  onChange={() => onChange({ ...history, method: "opening" })}
                />
                <span>Opening balance</span>
              </label>
            </div>

            {terms.length > TERM_WARNING_THRESHOLD ? (
              <div className="plan-dues history-warning" role="note">
                <div className="plan-dues-head">
                  <Icon name="info" />
                  <span>
                    <strong>{terms.length} terms is a long history</strong>
                    <small>Check the joining date is right before marking each term.</small>
                  </span>
                </div>
              </div>
            ) : null}

            {history.method === "periods" ? (
              <>
                <div className="history-bulk">
                  <button type="button" className="pay-mode" onClick={() => markAll("paid")}>
                    Mark all paid
                  </button>
                  <button type="button" className="pay-mode" onClick={() => markAll("unpaid")}>
                    Mark all unpaid
                  </button>
                </div>
                <ul className="history-terms">
                  {terms.map((period) => (
                    <TermRow
                      key={period}
                      period={period}
                      label={termRange(domain, member, period)}
                      answer={answerFor(period)}
                      fee={fee}
                      startDate={member.startDate}
                      onChange={(change) => setAnswer(period, change)}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <div className="mf-grid">
                <label className="mf-field">
                  Opening balance owed
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
                <label className="mf-field">
                  <span className="mf-label-row">
                    Of which admission fee
                    <em>Optional</em>
                  </span>
                  <span className="affix-input">
                    <span className="affix">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      value={history.openingAdmission}
                      onChange={(event) => onChange({ ...history, openingAdmission: event.target.value })}
                    />
                  </span>
                </label>
                <small className="field-hint wide">
                  Covers every term up to today, including the current one. Normal billing starts on{" "}
                  {displayDate(cutover)}. It shows as a balance due and never blocks check-in.
                </small>
              </div>
            )}
          </>
        ) : (
          <small className="field-hint">Enter the original joining date to list the terms since then.</small>
        )}
      </section>

      <section className="sheet-section" aria-labelledby="admissionHead">
        <div className="sheet-section-head">
          <h3 id="admissionHead">Admission fee</h3>
        </div>
        <label className="plan-check">
          <input type="checkbox" checked={history.admission.paid} onChange={(event) => setAdmission({ paid: event.target.checked })} />
          <span>
            <strong>Admission fee was paid</strong>
            <small>Leave unticked if they never paid one.</small>
          </span>
        </label>
        {history.admission.paid ? (
          <div className="history-term-body">
            <label className="mf-field">
              Amount paid
              <span className="affix-input">
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
            <PaidOn id="admissionPaidOn" entry={history.admission} min={member.startDate} onChange={setAdmission} />
            <label className="mf-field">
              Paid by
              <ModeSelect id="admissionModeSelect" value={history.admission.mode} onChange={(mode) => setAdmission({ mode })} />
            </label>
          </div>
        ) : null}
      </section>

      {terms.length ? (
        <section className="sheet-section" aria-labelledby="historySummaryHead">
          <div className="sheet-section-head">
            <h3 id="historySummaryHead">Summary</h3>
          </div>
          <dl className="plan-summary">
            <div>
              <dt>Original joining date</dt>
              <dd>{displayDate(member.startDate)}</dd>
            </div>
            <div>
              <dt>Registered in GymBoo</dt>
              <dd>{displayDate(todayKey())}</dd>
            </div>
            <div>
              <dt>Past terms</dt>
              <dd>{terms.length}</dd>
            </div>
            <div>
              <dt>Total paid</dt>
              <dd>{currency(paidTotal)}</dd>
            </div>
            <div>
              <dt>Outstanding</dt>
              <dd className={outstanding > 0 ? "is-due" : ""}>{currency(outstanding)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className={status === "overdue" ? "is-due" : ""}>{FEE_STATUS_LABELS[status]}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </>
  );
}
