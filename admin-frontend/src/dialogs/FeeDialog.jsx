import { useEffect, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import PaymentHistoryItem from "../components/PaymentHistoryItem.jsx";
import PaymentFields from "../components/PaymentFields.jsx";
import { currency } from "../lib/dates.js";
import { FEE_STATUS_LABELS } from "../lib/billing.js";
import { allocationLines, blankPaymentDraft, outstandingDebts, paymentBody, paymentHistory, paymentProblem } from "../lib/payments.js";

const HISTORY_LIMIT = 6;

/**
 * "Record payment": how much was received, when, how, and where it goes —
 * the oldest debt first by default (the opening balance, then the oldest
 * term), or the terms the admin picks. A bottom sheet on phones, a centred
 * card on desktop. The summary is the confirmation step.
 *
 * Every open gets a fresh request id, so a double tap or a retry after a
 * dropped connection returns the first recording instead of a second one.
 */
export default function FeeDialog() {
  const { closeFeeDialog, members, domain, recordPayment, showToast } = useApp();
  const { feeDialog } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(() => blankPaymentDraft());
  const requestId = useRef("");

  const member = members.find((item) => item.id === feeDialog.memberId);
  const debts = outstandingDebts(domain, member);
  const owedTotal = debts.reduce((sum, debt) => sum + debt.balance, 0);

  useEffect(() => {
    if (!feeDialog.open) return;
    requestId.current = crypto.randomUUID();
    setDraft(blankPaymentDraft(owedTotal || ""));
    // Only when the sheet opens for a member, not on every balance change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeDialog.open, feeDialog.memberId]);

  const status = member ? domain.getFeeStatus(member) : "";
  const history = member ? paymentHistory(member).slice(0, HISTORY_LIMIT) : [];
  const problem = member ? paymentProblem({ debts, draft, startDate: member.startDate }) : "";
  const lines = allocationLines({ debts, draft });
  const received = lines.reduce((sum, line) => sum + line.pay, 0);
  const left = Math.max(0, Math.round((owedTotal - received) * 100) / 100);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!member || problem || busy) return;
    setBusy(true);
    try {
      await recordPayment(member, paymentBody({ debts, draft, requestId: requestId.current }));
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="sheet" id="feeDialog" open={feeDialog.open} onClose={closeFeeDialog}>
      {member ? (
        <form className="sheet-panel" id="feeCollectionForm" method="dialog" onSubmit={onSubmit}>
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <h2 id="feeDialogTitle">Record payment</h2>
            <button className="sheet-close" id="closeFeeDialog" aria-label="Close" type="button" onClick={closeFeeDialog}>
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
                <small>{[member.phone, domain.getMembershipLabel(member)].filter(Boolean).join(" · ")}</small>
              </div>
              <span className={"status-pill " + status}>{FEE_STATUS_LABELS[status]}</span>
            </div>

            {debts.length ? (
              <>
                <p className={"pay-owed" + (domain.isOverdue(member) ? " is-due" : "")}>
                  <span>Total owed</span>
                  <strong>{currency(owedTotal)}</strong>
                </p>
                <PaymentFields member={member} debts={debts} draft={draft} onChange={setDraft} domain={domain} />
                {lines.length ? (
                  <section className="pay-summary-card" aria-label="Summary">
                    <h3>Summary</h3>
                    <dl>
                      <div className="pay-summary-total">
                        <dt>Received</dt>
                        <dd id="feeSelectedTotal">{currency(received)}</dd>
                      </div>
                      <div>
                        <dt>Still owed after this</dt>
                        <dd>{currency(left)}</dd>
                      </div>
                    </dl>
                  </section>
                ) : null}
                {problem ? (
                  <p className="pay-hint is-error" role="status">
                    {problem}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="sheet-note">
                <Icon name="check_circle" />
                Nothing is owed right now. Advance payments can&apos;t be recorded.
              </p>
            )}

            {history.length ? (
              <details className="sheet-history" open={!debts.length}>
                <summary>
                  Payment history
                  <Icon name="expand_more" />
                </summary>
                <ul>
                  {history.map((entry) => (
                    <PaymentHistoryItem key={entry.id} entry={entry} member={member} domain={domain} />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          {debts.length ? (
            <footer className="sheet-foot">
              <button
                className={"sheet-confirm" + (busy ? " is-busy" : "")}
                id="confirmFeeCollection"
                type="submit"
                disabled={Boolean(problem) || busy}
              >
                {busy ? "Recording…" : owedTotal === 0 ? "Mark as done (no fee)" : `Record ${currency(received)}`}
              </button>
            </footer>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  );
}
