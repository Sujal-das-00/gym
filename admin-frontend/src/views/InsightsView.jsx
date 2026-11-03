import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, dateFormatter, displayDate, parseDateKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import {
  getLedgerEntries,
  filterEntriesByDate,
  groupEntriesByCategory,
  groupEntriesByDay,
  summarizeEntries,
  topPayingMembers,
  undatedEntries,
  DATE_NOT_RECORDED,
} from "../lib/ledger.js";
import { availableYears } from "../lib/period.js";
import { CATEGORY_ICONS } from "../lib/constants.js";
import Icon from "../components/Icon.jsx";
import PeriodBar, { usePeriodSelection } from "../components/PeriodBar.jsx";
import Photo from "../components/Photo.jsx";
import UndatedPaymentsSheet from "../components/UndatedPaymentsSheet.jsx";
import InsightsAnalysis from "../components/InsightsAnalysis.jsx";
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

  // "money" = net and daily operations; "analysis" = charts and breakdowns of the
  // same period; "plans" = the member plan-change log.
  const [tab, setTab] = useState("money");
  const [planLog, setPlanLog] = useState({ rows: [], state: "idle" });
  const [undatedOpen, setUndatedOpen] = useState(false);

  const periodState = usePeriodSelection();

  // The full ledger is rebuilt only when the underlying records change; the
  // period picker then just slices it.
  const allEntries = useMemo(
    () => getLedgerEntries({ members, expenses, domain }),
    [members, expenses, domain],
  );

  const { period, label: periodLabel } = periodState;
  const years = availableYears(allEntries);

  const entries = filterEntriesByDate(allEntries, period.start, period.end);
  const totals = summarizeEntries(entries);
  const earnings = entries.filter((entry) => entry.type === "earning");
  const spending = entries.filter((entry) => entry.type === "expense");
  const incomeRows = groupEntriesByCategory(earnings, domain.expenseCategoryLabel);
  const spendRows = groupEntriesByCategory(spending, domain.expenseCategoryLabel);
  const topMembers = topPayingMembers(earnings);
  const days = groupEntriesByDay(entries);
  const purchases = earnings.filter((entry) => entry.category === "other-payment");
  const undatedInPeriod = undatedEntries(entries);
  const undatedTotal = undatedInPeriod.reduce((sum, entry) => sum + entry.amount, 0);

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
          [entry.purchase, entry.detail, entry.dateKnown === false ? DATE_NOT_RECORDED : ""].filter(Boolean).join(" · "),
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
          ["analysis", "monitoring", "Analysis"],
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

      <PeriodBar
        state={periodState}
        name="insightMode"
        years={years}
        count={
          tab === "plans"
            ? `${planChanges.length} plan change${planChanges.length === 1 ? "" : "s"}`
            : `${totals.count} ${totals.count === 1 ? "entry" : "entries"}`
        }
        onExport={exportCsv}
      />

      {tab === "plans" ? (
        <PlanChangesPanel
          changes={planChanges}
          state={planLog.state}
          periodLabel={periodLabel}
          members={members}
          openDetail={openDetail}
        />
      ) : tab === "analysis" ? (
        <InsightsAnalysis
          entries={entries}
          period={period}
          periodLabel={periodLabel}
          totals={totals}
          days={days}
          incomeRows={incomeRows}
          spendRows={spendRows}
          topMembers={topMembers}
          purchases={purchases}
          members={members}
          domain={domain}
          openDetail={openDetail}
        />
      ) : (
      <>
      {/* Small cards side by side: the period's headline numbers in one short row. */}
      <section className={"money-tiles" + (undatedInPeriod.length ? " has-4" : "")} aria-label={`Summary for ${periodLabel}`}>
        <div className="money-tile is-net">
          <span>Net</span>
          <strong className={totals.net < 0 ? "is-negative" : ""}>{(totals.net < 0 ? "−" : "") + currency(Math.abs(totals.net))}</strong>
          <small>{days.length} {days.length === 1 ? "day" : "days"}</small>
        </div>
        <div className="money-tile is-in">
          <span>
            <Icon name="south_west" />
            Earned
          </span>
          <strong>{currency(totals.earned)}</strong>
          <small>
            {totals.earningCount} payment{totals.earningCount === 1 ? "" : "s"}
          </small>
        </div>
        <div className="money-tile is-out">
          <span>
            <Icon name="north_east" />
            Spent
          </span>
          <strong>{currency(totals.spent)}</strong>
          <small>
            {totals.expenseCount} expense{totals.expenseCount === 1 ? "" : "s"}
          </small>
        </div>
        {undatedInPeriod.length ? (
          <button type="button" className="money-tile is-undated" onClick={() => setUndatedOpen(true)}>
            <span>
              <i className="undated-dot" aria-hidden="true" />
              No date
              <Icon name="chevron_right" className="money-tile-go" />
            </span>
            <strong>{currency(undatedTotal)}</strong>
            <small>{undatedInPeriod.length} undated</small>
          </button>
        ) : null}
      </section>

      {days.length ? (
        <section className="contact-group insight-days" aria-label="Daily operations">
          <h3 className="contact-group-title">
            Daily operations
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
                    <strong>
                      {weekdayOf(day.date)}
                      {undatedEntries(day.entries).length ? (
                        <i className="undated-dot" title="Includes a payment without a recorded date" />
                      ) : null}
                    </strong>
                    <small>
                      {/* The in/out split only earns its place on a mixed day. */}
                      {day.earned > 0 && day.spent > 0
                        ? `+${currency(day.earned)} in · −${currency(day.spent)} out`
                        : `${day.count} ${day.count === 1 ? "entry" : "entries"}`}
                      {undatedEntries(day.entries).length ? ` · ${undatedEntries(day.entries).length} undated` : ""}
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

      <UndatedPaymentsSheet
        open={undatedOpen}
        onClose={() => setUndatedOpen(false)}
        inPeriod={undatedInPeriod}
        overall={undatedEntries(allEntries)}
        periodLabel={periodLabel}
        onOpenMember={(memberId) => {
          setUndatedOpen(false);
          if (memberId) openDetail(memberId);
        }}
      />
    </section>
  );
}
