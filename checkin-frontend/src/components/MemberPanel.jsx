import { displayDate, displayTime, initials, visitCount } from "../lib/format.js";
import Icon from "./Icon.jsx";

const SOURCE_LABEL = (row) =>
  row.expired ? "Expired membership" : row.source === "qr" ? "Self check-in" : "Manual";

export default function MemberPanel({ member, history = [], status, onForget }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm flex flex-col space-y-3.5">
      <div className="flex items-center gap-3">
        {member.photo ? (
          <img
            alt={`${member.name} photo`}
            className="w-14 h-14 rounded-xl object-cover border border-gray-200"
            src={member.photo}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-primary-tint border border-primary/20 flex items-center justify-center font-headline-md font-bold text-primary text-lg">
            {initials(member.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            {member.gymId || "Member"}
          </span>
          <h2 className="text-base font-bold font-headline-md text-gray-900 truncate">{member.name}</h2>
          {member.phone && <p className="text-xs text-gray-500 font-medium">{member.phone}</p>}
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-center leading-tight">
          {status}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 pt-3">Recent check-ins</h3>
        <span className="text-[11px] font-semibold text-gray-400 pt-3">{visitCount(history.length)}</span>
      </div>

      {history.length ? (
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto scrollbar-none">
          {history.map((row) => (
            <article
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                row.expired ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200/80"
              }`}
              key={`${row.date}-${row.time || ""}`}
            >
              <div className="min-w-0">
                <strong className="block text-xs font-bold text-gray-900">{displayDate(row.date)}</strong>
                <span className="text-[11px] text-gray-500">{displayTime(row.time)}</span>
              </div>
              <em
                className={`text-[10px] font-bold uppercase tracking-wide not-italic shrink-0 ${
                  row.expired ? "text-red-600" : "text-gray-500"
                }`}
              >
                {SOURCE_LABEL(row)}
              </em>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 py-2 text-center">No earlier attendance found.</p>
      )}

      <button
        className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-900 transition-colors"
        onClick={onForget}
        type="button"
      >
        <Icon className="text-[15px]" name="delete_sweep" />
        Forget saved ID on this phone
      </button>
    </div>
  );
}
