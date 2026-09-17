import { useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, monthKey, todayKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import {
  buildLedgerEntries,
  filterEntriesByDate,
  groupEntriesByCategory,
  groupEntriesByDay,
  summarizeEntries,
  topPayingMembers,
} from "../lib/ledger.js";
import {
  MONTH_OPTIONS,
  PERIOD_MODES,
  availableYears,
  dayLabel,
  describePeriod,
  resolvePeriod,
} from "../lib/period.js";
import Icon from "../components/Icon.jsx";

/** A category row with a bar showing its share of that side's total. */
function BreakdownRow({ row, tone }) {
  return (
    <li className={"insight-breakdown-row is-" + tone}>
      <div className="insight-breakdown-head">
        <span className="insight-breakdown-label">{row.label}</span>
        <strong>{currency(row.amount)}</strong>
      </div>
      <div className="insight-breakdown-bar" aria-hidden="true">
        <span style={{ width: Math.max(2, Math.round(row.share * 100)) + "%" }} />
      </div>
      <small>
        {`${Math.round(row.share * 100)}% · ${row.count} ${row.count === 1 ? "entry" : "entries"}`}
      </small>
    </li>
  );
}

export default function InsightsView() {
  const { members, expenses, domain, openDayLedger, openDetail, showToast } = useApp();

  const [mode, setMode] = useState("month");
  const [year, setYear] = useState(() => todayKey().slice(0, 4));
  const [month, setMonth] = useState(() => monthKey().slice(5, 7));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // The full ledger is rebuilt only when the underlying records change; the
  // period picker then just slices it.
  const allEntries = useMemo(
    () => buildLedgerEntries({ members, expenses, domain }),
    [members, expenses, domain],
  );

  const selection = { mode, year, month, startDate, endDate };
  const period = resolvePeriod(selection);
  const periodLabel = describePeriod(selection);
  const years = availableYears(allEntries);

  const entries = filterEntriesByDate(allEntries, period.start, period.end);
  const totals = summarizeEntries(entries);
  const earnings = entries.filter((entry) => entry.type === "earning");
  const spending = entries.filter((entry) => entry.type === "expense");
  const incomeRows = groupEntriesByCategory(earnings, domain.expenseCategoryLabel);
  const spendRows = groupEntriesByCategory(spending, domain.expenseCategoryLabel);
  const topMembers = topPayingMembers(earnings);
  const days = groupEntriesByDay(entries);

  const exportCsv = () => {
    if (!entries.length) {
      showToast("Nothing to export for this period");
      return;
    }
    downloadCsv(
      [
        ["Date", "Type", "Category", "Who / what", "Detail", "Amount"],
        ...entries.map((entry) => [
          entry.date,
          entry.type === "expense" ? "Expense" : "Earning",
          domain.expenseCategoryLabel(entry.category),
          entry.title,
          entry.detail,
          (entry.type === "expense" ? -entry.amount : entry.amount).toString(),
        ]),
      ],
      `gym-insights-${periodLabel.toLowerCase().replace(/\s+/g, "-")}.csv`,
    );
    showToast("CSV exported");
  };

  return (
    <>
      <section className="panel insight-period-panel">
        <div className="panel-head">
          <div>
            <h2>Period</h2>
            <p>Pick a month, a full year, or your own date range.</p>
          </div>
          <button className="secondary-action" type="button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        <div className="insight-mode-switch" role="group" aria-label="Period type">
          {PERIOD_MODES.map((option) => (
            <button
              key={option.value}
              className={"insight-mode-button" + (mode === option.value ? " active" : "")}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="history-filters insight-filters">
          {mode === "custom" ? (
            <>
              <label>
                <span>From</span>
                <input
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
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Year</span>
                <select value={year} onChange={(event) => setYear(event.target.value)}>
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "month" ? (
                <label>
                  <span>Month</span>
                  <select value={month} onChange={(event) => setMonth(event.target.value)}>
                    {MONTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="stats-grid finance-stats" aria-label={`Summary for ${periodLabel}`}>
        <article className="stat-card paid">
          <div className="stat-icon">
            <Icon name="savings" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Earned in {periodLabel}</span>
          <strong>{currency(totals.earned)}</strong>
          <small>{`${totals.earningCount} payment${totals.earningCount === 1 ? "" : "s"} collected`}</small>
        </article>
        <article className="stat-card due">
          <div className="stat-icon">
            <Icon name="shopping_cart" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Spent in {periodLabel}</span>
          <strong>{currency(totals.spent)}</strong>
          <small>{`${totals.expenseCount} expense${totals.expenseCount === 1 ? "" : "s"} recorded`}</small>
        </article>
        <article className="stat-card total">
          <div className="stat-icon">
            <Icon name="account_balance" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Net</span>
          <strong className={totals.net < 0 ? "is-negative" : ""}>
            {(totals.net < 0 ? "−" : "") + currency(Math.abs(totals.net))}
          </strong>
          <small>{totals.net < 0 ? "Spent more than collected" : "Kept after expenses"}</small>
        </article>
        <article className="stat-card attend">
          <div className="stat-icon">
            <Icon name="calendar_month" style={{ fontSize: "1.4rem" }} />
          </div>
          <span>Active days</span>
          <strong>{days.length}</strong>
          <small>Days money moved</small>
        </article>
      </section>

      <div className="insight-breakdown-grid">
        <section className="panel">
          <div className="panel-head compact">
            <div>
              <h3>Where the money came from</h3>
              <p>{`${currency(totals.earned)} collected in ${periodLabel}`}</p>
            </div>
          </div>
          {incomeRows.length ? (
            <ul className="insight-breakdown-list">
              {incomeRows.map((row) => (
                <BreakdownRow key={row.category} row={row} tone="in" />
              ))}
            </ul>
          ) : (
            <p className="history-empty">Nothing was collected in this period.</p>
          )}

          {topMembers.length ? (
            <>
              <h4 className="insight-subhead">Top paying members</h4>
              <ul className="insight-member-list">
                {topMembers.map((row) => (
                  <li key={row.memberId}>
                    <button type="button" onClick={() => openDetail(row.memberId)}>
                      <span>{row.name}</span>
                      <strong>{currency(row.amount)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-head compact">
            <div>
              <h3>Where the money went</h3>
              <p>{`${currency(totals.spent)} spent in ${periodLabel}`}</p>
            </div>
          </div>
          {spendRows.length ? (
            <ul className="insight-breakdown-list">
              {spendRows.map((row) => (
                <BreakdownRow key={row.category} row={row} tone="out" />
              ))}
            </ul>
          ) : (
            <p className="history-empty">No expenses recorded in this period.</p>
          )}
        </section>
      </div>

      <section className="panel insight-days-panel">
        <div className="panel-head">
          <div>
            <h2>Day by day</h2>
            <p>{`${days.length} active day${days.length === 1 ? "" : "s"} in ${periodLabel} · tap a day for the full breakdown`}</p>
          </div>
        </div>
        {days.length ? (
          <ul className="insight-day-list">
            {days.map((day) => (
              <li key={day.date} className="insight-day-row">
                <div className="insight-day-main">
                  <strong className="insight-day-date">{day.date.slice(8, 10)}</strong>
                  <div className="insight-day-copy">
                    <strong>{dayLabel(day.date)}</strong>
                    <span>
                      {/* The in/out split only earns its place on a mixed day —
                          on a one-sided day it would just repeat the net. */}
                      {day.earned > 0 && day.spent > 0 ? (
                        <>
                          <em className="is-in">{"+" + currency(day.earned)}</em>
                          {" in · "}
                          <em className="is-out">{"−" + currency(day.spent)}</em>
                          {" out · "}
                        </>
                      ) : null}
                      {`${day.count} ${day.count === 1 ? "entry" : "entries"}`}
                    </span>
                  </div>
                </div>
                <strong className={"insight-day-net " + (day.net < 0 ? "is-out" : "is-in")}>
                  {(day.net < 0 ? "−" : "+") + currency(Math.abs(day.net))}
                </strong>
                <button className="insight-read-more" type="button" onClick={() => openDayLedger(day.date)}>
                  Read more <Icon name="arrow_forward" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="history-empty">
            No earnings or expenses in {periodLabel}. Collect a fee or record an expense, then pick that period here.
          </p>
        )}
      </section>
    </>
  );
}
