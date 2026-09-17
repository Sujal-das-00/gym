import Icon from "./Icon.jsx";

// Result banner under the check-in button — the old .result-box, restyled.
const TONES = {
  ok: ["bg-emerald-50 border-emerald-200 text-emerald-800", "text-emerald-600", "verified"],
  warn: ["bg-amber-50 border-amber-200 text-amber-900", "text-amber-600", "warning"],
  err: ["bg-red-50 border-red-200 text-red-800", "text-red-600", "error"],
};

export default function StatusNote({ tone = "ok", children }) {
  const [box, iconColor, iconName] = TONES[tone] || TONES.ok;
  return (
    <div
      aria-live="polite"
      className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${box}`}
      role="status"
    >
      <Icon className={`text-[18px] shrink-0 ${iconColor}`} name={iconName} />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
