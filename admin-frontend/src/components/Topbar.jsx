import { useApp } from "../store/AppContext.jsx";
import { VIEW_COPY } from "../lib/constants.js";
import { todayLabel } from "../lib/dates.js";
import Icon from "./Icon.jsx";
import PlanBadge from "./PlanBadge.jsx";
import useInstallPrompt from "../hooks/useInstallPrompt.js";

export default function Topbar() {
  const { activeView, settings, openMemberDialog } = useApp();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [title, subtitle] = VIEW_COPY[activeView] || VIEW_COPY.dashboard;

  return (
    <header className="topbar">
      <div>
        <h1 id="pageTitle">{title}</h1>
        <p id="pageSubtitle">
          {activeView === "dashboard" && settings.gymName ? settings.gymName : subtitle}
        </p>
      </div>
      <div className="topbar-actions">
        <PlanBadge />
        <span className="date-pill" id="todayLabel">
          {todayLabel()}
        </span>
        <button
          className="secondary-action"
          id="installAppButton"
          type="button"
          hidden={!canInstall}
          onClick={promptInstall}
        >
          Install app
        </button>
        <button className="primary-action" id="openAddMember" type="button" onClick={() => openMemberDialog()}>
          <Icon name="add" />
          Add member
        </button>
      </div>
    </header>
  );
}
