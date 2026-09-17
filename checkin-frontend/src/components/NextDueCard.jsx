import { displayDate } from "../lib/format.js";
import { rupees } from "../lib/memberStats.js";

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Renewal card: when the billing period in progress runs out, and what it costs.
 * Every figure comes from the server's billing summary — the period rules live in
 * backend/src/utils/billing.js and are deliberately not reimplemented here.
 */
export default function NextDueCard({ billing }) {
  if (!billing) return null;

  const { amount, cycleDays, daysLeft, daysOverdue, expired, nextDueDate, planLabel, unpaidPeriods } = billing;
  // Not overdue: ring drains as the period runs out. Overdue: ring is always
  // full (red) — how overdue it is shows as text, not as more fill.
  const remaining = cycleDays > 0 ? Math.min(1, Math.max(0, daysLeft / cycleDays)) : 0;
  const offset = CIRCUMFERENCE * (1 - (expired ? 1 : remaining));

  return (
    <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-xs border border-surface-container-high flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${expired ? "bg-red-500" : "bg-primary animate-pulse"}`}
          />
          <span
            className={`font-label-sm text-label-sm uppercase tracking-wider font-semibold truncate ${
              expired ? "text-red-700" : "text-secondary"
            }`}
          >
            {expired
              ? `Overdue since ${displayDate(nextDueDate)}${unpaidPeriods > 1 ? ` • ${unpaidPeriods} periods` : ""}`
              : `Next due • ${displayDate(nextDueDate)}`}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="font-headline-md text-headline-md text-on-surface font-bold">
            {rupees(amount)}
          </span>
          <span className="font-label-sm text-label-sm text-secondary truncate">{planLabel}</span>
        </div>
      </div>

      <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
        <svg
          className={`w-16 h-16 -rotate-90 ${expired ? "drop-shadow-[0_0_6px_rgba(239,68,68,0.65)]" : ""}`}
          viewBox="0 0 48 48"
        >
          <circle
            className="stroke-surface-container"
            cx="24"
            cy="24"
            fill="transparent"
            r={RADIUS}
            strokeWidth="4"
          />
          <circle
            className={expired ? "stroke-red-500 animate-pulse" : "stroke-primary"}
            cx="24"
            cy="24"
            fill="transparent"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="4"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-headline-sm text-[13px] font-bold leading-none ${expired ? "text-red-600" : "text-on-surface"}`}
          >
            {expired ? `${daysOverdue}d` : `${daysLeft}d`}
          </span>
          <span
            className={`text-[9px] uppercase font-semibold leading-none mt-0.5 ${expired ? "text-red-600" : "text-secondary"}`}
          >
            {expired ? "overdue" : "left"}
          </span>
        </div>
      </div>
    </div>
  );
}
