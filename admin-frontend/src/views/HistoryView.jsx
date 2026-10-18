import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { daysBetween, displayDate, getDefaultHistoryRange, parseDateKey, todayKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import EmptyState from "../components/EmptyState.jsx";

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "holiday", label: "Holiday" },
];

const STATUS_LABEL = { present: "Present", absent: "Absent", holiday: "Holiday", expired: "Expired" };

const weekday = (key) => new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(parseDateKey(key));

export default function HistoryView() {
  const { members, domain, showToast } = useApp();
  const [defaults] = useState(() => getDefaultHistoryRange());
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [showDates, setShowDates] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const from = startDate || defaults.start;
  const to = endDate || defaults.end;
  const customRange = from !== defaults.start || to !== defaults.end;

  // Days that haven't happened yet can't be absences, so the range stops at today.
  const lastDay = to > todayKey() ? todayKey() : to;

  // Work out the range once; every member is then a set lookup per day.
  const days = daysBetween(from, lastDay);
  const holidays = new Set(days.filter((day) => domain.isHoliday(day)));
  const workingDays = days.length - holidays.size;

  const rowsFor = (member) => {
    const attended = new Set(member.attendance || []);
    const expiredSet = new Set(member.expiredCheckins || []);
    return days.map((date) => {
      const holiday = holidays.has(date);
      const present = attended.has(date);
      const expired = present && expiredSet.has(date);
      return {
        date,
        present,
        holiday,
        expired,
        status: holiday ? "holiday" : expired ? "expired" : present ? "present" : "absent",
      };
    });
  };

  const summarize = (rows) => {
    const present = rows.filter((row) => row.present).length;
    return {
      present,
      absent: rows.filter((row) => row.status === "absent").length,
      holiday: holidays.size,
      expired: rows.filter((row) => row.expired).length,
      rate: workingDays ? Math.min(100, Math.round((present / workingDays) * 100)) : 0,
    };
  };

  const cards = members.map((member) => {
    const attended = new Set(member.attendance || []);
    const present = days.filter((day) => attended.has(day)).length;
    return {
      member,
      present,
      rate: workingDays ? Math.min(100, Math.round((present / workingDays) * 100)) : 0,
    };
  });
  const totalCheckins = cards.reduce((sum, card) => sum + card.present, 0);
  const averageRate = cards.length ? Math.round(cards.reduce((sum, card) => sum + card.rate, 0) / cards.length) : 0;

  const query = search.trim().toLowerCase();
  const visible = cards
    .filter((card) => [card.member.name, card.member.phone].some((value) => String(value || "").toLowerCase().includes(query)))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));

  const resetRange = () => {
    setStartDate(defaults.start);
    setEndDate(defaults.end);
  };

  // ---- Detail sheet ----
  const selected = members.find((member) => member.id === openId) || null;
  const rows = selected ? rowsFor(selected) : [];
  const stats = summarize(rows);
  // "present" includes expired check-ins — the member was in the gym either way.
  const matchesFilter = (row) =>
    statusFilter === "all" ||
    (statusFilter === "present" ? row.present && !row.holiday : row.status === statusFilter);
  const filteredRows = rows.filter(matchesFilter);
  const filterCount = (key) =>
    key === "all" ? rows.length : rows.filter((row) => (key === "present" ? row.present && !row.holiday : row.status === key)).length;

  const open = (id) => {
    setStatusFilter("all");
    setOpenId(id);
  };

  const exportCsv = () => {
    if (!selected) return;
    downloadCsv(
      [
        ["Member", "Phone", "Date", "Status"],
        ...filteredRows.map((row) => [selected.name, selected.phone, displayDate(row.date), row.status]),
      ],
      `${selected.name.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`,
    );
    showToast("CSV exported");
  };

  return (
    <section className="list-view" id="attendanceHistory">
      <div className="summary-pair">
        <div>
          <span>Check-ins</span>
          <strong>{totalCheckins}</strong>
          <small>
            {displayDate(from).slice(0, 6)} – {displayDate(lastDay).slice(0, 6)}
          </small>
        </div>
        <div>
          <span>Avg. attendance</span>
          <strong>{averageRate}%</strong>
          <small>{workingDays} working day{workingDays === 1 ? "" : "s"}</small>
        </div>
      </div>

      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            id="historySearch"
            type="search"
            placeholder="Search name or mobile"
            aria-label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={"list-filter-toggle" + (showDates || customRange ? " is-on" : "")}
          aria-expanded={showDates}
          aria-label="Change date range"
          onClick={() => setShowDates((value) => !value)}
        >
          <Icon name="calendar_month" />
          {customRange ? <i aria-hidden="true" /> : null}
        </button>
      </div>

      {showDates ? (
        <div className="list-dates">
          <label>
            <span>From</span>
            <input id="historyStartDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input id="historyEndDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button type="button" className="list-dates-clear" disabled={!customRange} onClick={resetRange}>
            This month
          </button>
        </div>
      ) : null}

      {visible.length ? (
        <section className="contact-group" aria-label="Members">
          <h3 className="contact-group-title">
            Members
            <span>{visible.length}</span>
          </h3>
          <ul className="contact-list" id="historyMemberGrid">
            {visible.map(({ member, present, rate }) => (
              <li key={member.id}>
                <button type="button" className="contact-row no-dot" onClick={() => open(member.id)}>
                  <span className="contact-avatar">
                    <Photo person={member} />
                  </span>
                  <span className="contact-copy">
                    <strong>{member.name}</strong>
                    <small>
                      {present} present · {Math.max(workingDays - present, 0)} absent
                    </small>
                  </span>
                  <span className="contact-state">
                    <strong>{rate}%</strong>
                    <span className="att-meter" aria-hidden="true">
                      <i style={{ width: `${rate}%` }} />
                    </span>
                  </span>
                  <Icon name="chevron_right" className="contact-go" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : members.length ? (
        <p className="contact-empty">No members match this search.</p>
      ) : null}

      <EmptyState
        id="historyEmpty"
        className="compact-empty"
        show={members.length === 0}
        avatar="+"
        title="No attendance yet"
        copy="Add a member to view individual attendance history."
      />

      <Dialog className="sheet member-sheet" id="historyDialog" open={Boolean(selected)} onClose={() => setOpenId("")}>
        {selected ? (
          <div className="sheet-panel">
            <header className="sheet-head">
              <span className="sheet-grabber" aria-hidden="true" />
              <h2>Attendance</h2>
              <button className="sheet-close" aria-label="Close" type="button" onClick={() => setOpenId("")}>
                <Icon name="close" />
              </button>
            </header>

            <div className="sheet-body">
              <div className="sheet-member">
                <span className="contact-avatar">
                  <Photo person={selected} />
                </span>
                <div>
                  <strong>{selected.name}</strong>
                  <small>
                    {displayDate(from).slice(0, 6)} – {displayDate(lastDay)}
                  </small>
                </div>
                <span className="status-pill neutral">{stats.rate}%</span>
              </div>

              <dl className="member-stats">
                <div>
                  <dt>Present</dt>
                  <dd>{stats.present}</dd>
                </div>
                <div>
                  <dt>Absent</dt>
                  <dd>{stats.absent}</dd>
                </div>
                <div>
                  <dt>Holidays</dt>
                  <dd>{stats.holiday}</dd>
                </div>
                <div>
                  <dt>Attendance rate</dt>
                  <dd>{stats.rate}%</dd>
                </div>
                {stats.expired ? (
                  <div className="is-due">
                    <dt>Expired check-ins</dt>
                    <dd>{stats.expired}</dd>
                  </div>
                ) : null}
              </dl>

              <section className="sheet-section">
                <div className="sheet-section-head">
                  <h3>Overview</h3>
                  <div className="att-legend" aria-hidden="true">
                    <span className="present">Present</span>
                    <span className="absent">Absent</span>
                    <span className="holiday">Holiday</span>
                  </div>
                </div>
                <div className="att-dots" aria-label="Attendance chart">
                  {rows.map((row) => (
                    <span key={row.date} className={"att-dot " + row.status} title={`${displayDate(row.date)} · ${STATUS_LABEL[row.status]}`} />
                  ))}
                </div>
              </section>

              <section className="sheet-section">
                <div className="sheet-section-head">
                  <h3>Daily records</h3>
                </div>
                <div className="chip-row" role="tablist" aria-label="Status filter">
                  {STATUS_CHIPS.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === chip.key}
                      className={"filter-chip" + (statusFilter === chip.key ? " active" : "")}
                      onClick={() => setStatusFilter(chip.key)}
                    >
                      {chip.label}
                      <span>{filterCount(chip.key)}</span>
                    </button>
                  ))}
                </div>
                {filteredRows.length ? (
                  <ul className="att-days">
                    {[...filteredRows].reverse().map((row) => (
                      <li key={row.date}>
                        <span>
                          <strong>{displayDate(row.date)}</strong>
                          <small>{weekday(row.date)}</small>
                        </span>
                        <span className={"status-pill " + row.status}>{STATUS_LABEL[row.status]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="member-empty">No dates match this filter.</p>
                )}
              </section>
            </div>

            <footer className="sheet-foot">
              <button className="sheet-confirm" id="exportAttendanceCsv" type="button" onClick={exportCsv}>
                Export CSV
              </button>
            </footer>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
