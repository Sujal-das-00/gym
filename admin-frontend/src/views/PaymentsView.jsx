import { memo, useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, displayDate, monthKey, todayKey } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";

const VISIBLE_LIMIT = 120;

// One status per member (domain.getFeeStatus) so every contact lands in exactly one group.
const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "balance", label: "Balance due" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
];

// Memoised: recording one payment re-renders that row only.
const PaymentRow = memo(function PaymentRow({ row, hasRange, domain, openFeeDialog }) {
  return (
    <li>
      <button type="button" className={"contact-row is-" + row.status} onClick={() => openFeeDialog(row.member.id)}>
        <span className="contact-avatar">
          <Photo person={row.member} />
        </span>
        <span className="contact-copy">
          <strong>{row.member.name}</strong>
          <small>
            {hasRange
              ? `${row.paymentCount} payment${row.paymentCount === 1 ? "" : "s"} · ${currency(row.collected)}`
              : [row.member.phone, domain.getMembershipLabel(row.member)].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className="contact-state">
          {row.status === "overdue" ? (
            <>
              <strong>{currency(row.overdueAmount)}</strong>
              <small>{row.duePeriods ? `${row.duePeriods} due` : "Balance"}</small>
            </>
          ) : row.status === "balance" ? (
            <>
              <strong>{currency(row.overdueAmount)}</strong>
              <small>Balance left</small>
            </>
          ) : row.status === "paid" ? (
            <>
              <strong>Paid</strong>
              <small>Next {displayDate(row.dueDate).slice(0, 6)}</small>
            </>
          ) : (
            <>
              <strong>{currency(row.member.fee)}</strong>
              <small>Due {displayDate(row.dueDate).slice(0, 6)}</small>
            </>
          )}
        </span>
        <Icon name="chevron_right" className="contact-go" />
      </button>
    </li>
  );
});

export default function PaymentsView() {
  const { members, domain, openFeeDialog } = useApp();
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDates, setShowDates] = useState(false);
  const hasRange = Boolean(startDate || endDate);

  // Statuses and "this month" depend on the date, so rows also refresh at midnight.
  const today = todayKey();
  const rows = useMemo(() => {
    const month = monthKey();
    const inRange = (payment) => {
      const day = String(payment.date || "").slice(0, 10);
      if (hasRange) {
        if (startDate && day < startDate) return false;
        if (endDate && day > endDate) return false;
        return true;
      }
      return day.startsWith(month);
    };
    return members.map((member) => {
      const status = domain.getFeeStatus(member);
      const payments = (member.payments || []).filter(inRange);
      return {
        member,
        status,
        collected: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        paymentCount: payments.length,
        // Overdue periods plus any balance left from part payments.
        overdueAmount: domain.getOutstandingAmount(member),
        duePeriods: status === "overdue" ? domain.getDueUnpaidPeriods(member).length : 0,
        dueDate: domain.getDueDateKey(member),
      };
    });
    // `today` is a dependency only so the rows roll over with the date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, domain, hasRange, startDate, endDate, today]);

  const counts = { all: rows.length, overdue: 0, balance: 0, pending: 0, paid: 0 };
  let collected = 0;
  let outstanding = 0;
  rows.forEach((row) => {
    counts[row.status] += 1;
    collected += row.collected;
    outstanding += row.overdueAmount;
  });

  // Typing stays instant: the list filters against the deferred query.
  const query = useDeferredValue(search).trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows
        .filter((row) => statusFilter === "all" || row.status === statusFilter)
        .filter((row) =>
          [row.member.name, row.member.phone].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          ),
        )
        .sort((a, b) => b.overdueAmount - a.overdueAmount || a.member.name.localeCompare(b.member.name)),
    [rows, statusFilter, query],
  );
  const visible = filtered.slice(0, VISIBLE_LIMIT);
  const groups = GROUPS.map((group) => ({ ...group, rows: visible.filter((row) => row.status === group.key) })).filter(
    (group) => group.rows.length,
  );

  const clearDates = () => {
    setStartDate("");
    setEndDate("");
  };

  return (
    <section className="list-view">
      <div className="summary-pair">
        <div>
          <span>{hasRange ? "Collected in range" : "Collected this month"}</span>
          <strong>{currency(collected)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong className={outstanding ? "is-due" : ""}>{currency(outstanding)}</strong>
        </div>
      </div>

      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            id="paymentSearch"
            type="search"
            placeholder="Search name or mobile"
            aria-label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={"list-filter-toggle" + (showDates || hasRange ? " is-on" : "")}
          aria-expanded={showDates}
          aria-label="Filter by date range"
          onClick={() => setShowDates((open) => !open)}
        >
          <Icon name="calendar_month" />
          {hasRange ? <i aria-hidden="true" /> : null}
        </button>
      </div>

      {showDates ? (
        <div className="list-dates">
          <label>
            <span>From</span>
            <input
              id="paymentStartDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              id="paymentEndDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button type="button" className="list-dates-clear" disabled={!hasRange} onClick={clearDates}>
            Clear
          </button>
        </div>
      ) : null}

      <div className="chip-row" role="tablist" aria-label="Payment status">
        {[{ key: "all", label: "All" }, ...GROUPS].map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={statusFilter === chip.key}
            className={"filter-chip " + chip.key + (statusFilter === chip.key ? " active" : "")}
            onClick={() => setStatusFilter(chip.key)}
          >
            {chip.label}
            <span>{counts[chip.key]}</span>
          </button>
        ))}
      </div>

      {groups.length ? (
        groups.map((group) => (
          <section className="contact-group" key={group.key} aria-label={group.label}>
            <h3 className="contact-group-title">
              {group.label}
              <span>{group.rows.length}</span>
            </h3>
            <ul className="contact-list">
              {group.rows.map((row) => (
                <PaymentRow
                  key={row.member.id}
                  row={row}
                  hasRange={hasRange}
                  domain={domain}
                  openFeeDialog={openFeeDialog}
                />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="contact-empty">
          {members.length ? "No members match these filters." : "Add a member to start collecting fees."}
        </p>
      )}

      {filtered.length > visible.length ? (
        <p className="contact-more">
          Showing the first {VISIBLE_LIMIT} of {filtered.length}. Search to narrow the list.
        </p>
      ) : null}
    </section>
  );
}
