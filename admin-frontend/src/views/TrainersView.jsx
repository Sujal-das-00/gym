import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { todayKey } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import DayBar from "../components/DayBar.jsx";
import EmptyState from "../components/EmptyState.jsx";

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

export default function TrainersView() {
  const {
    members,
    trainers,
    domain,
    trainerAttendanceDate,
    setTrainerAttendanceDate,
    setTrainerAttendanceStatus,
    openTrainerDialog,
  } = useApp();
  const [tab, setTab] = useState("roster");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Two-step "mark absent", like member attendance: a correction never happens on one stray tap.
  const [pendingRemovalId, setPendingRemovalId] = useState("");

  const selectedDate = trainerAttendanceDate || todayKey();
  const today = todayKey();
  const activeCount = trainers.filter((trainer) => trainer.status === "active").length;
  const presentToday = trainers.filter((trainer) => domain.hasTrainerAttendance(trainer, today)).length;
  const assignedCount = (trainerId) => members.filter((member) => member.trainerId === trainerId).length;
  const counts = { all: trainers.length, active: activeCount, inactive: trainers.length - activeCount };

  const query = search.trim().toLowerCase();
  const matchesSearch = (trainer) =>
    !query ||
    [trainer.name, trainer.phone, trainer.specialty, trainer.shift, trainer.bio].some((value) =>
      String(value || "").toLowerCase().includes(query),
    );

  const roster = trainers
    .filter((trainer) => (statusFilter === "all" || trainer.status === statusFilter) && matchesSearch(trainer))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));

  const attendanceRows = trainers
    .filter(matchesSearch)
    .map((trainer) => ({ trainer, present: domain.hasTrainerAttendance(trainer, selectedDate) }))
    .sort(
      (a, b) =>
        Number(a.present) - Number(b.present) ||
        Number(b.trainer.status === "active") - Number(a.trainer.status === "active") ||
        a.trainer.name.localeCompare(b.trainer.name),
    );
  const presentOnDate = attendanceRows.filter((row) => row.present).length;

  const changeDate = (key) => {
    setTrainerAttendanceDate(key);
    setPendingRemovalId("");
  };

  const mark = (trainerId, present) => {
    setPendingRemovalId("");
    setTrainerAttendanceStatus(trainerId, selectedDate, present);
  };

  const noResults = trainers.length > 0 && (tab === "roster" ? roster.length === 0 : attendanceRows.length === 0);

  return (
    <section className="list-view" id="trainers" aria-label="Trainers">
      <div className="summary-pair">
        <div>
          <span>Active trainers</span>
          <strong id="trainerSummaryActive">{activeCount}</strong>
          <small>of {trainers.length} in your gym</small>
        </div>
        <div>
          <span>Present today</span>
          <strong id="trainerSummaryPresent">{presentToday}</strong>
          <small>
            {Math.max(activeCount - presentToday, 0)} active not in yet
          </small>
        </div>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Trainer view">
        <label>
          <input type="radio" name="trainerTab" checked={tab === "roster"} onChange={() => setTab("roster")} />
          <span>Trainer list</span>
        </label>
        <label>
          <input type="radio" name="trainerTab" checked={tab === "attendance"} onChange={() => setTab("attendance")} />
          <span>Attendance</span>
        </label>
      </div>

      {tab === "attendance" ? (
        <DayBar date={selectedDate} onChange={changeDate} inputId="trainerAttendanceDate" label="Trainer attendance date" />
      ) : null}

      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            id="trainerSearch"
            type="search"
            placeholder="Name, specialty or shift"
            aria-label="Search trainers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="toolbar-add" id="openAddTrainer" type="button" onClick={() => openTrainerDialog()}>
          <Icon name="add" />
          <span className="toolbar-add-text">Add trainer</span>
        </button>
      </div>

      {tab === "roster" ? (
        <>
          <div className="chip-row" role="tablist" aria-label="Trainer status">
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
                <span>{counts[chip.key]}</span>
              </button>
            ))}
          </div>

          {roster.length ? (
            <section className="contact-group" aria-label="Trainer list">
              <h3 className="contact-group-title">
                All trainers
                <span>{roster.length}</span>
              </h3>
              <ul className="contact-list" id="trainerList">
                {roster.map((trainer) => {
                  const assigned = assignedCount(trainer.id);
                  const inactive = trainer.status === "inactive";
                  return (
                    <li key={trainer.id}>
                      <button
                        type="button"
                        className={"contact-row " + (inactive ? "is-inactive" : "is-paid")}
                        onClick={() => openTrainerDialog(trainer)}
                      >
                        <span className="contact-avatar">
                          <Photo person={trainer} />
                        </span>
                        <span className="contact-copy">
                          <strong>
                            <span className="contact-name">{trainer.name}</span>
                            {inactive ? <em className="contact-tag muted">Inactive</em> : null}
                          </strong>
                          <small>{[trainer.specialty, trainer.shift].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="contact-state">
                          <strong>{assigned}</strong>
                          <small>member{assigned === 1 ? "" : "s"}</small>
                        </span>
                        <Icon name="chevron_right" className="contact-go" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : attendanceRows.length ? (
        <section className="contact-group" aria-label="Trainer attendance">
          <h3 className="contact-group-title">
            Checked in
            <span id="trainerAttendancePresent">
              {presentOnDate}/{attendanceRows.length}
            </span>
          </h3>
          <ul className="contact-list" id="trainerAttendanceList">
            {attendanceRows.map(({ trainer, present }) => {
              const confirming = pendingRemovalId === trainer.id && present;
              return (
                <li key={trainer.id}>
                  <div className={"contact-row is-static " + (present ? "is-paid" : "is-pending")}>
                    <span className="contact-avatar">
                      <Photo person={trainer} />
                    </span>
                    <span className="contact-copy">
                      <strong>
                        <span className="contact-name">{trainer.name}</span>
                      </strong>
                      <small>{[trainer.specialty, trainer.shift].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="contact-state">
                      {present ? (
                        confirming ? (
                          <span className="att-confirm" role="group" aria-label={`Confirm attendance correction for ${trainer.name}`}>
                            <button type="button" className="att-btn danger" onClick={() => mark(trainer.id, false)}>
                              Mark absent
                            </button>
                            <button
                              type="button"
                              className="att-btn icon"
                              aria-label="Keep checked in"
                              onClick={() => setPendingRemovalId("")}
                            >
                              <Icon name="close" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="att-btn in"
                            aria-label={`${trainer.name} is checked in. Tap to correct.`}
                            onClick={() => setPendingRemovalId(trainer.id)}
                          >
                            <Icon name="check" />
                            In
                          </button>
                        )
                      ) : (
                        <button type="button" className="att-btn" onClick={() => mark(trainer.id, true)}>
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
      ) : null}

      {noResults ? <p className="contact-empty">No trainers match this search.</p> : null}

      <EmptyState
        id="trainerEmptyState"
        show={trainers.length === 0}
        avatar="T"
        title="No trainers yet"
        copy="Add your trainers to assign them to members and keep their attendance."
        action={
          <button className="primary-action" id="emptyAddTrainer" type="button" onClick={() => openTrainerDialog()}>
            Add trainer
          </button>
        }
      />
    </section>
  );
}
