import { memo, useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate, todayKey } from "../lib/dates.js";
import { sendFeeReminder } from "../lib/whatsapp.js";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import WhatsAppIcon from "../components/WhatsAppIcon.jsx";
import EmptyState from "../components/EmptyState.jsx";
import useProgressiveList from "../hooks/useProgressiveList.js";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "present", label: "Present" },
];

// Memoised: a check-in or payment for one member re-renders only that row.
const MemberRow = memo(function MemberRow({ member, status, present, hasDues, trainer, domain, openDetail }) {
  return (
    <li className="member-item">
      <button type="button" className={"contact-row is-" + status} onClick={() => openDetail(member.id)}>
        <span className="contact-avatar">
          <Photo person={member} />
        </span>
        <span className="contact-copy">
          <strong>
            <span className="contact-name">{member.name}</span>
            {present ? <em className="contact-tag">Present</em> : null}
          </strong>
          <small>{[member.phone, domain.getMembershipLabel(member)].filter(Boolean).join(" · ")}</small>
          <small className="contact-meta">
            {member.startDate ? `Joined ${displayDate(member.startDate)}` : ""}
            {trainer ? (
              <>
                {member.startDate ? " · " : ""}
                <Icon name="exercise" />
                {trainer}
              </>
            ) : null}
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
});

export default function MembersView() {
  const { members, trainers, domain, openMemberDialog, openDetail } = useApp();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  // Typing stays instant: the list filters against the deferred query, which
  // React can interrupt when the next key arrives.
  const deferredSearch = useDeferredValue(search);

  const trainerNames = useMemo(() => new Map(trainers.map((trainer) => [trainer.id, trainer.name])), [trainers]);

  // Present / due labels depend on the date, so the rows also refresh at midnight.
  const today = todayKey();
  const rows = useMemo(
    () =>
      members.map((member) => {
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
      }),
    // `today` is a dependency only so the rows roll over with the date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, domain, today],
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      overdue: rows.filter((row) => row.overdue).length,
      paid: rows.filter((row) => row.paid).length,
      present: rows.filter((row) => row.present).length,
    }),
    [rows],
  );

  const query = deferredSearch.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows
        .filter((row) => activeFilter === "all" || row[activeFilter])
        .filter(
          (row) =>
            !query ||
            [row.member.name, row.member.phone, row.member.address].some((value) =>
              String(value || "").toLowerCase().includes(query),
            ),
        )
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.member.name.localeCompare(b.member.name)),
    [rows, activeFilter, query],
  );

  const shown = useProgressiveList(visible);
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
            {shown.map(({ member, status, present, hasDues }) => (
              <MemberRow
                key={member.id}
                member={member}
                status={status}
                present={present}
                hasDues={hasDues}
                trainer={trainerNames.get(member.trainerId) || ""}
                domain={domain}
                openDetail={openDetail}
              />
            ))}
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
