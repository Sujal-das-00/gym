import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { api } from "../lib/api.js";
import { currency, displayDate } from "../lib/dates.js";
import { DATE_NOT_RECORDED, collectionTimingLabel, paymentModeLabel } from "../lib/billing.js";
import { changeTimestamp, changedByLabel, planSummary } from "../lib/planChanges.js";

const TYPE_TITLES = {
  joined: "Joined",
  upgrade: "Upgraded",
  downgrade: "Downgraded",
  change: "Plan changed",
  restart: "Restarted",
};

const TERM_STATUS = {
  paid: { label: "Paid", pill: "paid" },
  part: { label: "Part paid", pill: "balance" },
  unpaid: { label: "Unpaid", pill: "pending" },
  kept: { label: "Kept as balance due", pill: "balance" },
  waived: { label: "Waived", pill: "neutral" },
  "not-billed": { label: "Not billed after the plan change", pill: "neutral" },
};

const TERM_STATE = { current: "Current term", ended: "Ended", scheduled: "Starts later" };

const NOTES = {
  "plan-log-started": "Plan changes made before 28 Oct 2026 weren't recorded, so the plan at joining is the earliest one on record.",
  "dues-not-itemised": "Some earlier plan changes recorded only dues totals, not the terms behind them.",
};

const termDates = (term) => `${displayDate(term.start)} – ${displayDate(term.lastDay)}`;

function renewalTitle(term) {
  if (term.status === "paid" || term.status === "part") return term.paidAhead ? "Renewed in advance" : "Renewed";
  if (term.status === "kept") return "Renewal kept as due";
  if (term.status === "waived" || term.status === "not-billed") return "Term not billed";
  if (term.state === "scheduled") return "Next renewal";
  return term.overdue ? "Renewal overdue" : "Renewal due";
}

function termPill(term) {
  if (term.status === "unpaid" && term.overdue) return { label: "Overdue", pill: "overdue" };
  return TERM_STATUS[term.status] || TERM_STATUS.unpaid;
}

const listTerms = (domain, member, terms) =>
  (terms || []).map((term) => domain.getBillingPeriodLabel(term.period, member)).join(", ");

/**
 * The member's membership history, oldest first: joining, each renewal (term),
 * and every plan change or restart, each expandable to its plans, dates,
 * price, payments and dues. Built by the server from the plan-change log and
 * payments (GET /api/members/:id/membership-history); refetched when the plan
 * or the member's payments change.
 */
export default function MembershipHistory({ member, domain, revision }) {
  const [state, setState] = useState({ memberId: "", data: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    api("/api/members/" + encodeURIComponent(member.id) + "/membership-history")
      .then((data) => !cancelled && setState({ memberId: member.id, data, failed: false }))
      .catch(() => !cancelled && setState({ memberId: member.id, data: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [member.id, revision]);

  const ready = state.memberId === member.id;
  const entries = ready && state.data ? state.data.entries : [];

  return (
    <details className="sheet-history membership-history">
      <summary>
        Membership history{entries.length ? ` · ${entries.length}` : ""}
        <Icon name="expand_more" />
      </summary>
      {!ready ? (
        <p className="member-empty">Loading…</p>
      ) : state.failed ? (
        <p className="member-empty">Could not load the membership history. Check your connection.</p>
      ) : (
        <>
          {state.data.notes.map((note) => (
            <p key={note} className="membership-note">
              <Icon name="info" />
              {NOTES[note] || note}
            </p>
          ))}
          <ol className="membership-entries">
            {entries.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} member={member} domain={domain} />
            ))}
          </ol>
        </>
      )}
    </details>
  );
}

function HistoryEntry({ entry, member, domain }) {
  const term = entry.term;
  const title = entry.type === "renewed" ? renewalTitle(term) : TYPE_TITLES[entry.type] || "Plan changed";
  const pill =
    entry.state === "replaced"
      ? { label: "Replaced", pill: "neutral" }
      : entry.state === "scheduled" && (!term || term.state === "scheduled") && !term?.paidAhead
        ? { label: "Scheduled", pill: "pending" }
        : term
          ? termPill(term)
          : null;
  const change = entry.change;
  const detail = change?.duesDetail;

  return (
    <li>
      <details>
        <summary>
          <span className="membership-date">{displayDate(entry.date)}</span>
          <span className="membership-title">
            <strong>{title}</strong>
            <small>{planSummary(entry.plan)}</small>
          </span>
          {pill ? <span className={"status-pill " + pill.pill}>{pill.label}</span> : null}
        </summary>
        <dl className="plan-summary membership-detail">
          {entry.previousPlan ? (
            <div>
              <dt>Previous plan</dt>
              <dd>
                {planSummary(entry.previousPlan)} · {collectionTimingLabel(entry.previousPlan.collectionTiming)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{entry.previousPlan ? "New plan" : "Plan"}</dt>
            <dd>
              {planSummary(entry.plan)} · {collectionTimingLabel(entry.plan.collectionTiming)}
            </dd>
          </div>
          <div>
            <dt>{entry.type === "joined" ? "Joined on" : entry.type === "renewed" ? "Term starts" : "Effective from"}</dt>
            <dd>{displayDate(entry.date)}</dd>
          </div>
          {term ? (
            <>
              <div>
                <dt>Term</dt>
                <dd>
                  {termDates(term)}
                  {term.cutShort ? " (ended early by a plan change)" : ""}
                </dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{displayDate(term.lastDay)}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{currency(term.fee)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>
                  {currency(term.paid)}
                  {term.balance > 0 ? ` · ${currency(term.balance)} due` : ""}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {termPill(term).label} · {TERM_STATE[term.state]}
                </dd>
              </div>
            </>
          ) : null}
          {entry.joined?.onboardingType === "existing" ? (
            <div>
              <dt>Added to GymBoo</dt>
              <dd>{entry.joined.registeredAt ? displayDate(entry.joined.registeredAt.slice(0, 10)) : "—"}</dd>
            </div>
          ) : null}
          {entry.joined?.billingCutover ? (
            <div>
              <dt>Opening balance</dt>
              <dd>
                {currency(entry.joined.openingBalance)} · billing from {displayDate(entry.joined.billingCutover)}
              </dd>
            </div>
          ) : null}
          {change ? (
            <>
              <div>
                <dt>Recorded</dt>
                <dd>{[changeTimestamp({ changedAt: change.recordedAt }), changedByLabel({ changedBy: change.by })].filter(Boolean).join(" ")}</dd>
              </div>
              {change.duesCollected > 0 ? (
                <div>
                  <dt>Old dues collected</dt>
                  <dd>
                    {currency(change.duesCollected)}
                    {detail?.collected?.length ? ` · ${listTerms(domain, member, detail.collected)}` : ""}
                  </dd>
                </div>
              ) : null}
              {change.duesCarried > 0 ? (
                <div>
                  <dt>Kept as balance due</dt>
                  <dd>
                    {currency(change.duesCarried)}
                    {detail?.carried?.length ? ` · ${listTerms(domain, member, detail.carried)}` : ""}
                  </dd>
                </div>
              ) : null}
              {change.duesWaived > 0 ? (
                <div>
                  <dt>Waived</dt>
                  <dd>
                    {currency(change.duesWaived)}
                    {detail?.waived?.length ? ` · ${listTerms(domain, member, detail.waived)}` : ""}
                  </dd>
                </div>
              ) : null}
              {change.firstTermCollected > 0 ? (
                <div>
                  <dt>First term collected</dt>
                  <dd>{currency(change.firstTermCollected)}</dd>
                </div>
              ) : null}
              {change.note ? (
                <div>
                  <dt>Note</dt>
                  <dd>{change.note}</dd>
                </div>
              ) : null}
              {entry.state === "replaced" ? (
                <p>
                  <Icon name="info" />
                  Replaced by a later change before it started.
                </p>
              ) : null}
            </>
          ) : null}
          {term?.payments?.length ? (
            <div className="membership-payments">
              <dt>Payments</dt>
              <dd>
                {term.payments.map((payment) => (
                  <span key={payment.transactionId + payment.amount}>
                    {currency(payment.amount)} · {payment.dateKnown ? displayDate(payment.date) : DATE_NOT_RECORDED} ·{" "}
                    {paymentModeLabel(payment.mode)}
                    {payment.reference ? ` · Ref ${payment.reference}` : ""}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </details>
    </li>
  );
}
