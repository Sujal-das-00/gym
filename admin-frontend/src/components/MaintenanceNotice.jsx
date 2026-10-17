import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";
import { currency, displayDate } from "../lib/dates.js";

// Yearly server & maintenance fee. From day one the owner sees "plan expired, pay by <date>"
// (a banner); once that date has passed the account is on hold and a full-screen notice
// takes over. Only the owner sees it: staff can't pay, and the billing API is owner-only.
export default function MaintenanceNotice() {
  const { user, setView } = useApp();
  const [billing, setBilling] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "gym_admin") return;
    let alive = true;
    const load = () =>
      api("/api/billing")
        .then((d) => alive && (setBilling(d), setLocked(Boolean(d.maintenance.locked))))
        .catch(() => {});
    load();
    const onLocked = () => (setLocked(true), load());
    window.addEventListener("gymboo:maintenance-locked", onLocked);
    return () => {
      alive = false;
      window.removeEventListener("gymboo:maintenance-locked", onLocked);
    };
  }, [user]);

  const m = billing && billing.maintenance;
  if (!m || !m.applicable) return null;

  if (locked) {
    return (
      <div className="maint-lock" role="alertdialog" aria-modal="true">
        <div className="maint-lock-card">
          <h2>Your plan has expired</h2>
          <p>
            The yearly server &amp; maintenance fee of <strong>{currency(m.amount)}</strong> was due by{" "}
            <strong>{displayDate(m.dueBy)}</strong>. Your account is on hold and all your data is safe. It reopens as soon as we
            record your payment.
          </p>
          {billing.upi ? (
            <p className="maint-pay">
              Pay <strong>{currency(m.amount)}</strong> to UPI <strong>{billing.upi.id}</strong> ({billing.upi.name}), then email the
              transaction ID to {billing.supportEmail}.
            </p>
          ) : (
            <p className="maint-pay">Write to {billing.supportEmail} for payment details.</p>
          )}
          <button className="primary-action" type="button" onClick={() => window.location.reload()}>
            I have paid, check again
          </button>
        </div>
      </div>
    );
  }

  if (m.status === "due") {
    return (
      <div className="plan-banner warn" role="status">
        <span>
          Plan expired. Pay the yearly maintenance fee of {currency(m.amount)} by {displayDate(m.dueBy)}, or your account will be put
          on hold.
        </span>
        <button type="button" className="plan-banner-btn" onClick={() => setView("plan")}>
          Pay now
        </button>
      </div>
    );
  }
  return null;
}
