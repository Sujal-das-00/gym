import { currency } from "../lib/dates.js";

/**
 * One row of a member's payment history: what it paid for, when and how, and
 * the amount. A part payment also gets a "Part" tag, the period's full fee and
 * what is still due on it, worded the same in every list.
 */
export default function PaymentHistoryItem({ payment, member, domain }) {
  const partNotes = domain.getPartPaymentNotes(member, payment);
  const extra = domain.isExtraPayment(payment);
  return (
    <li>
      <span>
        <strong>
          {domain.getPaymentLabel(payment, member)}
          {partNotes.length ? <em className="pay-tag">Part</em> : null}
          {extra ? <em className="pay-tag">Extra</em> : null}
        </strong>
        <small>
          {[domain.getPaymentDateLabel(payment), domain.paymentModeLabel(payment.mode), ...partNotes]
            .filter(Boolean)
            .join(" · ")}
        </small>
        {extra && payment.note ? <small className="pay-note">“{payment.note}”</small> : null}
      </span>
      <strong>{currency(payment.amount)}</strong>
    </li>
  );
}
