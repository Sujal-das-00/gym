import Icon from "./Icon.jsx";

const ITEMS = [
  { id: "home", label: "Home", icon: "grid_view" },
  { id: "checkin", label: "Check-In", icon: "qr_code_scanner" },
  { id: "receipts", label: "Receipts", icon: "receipt_long" },
  { id: "id-card", label: "ID Card", icon: "badge" },
];

export default function MemberNav({ active, onChange }) {
  return (
    <nav className="sticky bottom-0 z-40 w-full pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.05)]">
      <div className="h-16 max-w-md mx-auto px-gutter grid grid-cols-4 items-center">
        {ITEMS.map((item) => {
          const selected = active === item.id;
          return (
            <button
              aria-current={selected ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                selected ? "text-primary font-semibold" : "text-secondary hover:text-on-surface"
              }`}
              key={item.id}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <Icon
                className="text-[24px]"
                name={item.icon}
                style={selected ? { fontVariationSettings: '"FILL" 1' } : undefined}
              />
              <span className="font-label-sm text-label-sm">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
