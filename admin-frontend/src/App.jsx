import { memo, useRef } from "react";
import { AppContext, useApp, useShell } from "./store/AppContext.jsx";
import Toast from "./components/Toast.jsx";
import MobileAppbar from "./components/MobileAppbar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import PlanBanner from "./components/PlanBanner.jsx";
import MaintenanceNotice from "./components/MaintenanceNotice.jsx";
import AppTabbar from "./components/AppTabbar.jsx";
import DashboardView from "./views/DashboardView.jsx";
import AttendanceView from "./views/AttendanceView.jsx";
import CheckinView from "./views/CheckinView.jsx";
import HistoryView from "./views/HistoryView.jsx";
import MembersView from "./views/MembersView.jsx";
import TrainersView from "./views/TrainersView.jsx";
import PaymentsView from "./views/PaymentsView.jsx";
import ExpensesView from "./views/ExpensesView.jsx";
import InsightsView from "./views/InsightsView.jsx";
import PlanBillingView from "./views/PlanBillingView.jsx";
import NotificationsView from "./views/NotificationsView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import HelpView from "./views/HelpView.jsx";
import MemberDialog from "./dialogs/MemberDialog.jsx";
import TrainerDialog from "./dialogs/TrainerDialog.jsx";
import ExpenseDialog from "./dialogs/ExpenseDialog.jsx";
import FeeDialog from "./dialogs/FeeDialog.jsx";
import PlanDialog from "./dialogs/PlanDialog.jsx";
import DetailDialog from "./dialogs/DetailDialog.jsx";
import DayLedgerDialog from "./dialogs/DayLedgerDialog.jsx";
import LoginOverlay from "./auth/LoginOverlay.jsx";
import GymsDialog from "./auth/GymsDialog.jsx";
import StaffDialog from "./auth/StaffDialog.jsx";
import MenuTour from "./components/MenuTour.jsx";

// A view mounts on first visit and then stays mounted, shown/hidden by the
// `.view.active` class — that keeps each view's filters and scroll position
// when you navigate away and back, and preserves the view-enter animation.
const VIEWS = [
  ["dashboard", DashboardView],
  ["attendance", AttendanceView],
  ["checkin", CheckinView],
  ["history", HistoryView],
  ["members", MembersView],
  ["trainers", TrainersView],
  ["payments", PaymentsView],
  ["expenses", ExpensesView],
  ["insights", InsightsView],
  ["plan", PlanBillingView],
  ["notifications", NotificationsView],
  ["settings", SettingsView],
  ["help", HelpView],
].map(([name, View]) => [name, memo(View)]);

// Hidden views get a frozen copy of the app context, so a poll, a dialog or an
// edit on another screen doesn't re-render all of them (that is what
// made navigation and typing lag on phones). They catch up when shown again.
function ViewPanel({ name, View }) {
  const live = useApp();
  const active = live.activeView === name;
  const frozen = useRef(live);
  const visited = useRef(false);
  if (!live.user) visited.current = false;
  if (active) {
    frozen.current = live;
    visited.current = true;
  } else if (frozen.current.activeView === name) {
    // Just navigated away: pass on that one change so the view's "only while
    // open" pollers stop, then hold still.
    frozen.current = live;
  }

  return (
    <section className={"view" + (active ? " active" : "")} data-view-panel={name}>
      {/* Views render only once the user is in, so no request fires before login. */}
      {live.user && visited.current ? (
        <AppContext.Provider value={frozen.current}>
          <View />
        </AppContext.Provider>
      ) : null}
    </section>
  );
}

function SidebarScrim() {
  const { closeDrawer } = useApp();
  const { drawerOpen } = useShell();
  return <div className="sidebar-scrim" id="sidebarScrim" hidden={!drawerOpen} onClick={closeDrawer}></div>;
}

// Reads no context itself, so a state change re-renders only the parts that use it.
export default function App() {
  return (
    <>
      <Toast />

      <div className="dashboard-shell">
        <MobileAppbar />

        <SidebarScrim />

        <Sidebar />

        <main className="main-content" id="dashboard">
          <PlanBanner />
          <MaintenanceNotice />
          <Topbar />

          {VIEWS.map(([name, View]) => (
            <ViewPanel key={name} name={name} View={View} />
          ))}
        </main>

        <AppTabbar />
      </div>

      <MemberDialog />
      <TrainerDialog />
      <ExpenseDialog />
      <FeeDialog />
      <PlanDialog />
      <DetailDialog />
      <DayLedgerDialog />

      <LoginOverlay />
      <GymsDialog />
      <StaffDialog />
      <MenuTour />
    </>
  );
}
