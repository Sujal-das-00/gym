import { useMemo } from "react";
import Icon from "./Icon.jsx";
import Photo from "./Photo.jsx";
import ColumnChart from "./ColumnChart.jsx";
import { currency, displayDate } from "../lib/dates.js";
import { CATEGORY_ICONS } from "../lib/constants.js";
import { buildTrend } from "../lib/trend.js";

const PURCHASE_LIMIT = 8;

/** A category row with a bar showing its share of that side's total (ranked, one hue). */
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

// One tick label every N columns so the x axis stays readable at any width.
const tickEvery = (trend) => (trend.unit === "month" ? 1 : trend.points.length > 20 ? 5 : trend.points.length > 10 ? 2 : 1);

/**
 * The Analysis screen: where the money came from and where it went, with the
 * trend over the period drawn as charts. The Insights "Analysis" tab, reading
 * the same period and ledger as the Money tab, so the totals always match.
 */
export default function InsightsAnalysis({
  entries,
  period,
  periodLabel,
  totals,
  days,
  incomeRows,
  spendRows,
  topMembers,
  purchases,
  members,
  domain,
  openDetail,
}) {
  const trend = useMemo(() => buildTrend(entries, period), [entries, period]);
  const earningDays = days.filter((day) => day.earned > 0);
  const bestDay = earningDays.reduce((best, day) => (!best || day.earned > best.earned ? day : best), null);
  const average = earningDays.length ? Math.round(totals.earned / earningDays.length) : 0;
  const memberById = (id) => members.find((member) => member.id === id);
  const every = tickEvery(trend);
  const per = trend.unit === "month" ? "month" : "day";

  return (
    <>
      <div className="stat-row" aria-label="Highlights">
        <div className="stat-tile">
          <span>Best day</span>
          <strong>{bestDay ? currency(bestDay.earned) : "—"}</strong>
          <small>{bestDay ? displayDate(bestDay.date).slice(0, 6) : "No earnings"}</small>
        </div>
        <div className="stat-tile">
          <span>Daily average</span>
          <strong>{currency(average)}</strong>
          <small>{earningDays.length} {earningDays.length === 1 ? "day" : "days"} with earnings</small>
        </div>
        <div className="stat-tile">
          <span>Payments</span>
          <strong>{totals.earningCount}</strong>
          <small>{totals.expenseCount} {totals.expenseCount === 1 ? "expense" : "expenses"}</small>
        </div>
      </div>

      <div className="insight-grid">
        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Money in</h3>
              <p>Where it came from</p>
            </div>
            <strong className="insight-card-total is-in">{currency(totals.earned)}</strong>
          </header>

          {totals.earned > 0 ? (
            <>
              <h4 className="chart-title">Collected per {per}</h4>
              <ColumnChart
                points={trend.points}
                valueKey="earned"
                tone="in"
                tickEvery={every}
                ariaLabel={`Money collected per ${per}, ${periodLabel}. Total ${currency(totals.earned)}.`}
              />
              <h4 className="chart-title">By category</h4>
              <ul className="split-list">
                {incomeRows.map((row) => (
                  <BreakdownRow key={row.category} row={row} tone="in" />
                ))}
              </ul>
            </>
          ) : (
            <p className="member-empty">Nothing was collected in this period.</p>
          )}

          {purchases.length ? (
            <>
              <h4 className="contact-group-title insight-subhead">
                Other payments
                <span>{purchases.length}</span>
              </h4>
              <ul className="purchase-list">
                {purchases.slice(0, PURCHASE_LIMIT).map((entry) => (
                  <li key={entry.id}>
                    <button type="button" onClick={() => openDetail(entry.memberId)}>
                      <span>
                        <strong>{entry.purchase || "Other payment"}</strong>
                        <small>
                          {entry.title} · {displayDate(entry.date).slice(0, 6)}
                          {domain.paymentModeLabel(entry.mode) ? ` · ${domain.paymentModeLabel(entry.mode)}` : ""}
                        </small>
                      </span>
                      <b>{currency(entry.amount)}</b>
                    </button>
                  </li>
                ))}
              </ul>
              {purchases.length > PURCHASE_LIMIT ? (
                <small className="purchase-more">+{purchases.length - PURCHASE_LIMIT} more, listed in Daily operations</small>
              ) : null}
            </>
          ) : null}

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
            <>
              <h4 className="chart-title">Spent per {per}</h4>
              <ColumnChart
                points={trend.points}
                valueKey="spent"
                tone="out"
                tickEvery={every}
                ariaLabel={`Money spent per ${per}, ${periodLabel}. Total ${currency(totals.spent)}.`}
              />
              <h4 className="chart-title">By category</h4>
              <ul className="split-list">
                {spendRows.map((row) => (
                  <BreakdownRow key={row.category} row={row} tone="out" />
                ))}
              </ul>
            </>
          ) : (
            <p className="member-empty">No expenses recorded in this period.</p>
          )}
        </section>
      </div>
    </>
  );
}
