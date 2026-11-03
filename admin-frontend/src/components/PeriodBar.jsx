import { useState } from "react";
import Icon from "./Icon.jsx";
import { monthKey, todayKey } from "../lib/dates.js";
import { PERIOD_MODES, describePeriod, resolvePeriod } from "../lib/period.js";

/**
 * The month / year / custom-dates choice behind <PeriodBar>, starting on the
 * current month. `period` is the resolved { start, end } of date keys.
 */
export function usePeriodSelection() {
  const [mode, setMode] = useState("month");
  const [year, setYear] = useState(() => todayKey().slice(0, 4));
  const [month, setMonth] = useState(() => monthKey().slice(5, 7));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const selection = { mode, year, month, startDate, endDate };

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
  const pickMonth = (value) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    setYear(value.slice(0, 4));
    setMonth(value.slice(5, 7));
  };

  return {
    ...selection,
    period: resolvePeriod(selection),
    label: describePeriod(selection),
    setMode,
    setYear,
    setStartDate,
    setEndDate,
    step,
    pickMonth,
  };
}

/**
 * Month / Year / Custom tabs with an optional export button, then either
 * ‹ November 2026 › (with `count` under it) or From–To date fields.
 * `name` keeps the radio groups of two screens apart.
 */
export default function PeriodBar({ state, name, years, count, onExport }) {
  const { mode, year, month, startDate, endDate, label } = state;
  return (
    <>
      <div className="list-toolbar">
        <div className="segmented insight-modes" role="radiogroup" aria-label="Period type">
          {PERIOD_MODES.map((option) => (
            <label key={option.value}>
              <input type="radio" name={name} checked={mode === option.value} onChange={() => state.setMode(option.value)} />
              <span>{option.value === "custom" ? "Custom" : option.value === "year" ? "Year" : "Month"}</span>
            </label>
          ))}
        </div>
        {onExport ? (
          <button type="button" className="list-filter-toggle" aria-label="Export CSV" onClick={onExport}>
            <Icon name="download" />
          </button>
        ) : null}
      </div>

      {mode === "custom" ? (
        <div className="list-dates">
          <label>
            <span>From</span>
            <input type="date" min="2000-01-01" max="2099-12-31" value={startDate} onChange={(event) => state.setStartDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" min="2000-01-01" max="2099-12-31" value={endDate} onChange={(event) => state.setEndDate(event.target.value)} />
          </label>
          <button
            type="button"
            className="list-dates-clear"
            disabled={!startDate && !endDate}
            onClick={() => {
              state.setStartDate("");
              state.setEndDate("");
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="day-bar">
          <button type="button" className="day-step" aria-label={mode === "year" ? "Previous year" : "Previous month"} onClick={() => state.step(-1)}>
            <Icon name="chevron_left" />
          </button>
          <label className="day-pick">
            <strong>{label}</strong>
            <small>{count}</small>
            {/* Invisible picker over the label, like the attendance day bar. */}
            {mode === "month" ? (
              <input
                type="month"
                aria-label="Pick a month"
                value={`${year}-${month}`}
                onChange={(event) => state.pickMonth(event.target.value)}
                onClick={(event) => event.currentTarget.showPicker?.()}
              />
            ) : (
              <select aria-label="Pick a year" value={year} onChange={(event) => state.setYear(event.target.value)}>
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button type="button" className="day-step" aria-label={mode === "year" ? "Next year" : "Next month"} onClick={() => state.step(1)}>
            <Icon name="chevron_right" />
          </button>
        </div>
      )}
    </>
  );
}
