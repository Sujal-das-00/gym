import { currency, displayDate } from "../lib/dates.js";

/**
 * One row of a member's payment history: what it paid for, when and how, and
 * the amount. A part payment also gets a "Part" tag, the period's full fee and
 * what is still due on it, worded the same in every list.
 */
export default function PaymentHistoryItem({ payment, member, domain }) {
  const partNotes = domain.getPartPaymentNotes(member, payment);
  return (
    <li>
      <span>
        <strong>
          {domain.getPaymentLabel(payment, member)}
          {partNotes.length ? <em className="pay-tag">Part</em> : null}
        </strong>
        <small>
          {[displayDate(String(payment.date || "").slice(0, 10)), domain.paymentModeLabel(payment.mode), ...partNotes]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
      <strong>{currency(payment.amount)}</strong>
    </li>
  );
}
