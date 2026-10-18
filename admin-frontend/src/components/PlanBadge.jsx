import { useApp } from "../store/AppContext.jsx";
import useLicence from "../hooks/useLicence.js";
import { describePlan } from "../lib/plan.js";

export default function PlanBadge() {
  const { setView } = useApp();
  const status = useLicence();

  if (!status) return null;
  const { access } = status;
  const { tone, label } = describePlan(access);
  const detail = access.phase === "trial" && access.daysLeft != null ? ` · ${access.daysLeft}d left` : "";
  return (
    <button className={"plan-badge " + tone} type="button" title="View plan & billing" onClick={() => setView("plan")}>
      <span className="plan-badge-dot" aria-hidden="true"></span>
      {label}
      {detail}
    </button>
  );
}
