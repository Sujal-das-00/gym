const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });

const weekdayFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export const todayLabel = () => dateFormat.format(new Date());

export function displayDate(value) {
  if (!value) return "Not recorded";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return "Not recorded";
  return dateFormat.format(new Date(year, month - 1, day));
}

export function displayTime(value) {
  if (!value) return "Manual entry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Manual entry";
  return timeFormat.format(date);
}

/**
 * "Today" / "Yesterday" / "Mon, 21 Oct" — the day heading on the home screen's
 * activity rows, where a bare date reads as noise for the most recent visits.
 */
export function relativeDay(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "Not recorded";
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return weekdayFormat.format(date);
}

/**
 * A billing period is stored either as "YYYY-MM" (month-start billing) or as the
 * "YYYY-MM-DD" start of a rolling cycle, so it has to be read both ways.
 */
export function displayPeriod(value) {
  const key = String(value || "");
  if (key.length === 7) {
    const [year, month] = key.split("-").map(Number);
    if (year && month) return monthFormat.format(new Date(year, month - 1, 1));
  }
  if (key.length === 10) return displayDate(key);
  return "";
}

/** "+91 98765 43210" from the ten-digit form the backend normalises phones into. */
export function displayPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "Not on file";
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return digits;
}

export function initials(name) {
  return (
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "GA"
  );
}

export const visitCount = (count) => `${count} visit${count === 1 ? "" : "s"}`;
