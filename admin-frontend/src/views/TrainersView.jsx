import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate, todayKey } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";
import EmptyState from "../components/EmptyState.jsx";

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const selectedDate = trainerAttendanceDate || todayKey();
  const query = search.trim().toLowerCase();

  const visible = trainers
    .filter((trainer) => {
      if (statusFilter !== "all" && trainer.status !== statusFilter) return false;
      if (!query) return true;
      return [trainer.name, trainer.phone, trainer.specialty, trainer.shift, trainer.bio].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );
    })
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));

  const activeCount = trainers.filter((trainer) => trainer.status === "active").length;
  const specialtyCount = new Set(trainers.map((trainer) => trainer.specialty.toLowerCase()).filter(Boolean)).size;
  const presentCount = trainers.filter((trainer) => domain.hasTrainerAttendance(trainer, selectedDate)).length;
  const noResults = trainers.length > 0 && visible.length === 0;

  const getAssignedMemberCount = (trainerId) => members.filter((member) => member.trainerId === trainerId).length;

  const attendanceRows = trainers
    .slice()
    .sort(
      (a, b) =>
        Number(domain.hasTrainerAttendance(b, selectedDate)) - Number(domain.hasTrainerAttendance(a, selectedDate)) ||
        a.name.localeCompare(b.name),
    );

  return (
    <>
      <div className="trainer-summary">
        <article>
          <span>Total trainers</span>
          <strong id="trainerSummaryTotal">{trainers.length}</strong>
        </article>
        <article>
          <span>Active trainers</span>
          <strong id="trainerSummaryActive">{activeCount}</strong>
        </article>
        <article>
          <span>Specialties</span>
          <strong id="trainerSummarySpecialties">{specialtyCount}</strong>
        </article>
        <article>
          <span>Present today</span>
          <strong id="trainerSummaryPresent">{presentCount}</strong>
        </article>
      </div>

      <section className="panel trainer-section" id="trainers">
        <div className="trainer-toolbar">
          <label className="search-box">
            <input
              id="trainerSearch"
              type="search"
              placeholder="Name, mobile, specialty, or shift"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="panel-head wmb-100 ">
            <button className="primary-action " id="openAddTrainer" type="button" onClick={() => openTrainerDialog()}>
              <span>+</span>
              Add trainer
            </button>
          </div>
          <label>
            <span>Status</span>
            <select
              id="trainerStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All trainers</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <section className="trainer-attendance-panel" aria-label="Trainer attendance">
          <div className="panel-head compact">
            <label className="date-picker wmb-100">
              Date
              <input
                id="trainerAttendanceDate"
                type="date"
                value={selectedDate}
                onChange={(event) => setTrainerAttendanceDate(event.target.value || todayKey())}
              />
            </label>
          </div>
          <div className="attendance-summary trainer-attendance-summary">
            <strong id="trainerAttendancePresent">{presentCount} checked in</strong>
            <span id="trainerAttendanceLabel">
              {Math.max(trainers.length - presentCount, 0)} pending | {displayDate(selectedDate)}
            </span>
          </div>
          <div className="trainer-attendance-list" id="trainerAttendanceList">
            {attendanceRows.map((trainer) => {
              const present = domain.hasTrainerAttendance(trainer, selectedDate);
              return (
                <article
                  key={trainer.id}
                  className={"trainer-attendance-row " + (present ? "is-present" : "is-pending")}
                >
                  <Photo person={trainer} />
                  <div>
                    <h3>{trainer.name}</h3>
                    <p>
                      {trainer.specialty} · {trainer.shift}
                    </p>
                  </div>
                  <span className={"attendance-status " + (present ? "present" : "pending")}>
                    {present ? "Present" : "Not marked"}
                  </span>
                  <button
                    className={"attendance-button " + (present ? "correction" : "mark-present")}
                    type="button"
                    onClick={() => setTrainerAttendanceStatus(trainer.id, selectedDate, !present)}
                  >
                    {present ? "Mark absent" : "Mark present"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <div className="trainer-list" id="trainerList" style={{ display: visible.length ? "grid" : "none" }}>
          {visible.map((trainer) => {
            const assigned = getAssignedMemberCount(trainer.id);
            return (
              <article className="trainer-card" key={trainer.id}>
                <button className="trainer-card-main" type="button" onClick={() => openTrainerDialog(trainer)}>
                  <Photo person={trainer} />
                  <div>
                    <div className="trainer-card-headline">
                      <h3>{trainer.name}</h3>
                      <span className={"badge " + (trainer.status === "inactive" ? "pending" : "present")}>
                        {trainer.status === "inactive" ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <p>
                      {trainer.phone} · {trainer.specialty}
                    </p>
                    <p>
                      {trainer.shift} · {assigned} assigned member{assigned === 1 ? "" : "s"}
                    </p>
                    {trainer.bio ? <small>{trainer.bio}</small> : null}
                  </div>
                </button>
              </article>
            );
          })}
        </div>

        <EmptyState
          id="trainerEmptyState"
          show={trainers.length === 0 || noResults}
          avatar="T"
          title={noResults ? "No matching trainers" : "No trainers found"}
          copy={
            noResults
              ? "Try another search or status filter."
              : 'It looks like you haven\'t added any trainers yet. Use the "Add trainer" button below to populate your roster.'
          }
          action={
            <button className="primary-action" id="emptyAddTrainer" type="button" onClick={() => openTrainerDialog()}>
              Add trainer
            </button>
          }
        />
      </section>
    </>
  );
}
