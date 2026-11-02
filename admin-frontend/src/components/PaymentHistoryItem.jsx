import { currency, displayDate, localDateKey } from "../lib/dates.js";
import { DATE_NOT_RECORDED } from "../lib/billing.js";
import { useApp } from "../store/AppContext.jsx";
import Icon from "./Icon.jsx";

/**
 * One row of a member's payment history (see paymentHistory()): a payment —
 * what it paid for, when and how, and the amount — or the admission fee.
 *
 * A part payment gets a "Part" tag with the term's full fee and what is still
 * due. A reversed payment stays listed, struck through with who reversed it
 * and why; a corrected one points to its replacement. Owners get a menu to
 * edit, correct or reverse an active payment.
 */
export default function PaymentHistoryItem({ entry, member, domain }) {
  const { canManagePayments, openPaymentAction } = useApp();
  const tx = entry.transaction;

  if (!tx) {
    const payment = entry.payment;
    const partNotes = domain.getPartPaymentNotes(member, payment);
    return (
      <li>
        <span>
          <strong>
            {domain.getPaymentLabel(payment, member)}
            {partNotes.length ? <em className="pay-tag">Part</em> : null}
          </strong>
          <small>
            {[domain.getPaymentDateLabel(payment), domain.paymentModeLabel(payment.mode), ...partNotes].filter(Boolean).join(" · ")}
          </small>
        </span>
        <strong>{currency(payment.amount)}</strong>
      </li>
    );
  }

  const reversed = tx.status === "reversed";
  const terms = tx.allocations.map((allocation) => domain.getBillingPeriodLabel(allocation.billingPeriod, member)).join(", ");
  const single = tx.allocations.length === 1 ? tx.allocations[0] : null;
  const part = single && single.periodFee !== null && single.amount < single.periodFee;
  const when = tx.reversedAt ? displayDate(localDateKey(new Date(tx.reversedAt))) : "";
  const details = [
    tx.dateKnown ? displayDate(tx.date) : DATE_NOT_RECORDED,
    domain.paymentModeLabel(tx.mode),
    tx.reference,
    part ? `of ${currency(single.periodFee)}` : "",
  ].filter(Boolean);

  return (
    <li className={reversed ? "is-reversed" : ""}>
      <span>
        <strong>
          {terms || "Payment"}
          {part ? <em className="pay-tag">Part</em> : null}
          {reversed ? <em className="pay-tag is-reversed">{tx.replacedById ? "Corrected" : "Reversed"}</em> : null}
          {tx.replacesId ? <em className="pay-tag">Correction</em> : null}
        </strong>
        <small>{details.join(" · ")}</small>
        {tx.note ? <small className="pay-note">{tx.note}</small> : null}
        {reversed ? (
          <small className="pay-reversal">
            {tx.replacedById ? "Replaced" : "Reversed"}
            {tx.reversedBy?.name ? ` by ${tx.reversedBy.name}` : ""}
            {when ? ` on ${when}` : ""}
            {tx.reversalReason ? `: ${tx.reversalReason}` : ""}
          </small>
        ) : null}
      </span>
      <strong className={reversed ? "is-struck" : ""}>{currency(tx.amount)}</strong>
      {canManagePayments && !reversed ? (
        <button
          type="button"
          className="pay-row-menu"
          aria-label={`Edit, correct or reverse the ${currency(tx.amount)} payment`}
          onClick={() => openPaymentAction(member.id, tx.id)}
        >
          <Icon name="more_vert" />
        </button>
      ) : null}
    </li>
  );
}
