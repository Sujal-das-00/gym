import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate, todayKey } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DayBar from "../components/DayBar.jsx";

const CHIPS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Not in" },
  { key: "in", label: "Checked in" },
];

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
  const [filter, setFilter] = useState("all");

  const selectedDate = attendanceDate || todayKey();

  // Attendance polling: only while this view is open, exactly as the original
  // started/stopped its interval on view change.
  useEffect(() => {
    if (activeView !== "attendance") return undefined;
    refreshAttendanceStatus(true).catch(() => showToast("Attendance sync failed"));
    const timer = window.setInterval(() => refreshAttendanceStatus().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [activeView, refreshAttendanceStatus, showToast]);

  const changeDate = (key) => {
    setAttendanceDate(key || todayKey());
    setPendingAttendanceRemovalId("");
  };

  const rows = members.map((member) => {
    const present = domain.hasAttendance(member, selectedDate);
    return { member, present, expired: present && (member.expiredCheckins || []).includes(selectedDate) };
  });
  const presentCount = rows.filter((row) => row.present).length;
  const counts = { all: rows.length, pending: rows.length - presentCount, in: presentCount };

  const query = search.trim().toLowerCase();
  const visible = rows
    .filter((row) => filter === "all" || (filter === "in") === row.present)
    .filter((row) => [row.member.name, row.member.phone].some((value) => String(value || "").toLowerCase().includes(query)))
    .sort((a, b) => Number(a.present) - Number(b.present) || a.member.name.localeCompare(b.member.name));

  const groups = [
    { key: "pending", label: "Not checked in", rows: visible.filter((row) => !row.present) },
    { key: "in", label: "Checked in", rows: visible.filter((row) => row.present) },
  ].filter((group) => group.rows.length);

  const reason = domain.holidayReason(selectedDate);
  const noMatches = members.length > 0 && visible.length === 0;

  return (
    <section className="list-view" id="attendance" aria-label="Attendance sheet">
      <DayBar date={selectedDate} onChange={changeDate} inputId="attendanceDate" label="Attendance date" />

      <div className="summary-pair">
        <div>
          <span>Checked in</span>
          <strong id="selectedDatePresent">{presentCount}</strong>
          <small>of {members.length} members</small>
        </div>
        <div>
          <span>Not yet</span>
          <strong>{counts.pending}</strong>
          <small>{counts.pending === 1 ? "member pending" : "members pending"}</small>
        </div>
      </div>

      {reason ? (
        <p className="list-note" id="attendanceHolidayNote">
          <Icon name="beach_access" />
          <span>
            {displayDate(selectedDate)} is a gym holiday — {reason}. Check-ins are still recorded if the gym opens.
          </span>
        </p>
      ) : null}

      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            id="attendanceSearch"
            type="search"
            placeholder="Search name or mobile"
            aria-label="Search members"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPendingAttendanceRemovalId("");
            }}
          />
        </label>
      </div>

      <div className="chip-row" role="tablist" aria-label="Attendance filter">
        {CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={filter === chip.key}
            className={"filter-chip" + (filter === chip.key ? " active" : "")}
            onClick={() => setFilter(chip.key)}
          >
            {chip.label}
            <span>{counts[chip.key]}</span>
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <section className="contact-group" key={group.key} aria-label={group.label}>
          <h3 className="contact-group-title">
            {group.label}
            <span>{group.rows.length}</span>
          </h3>
          <ul className="contact-list" id={group.key === "pending" ? "attendanceList" : undefined}>
            {group.rows.map(({ member, present, expired }) => {
              const confirming = pendingAttendanceRemovalId === member.id && present;
              return (
                <li key={member.id}>
                  <div className={"contact-row is-static " + (present && !expired ? "is-paid" : "is-pending")}>
                    <span className="contact-avatar">
                      <Photo person={member} />
                    </span>
                    <span className="contact-copy">
                      <strong>
                        <span className="contact-name">{member.name}</span>
                        {expired ? <em className="contact-tag warn">Expired</em> : null}
                      </strong>
                      <small>{expired ? "Membership expired · collect renewal" : member.phone}</small>
                    </span>
                    <span className="contact-state">
                      {present ? (
                        confirming ? (
                          <span className="att-confirm" role="group" aria-label={`Confirm attendance correction for ${member.name}`}>
                            <button
                              type="button"
                              className="att-btn danger"
                              onClick={() => setMemberAttendanceStatus(member.id, selectedDate, false)}
                            >
                              Mark absent
                            </button>
                            <button
                              type="button"
                              className="att-btn icon"
                              aria-label="Keep checked in"
                              onClick={() => setPendingAttendanceRemovalId("")}
                            >
                              <Icon name="close" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="att-btn in"
                            aria-label={`${member.name} is checked in. Tap to correct.`}
                            onClick={() => setPendingAttendanceRemovalId(member.id)}
                          >
                            <Icon name="check" />
                            In
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="att-btn"
                          onClick={() => setMemberAttendanceStatus(member.id, selectedDate, true)}
                        >
                          Check in
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {noMatches ? <p className="contact-empty">No members match this search.</p> : null}

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
