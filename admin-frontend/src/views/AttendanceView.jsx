import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate, todayKey } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function AttendanceView() {
  const {
    members,
    domain,
    attendanceDate,
    setAttendanceDate,
    pendingAttendanceRemovalId,
    setPendingAttendanceRemovalId,
    setMemberAttendanceStatus,
    refreshAttendanceStatus,
    showToast,
    activeView,
  } = useApp();
  const [search, setSearch] = useState("");

  const selectedDate = attendanceDate || todayKey();

  // Attendance polling: only while this view is open, exactly as the original
  // started/stopped its interval on view change.
  useEffect(() => {
    if (activeView !== "attendance") return undefined;
    refreshAttendanceStatus(true).catch(() => showToast("Attendance sync failed"));
    const timer = window.setInterval(() => refreshAttendanceStatus().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [activeView, refreshAttendanceStatus, showToast]);

  const query = search.trim().toLowerCase();
  const attendanceMembers = members.filter((member) =>
    [member.name, member.phone].some((value) => String(value || "").toLowerCase().includes(query)),
  );
  const presentMembers = members.filter((member) => domain.hasAttendance(member, selectedDate));
  const notCheckedInCount = Math.max(members.length - presentMembers.length, 0);
  const noAttendanceMatches = members.length > 0 && attendanceMembers.length === 0;
  const reason = domain.holidayReason(selectedDate);

  const sorted = attendanceMembers.slice().sort((a, b) => {
    const aPresent = domain.hasAttendance(a, selectedDate);
    const bPresent = domain.hasAttendance(b, selectedDate);
    if (aPresent !== bPresent) return aPresent ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const onDateChange = (event) => {
    setAttendanceDate(event.target.value || todayKey());
    setPendingAttendanceRemovalId("");
  };

  return (
    <section className="panel attendance-section" id="attendance" aria-label="Attendance sheet">
      <div className="panel-head">
        <label className="date-picker wmb-100">
          Date
          <input id="attendanceDate" type="date" value={selectedDate} onChange={onDateChange} />
        </label>
      </div>
      <label className="attendance-search search-box">
        <input
          id="attendanceSearch"
          type="search"
          placeholder="🔍  Name or mobile"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPendingAttendanceRemovalId("");
          }}
        />
      </label>
      <div className="attendance-summary">
        <strong id="selectedDatePresent">{presentMembers.length} checked in</strong>
        <span id="selectedDateLabel">
          {notCheckedInCount} pending | {displayDate(selectedDate)}
        </span>
      </div>
      <p className="attendance-holiday-note" id="attendanceHolidayNote" hidden={!reason}>
        {reason
          ? `🌴 ${displayDate(selectedDate)} is a gym holiday — ${reason}. Check-ins are still recorded if the gym opens.`
          : ""}
      </p>
      <div
        className="attendance-list"
        id="attendanceList"
        style={{ display: attendanceMembers.length || noAttendanceMatches ? "grid" : "none" }}
      >
        {noAttendanceMatches ? (
          <p className="history-empty">No members match this search.</p>
        ) : (
          sorted.map((member) => {
            const present = domain.hasAttendance(member, selectedDate);
            const expired = present && (member.expiredCheckins || []).includes(selectedDate);
            const confirmRemoval = pendingAttendanceRemovalId === member.id && present;
            return (
              <article
                key={member.id}
                className={
                  "attendance-row " + (present ? (expired ? "is-present is-expired" : "is-present") : "is-pending")
                }
              >
                <Photo person={member} />
                <div className="attendance-member-copy">
                  <h3>{member.name}</h3>
                  <p>{member.phone}</p>
                </div>
                <div className="attendance-status-cell">
                  <span className={"attendance-status " + (present ? (expired ? "expired" : "present") : "pending")}>
                    {present ? (expired ? "Checked in — expired" : "Checked in") : "Not checked in"}
                  </span>
                  {expired ? (
                    <small>Membership had expired at check-in. Collect the renewal.</small>
                  ) : present ? (
                    <small>Use absent only for a correction.</small>
                  ) : (
                    <small>No attendance saved for this date.</small>
                  )}
                </div>
                <div className="attendance-actions">
                  {present ? (
                    confirmRemoval ? (
                      <div
                        className="attendance-confirm-actions"
                        role="group"
                        aria-label={`Confirm attendance correction for ${member.name}`}
                      >
                        <button
                          className="attendance-button danger"
                          type="button"
                          onClick={() => setMemberAttendanceStatus(member.id, selectedDate, false)}
                        >
                          Confirm absent
                        </button>
                        <button
                          className="attendance-button ghost"
                          type="button"
                          onClick={() => setPendingAttendanceRemovalId("")}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="attendance-button correction"
                        type="button"
                        onClick={() => setPendingAttendanceRemovalId(member.id)}
                      >
                        Mark absent
                      </button>
                    )
                  ) : (
                    <button
                      className="attendance-button mark-present"
                      type="button"
                      onClick={() => setMemberAttendanceStatus(member.id, selectedDate, true)}
                    >
                      Mark present
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      <EmptyState
        id="attendanceEmpty"
        className="compact-empty"
        show={members.length === 0}
        avatar="+"
        title="No members to mark"
        copy="Add members first, then this sheet becomes the fastest place to take daily attendance."
      />
    </section>
  );
}
