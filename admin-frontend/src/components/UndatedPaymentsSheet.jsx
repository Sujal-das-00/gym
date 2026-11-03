import { useState } from "react";
import Dialog from "./Dialog.jsx";
import Icon from "./Icon.jsx";
import { currency, displayDate } from "../lib/dates.js";
import { CATEGORY_ICONS } from "../lib/constants.js";

/**
 * Every payment taken without a recorded collection date. Those are filed on
 * the start of the term they paid, so the money shows in that month even if it
 * was collected later; this lists them so the admin can see what is affected.
 */
export default function UndatedPaymentsSheet({ open, onClose, inPeriod, overall, periodLabel, onOpenMember }) {
  const [scope, setScope] = useState("period");
  const rows = scope === "period" ? inPeriod : overall;
  const total = rows.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Dialog className="sheet" open={open} onClose={onClose}>
      {open ? (
        <div className="sheet-panel">
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <h2>Payments without a date</h2>
            <button className="sheet-close" aria-label="Close" type="button" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>

          <div className="sheet-body">
            <div className="segmented" role="radiogroup" aria-label="Which payments to list">
              {[
                ["period", periodLabel, inPeriod.length],
                ["all", "All time", overall.length],
              ].map(([value, label, count]) => (
                <label key={value}>
                  <input type="radio" name="undatedScope" value={value} checked={scope === value} onChange={() => setScope(value)} />
                  <span>
                    {label} · {count}
                  </span>
                </label>
              ))}
            </div>

            <div className="plan-dues undated-note" role="note">
              <div className="plan-dues-head">
                <Icon name="info" />
                <span>
                  <strong>
                    {rows.length} {rows.length === 1 ? "payment" : "payments"} · {currency(total)}
                  </strong>
                  <small>
                    The admin didn&apos;t know when these were collected, so each is counted on the first day of the period it paid for.
                  </small>
                </span>
              </div>
            </div>

            <section className="contact-group">
              {rows.length ? (
                <ul className="contact-list">
                  {rows.map((entry) => (
                    <li key={entry.id}>
                      <button type="button" className="contact-row no-dot ledger-entry is-in" onClick={() => onOpenMember(entry.memberId)}>
                        <span className="ledger-tile" aria-hidden="true">
                          <Icon name={CATEGORY_ICONS[entry.category] || "receipt_long"} />
                        </span>
                        <span className="contact-copy">
                          <strong>
                            <span className="contact-name">{entry.title}</span>
                          </strong>
                          <small>{entry.detail}</small>
                          <small>Counted on {displayDate(entry.date)}</small>
                        </span>
                        <span className="contact-state">
                          <strong className="ledger-amount">+{currency(entry.amount)}</strong>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="member-empty">Every payment here has a recorded date.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
