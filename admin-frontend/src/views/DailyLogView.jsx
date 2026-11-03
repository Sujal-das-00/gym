import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Icon from "../components/Icon.jsx";
import DayBar, { shiftDay } from "../components/DayBar.jsx";
import { currency, dateFormatter, displayDate, localDateKey, parseDateKey, todayKey } from "../lib/dates.js";
import { downloadCsv } from "../lib/csv.js";
import {
  LOG_FILTERS,
  dayMoney,
  describeEvent,
  eventTime,
  fetchDailyLog,
  filterOf,
  logCsvRows,
  logWindow,
} from "../lib/dailyLog.js";

// Lines the day shows before "Show more".
const PREVIEW = 10;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const activities = (count) => `${count} ${count === 1 ? "activity" : "activities"}`;

// The first and last day of the month a day is in, as the log's fetch window.
function monthRange(day) {
  const date = parseDateKey(day);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: localDateKey(first), end: localDateKey(last) };
}

// Same day number in another month ("3 Nov" → "3 Oct"), kept inside that
// month (31 Oct → 30 Nov) and never past today.
function sameDayIn(day, monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const target = `${monthValue}-${String(Math.min(Number(day.slice(8, 10)), lastDay)).padStart(2, "0")}`;
  const today = todayKey();
  return target > today ? today : target;
}

/**
 * Daily Log: what was done at the gym on one day — members added, edited and
 * removed, payments, purchases, plan changes, expenses — rebuilt by the
 * server from record timestamps. The arrows move one day at a time (so do
 * ← / →); the month picker jumps further. The log is fetched a month at a
 * time, so stepping within a month needs no request.
 */
export default function DailyLogView() {
  const { activeView, members, expenses, trainers, planChangeRevision, domain, showToast } = useApp();
  const today = todayKey();
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [log, setLog] = useState({ status: "idle", key: "", data: null, error: "" });
  const [retry, setRetry] = useState(0);
  const active = activeView === "dailylog";

  const goTo = useCallback((key) => {
    const next = !key || key > todayKey() ? todayKey() : key;
    setDay(next);
    setShowAll(false);
  }, []);

  // ← / → step a day while the log is open and nothing else wants the keys.
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      setDay((current) => {
        const next = shiftDay(current, event.key === "ArrowLeft" ? -1 : 1);
        return next > todayKey() ? current : next;
      });
      setShowAll(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const range = logWindow(monthRange(day));
  const rangeKey = range.error ? "" : `${range.from}-${range.to}`;

  // Fetched while the screen is open, and again after anything that writes.
  useEffect(() => {
    if (!active || !rangeKey) return undefined;
    let cancelled = false;
    setLog((current) => ({ ...current, status: current.key === rangeKey && current.data ? "refreshing" : "loading", key: rangeKey }));
    const timer = setTimeout(() => {
      fetchDailyLog(range)
        .then((data) => !cancelled && setLog({ status: "ready", key: rangeKey, data, error: "" }))
        .catch((error) => !cancelled && setLog((current) => ({ ...current, status: "error", error: error.message })));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // range is rebuilt every render; rangeKey stands for it.
  }, [active, rangeKey, members, expenses, trainers, planChangeRevision, retry]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const data = log.key === rangeKey ? log.data : null;
  const dayRows = useMemo(
    () =>
      (data?.events || [])
        .filter((event) => localDateKey(new Date(event.at)) === day)
        .map((event) => ({ event, line: describeEvent(event, { domain, memberById }) })),
    [data, day, domain, memberById],
  );
  const counts = useMemo(() => {
    const result = { all: dayRows.length };
    for (const { event } of dayRows) result[filterOf(event)] = (result[filterOf(event)] || 0) + 1;
    return result;
  }, [dayRows]);
  // A filter the day has nothing for falls back to everything.
  const activeFilter = counts[filter] ? filter : "all";
  const shown = activeFilter === "all" ? dayRows : dayRows.filter(({ event }) => filterOf(event) === activeFilter);
  const visible = showAll ? shown : shown.slice(0, PREVIEW);
  const money = dayMoney(dayRows.map((row) => row.line));
  const checkins = Number(data?.checkins?.[day] || 0);

  const exportCsv = () => {
    const monthRows = (data?.events || []).map((event) => ({ event, line: describeEvent(event, { domain, memberById }) }));
    if (!monthRows.length) {
      showToast("Nothing to export for this month");
      return;
    }
    downloadCsv(logCsvRows(monthRows), `daily-log-${monthRange(day).start.slice(0, 7)}.csv`);
    showToast("CSV exported for the whole month");
  };

  const loading = log.status === "loading" && !data;
  const monthLabel = dateFormatter({ month: "long", year: "numeric" }).format(parseDateKey(day));
  const stats = [
    dayRows.length ? { text: activities(dayRows.length), tone: "" } : null,
    money.in > 0 ? { text: `+${currency(money.in)} in`, tone: "is-in" } : null,
    money.out > 0 ? { text: `−${currency(money.out)} out`, tone: "is-out" } : null,
    checkins ? { text: plural(checkins, "check-in"), tone: "" } : null,
  ].filter(Boolean);

  return (
    <section className="list-view dlog-view" aria-label="Daily log">
      <div className="list-toolbar">
        {/* Invisible month input over the label, like the day bar's date input. */}
        <label className="dlog-month">
          <Icon name="calendar_month" />
          <span>
            <small>Jump to month</small>
            <strong>{monthLabel}</strong>
          </span>
          <Icon name="expand_more" className="dlog-month-go" />
          <input
            type="month"
            aria-label="Jump to a month"
            min="2000-01"
            max={today.slice(0, 7)}
            value={day.slice(0, 7)}
            onChange={(event) => event.target.value && goTo(sameDayIn(day, event.target.value))}
            onClick={(event) => event.currentTarget.showPicker?.()}
          />
        </label>
        <button type="button" className="list-filter-toggle" aria-label="Export this month as CSV" title="Export this month as CSV" onClick={exportCsv}>
          <Icon name="download" />
        </button>
      </div>

      <DayBar date={day} onChange={goTo} max={today} label="Pick a day" />

      {stats.length ? (
        <p className="dlog-stats" aria-label="Summary of the day">
          {stats.map((stat) => (
            <span key={stat.text} className={stat.tone}>
              {stat.text}
            </span>
          ))}
        </p>
      ) : null}

      {dayRows.length > 1 ? (
        <div className="dlog-filters" role="radiogroup" aria-label="Show">
          {LOG_FILTERS.filter((option) => option.key === "all" || counts[option.key]).map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={activeFilter === option.key}
              className={"dlog-filter" + (activeFilter === option.key ? " is-active" : "")}
              onClick={() => {
                setFilter(option.key);
                setShowAll(false);
              }}
            >
              {option.label}
              <span>{counts[option.key] || 0}</span>
            </button>
          ))}
        </div>
      ) : null}

      {range.error ? (
        <p className="contact-empty">{range.error}</p>
      ) : loading ? (
        <div className="dlog-day is-skeleton" aria-busy="true" aria-label="Loading the log" />
      ) : log.status === "error" && !data ? (
        <div className="contact-empty dlog-error">
          <p>Couldn&apos;t load the log. {log.error}</p>
          <button type="button" className="sheet-link" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : shown.length ? (
        <div className="dlog-day">
          <ul className="dlog-list">
            {visible.map(({ event, line }) => {
              const body = (
                <>
                  <time dateTime={event.at}>{eventTime(event)}</time>
                  <span className={"dlog-ico tone-" + line.tone} aria-hidden="true">
                    <Icon name={line.icon} />
                  </span>
                  <span className="dlog-copy">
                    <span className="dlog-line">
                      <strong>{line.who}</strong>
                      <em className={"dlog-tag tone-" + line.tag.tone}>{line.tag.text}</em>
                    </span>
                    {line.chips.length ? (
                      <span className="dlog-chips">
                        {line.chips.map((item) => (
                          <span key={item.text} className={"dlog-chip tone-" + item.tone}>
                            {item.text}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {line.money ? (
                    <b className={"dlog-amt is-" + line.money}>
                      {line.money === "out" ? "−" : "+"}
                      {currency(line.amount)}
                    </b>
                  ) : line.struck && line.amount ? (
                    <b className="dlog-amt is-struck" title="Removed: no longer counted">
                      {currency(line.amount)}
                    </b>
                  ) : line.history ? (
                    <b className="dlog-amt is-history" title="Past payments entered today, not money received today">
                      {currency(line.amount)}
                      <small>past</small>
                    </b>
                  ) : (
                    <span />
                  )}
                </>
              );
              return (
                <li key={event.id}>
                  <div className="dlog-entry">{body}</div>
                </li>
              );
            })}
            {shown.length > PREVIEW && !showAll ? (
              <li>
                <button type="button" className="dlog-more" onClick={() => setShowAll(true)}>
                  Show {shown.length - PREVIEW} more
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="contact-empty">Nothing recorded {day === today ? "today yet" : `on ${displayDate(day)}`}.</p>
      )}

      {data?.truncated ? <p className="contact-empty">Showing the latest 5,000 activities of this month.</p> : null}
    </section>
  );
}
