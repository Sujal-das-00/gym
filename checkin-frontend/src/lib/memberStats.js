/**
 * Home-screen figures derived from the member's attendance list.
 *
 * Attendance arrives from the API as sorted local date keys ("YYYY-MM-DD"), the
 * same form the backend stores, so every comparison here is a plain string
 * compare against a locally-built key — never a UTC one, or a member checking in
 * late at night would land on the wrong day.
 */

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Consecutive days attended, counting back from today. A day that hasn't been
 * used yet doesn't break the streak — it only stops growing — so the number
 * doesn't drop to zero every morning before the member arrives.
 */
export function currentStreak(attendance = []) {
  const days = new Set(attendance);
  if (!days.size) return 0;

  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function visitsThisMonth(attendance = []) {
  const month = dateKey(new Date()).slice(0, 7);
  return attendance.filter((day) => day.startsWith(month)).length;
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** The Monday-to-Sunday strip at the top of the attendance card. */
export function weekStrip(attendance = []) {
  const days = new Set(attendance);
  const today = new Date();
  const monday = new Date(today);
  // getDay() is 0 on Sunday, which belongs to the week that began six days ago.
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const todayKey = dateKey(today);
  return WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label,
      present: days.has(key),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}

const rupeeFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const rupees = (amount) => rupeeFormat.format(Number(amount) || 0);
