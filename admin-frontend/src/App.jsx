import { useApp } from "./store/AppContext.jsx";
import Toast from "./components/Toast.jsx";
import MobileAppbar from "./components/MobileAppbar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
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
import SettingsView from "./views/SettingsView.jsx";
import HelpView from "./views/HelpView.jsx";
import MemberDialog from "./dialogs/MemberDialog.jsx";
import TrainerDialog from "./dialogs/TrainerDialog.jsx";
import ExpenseDialog from "./dialogs/ExpenseDialog.jsx";
import FeeDialog from "./dialogs/FeeDialog.jsx";
import DetailDialog from "./dialogs/DetailDialog.jsx";
import DayLedgerDialog from "./dialogs/DayLedgerDialog.jsx";
import LoginOverlay from "./auth/LoginOverlay.jsx";
import GymsDialog from "./auth/GymsDialog.jsx";
import StaffDialog from "./auth/StaffDialog.jsx";

// Every view stays mounted and is shown/hidden by the `.view.active` class, as
// in the original markup — that keeps each view's filters and scroll position
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
  ["settings", SettingsView],
  ["help", HelpView],
];

export default function App() {
  const { activeView, drawerOpen, closeDrawer, user } = useApp();

  return (
    <>
      <Toast />

      <div className="dashboard-shell">
        <MobileAppbar />

        <div className="sidebar-scrim" id="sidebarScrim" hidden={!drawerOpen} onClick={closeDrawer}></div>

        <Sidebar />

        <main className="main-content" id="dashboard">
          <Topbar />

          {VIEWS.map(([name, View]) => (
            <section
              key={name}
              className={"view" + (activeView === name ? " active" : "")}
              data-view-panel={name}
            >
              {/* Views render only once the user is in, so no request fires before login. */}
              {user ? <View /> : null}
            </section>
          ))}
        </main>

        <AppTabbar />
      </div>

      <MemberDialog />
      <TrainerDialog />
      <ExpenseDialog />
      <FeeDialog />
      <DetailDialog />
      <DayLedgerDialog />

      <LoginOverlay />
      <GymsDialog />
      <StaffDialog />
    </>
  );
}
