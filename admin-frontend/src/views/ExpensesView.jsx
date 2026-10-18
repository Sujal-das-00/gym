import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { CATEGORY_ICONS, EXPENSE_CATEGORIES } from "../lib/constants.js";
import { currency, dateFormatter, displayDate, getDefaultHistoryRange, localDateKey, parseDateKey, todayKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import { getLedgerEntries, filterEntriesByDate, groupEntriesByDay } from "../lib/ledger.js";
import Icon from "../components/Icon.jsx";

const TYPE_CHIPS = [
  { key: "all", label: "All" },
  { key: "earning", label: "Earnings" },
  { key: "expense", label: "Expenses" },
];

function dayTitle(key) {
  const today = todayKey();
  const yesterday = parseDateKey(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) return "Today";
  if (key === localDateKey(yesterday)) return "Yesterday";
  return dateFormatter({ weekday: "short", day: "numeric", month: "short" }).format(parseDateKey(key));
}

const signed = (amount) => (amount < 0 ? "−" : "+") + currency(Math.abs(amount));

export default function ExpensesView() {
  const { members, expenses, domain, openExpenseDialog, openDetail, setView, showToast } = useApp();
  const [range] = useState(() => getDefaultHistoryRange());
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const customFilters = startDate !== range.start || endDate !== range.end || categoryFilter !== "all";

  // Shared with the Detailed Insights screen (lib/ledger.js) so both always
  // report the same totals from the same records.
  const entries = filterEntriesByDate(getLedgerEntries({ members, expenses, domain }), startDate, endDate);
  const earnings = entries.filter((entry) => entry.type === "earning");
  const spending = entries.filter((entry) => entry.type === "expense");
  const earnedTotal = earnings.reduce((sum, entry) => sum + entry.amount, 0);
  const spentTotal = spending.reduce((sum, entry) => sum + entry.amount, 0);
  const net = earnedTotal - spentTotal;

  const overdue = members.filter((member) => domain.isOverdue(member));
  const overdueTotal = overdue.reduce((sum, member) => sum + domain.getOverdueAmount(member), 0);

  const byCategory = entries.filter((entry) => categoryFilter === "all" || entry.category === categoryFilter);
  const counts = {
    all: byCategory.length,
    earning: byCategory.filter((entry) => entry.type === "earning").length,
    expense: byCategory.filter((entry) => entry.type === "expense").length,
  };
  const visible = byCategory.filter((entry) => typeFilter === "all" || entry.type === typeFilter);
  const days = groupEntriesByDay(visible);

  const rangeLabel =
    startDate || endDate
      ? `${startDate ? displayDate(startDate).slice(0, 6) : "Start"} – ${endDate ? displayDate(endDate).slice(0, 6) : "today"}`
      : "All records";

  const resetFilters = () => {
    setStartDate(range.start);
    setEndDate(range.end);
    setCategoryFilter("all");
  };

  const exportFinanceCsv = () => {
    if (!visible.length) {
      showToast("No records to export");
      return;
    }
    downloadCsv(
      [
        ["Date", "Type", "Category", "Description", "Amount"],
        ...visible.map((entry) => [
          displayDate(entry.date),
          entry.type === "expense" ? "Expense" : "Earning",
          domain.expenseCategoryLabel(entry.category),
          entry.title,
          (entry.type === "expense" ? -entry.amount : entry.amount).toString(),
        ]),
      ],
      "gym-earnings-expenses.csv",
    );
    showToast("CSV exported");
  };

  const onEntryClick = (entry) => {
    if (entry.type === "expense") {
      const expense = expenses.find((item) => item.id === entry.id);
      if (expense) openExpenseDialog(expense);
      return;
    }
    if (members.some((member) => member.id === entry.memberId)) openDetail(entry.memberId);
  };

  return (
    <section className="list-view" aria-label="Expense tracker">
      <section className="money-card" aria-label="Finance summary">
        <span className="money-card-label">Net balance · {rangeLabel}</span>
        <strong id="financeNet" className={net < 0 ? "is-negative" : ""}>
          {(net < 0 ? "−" : "") + currency(Math.abs(net))}
        </strong>
        <div className="money-card-split">
          <div className="is-in">
            <span className="money-card-ico" aria-hidden="true">
              <Icon name="south_west" />
            </span>
            <div>
              <small>Collected</small>
              <b id="financeCollected">{currency(earnedTotal)}</b>
              <small>
                {earnings.length} payment{earnings.length === 1 ? "" : "s"}
              </small>
            </div>
          </div>
          <div className="is-out">
            <span className="money-card-ico" aria-hidden="true">
              <Icon name="north_east" />
            </span>
            <div>
              <small>Spent</small>
              <b id="financeExpenses">{currency(spentTotal)}</b>
              <small>
                {spending.length} expense{spending.length === 1 ? "" : "s"}
              </small>
            </div>
          </div>
        </div>
        {overdue.length ? (
          <button type="button" className="money-card-due" onClick={() => setView("payments")}>
            <Icon name="error" />
            <span className="money-card-due-text">
              <b id="financeOverdueAmount">{currency(overdueTotal)}</b> overdue from {overdue.length} member
              {overdue.length === 1 ? "" : "s"}
            </span>
            <Icon name="chevron_right" />
          </button>
        ) : null}
      </section>

      <div className="list-toolbar">
        <button className="toolbar-add" id="openAddExpense" type="button" onClick={() => openExpenseDialog()}>
          <Icon name="add" />
          Add expense
        </button>
        <button
          type="button"
          className={"list-filter-toggle" + (showFilters || customFilters ? " is-on" : "")}
          aria-expanded={showFilters}
          aria-label="Filter by date and category"
          onClick={() => setShowFilters((value) => !value)}
        >
          <Icon name="tune" />
          {customFilters ? <i aria-hidden="true" /> : null}
        </button>
        <button type="button" className="list-filter-toggle" id="exportFinanceCsv" aria-label="Export CSV" onClick={exportFinanceCsv}>
          <Icon name="download" />
        </button>
      </div>

      {showFilters ? (
        <div className="list-dates ledger-filters">
          <label>
            <span>From</span>
            <input
              id="financeStartDate"
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
              id="financeEndDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className="ledger-filters-category">
            <span>Category</span>
            <select id="financeCategoryFilter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              <option value="membership-fee">Membership fees</option>
              <option value="admission-fee">Admission fees</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="list-dates-clear" disabled={!customFilters} onClick={resetFilters}>
            Reset
          </button>
        </div>
      ) : null}

      <div className="chip-row" role="tablist" aria-label="Entry type">
        {TYPE_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={typeFilter === chip.key}
            className={"filter-chip" + (typeFilter === chip.key ? " active" : "")}
            onClick={() => setTypeFilter(chip.key)}
          >
            {chip.label}
            <span>{counts[chip.key]}</span>
          </button>
        ))}
      </div>

      <div id="financeLedger" className="ledger-days">
        {days.length ? (
          days.map((day) => (
            <section className="contact-group" key={day.date} aria-label={displayDate(day.date)}>
              <h3 className="contact-group-title ledger-day-title">
                {dayTitle(day.date)}
                <em className={day.net < 0 ? "is-out" : "is-in"}>{signed(day.net)}</em>
              </h3>
              <ul className="contact-list">
                {day.entries.map((entry) => (
                  <li key={entry.type + ":" + entry.id}>
                    <button
                      type="button"
                      className={"contact-row no-dot ledger-entry " + (entry.type === "expense" ? "is-out" : "is-in")}
                      onClick={() => onEntryClick(entry)}
                    >
                      <span className="ledger-tile" aria-hidden="true">
                        <Icon name={CATEGORY_ICONS[entry.category] || "receipt_long"} />
                      </span>
                      <span className="contact-copy">
                        <strong>
                          <span className="contact-name">{entry.title}</span>
                        </strong>
                        <small>
                          {[entry.detail, domain.paymentModeLabel(entry.mode)].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                      <span className="contact-state">
                        <strong className="ledger-amount">
                          {entry.type === "expense" ? "−" : "+"}
                          {currency(entry.amount)}
                        </strong>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="contact-empty">
            No earnings or expenses match these filters. Use &quot;Add expense&quot; to record rent, trainer payments
            or anything else.
          </p>
        )}
      </div>
    </section>
  );
}
