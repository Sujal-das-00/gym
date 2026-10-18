import useLicence from "../hooks/useLicence.js";
import { planNotice } from "../lib/plan.js";

// Tells the owner where they stand on the free trial / plan. Nothing is shown for a
// licensed gym with nothing pending. Staff see it too, but only the owner can pay.
// Desktop only — on phones the app-bar chip carries the same status.
export default function PlanBanner() {
  const notice = planNotice(useLicence());
  if (!notice || notice.banner === false) return null;

  return (
    <div className={"plan-banner " + notice.tone} role="status">
      <span>{notice.text}</span>
      <a href="/plans">{notice.pending ? "View status" : "Choose a plan"}</a>
    </div>
  );
}
