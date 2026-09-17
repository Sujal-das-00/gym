import Icon from "./Icon.jsx";

function Pill({ label, value, unit, tone, children }) {
  return (
    <div className="flex flex-col p-2.5 rounded-xl bg-surface-container-lowest shadow-xs border border-surface-container-high">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-secondary">{label}</span>
        {children}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span
          className={`font-headline-md text-headline-md font-bold leading-none ${
            tone === "danger" ? "text-red-600" : tone === "brand" ? "text-primary" : "text-on-surface"
          }`}
        >
          {value}
        </span>
        <span className="font-label-sm text-label-sm text-secondary">{unit}</span>
      </div>
    </div>
  );
}

export default function MemberStatPills({ streak, visits, daysLeft, daysOverdue, expired }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-1">
      <Pill label="Streak" unit={streak === 1 ? "day" : "days"} value={streak}>
        <span className="text-[14px]">🔥</span>
      </Pill>
      <Pill label="Visits" unit="this mo" value={visits}>
        <Icon className="text-primary text-[16px]" name="verified" />
      </Pill>
      <Pill
        label="Plan"
        tone={expired ? "danger" : "brand"}
        unit={daysLeft === null ? "" : expired ? "overdue" : "days left"}
        value={daysLeft === null ? "—" : expired ? daysOverdue : daysLeft}
      >
        <Icon className="text-tertiary text-[16px]" name="timer" />
      </Pill>
    </div>
  );
}
