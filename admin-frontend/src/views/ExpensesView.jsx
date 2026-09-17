import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { EXPENSE_CATEGORIES } from "../lib/constants.js";
import { currency, displayDate, getDefaultHistoryRange } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import { buildLedgerEntries, filterEntriesByDate } from "../lib/ledger.js";
import Icon from "../components/Icon.jsx";
import Photo from "../components/Photo.jsx";

export default function ExpensesView() {
  const { members, expenses, domain, openExpenseDialog, openFeeDialog, openDetail, showToast } = useApp();
  const [range] = useState(() => getDefaultHistoryRange());
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filterLedgerEntries = (entries) =>
    entries.filter((entry) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
      return true;
    });

  // Shared with the Detailed Insights screen (lib/ledger.js) so both always
  // report the same totals from the same records.
  const entries = filterEntriesByDate(buildLedgerEntries({ members, expenses, domain }), startDate, endDate);
  const earnings = entries.filter((entry) => entry.type === "earning");
  const expenseEntries = entries.filter((entry) => entry.type === "expense");
  const earnedTotal = earnings.reduce((sum, entry) => sum + entry.amount, 0);
  const expenseTotal = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const net = earnedTotal - expenseTotal;

  const overdueRows = members
    .map((member) => ({
      member,
      periods: domain.getDueUnpaidPeriods(member).length,
      amount: domain.getOverdueAmount(member),
    }))
    .filter((row) => row.periods > 0)
    .sort((a, b) => b.amount - a.amount || a.member.name.localeCompare(b.member.name));
  const overdueTotal = overdueRows.reduce((sum, row) => sum + row.amount, 0);

  const visible = filterLedgerEntries(entries);

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

  const onLedgerClick = (entry) => {
    if (entry.type === "expense") {
      const expense = expenses.find((item) => item.id === entry.id);
      if (expense) openExpenseDialog(expense);
      return;
    }
    if (members.some((member) => member.id === entry.memberId)) openDetail(entry.memberId);
  };

  return (
    <>
      <section className="stats-grid finance-stats" aria-label="Finance summary">
        <article className="stat-card paid">
          <div className="stat-icon">
            <Icon name="savings" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Collected</span>
          <strong id="financeCollected">{currency(earnedTotal)}</strong>
          <small id="financeCollectedCount">{`${earnings.length} payment${earnings.length === 1 ? "" : "s"} received`}</small>
        </article>
        <article className="stat-card due">
          <div className="stat-icon">
            <Icon name="shopping_cart" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Expenses</span>
          <strong id="financeExpenses">{currency(expenseTotal)}</strong>
          <small id="financeExpensesCount">{`${expenseEntries.length} expense${expenseEntries.length === 1 ? "" : "s"} recorded`}</small>
        </article>
        <article className="stat-card total">
          <div className="stat-icon">
            <Icon name="account_balance" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Net Balance</span>
          <strong id="financeNet" className={net < 0 ? "is-negative" : ""}>
            {(net < 0 ? "−" : "") + currency(Math.abs(net))}
          </strong>
          <small id="financeNetHint">{net < 0 ? "Spending more than collected" : "Collected minus expenses"}</small>
        </article>
        <article className="stat-card attend">
          <div className="stat-icon">
            <Icon name="person_alert" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Overdue Dues</span>
          <strong id="financeOverdueAmount">{currency(overdueTotal)}</strong>
          <small id="financeOverdueCount">{`${overdueRows.length} member${overdueRows.length === 1 ? "" : "s"} overdue`}</small>
        </article>
      </section>

      <div className="finance-grid">
        <section className="panel finance-ledger-panel">
          <div className="panel-head">
            <div>
              <h2>Earnings &amp; Expenses</h2>
              <p id="financeRangeLabel">
                {startDate || endDate
                  ? `${startDate ? displayDate(startDate) : "Beginning"} to ${endDate ? displayDate(endDate) : "today"}`
                  : "All records"}
              </p>
            </div>
            <div className="finance-head-actions">
              <button className="secondary-action" id="exportFinanceCsv" type="button" onClick={exportFinanceCsv}>
                Export CSV
              </button>
              <button className="primary-action" id="openAddExpense" type="button" onClick={() => openExpenseDialog()}>
                <span>+</span> Add expense
              </button>
            </div>
          </div>
          <div className="history-filters finance-filters">
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
            <label>
              <span>Type</span>
              <select id="financeTypeFilter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Earnings + expenses</option>
                <option value="earning">Earnings only</option>
                <option value="expense">Expenses only</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                id="financeCategoryFilter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
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
          </div>
          <div className="finance-ledger" id="financeLedger">
            {visible.length ? (
              visible.map((entry) => (
                <button
                  key={entry.type + ":" + entry.id}
                  className={"ledger-row " + (entry.type === "expense" ? "is-expense" : "is-earning")}
                  type="button"
                  onClick={() => onLedgerClick(entry)}
                >
                  <span className="ledger-ico" aria-hidden="true">
                    <Icon name={entry.type === "expense" ? "arrow_outward" : "south_west"} />
                  </span>
                  <span className="ledger-copy">
                    <strong>{entry.title}</strong>
                    <span>{`${entry.detail} · ${displayDate(entry.date)}`}</span>
                  </span>
                  <strong className="ledger-amount">
                    {entry.type === "expense" ? "−" : "+"} {currency(entry.amount)}
                  </strong>
                </button>
              ))
            ) : (
              <p className="history-empty">
                No earnings or expenses match these filters. Use "Add expense" to record rent, trainer payments, or
                anything else.
              </p>
            )}
          </div>
        </section>

        <section className="panel finance-overdue-panel">
          <div className="panel-head">
            <div>
              <h2>Overdue members</h2>
              <p id="financeOverdueLabel">
                {overdueRows.length
                  ? `${overdueRows.length} member${overdueRows.length === 1 ? "" : "s"} owe ${currency(overdueTotal)} in total.`
                  : "Members with pending dues."}
              </p>
            </div>
          </div>
          <div className="finance-overdue-list" id="financeOverdueList">
            {overdueRows.length ? (
              overdueRows.map(({ member, periods, amount }) => (
                <article className="finance-overdue-row" key={member.id}>
                  <Photo person={member} />
                  <div className="finance-overdue-copy">
                    <h3>{member.name}</h3>
                    <p>
                      {`${periods} unpaid ${domain.getPeriodUnitLabel(member)}${periods === 1 ? "" : "s"} · due since ${displayDate(domain.getDueDateKey(member))}`}
                    </p>
                  </div>
                  <div className="finance-overdue-actions">
                    <strong>{currency(amount)}</strong>
                    <button className="secondary-action" type="button" onClick={() => openFeeDialog(member.id)}>
                      Collect
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="history-empty">
                No overdue members. Every collected payment shows up in the ledger as an earning.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
