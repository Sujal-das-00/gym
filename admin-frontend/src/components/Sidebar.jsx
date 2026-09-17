import { Fragment } from "react";
import { useApp } from "../store/AppContext.jsx";
import { getInitials } from "../lib/format.js";
import Icon from "./Icon.jsx";
import AuthBar from "../auth/AuthBar.jsx";

const NAV_SECTIONS = [
  {
    label: "Overview",
    links: [{ view: "dashboard", icon: "dashboard", text: "Dashboard" }],
  },
  {
    label: "Attendance",
    links: [
      { view: "attendance", icon: "productivity", text: "Mark Attendance" },
      { view: "checkin", icon: "qr_code_scanner", text: "QR Check-in" },
      { view: "history", icon: "calendar_month", text: "Attendance History" },
    ],
  },
  {
    label: "Members",
    links: [
      { view: "members", icon: "groups_3", text: "Members" },
      { view: "trainers", icon: "exercise", text: "Trainers" },
    ],
  },
  {
    label: "Billing",
    links: [
      { view: "payments", icon: "payments", text: "Payments" },
      { view: "expenses", icon: "account_balance_wallet", text: "Expense Tracker" },
      { view: "insights", icon: "insights", text: "Detailed Insights" },
    ],
  },
  {
    label: "Notifications",
    // Owner-only: a mass push reaches every member's phone, so `staff` never
    // sees the link. NotificationsView and the backend both re-check the role.
    roles: ["gym_admin", "super_admin"],
    links: [{ view: "notifications", icon: "notifications_active", text: "Send Notification" }],
  },
  {
    label: "Settings",
    links: [{ view: "settings", icon: "settings", text: "Settings" }],
  },
  {
    label: "Support",
    links: [{ view: "help", icon: "help", text: "Need Help" }],
  },
];

export default function Sidebar() {
  const { settings, activeView, setView, openMemberDialog, user } = useApp();
  const name = settings.gymName || "Gym Admin";
  const initials = getInitials(name) || "GA";

  return (
    <aside className="sidebar" id="adminSidebar" aria-label="Admin navigation">
      <div className="brand-block">
        <div className="brand-logo" id="brandLogo">
          {settings.logo ? <img src={settings.logo} alt={`${name} logo`} /> : initials}
        </div>
        <div>
          <strong id="sidebarGymName">{name}</strong>
          <span>Dashboard</span>
        </div>
      </div>

      <nav className="side-nav">
        {NAV_SECTIONS.filter((section) => !section.roles || section.roles.includes(user?.role)).map((section) => (
          <Fragment key={section.label}>
            <p>{section.label}</p>
            {section.links.map((link) => (
              <button
                key={link.view}
                className={"nav-link" + (activeView === link.view ? " active" : "")}
                data-view={link.view}
                type="button"
                onClick={() => setView(link.view)}
              >
                <Icon name={link.icon} />
                {link.text}
              </button>
            ))}
            {/* "Add Member" sits inside the Members group, as it did in the original markup. */}
            {section.label === "Members" ? (
              <button id="sideAddMember" type="button" onClick={() => openMemberDialog()}>
                <Icon name="person_add" />
                Add Member
              </button>
            ) : null}
          </Fragment>
        ))}
      </nav>

      <button className="support-card" data-view="help" type="button" onClick={() => setView("help")}>
        <strong>Need help?</strong>
        <span>Video tutorials &amp; step-by-step guide</span>
      </button>

      {/* Auth: account bar, docked in the sidebar on all screen sizes
          (below the support card on desktop, drawer footer on mobile). */}
      <AuthBar />
    </aside>
  );
}
