import { useApp } from "../store/AppContext.jsx";
import Icon from "./Icon.jsx";

const TABS = [
  { view: "dashboard", icon: "home", label: "Home" },
  { view: "members", icon: "groups", label: "Members" },
  { view: "attendance", icon: "how_to_reg", label: "Attendance" },
  { view: "payments", icon: "payments", label: "Payments" },
  { view: "settings", icon: "settings", label: "Settings" },
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
          <span className="tab-ico">
            <Icon name={tab.icon} />
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
