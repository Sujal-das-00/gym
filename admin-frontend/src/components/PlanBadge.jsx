import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";

// Which plan the gym is on, at a glance: Free Trial, Monthly Licence, Lifetime Licence.
function describe(access) {
  switch (access.phase) {
    case "licensed":
      return access.licence === "lifetime"
        ? { tone: "lifetime", label: "Lifetime License" }
        : { tone: "monthly", label: "Monthly Subscription" };
    case "trial":
      return { tone: "trial", label: "Free Plan" };
    case "grace":
      return { tone: "grace", label: "Pending Verification" };
    case "suspended":
      return { tone: "expired", label: "Suspended" };
    default:
      return { tone: "expired", label: "Trial Ended" };
  }
}

export default function PlanBadge() {
  const { user, setView } = useApp();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/api/licence")
      .then((data) => alive && setAccess(data.access))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  if (!access) return null;
  const { tone, label } = describe(access);
  const detail = access.phase === "trial" && access.daysLeft != null ? ` · ${access.daysLeft}d left` : "";
  return (
    <button className={"plan-badge " + tone} type="button" title="View plan & billing" onClick={() => setView("plan")}>
      <span className="plan-badge-dot" aria-hidden="true"></span>
      {label}
      {detail}
    </button>
  );
}
