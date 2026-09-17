import { useApp } from "../store/AppContext.jsx";

const TABS = [
  { view: "dashboard", icon: "🏠", label: "Home" },
  { view: "members", icon: "👥", label: "Members" },
  { view: "attendance", icon: "✅", label: "Attend" },
  { view: "payments", icon: "💰", label: "Billing" },
  { view: "settings", icon: "⚙️", label: "Settings" },
];

/** App-only bottom tab bar (shown when launched as an installed PWA). */
export default function AppTabbar() {
  const { activeView, setView } = useApp();
  return (
    <nav className="app-tabbar" aria-label="Primary">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          className={"nav-link tab-link" + (activeView === tab.view ? " active" : "")}
          data-view={tab.view}
          type="button"
          onClick={() => setView(tab.view)}
        >
          <span className="tab-ico">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
