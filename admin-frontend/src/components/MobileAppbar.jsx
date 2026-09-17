import { useApp } from "../store/AppContext.jsx";
import { VIEW_SHORT_TITLE } from "../lib/constants.js";

export default function MobileAppbar() {
  const { activeView, drawerOpen, toggleDrawer, openMemberDialog } = useApp();
  return (
    <header className="mobile-appbar">
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
      <button
        className="mobile-appbar-add"
        id="mobileAddMember"
        type="button"
        aria-label="Add member"
        onClick={() => openMemberDialog()}
      >
        +
      </button>
    </header>
  );
}
