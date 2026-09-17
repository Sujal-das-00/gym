import { initials } from "../lib/format.js";
import Icon from "./Icon.jsx";

/** Sticky bar over the member home screen: whose gym this is, and the way out. */
export default function DashboardHeader({ gymName, logo, expired, onSignOut, subtitle }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 max-w-md mx-auto px-margin flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm min-w-0">
          {logo ? (
            <img alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" src={logo} />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-gray-950 text-white shrink-0 flex items-center justify-center font-headline-sm text-[11px] font-bold">
              {initials(gymName)}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight truncate leading-none uppercase">
              {gymName}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider truncate">
              {subtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-xs ${
              expired ? "bg-red-50" : "bg-surface-container-low"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${expired ? "bg-red-500" : "bg-primary animate-pulse"}`}
            />
            <span
              className={`font-label-sm text-label-sm font-semibold uppercase tracking-wider ${
                expired ? "text-red-700" : "text-on-surface"
              }`}
            >
              {expired ? "Expired" : "Active"}
            </span>
          </div>
          <button
            aria-label="Sign out"
            className="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors touch-manipulation"
            onClick={onSignOut}
            type="button"
          >
            <Icon className="text-[22px]" name="logout" />
          </button>
        </div>
      </div>
    </header>
  );
}
