import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";
import { currency, displayDate } from "../lib/dates.js";

const PLAN_LABEL = { lifetime: "Lifetime License", monthly: "Monthly Subscription" };
const STATUS_LABEL = { paid: "Paid", verifying: "Verifying", rejected: "Rejected" };
const MAINT_COPY = {
  upcoming: "Upcoming",
  due: "Plan expired, pay now",
  overdue: "Account on hold",
};

function planOf(access) {
  if (access.phase === "licensed") return PLAN_LABEL[access.licence] || "Licensed";
  if (access.phase === "trial") return "Free Plan";
  if (access.phase === "grace") return "Pending Verification";
  return access.phase === "suspended" ? "Suspended" : "Trial Ended";
}

function dueText(m) {
  const days = m.daysUntilDue;
  if (m.status === "overdue") return `${-days} day${days === -1 ? "" : "s"} past the due date`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} to go`;
}

// "Plan & Billing": the owner's plan, the yearly server & maintenance fee, and every
// payment they have made to us. Read-only; payments are recorded by us after they clear.
export default function PlanBillingView() {
  const { user, activeView } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // Re-fetch each time the tab is opened so a payment we just recorded shows up.
  useEffect(() => {
    if (!user || activeView !== "plan" || user.role === "staff") return;
    let alive = true;
    api("/api/billing")
      .then((d) => alive && (setData(d), setError("")))
      .catch((e) => alive && setError(e.message || "Could not load billing"));
    return () => {
      alive = false;
    };
  }, [user, activeView]);

  if (error) return <section className="panel"><p className="plan-note">{error}</p></section>;
  if (!data) return <section className="panel"><p className="plan-note">Loading…</p></section>;

  const { access, maintenance: m, history, totalPaid } = data;
  const trial = access.phase === "trial";

  return (
    <div className="plan-billing">
      <div className="plan-cards">
        <article className="plan-card">
          <span>Current plan</span>
          <strong>{planOf(access)}</strong>
          <small>
            {trial
              ? `${access.daysLeft} day${access.daysLeft === 1 ? "" : "s"} left in your free plan`
              : access.phase === "licensed"
                ? access.licence === "lifetime"
                  ? "One-time license, no renewal"
                  : "Billed monthly"
                : "Choose a plan to continue"}
          </small>
          {access.phase !== "licensed" ? <a className="plan-link" href="/plans">Choose a plan</a> : null}
        </article>

        <article className={"plan-card maint " + (m.applicable ? m.status : "na")}>
          <span>Server &amp; maintenance</span>
          {m.applicable ? (
            <>
              <strong>{currency(m.amount)} <em>/ year</em></strong>
              <small>
                Pay {m.customDate ? `${displayDate(m.windowStart)} to ${displayDate(m.dueBy)}` : `between ${displayDate(m.windowStart)} and ${displayDate(m.dueBy)}`}
              </small>
              <b className="maint-pill">{MAINT_COPY[m.status]} · {dueText(m)}</b>
            </>
          ) : (
            <>
              <strong>Not applicable</strong>
              <small>
                {access.licence === "monthly"
                  ? "Hosting is included in your monthly subscription."
                  : "Applies once you hold the Lifetime License."}
              </small>
            </>
          )}
        </article>

        <article className="plan-card">
          <span>Total paid to us</span>
          <strong>{currency(totalPaid)}</strong>
          <small>{m.applicable && m.lastPaidOn ? `Last maintenance payment ${displayDate(m.lastPaidOn)}` : `${history.filter((h) => h.status === "paid").length} payment(s)`}</small>
        </article>
      </div>

      <section className="panel">
        <div className="panel-head"><h3 className="subhead">Payment history</h3></div>
        {history.length ? (
          <div className="plan-table-wrap">
            <table className="plan-table">
              <thead>
                <tr><th>Date</th><th>For</th><th>Reference</th><th className="num">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.kind + h.id}>
                    <td>{displayDate(h.date)}</td>
                    <td>{h.title}</td>
                    <td>{h.ref || (h.mode ? h.mode.toUpperCase() : "—")}</td>
                    <td className="num">{currency(h.amount)}</td>
                    <td><span className={"plan-status " + h.status}>{STATUS_LABEL[h.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="plan-note">No payments yet. They appear here once we confirm them.</p>
        )}
        <p className="plan-note">Questions about a payment? Write to {data.supportEmail}.</p>
      </section>
    </div>
  );
}
