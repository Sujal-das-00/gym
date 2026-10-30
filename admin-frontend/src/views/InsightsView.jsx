import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, dateFormatter, displayDate, monthKey, parseDateKey, todayKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import {
  getLedgerEntries,
  filterEntriesByDate,
  groupEntriesByCategory,
  groupEntriesByDay,
  summarizeEntries,
  topPayingMembers,
} from "../lib/ledger.js";
import { PERIOD_MODES, availableYears, describePeriod, resolvePeriod } from "../lib/period.js";
import { CATEGORY_ICONS } from "../lib/constants.js";
import Icon from "../components/Icon.jsx";
import Photo from "../components/Photo.jsx";
import {
  changeDateKey,
  changeDirection,
  changeMoneyNotes,
  changeTime,
  changedByLabel,
  changedFields,
  fetchPlanChanges,
  planChangesCsvRows,
} from "../lib/planChanges.js";

/** A category row with a bar showing its share of that side's total. */
function BreakdownRow({ row, tone }) {
  const share = Math.round(row.share * 100);
  return (
    <li className={"split-row is-" + tone}>
      <span className="split-ico" aria-hidden="true">
        <Icon name={CATEGORY_ICONS[row.category] || "receipt_long"} />
      </span>
      <div className="split-body">
        <div className="split-head">
          <span>{row.label}</span>
          <strong>{currency(row.amount)}</strong>
        </div>
        <div className="split-bar" aria-hidden="true">
          <span style={{ width: Math.max(2, share) + "%" }} />
        </div>
        <small>
          {share}% · {row.count} {row.count === 1 ? "entry" : "entries"}
        </small>
      </div>
    </li>
  );
}

const weekdayOf = (key) => dateFormatter({ weekday: "long" }).format(parseDateKey(key));
const monthShortOf = (key) => dateFormatter({ month: "short" }).format(parseDateKey(key));
const signed = (amount) => (amount < 0 ? "−" : "+") + currency(Math.abs(amount));
const dayTitleOf = (key) => dateFormatter({ weekday: "long", day: "numeric", month: "short" }).format(parseDateKey(key));

const DIRECTION_COPY = {
  upgrade: { label: "Upgrade", icon: "trending_up" },
  downgrade: { label: "Downgrade", icon: "trending_down" },
  same: { label: "Changed", icon: "swap_horiz" },
};

/**
 * The plan-change log for the picked period: every time a member's plan was
 * changed, with the date and time, who did it and from when it applies.
 */
function PlanChangesPanel({ changes, state, periodLabel, members, openDetail }) {
  if (state === "loading" && !changes.length) return <p className="contact-empty">Loading plan changes…</p>;
  if (state === "error") return <p className="contact-empty">Could not load plan changes. Check your connection and try again.</p>;

  const counts = { upgrade: 0, downgrade: 0, same: 0 };
  for (const change of changes) counts[changeDirection(change)] += 1;

  const days = [];
  for (const change of changes) {
    const key = changeDateKey(change);
    const last = days[days.length - 1];
    if (last && last.date === key) last.rows.push(change);
    else days.push({ date: key, rows: [change] });
  }

  return (
    <>
      <section className="money-card plan-log-card" aria-label={`Plan changes in ${periodLabel}`}>
        <div className="plan-log-total">
          <span className="money-card-label">Changes</span>
          <strong>{changes.length}</strong>
        </div>
        <ul className="plan-log-stats">
          {[
            ["is-up", "trending_up", counts.upgrade, counts.upgrade === 1 ? "Upgrade" : "Upgrades"],
            ["is-down", "trending_down", counts.downgrade, counts.downgrade === 1 ? "Downgrade" : "Downgrades"],
          ].map(([tone, icon, value, label]) => (
            <li key={icon} className={tone}>
              <span className="money-card-ico" aria-hidden="true">
                <Icon name={icon} />
              </span>
              <b>{value}</b>
              <small>{label}</small>
            </li>
          ))}
        </ul>
      </section>

      {days.length ? (
        <div className="plan-log-days">
        {days.map((day) => (
          <section className="contact-group" key={day.date} aria-label={dayTitleOf(day.date)}>
            <h3 className="contact-group-title">
              {dayTitleOf(day.date)}
              <span>{day.rows.length}</span>
            </h3>
            <ul className="contact-list">
              {day.rows.map((change) => {
                const member = members.find((item) => item.id === change.memberId);
                const direction = DIRECTION_COPY[changeDirection(change)];
                return (
                  <li key={change.id}>
                    <button
                      type="button"
                      className="contact-row no-dot plan-log-row"
                      disabled={!member}
                      onClick={() => member && openDetail(member.id)}
                    >
                      <span className="contact-avatar">{member ? <Photo person={member} /> : null}</span>
                      <span className="contact-copy">
                        <strong>
                          <span className="contact-name">{change.memberName}</span>
                          <span className={"contact-tag plan-tag is-" + changeDirection(change)}>{direction.label}</span>
                        </strong>
                        <small className="plan-log-what">{changedFields(change).join(" · ")}</small>
                        <small className="contact-meta">
                          {["Starts " + displayDate(change.effectiveDate), ...changeMoneyNotes(change), changedByLabel(change), change.note]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <span className="contact-state">
                        <strong>{changeTime(change)}</strong>
                        <small>{member ? change.memberCode : "Deleted"}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        </div>
      ) : (
        <p className="contact-empty">
          No plan changes in {periodLabel}. Change a plan from a member&apos;s profile (Plan button) and it shows up here
          with the date and time.
        </p>
      )}
    </>
  );
}

export default function InsightsView() {
  const { members, expenses, domain, openDayLedger, openDetail, showToast, planChangeRevision } = useApp();

  // "money" = earnings and expenses; "plans" = the member plan-change log.
  const [tab, setTab] = useState("money");
  const [planLog, setPlanLog] = useState({ rows: [], state: "idle" });

  const [mode, setMode] = useState("month");
  const [year, setYear] = useState(() => todayKey().slice(0, 4));
  const [month, setMonth] = useState(() => monthKey().slice(5, 7));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // The full ledger is rebuilt only when the underlying records change; the
  // period picker then just slices it.
  const allEntries = useMemo(
    () => getLedgerEntries({ members, expenses, domain }),
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

  // The log is fetched when its tab opens and again after any plan change.
  useEffect(() => {
    if (tab !== "plans") return undefined;
    let cancelled = false;
    setPlanLog((current) => ({ ...current, state: "loading" }));
    fetchPlanChanges()
      .then((rows) => !cancelled && setPlanLog({ rows, state: "ready" }))
      .catch(() => !cancelled && setPlanLog((current) => ({ ...current, state: "error" })));
    return () => {
      cancelled = true;
    };
  }, [tab, planChangeRevision]);

  const planChanges = planLog.rows.filter((change) => {
    const day = changeDateKey(change);
    return (!period.start || day >= period.start) && (!period.end || day <= period.end);
  });

  // ‹ October 2026 › / ‹ 2026 › stepping for the month and year modes.
  const step = (delta) => {
    if (mode === "year") {
      setYear(String(Number(year) + delta));
      return;
    }
    const next = new Date(Number(year), Number(month) - 1 + delta, 1);
    setYear(String(next.getFullYear()));
    setMonth(String(next.getMonth() + 1).padStart(2, "0"));
  };
  const onMonthPick = (value) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    setYear(value.slice(0, 4));
    setMonth(value.slice(5, 7));
  };
  const memberById = (id) => members.find((member) => member.id === id);

  const exportCsv = () => {
    if (tab === "plans") {
      if (!planChanges.length) {
        showToast("No plan changes to export for this period");
        return;
      }
      downloadCsv(planChangesCsvRows(planChanges), `plan-changes-${periodLabel.toLowerCase().replace(/\s+/g, "-")}.csv`);
      showToast("CSV exported");
      return;
    }
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
    <section className="list-view insights-view" aria-label="Detailed insights">
      <div className="insight-tabs" role="tablist" aria-label="Insights">
        {[
          ["money", "payments", "Money"],
          ["plans", "history", "Plan changes"],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={"insight-tab" + (tab === key ? " active" : "")}
            onClick={() => setTab(key)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>

      <div className="list-toolbar">
        <div className="segmented insight-modes" role="radiogroup" aria-label="Period type">
          {PERIOD_MODES.map((option) => (
            <label key={option.value}>
              <input type="radio" name="insightMode" checked={mode === option.value} onChange={() => setMode(option.value)} />
              <span>{option.value === "custom" ? "Custom" : option.value === "year" ? "Year" : "Month"}</span>
            </label>
          ))}
        </div>
        <button type="button" className="list-filter-toggle" aria-label="Export CSV" onClick={exportCsv}>
          <Icon name="download" />
        </button>
      </div>

      {mode === "custom" ? (
        <div className="list-dates">
          <label>
            <span>From</span>
            <input type="date" min="2000-01-01" max="2099-12-31" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" min="2000-01-01" max="2099-12-31" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button
            type="button"
            className="list-dates-clear"
            disabled={!startDate && !endDate}
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="day-bar">
          <button type="button" className="day-step" aria-label={mode === "year" ? "Previous year" : "Previous month"} onClick={() => step(-1)}>
            <Icon name="chevron_left" />
          </button>
          <label className="day-pick">
            <strong>{periodLabel}</strong>
            <small>
              {tab === "plans"
                ? `${planChanges.length} plan change${planChanges.length === 1 ? "" : "s"}`
                : `${totals.count} ${totals.count === 1 ? "entry" : "entries"}`}
            </small>
            {/* Invisible picker over the label, like the attendance day bar. */}
            {mode === "month" ? (
              <input
                type="month"
                aria-label="Pick a month"
                value={`${year}-${month}`}
                onChange={(event) => onMonthPick(event.target.value)}
                onClick={(event) => event.currentTarget.showPicker?.()}
              />
            ) : (
              <select aria-label="Pick a year" value={year} onChange={(event) => setYear(event.target.value)}>
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button type="button" className="day-step" aria-label={mode === "year" ? "Next year" : "Next month"} onClick={() => step(1)}>
            <Icon name="chevron_right" />
          </button>
        </div>
      )}

      {tab === "plans" ? (
        <PlanChangesPanel
          changes={planChanges}
          state={planLog.state}
          periodLabel={periodLabel}
          members={members}
          openDetail={openDetail}
        />
      ) : (
      <>
      <section className="money-card" aria-label={`Summary for ${periodLabel}`}>
        <span className="money-card-label">Net · {periodLabel}</span>
        <strong className={totals.net < 0 ? "is-negative" : ""}>
          {(totals.net < 0 ? "−" : "") + currency(Math.abs(totals.net))}
        </strong>
        <div className="money-card-split">
          <div className="is-in">
            <span className="money-card-ico" aria-hidden="true">
              <Icon name="south_west" />
            </span>
            <div>
              <small>Earned</small>
              <b>{currency(totals.earned)}</b>
              <small>
                {totals.earningCount} payment{totals.earningCount === 1 ? "" : "s"}
              </small>
            </div>
          </div>
          <div className="is-out">
            <span className="money-card-ico" aria-hidden="true">
              <Icon name="north_east" />
            </span>
            <div>
              <small>Spent</small>
              <b>{currency(totals.spent)}</b>
              <small>
                {totals.expenseCount} expense{totals.expenseCount === 1 ? "" : "s"}
              </small>
            </div>
          </div>
        </div>
        <small className="money-card-foot">
          Money moved on {days.length} day{days.length === 1 ? "" : "s"}
        </small>
      </section>

      <div className="insight-grid">
        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Money in</h3>
              <p>Where it came from</p>
            </div>
            <strong className="insight-card-total is-in">{currency(totals.earned)}</strong>
          </header>
          {incomeRows.length ? (
            <ul className="split-list">
              {incomeRows.map((row) => (
                <BreakdownRow key={row.category} row={row} tone="in" />
              ))}
            </ul>
          ) : (
            <p className="member-empty">Nothing was collected in this period.</p>
          )}

          {topMembers.length ? (
            <>
              <h4 className="contact-group-title insight-subhead">Top paying members</h4>
              <ul className="insight-top">
                {topMembers.map((row, index) => {
                  const member = memberById(row.memberId);
                  return (
                    <li key={row.memberId}>
                      <button type="button" onClick={() => openDetail(row.memberId)}>
                        <span className="insight-rank">{index + 1}</span>
                        <span className="contact-avatar">{member ? <Photo person={member} /> : null}</span>
                        <span className="contact-copy">
                          <strong>
                            <span className="contact-name">{row.name}</span>
                          </strong>
                          <small>
                            {row.count} payment{row.count === 1 ? "" : "s"}
                          </small>
                        </span>
                        <strong className="insight-top-amount">{currency(row.amount)}</strong>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>

        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Money out</h3>
              <p>Where it went</p>
            </div>
            <strong className="insight-card-total is-out">{currency(totals.spent)}</strong>
          </header>
          {spendRows.length ? (
            <ul className="split-list">
              {spendRows.map((row) => (
                <BreakdownRow key={row.category} row={row} tone="out" />
              ))}
            </ul>
          ) : (
            <p className="member-empty">No expenses recorded in this period.</p>
          )}
        </section>
      </div>

      {days.length ? (
        <section className="contact-group insight-days" aria-label="Day by day">
          <h3 className="contact-group-title">
            Day by day
            <span>{days.length}</span>
          </h3>
          <ul className="contact-list">
            {days.map((day) => (
              <li key={day.date}>
                <button type="button" className="contact-row no-dot insight-day" onClick={() => openDayLedger(day.date)}>
                  <span className="date-tile" aria-hidden="true">
                    <b>{day.date.slice(8, 10)}</b>
                    <small>{monthShortOf(day.date)}</small>
                  </span>
                  <span className="contact-copy">
                    <strong>{weekdayOf(day.date)}</strong>
                    <small>
                      {/* The in/out split only earns its place on a mixed day. */}
                      {day.earned > 0 && day.spent > 0
                        ? `+${currency(day.earned)} in · −${currency(day.spent)} out`
                        : `${day.count} ${day.count === 1 ? "entry" : "entries"}`}
                    </small>
                  </span>
                  <span className="contact-state">
                    <strong className={day.net < 0 ? "is-out" : "is-in"}>{signed(day.net)}</strong>
                  </span>
                  <Icon name="chevron_right" className="contact-go" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="contact-empty">
          No earnings or expenses in {periodLabel}. Collect a fee or record an expense, then pick that period here.
        </p>
      )}
      </>
      )}
    </section>
  );
}
