import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { daysBetween, displayDate, getDefaultHistoryRange } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import Photo from "../components/Photo.jsx";

export default function HistoryView() {
  const { members, domain, selectedHistoryMemberId, setSelectedHistoryMemberId, showToast } = useApp();
  const [range] = useState(() => getDefaultHistoryRange());
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const getHistoryRows = (member) => {
    if (!member) return [];
    const attendance = new Set(member.attendance || []);
    const expiredCheckins = new Set(member.expiredCheckins || []);
    return daysBetween(startDate || range.start, endDate || range.end).map((day) => {
      const holiday = domain.isHoliday(day);
      const present = attendance.has(day);
      const expired = present && expiredCheckins.has(day);
      return {
        date: day,
        status: holiday ? "holiday" : expired ? "expired" : present ? "present" : "absent",
        present,
        holiday,
        expired,
      };
    });
  };

  const filterHistoryRows = (rows) => {
    if (statusFilter === "all") return rows;
    // "present" includes expired check-ins — the member was in the gym either way.
    if (statusFilter === "present") return rows.filter((row) => row.present && !row.holiday);
    return rows.filter((row) => row.status === statusFilter);
  };

  const query = search.trim().toLowerCase();
  const visibleMembers = members
    .filter((member) => [member.name, member.phone].some((value) => String(value || "").toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedMember =
    visibleMembers.find((member) => member.id === selectedHistoryMemberId) || visibleMembers[0] || null;

  const exportHistoryCsv = () => {
    if (!selectedMember) {
      showToast("Select a member first");
      return;
    }
    const rows = filterHistoryRows(getHistoryRows(selectedMember));
    downloadCsv(
      [
        ["Member", "Phone", "Date", "Status"],
        ...rows.map((row) => [selectedMember.name, selectedMember.phone, displayDate(row.date), row.status]),
      ],
      `${selectedMember.name.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`,
    );
    showToast("CSV exported");
  };

  const reportRows = selectedMember ? getHistoryRows(selectedMember) : [];
  const visibleReportRows = filterHistoryRows(reportRows);
  const present = reportRows.filter((row) => row.present).length;
  const holidays = reportRows.filter((row) => row.holiday).length;
  const absent = reportRows.filter((row) => row.status === "absent").length;
  const expiredVisits = reportRows.filter((row) => row.expired).length;
  const workingDays = reportRows.length - holidays;
  const rate = workingDays ? Math.round((present / workingDays) * 100) : 0;

  return (
    <section className="panel attendance-history" id="attendanceHistory">
      <div className="panel-head">
        <div>
          <h2>Attendance History</h2>
          <p id="attendanceHistoryLabel">
            {selectedMember
              ? `${selectedMember.name} · ${displayDate(startDate || range.start)} to ${displayDate(endDate || range.end)}`
              : "No member selected."}
          </p>
        </div>
        <button className="primary-action" id="exportAttendanceCsv" type="button" onClick={exportHistoryCsv}>
          Export CSV
        </button>
      </div>

      <div className="history-filters">
        <label>
          <span>Search customer</span>
          <input
            id="historySearch"
            type="search"
            placeholder="Name or mobile number..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>From</span>
          <input
            id="historyStartDate"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input id="historyEndDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          <span>Status</span>
          <select
            id="historyStatusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All dates</option>
            <option value="present">Present only</option>
            <option value="absent">Absent only</option>
            <option value="holiday">Holidays only</option>
          </select>
        </label>
      </div>

      <div className="history-workspace">
        <div>
          <h3 className="subhead">Member records</h3>
          <div className="history-member-grid" id="historyMemberGrid">
            {visibleMembers.length ? (
              visibleMembers.map((member) => {
                const rows = getHistoryRows(member);
                const memberPresent = rows.filter((row) => row.present).length;
                const memberHolidays = rows.filter((row) => row.holiday).length;
                const memberExpired = rows.filter((row) => row.expired).length;
                return (
                  <button
                    key={member.id}
                    className={"history-member-card" + (member.id === selectedMember?.id ? " active" : "")}
                    type="button"
                    onClick={() => setSelectedHistoryMemberId(member.id)}
                  >
                    <Photo person={member} />
                    <div>
                      <h3>{member.name}</h3>
                      <p>{`${member.phone} · ${member.gymId || member.id || ""}`}</p>
                      <span>
                        {`${memberPresent} present · ${memberHolidays} holidays`}
                        {memberExpired ? (
                          <>
                            {" · "}
                            <em className="expired-flag">{`${memberExpired} expired`}</em>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="history-empty">No members match this filter.</p>
            )}
          </div>
        </div>
        <div className="history-report" id="historyReport">
          {selectedMember ? (
            <>
              <div className="history-report-head">
                <Photo person={selectedMember} />
                <div>
                  <h3>{selectedMember.name}</h3>
                  <p>{`${selectedMember.phone} · ${selectedMember.address}`}</p>
                </div>
              </div>
              <div className="history-stat-grid">
                <article>
                  <span>Present</span>
                  <strong>{present}</strong>
                </article>
                <article>
                  <span>Absent</span>
                  <strong>{absent}</strong>
                </article>
                <article>
                  <span>Holidays</span>
                  <strong>{holidays}</strong>
                </article>
                <article>
                  <span>Attendance rate</span>
                  <strong>{rate}%</strong>
                </article>
                {expiredVisits ? (
                  <article className="expired-stat">
                    <span>Expired check-ins</span>
                    <strong>{expiredVisits}</strong>
                  </article>
                ) : null}
              </div>
              <div className="attendance-chart" aria-label="Attendance chart">
                {reportRows.map((row) => (
                  <span
                    key={row.date}
                    className={"chart-day " + row.status}
                    title={`${displayDate(row.date)} · ${row.status}`}
                  ></span>
                ))}
              </div>
              <div className="history-date-list">
                {visibleReportRows.length ? (
                  visibleReportRows.map((row) => (
                    <div className="history-date-row" key={row.date}>
                      <span>{displayDate(row.date)}</span>
                      <strong className={row.status}>{row.status}</strong>
                    </div>
                  ))
                ) : (
                  <p className="history-empty">No dates match this filter.</p>
                )}
              </div>
            </>
          ) : (
            <p className="history-empty">Add a member to view individual attendance history.</p>
          )}
        </div>
      </div>
    </section>
  );
}
