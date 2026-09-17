import Icon from "./Icon.jsx";

const TABS = [
  { id: "checkin", label: "Fast Check-In", icon: "how_to_reg" },
  { id: "account", label: "Sensitive Login", icon: "lock" },
];

const baseTab =
  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all";

export default function TabSwitcher({ active, onChange }) {
  return (
    <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl border border-gray-200" role="tablist">
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            aria-controls={`panel-${tab.id}`}
            aria-selected={selected}
            className={`${baseTab} ${selected ? "shadow-sm bg-primary text-white" : "text-gray-600 hover:text-gray-900"}`}
            id={`tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            <Icon
              className="text-[18px]"
              name={tab.icon}
              style={selected ? { fontVariationSettings: '"FILL" 1' } : undefined}
            />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
