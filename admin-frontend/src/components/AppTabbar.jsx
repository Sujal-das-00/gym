import { useApp } from "../store/AppContext.jsx";
import Icon from "./Icon.jsx";

const TABS = [
  { view: "dashboard", icon: "home", label: "Home" },
  { view: "members", icon: "groups", label: "Members" },
  { view: "attendance", icon: "how_to_reg", label: "Attendance" },
  { view: "payments", icon: "payments", label: "Payments" },
  { view: "settings", icon: "settings", label: "Settings" },
];

// Screens reached from the drawer light up the tab they belong to (same
// grouping as the sidebar), so the bar always shows where you are.
const PARENT_TAB = {
  checkin: "attendance",
  history: "attendance",
  trainers: "members",
  expenses: "payments",
  insights: "payments",
  plan: "settings",
  notifications: "settings",
  help: "settings",
};

/** App-only bottom tab bar (shown when launched as an installed PWA). */
export default function AppTabbar() {
  const { activeView, setView } = useApp();
  const current = PARENT_TAB[activeView] || activeView;
  return (
    <nav className="app-tabbar" aria-label="Primary">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          className={"nav-link tab-link" + (current === tab.view ? " active" : "")}
          data-view={tab.view}
          type="button"
          aria-current={current === tab.view ? "page" : undefined}
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
