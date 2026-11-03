/**
 * The last look before a payment is recorded: what was entered, line by line,
 * and what will be received. The same card closes every payment flow (collect
 * payment, other payment, plan change, member onboarding).
 *
 * rows:   [{ label, value, hint?, tone? }]   tone "due" paints the value red
 * total:  { label, value }                   the highlighted last line
 * notes:  [string]                           small print under the card
 */
export default function ReviewCard({ title = "Review", subtitle = "Check everything, then record it.", rows, total, notes = [] }) {
  return (
    <section className="pay-summary-card review-card" aria-label={title}>
      <h3>{title}</h3>
      {subtitle ? <p className="review-sub">{subtitle}</p> : null}
      <dl>
        {rows.map((row) => (
          <div key={row.label} className={row.skipped ? "is-skipped" : ""}>
            <dt>{row.label}</dt>
            <dd className={row.tone === "due" ? "is-due" : ""}>
              {row.value}
              {row.hint ? <small>{row.hint}</small> : null}
            </dd>
          </div>
        ))}
        {total ? (
          <div className="pay-summary-total">
            <dt>{total.label}</dt>
            <dd>{total.value}</dd>
          </div>
        ) : null}
      </dl>
      {notes.filter(Boolean).map((note) => (
        <p key={note} className="pay-hint">
          {note}
        </p>
      ))}
    </section>
  );
}
