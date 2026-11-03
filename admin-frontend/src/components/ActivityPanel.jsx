import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import Dialog from "./Dialog.jsx";
import { dateFormatter, parseDateKey } from "../lib/dates.js";
import { dayLabel } from "../lib/period.js";
import { ACTIVITY_TYPES, activityCard, dayBreakdown, fetchActivities, groupActivitiesByDay } from "../lib/activity.js";

const weekdayOf = (key) => dateFormatter({ weekday: "long" }).format(parseDateKey(key));
const monthShortOf = (key) => dateFormatter({ month: "short" }).format(parseDateKey(key));
const countOf = (n) => `${n} ${n === 1 ? "activity" : "activities"}`;

/**
 * Activity history (Detail Insights → Activity), for the period picked in the
 * Insights bar: one card per day, newest first, like Money's "Day by day".
 * A day opens a window listing each activity as one card — what happened,
 * the details that matter, when and who. Filter by type, search by member.
 *
 * `revision` changes whenever members or payments change, so the list stays
 * current while the owner works elsewhere; `onLoaded` hands the rows up for
 * the bar's count and the CSV export.
 */
export default function ActivityPanel({ startKey, endKey, periodLabel, members, domain, openDetail, revision, onLoaded }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ rows: [], truncated: false, status: "loading" });
  const [openDay, setOpenDay] = useState("");
  const request = useRef(0);

  // Searching waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const id = ++request.current;
    setState((current) => ({ ...current, status: "loading" }));
    fetchActivities({ startKey, endKey, category, q: query })
      .then((result) => {
        if (id !== request.current) return;
        setState({ rows: result.activities, truncated: result.truncated, status: "ready" });
        onLoaded?.(result.activities);
      })
      .catch(() => id === request.current && setState((current) => ({ ...current, status: "error" })));
    // onLoaded is a state setter from the parent; it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey, category, query, revision]);

  const days = groupActivitiesByDay(state.rows);
  const typeLabel = ACTIVITY_TYPES.find((type) => type.value === category)?.label || "";
  const day = days.find((item) => item.date === openDay);

  return (
    <>
      <div className="list-toolbar">
        <label className="list-search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search by member name"
            aria-label="Search activities by member name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="chip-row" role="tablist" aria-label="Activity type">
        {ACTIVITY_TYPES.map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            role="tab"
            aria-selected={category === option.value}
            className={"filter-chip" + (category === option.value ? " active" : "")}
            onClick={() => setCategory(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {state.status === "error" ? (
        <p className="contact-empty">Could not load the activity history. Check your connection and try again.</p>
      ) : state.status === "loading" && !state.rows.length ? (
        <p className="contact-empty">Loading activity…</p>
      ) : !days.length ? (
        <p className="contact-empty">
          No {category ? typeLabel.toLowerCase() + " " : ""}activity in {periodLabel}
          {query ? ` matching “${query}”` : ""}.
        </p>
      ) : (
        <section className="contact-group insight-days" aria-label="Activity by day" aria-busy={state.status !== "ready"}>
          <h3 className="contact-group-title">
            Day by day
            <span>{days.length}</span>
          </h3>
          <ul className="contact-list">
            {days.map((item) => (
              <li key={item.date}>
                <button type="button" className="contact-row no-dot insight-day activity-day" onClick={() => setOpenDay(item.date)}>
                  <span className="date-tile" aria-hidden="true">
                    <b>{item.date.slice(8, 10)}</b>
                    <small>{monthShortOf(item.date)}</small>
                  </span>
                  <span className="contact-copy">
                    <strong>{weekdayOf(item.date)}</strong>
                    <small>{dayBreakdown(item.rows)}</small>
                  </span>
                  <span className="contact-state">
                    <strong>{item.rows.length}</strong>
                  </span>
                  <Icon name="chevron_right" className="contact-go" />
                </button>
              </li>
            ))}
          </ul>
          {state.truncated ? (
            <p className="member-empty">Showing the latest {state.rows.length} activities. Pick a shorter period to see older ones.</p>
          ) : null}
        </section>
      )}

      <Dialog className="sheet" open={Boolean(day)} onClose={() => setOpenDay("")}>
        {day ? (
          <div className="sheet-panel">
            <header className="sheet-head">
              <span className="sheet-grabber" aria-hidden="true" />
              <h2>{dayLabel(day.date)}</h2>
              <button className="sheet-close" aria-label="Close" type="button" onClick={() => setOpenDay("")}>
                <Icon name="close" />
              </button>
            </header>
            <div className="sheet-body">
              <section className="contact-group">
                <h3 className="contact-group-title ledger-day-title">
                  {countOf(day.rows.length)}
                  <em>{dayBreakdown(day.rows)}</em>
                </h3>
                <ul className="contact-list activity-cards">
                  {day.rows.map((activity) => {
                    const member = members.find((item) => item.id === activity.memberId) || null;
                    const card = activityCard(activity, domain, member);
                    return (
                      <li key={activity.id}>
                        <button
                          type="button"
                          className={"contact-row no-dot ledger-entry activity-card is-" + card.tone}
                          disabled={!member}
                          onClick={() => {
                            setOpenDay("");
                            openDetail(member.id);
                          }}
                        >
                          <span className="ledger-tile" aria-hidden="true">
                            <Icon name={card.icon} />
                          </span>
                          <span className="contact-copy">
                            <strong>{card.title}</strong>
                            {card.detail ? <small className="activity-card-detail">{card.detail}</small> : null}
                            <small>{card.meta}</small>
                          </span>
                          {card.amount ? (
                            <span className="contact-state">
                              <strong className={"ledger-amount is-" + card.amount.tone}>{card.amount.text}</strong>
                            </span>
                          ) : (
                            <span />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
