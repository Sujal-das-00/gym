import { useApp, useShell } from "../store/AppContext.jsx";
import { VIEW_SHORT_TITLE } from "../lib/constants.js";
import useLicence from "../hooks/useLicence.js";
import { planNotice } from "../lib/plan.js";
import Icon from "./Icon.jsx";

const OWNER_ROLES = ["gym_admin", "super_admin"];

export default function MobileAppbar() {
  const { activeView, toggleDrawer, openMemberDialog, setView, user } = useApp();
  const { drawerOpen } = useShell();
  const notice = planNotice(useLicence());
  const canOpenPlan = OWNER_ROLES.includes(user?.role);

  return (
    // On the dashboard the bar is flat so it flows into the hero band below it.
    <header className={"mobile-appbar" + (activeView === "dashboard" ? " is-flush" : "")}>
      <button
        className="hamburger"
        id="menuToggle"
        type="button"
        aria-label="Open menu"
        aria-controls="adminSidebar"
        aria-expanded={drawerOpen ? "true" : "false"}
        onClick={toggleDrawer}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
      <span className="mobile-appbar-title" id="mobileTitle">
        {VIEW_SHORT_TITLE[activeView] || "Dashboard"}
      </span>
      {notice ? (
        <button
          className={"appbar-plan-chip " + notice.tone}
          type="button"
          title={notice.text}
          aria-label={notice.text}
          disabled={!canOpenPlan}
          onClick={() => setView("plan")}
        >
          <span className="appbar-plan-dot" aria-hidden="true"></span>
          <span className="appbar-plan-text">{notice.short}</span>
        </button>
      ) : null}
      <button
        className="mobile-appbar-add"
        id="mobileAddMember"
        type="button"
        aria-label="Add member"
        onClick={() => openMemberDialog()}
      >
        <Icon name="person_add" />
      </button>
    </header>
  );
}
