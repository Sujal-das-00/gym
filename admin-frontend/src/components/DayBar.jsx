import { dateFormatter, displayDate, localDateKey, parseDateKey, todayKey } from "../lib/dates.js";
import Icon from "./Icon.jsx";

export function shiftDay(key, delta) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

function dayHeading(key) {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  if (key === shiftDay(today, 1)) return "Tomorrow";
  return dateFormatter({ weekday: "long" }).format(parseDateKey(key));
}

/** ‹ Today · 18 Oct 2026 › — step a day either way, or tap the middle to pick a date. */
export default function DayBar({ date, onChange, inputId, label = "Date" }) {
  return (
    <div className="day-bar">
      <button type="button" className="day-step" aria-label="Previous day" onClick={() => onChange(shiftDay(date, -1))}>
        <Icon name="chevron_left" />
      </button>
      <label className="day-pick">
        <strong>{dayHeading(date)}</strong>
        <small>{displayDate(date)}</small>
        {/* Invisible date input over the label: tapping the label opens the native picker. */}
        <input
          id={inputId}
          type="date"
          aria-label={label}
          value={date}
          onChange={(event) => onChange(event.target.value || todayKey())}
          onClick={(event) => event.currentTarget.showPicker?.()}
        />
      </label>
      <button type="button" className="day-step" aria-label="Next day" onClick={() => onChange(shiftDay(date, 1))}>
        <Icon name="chevron_right" />
      </button>
      {date !== todayKey() ? (
        <button type="button" className="day-today" onClick={() => onChange(todayKey())}>
          Today
        </button>
      ) : null}
    </div>
  );
}
