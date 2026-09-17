import { useApp } from "../store/AppContext.jsx";
import Icon from "../components/Icon.jsx";

const STAT_ICON_STYLE = { fontSize: "1.15rem" };

export default function DashboardView() {
  const { members, trainers, domain, setView } = useApp();

  const total = members.length;
  const overdue = members.filter((member) => domain.isOverdue(member)).length;
  const paid = members.filter((member) => domain.isPaidThisPeriod(member)).length;
  const present = members.filter((member) => domain.isPresentToday(member)).length;
  const activeTrainers = trainers.filter((trainer) => trainer.status !== "inactive").length;
  const visits = members.reduce((count, member) => count + domain.getMonthlyAttendance(member), 0);

  return (
    <>
      <section className="stats-grid" aria-label="Gym summary">
        <article className="stat-card total">
          <div className="stat-icon">
            <Icon name="groups_3" style={STAT_ICON_STYLE} />
          </div>
          <span>Total Members</span>
          <strong id="totalMembers">{total}</strong>
          <small>Registered members</small>
        </article>
        <article className="stat-card due">
          <div className="stat-icon">
            <Icon name="person_alert" style={STAT_ICON_STYLE} />
          </div>
          <span>Overdue Fees</span>
          <strong id="overdueMembers">{overdue}</strong>
          <small>Members with dues</small>
        </article>
        <article className="stat-card paid">
          <div className="stat-icon">
            <Icon name="money_bag" style={STAT_ICON_STYLE} />
          </div>
          <span>Paid This Month</span>
          <strong id="paidMembers">{paid}</strong>
          <small>Members</small>
        </article>
        <article className="stat-card attend">
          <div className="stat-icon">
            <Icon name="how_to_reg" style={STAT_ICON_STYLE} />
          </div>
          <span>Today Present</span>
          <strong id="todayPresent">{present}</strong>
          <small>Members</small>
        </article>
        <article className="stat-card trainers">
          <div className="stat-icon">
            <Icon name="exercise" style={STAT_ICON_STYLE} />
          </div>
          <span>Active Trainers</span>
          <strong id="activeTrainerCount">{activeTrainers}</strong>
          <small id="totalTrainerCount">
            {trainers.length} total trainer{trainers.length === 1 ? "" : "s"}
          </small>
        </article>
      </section>

      <section className="dashboard-grid">
        <section className="panel mini-panel">
          <div className="panel-head compact">
            <div>
              <h2>Activity Summary</h2>
              <p>This month overview</p>
            </div>
          </div>
          <div className="summary-list">
            <div>
              <span>Total visits</span>
              <strong id="summaryVisits">{visits}</strong>
            </div>
            <div>
              <span>Attendance rate</span>
              <strong id="summaryRate">{total ? `${Math.round((present / total) * 100)}%` : "0%"}</strong>
            </div>
            <div>
              <span>Active members</span>
              <strong id="summaryActive">{total}</strong>
            </div>
          </div>
        </section>

        <section className="panel quick-panel">
          <div className="panel-head compact">
            <div>
              <h2>Quick Actions</h2>
              <p>Open the daily workflows from the sidebar.</p>
            </div>
          </div>
          <div className="quick-actions-grid">
            <button className="secondary-action nav-shortcut" type="button" onClick={() => setView("attendance")}>
              Mark Attendance
            </button>
            <button className="secondary-action nav-shortcut" type="button" onClick={() => setView("history")}>
              View History
            </button>
            <button className="secondary-action nav-shortcut" type="button" onClick={() => setView("members")}>
              Manage Members
            </button>
            <button className="secondary-action nav-shortcut" type="button" onClick={() => setView("trainers")}>
              Manage Trainers
            </button>
            <button className="secondary-action nav-shortcut" type="button" onClick={() => setView("settings")}>
              Settings
            </button>
          </div>
        </section>
      </section>
    </>
  );
}
