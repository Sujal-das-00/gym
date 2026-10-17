import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";

// Tells the owner where they stand on the free trial / plan. Nothing is shown for a
// licensed gym with nothing pending. Staff see it too, but only the owner can pay.
export default function PlanBanner() {
  const { user } = useApp();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/api/licence")
      .then((data) => alive && setStatus(data))
      .catch(() => {}); // the banner is a nicety; never block the dashboard on it
    return () => {
      alive = false;
    };
  }, [user]);

  if (!status) return null;
  const { access, purchase } = status;
  const pending = Boolean(purchase && purchase.claimedAt);

  let tone = "";
  let text = "";
  if (access.phase === "grace") {
    tone = "warn";
    const until = new Date(access.graceUntil).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    text = `Plan pending verification. Temporary access until ${until} (day ${access.graceDaysUsed} of ${access.graceDaysMax}).`;
  } else if (access.phase === "trial" && pending) {
    tone = "info";
    text = "Plan pending verification. We confirm your payment within 24 hours.";
  } else if (access.phase === "trial") {
    tone = access.daysLeft <= 2 ? "warn" : "info";
    text = access.daysLeft === 0 ? "Your free trial ends today." : `Free trial: ${access.daysLeft} day${access.daysLeft === 1 ? "" : "s"} left.`;
  } else {
    return null;
  }

  return (
    <div className={"plan-banner " + tone} role="status">
      <span>{text}</span>
      <a href="/plans">{pending ? "View status" : "Choose a plan"}</a>
    </div>
  );
}
