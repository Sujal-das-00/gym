/**
 * "Review · 2 of 2" with a progress bar: where the admin is in a short,
 * step-by-step form. Used by every sheet that records a payment, so they all
 * read the same.
 */
export default function StepProgress({ steps, current, compact = false }) {
  return (
    <div className={"mf-steps" + (compact ? " is-compact" : "")} role="group" aria-label={`Step ${current + 1} of ${steps.length}`}>
      <span className="mf-steps-chip">
        {steps[current]} · {current + 1} of {steps.length}
      </span>
      <div className="mf-steps-bar" aria-hidden="true">
        <span style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}
