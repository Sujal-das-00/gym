import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate } from "../lib/dates.js";
import { sendFeeReminder } from "../lib/whatsapp.js";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import WhatsAppIcon from "../components/WhatsAppIcon.jsx";
import EmptyState from "../components/EmptyState.jsx";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "present", label: "Present" },
];

export default function MembersView() {
  const { members, trainers, domain, openMemberDialog, openDetail } = useApp();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const trainerName = (id) => trainers.find((trainer) => trainer.id === id)?.name || "";

  const rows = members.map((member) => {
    const overdue = domain.isOverdue(member);
    const paid = domain.isPaidThisPeriod(member);
    return {
      member,
      overdue,
      paid,
      present: domain.isPresentToday(member),
      hasDues: domain.getUnpaidPeriods(member).length > 0,
      // One status per member: owing an older period outranks paying this one.
      status: overdue ? "overdue" : paid ? "paid" : "pending",
    };
  });

  const counts = {
    all: rows.length,
    overdue: rows.filter((row) => row.overdue).length,
    paid: rows.filter((row) => row.paid).length,
    present: rows.filter((row) => row.present).length,
  };

  const query = search.trim().toLowerCase();
  const visible = rows
    .filter((row) => activeFilter === "all" || row[activeFilter])
    .filter(
      (row) =>
        !query ||
        [row.member.name, row.member.phone, row.member.address].some((value) =>
          String(value || "").toLowerCase().includes(query),
        ),
    )
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.member.name.localeCompare(b.member.name));

  const noResults = members.length > 0 && visible.length === 0;

  return (
    <section className="list-view">
      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            id="memberSearch"
            type="search"
            placeholder="Search name, phone or address"
            aria-label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="chip-row" role="tablist" aria-label="Member filter">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter.value}
            className={"filter-chip" + (activeFilter === filter.value ? " active" : "")}
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
            <span>{counts[filter.value]}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <section className="contact-group" aria-label="Members">
          <h3 className="contact-group-title">
            {activeFilter === "all" ? "Members" : FILTERS.find((filter) => filter.value === activeFilter).label}
            <span>{visible.length}</span>
          </h3>
          <ul className="contact-list" id="memberList">
            {visible.map(({ member, status, present, hasDues }) => {
              const trainer = trainerName(member.trainerId);
              return (
                <li key={member.id} className="member-item">
                  <button type="button" className={"contact-row is-" + status} onClick={() => openDetail(member.id)}>
                    <span className="contact-avatar">
                      <Photo person={member} />
                    </span>
                    <span className="contact-copy">
                      <strong>
                        <span className="contact-name">{member.name}</span>
                        {present ? <em className="contact-tag">Present</em> : null}
                      </strong>
                      <small>
                        {[member.phone, trainer || domain.getMembershipLabel(member)].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                    <span className="contact-state">
                      <span className={"status-pill " + status}>
                        {status === "overdue"
                          ? "Overdue"
                          : status === "paid"
                            ? "Paid"
                            : `Due ${displayDate(domain.getDueDateKey(member)).slice(0, 6)}`}
                      </span>
                    </span>
                  </button>
                  {hasDues ? (
                    <button
                      type="button"
                      className="member-remind"
                      aria-label={`Send ${member.name} a WhatsApp fee reminder`}
                      title="WhatsApp reminder"
                      onClick={() => sendFeeReminder(member, domain)}
                    >
                      <WhatsAppIcon size={19} />
                    </button>
                  ) : (
                    <Icon name="chevron_right" className="contact-go member-go" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <EmptyState
        id="emptyState"
        show={members.length === 0 || noResults}
        avatar="+"
        title={noResults ? "No matching members" : "No members yet"}
        copy={
          noResults
            ? "Try a different search or filter."
            : "Add the first person when they come in, then track attendance and fees from one place."
        }
        action={
          <button className="primary-action" id="emptyAddMember" type="button" onClick={() => openMemberDialog()}>
            Add member
          </button>
        }
      />
    </section>
  );
}
