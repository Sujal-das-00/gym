import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, currentMonthLabel, displayDate } from "../lib/dates.js";
import { normalizePhone } from "../lib/format.js";
import Photo from "../components/Photo.jsx";
import EmptyState from "../components/EmptyState.jsx";

const FILTERS = [
  { value: "all", label: "All Members" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "present", label: "Present" },
];

export default function MembersView() {
  const { members, trainers, domain, openMemberDialog, openDetail, user, gyms, gymId, settings } = useApp();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const getTrainerName = (id) => trainers.find((trainer) => trainer.id === id)?.name || "No trainer assigned";

  const matchesFilter = (member) => {
    if (activeFilter === "overdue") return domain.isOverdue(member);
    if (activeFilter === "paid") return domain.isPaidThisPeriod(member);
    if (activeFilter === "present") return domain.isPresentToday(member);
    return true;
  };

  const matchesSearch = (member) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [member.name, member.phone, member.address].some((value) =>
      String(value || "").toLowerCase().includes(query),
    );
  };

  const visible = members
    .filter((member) => matchesFilter(member) && matchesSearch(member))
    .sort((a, b) => {
      if (domain.isOverdue(a) !== domain.isOverdue(b)) return domain.isOverdue(a) ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const noResults = members.length > 0 && visible.length === 0;

  // wa.me needs the full international number; stored numbers are the bare
  // 10-digit local form, so put the Indian country code back for the link.
  const toWhatsappNumber = (phone) => {
    const digits = normalizePhone(phone);
    return digits.length === 10 ? "91" + digits : digits;
  };

  const sendReminder = (member) => {
    if (!domain.getUnpaidPeriods(member).length) return;
    const phone = toWhatsappNumber(member.phone);
    const message = encodeURIComponent(
      `Hello ${member.name}, your gym fee of ${currency(member.fee)} is due on ${displayDate(
        domain.getDueDateKey(member),
      )}. Please clear it soon. Thank you.`,
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
  };

  // The member portal is served from this same host, at /checkin/<gym-slug>.
  const gymSlug = user?.gym?.slug || gyms.find((gym) => gym.id === gymId)?.slug || "";
  const gymName = settings?.gymName || "our gym";

  const sendCredentials = (member) => {
    const phone = toWhatsappNumber(member.phone);
    const loginUrl = gymSlug ? `${window.location.origin}/checkin/${gymSlug}` : window.location.origin;
    const message = encodeURIComponent(
      `Hello ${member.name},\n\n` +
        `Welcome to ${gymName}! Your member login is ready.\n\n` +
        `*Login details*\n` +
        `Membership ID: ${member.gymId}\n` +
        `Mobile Number: ${member.phone}\n` +
        `Login link: ${loginUrl}\n\n` +
        `Sign in with your Membership ID and registered mobile number to view your attendance, payments and dues.\n\n` +
        `Please keep these details confidential and do not share them with anyone.\n\n` +
        `Regards,\n${gymName}`,
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <section className="panel action-panel" aria-label="Quick actions">
        <label className="search-box">
          <input
            id="searchInput"
            type="search"
            placeholder="Search members by name, phone or address..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="filter-tabs" role="group" aria-label="Member filter">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={"tab" + (activeFilter === filter.value ? " active" : "")}
              // style.css colours each tab's dot off this attribute — keep it.
              data-filter={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel member-section" id="members">
        <div className="panel-head">
          <div>
            <h2>Members</h2>
            <p>Tap a card to manage attendance, payment, and reminders.</p>
          </div>
          <span id="monthLabel">{currentMonthLabel()}</span>
        </div>
        <div className="member-list" id="memberList" style={{ display: visible.length ? "grid" : "none" }}>
          {visible.map((member) => {
            const overdue = domain.isOverdue(member);
            const paid = domain.isPaidThisPeriod(member);
            const hasDues = domain.getUnpaidPeriods(member).length > 0;
            return (
              <article
                key={member.id}
                className={"member-card " + (overdue ? "is-overdue" : paid ? "is-paid" : "is-pending")}
              >
                <button className="member-card-main" type="button" onClick={() => openDetail(member.id)}>
                  <Photo person={member} />
                  <div>
                    <h3>{member.name}</h3>
                    <p className="member-phone">{member.phone}</p>
                    <p className="member-address">{member.address}</p>
                    <p className="member-trainer">{`Trainer: ${getTrainerName(member.trainerId)}`}</p>
                  </div>
                  <div className="member-badges">
                    {overdue ? (
                      <span className="badge overdue">Overdue</span>
                    ) : (
                      <span className="badge pending">Due {displayDate(domain.getDueDateKey(member))}</span>
                    )}
                    {paid ? <span className="badge paid">Paid</span> : null}
                    {domain.isPresentToday(member) ? <span className="badge present">Present today</span> : null}
                  </div>
                </button>
                <div className="member-card-foot">
                  <div className="member-fee">
                    <strong>{currency(member.fee)}</strong>
                    <span>{domain.getMembershipLabel(member)}</span>
                  </div>
                  <div className="member-card-actions">
                    <button
                      className="member-whatsapp-action secondary-action"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        sendCredentials(member);
                      }}
                    >
                      Send credentials
                    </button>
                    <button
                      className="member-whatsapp-action"
                      type="button"
                      disabled={!hasDues}
                      onClick={(event) => {
                        event.stopPropagation();
                        sendReminder(member);
                      }}
                    >
                      WhatsApp reminder
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
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
    </>
  );
}
