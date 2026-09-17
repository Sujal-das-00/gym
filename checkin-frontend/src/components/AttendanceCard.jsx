import { useState } from "react";
import { displayTime, relativeDay } from "../lib/format.js";
import Icon from "./Icon.jsx";

const PREVIEW_ROWS = 3;

function DayCell({ day }) {
  if (day.present) {
    return (
      <span
        className={`w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-[12px] font-bold ${
          day.isToday ? "ring-2 ring-primary-fixed" : ""
        }`}
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
        day.isFuture ? "bg-surface-container-low text-secondary/50" : "bg-surface-container-high text-secondary"
      } ${day.isToday ? "ring-2 ring-surface-container-highest" : ""}`}
    >
      {day.isFuture ? "" : "–"}
    </span>
  );
}

export default function AttendanceCard({ gymName, history = [], week = [] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? history : history.slice(0, PREVIEW_ROWS);
  const canExpand = history.length > PREVIEW_ROWS;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Attendance</h2>
          <span className="px-2 py-0.5 rounded bg-surface-container text-secondary font-label-sm">
            This week
          </span>
        </div>
        {canExpand && (
          <button
            className="font-label-sm text-label-sm text-primary font-semibold"
            onClick={() => setExpanded((open) => !open)}
            type="button"
          >
            {expanded ? "Show less" : "View history"}
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-xs border border-surface-container-high flex flex-col gap-3">
        <div className="grid grid-cols-7 gap-1.5 text-center pb-2 border-b border-surface-container-low">
          {week.map((day) => (
            <div className="flex flex-col items-center gap-1" key={day.key}>
              <span
                className={`font-label-sm text-label-sm ${
                  day.isToday ? "text-primary font-bold" : "text-secondary"
                }`}
              >
                {day.label}
              </span>
              <DayCell day={day} />
            </div>
          ))}
        </div>

        {rows.length ? (
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div key={`${row.date}-${row.time || index}`}>
                {index > 0 && <div className="h-[1px] w-full bg-surface-container-low mb-2" />}
                <div className="flex items-center justify-between py-1 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        row.expired ? "bg-red-500" : index === 0 ? "bg-primary" : "bg-secondary"
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                        {relativeDay(row.date)}
                        {row.time ? `, ${displayTime(row.time)}` : ""}
                      </span>
                      <span className="font-body-sm text-body-sm text-secondary truncate">
                        {gymName} • {row.source === "qr" ? "Self check-in" : "Marked at front desk"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full font-label-sm shrink-0 ${
                      row.expired ? "bg-red-50 text-red-700" : "bg-surface-container text-secondary"
                    }`}
                  >
                    {row.expired ? "Expired" : "Verified"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center justify-center gap-1.5 py-2 text-body-sm text-secondary">
            <Icon className="text-[16px]" name="event_busy" />
            No check-ins recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}
