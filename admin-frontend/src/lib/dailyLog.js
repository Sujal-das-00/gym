/* ---------------------------------------------------------------------------
 * The Daily Log: everything done in the gym, day by day. Since the activity
 * record existed, each action comes from it (who did it, old and new values,
 * deletions; backend/src/services/auditService.js); before that the server
 * rebuilds it from record timestamps (backend/src/utils/dailyLog.js). This
 * file fetches it for a period and turns each event into one short line.
 * Times are instants, grouped here by the device's local day.
 * ------------------------------------------------------------------------- */
import { api } from "./api.js";
import { currency, dateFormatter, displayDate, localDateKey, parseDateKey, todayKey } from "./dates.js";
import { collectionTimingLabel, planLabel } from "./billing.js";

const MAX_DAYS = 366;

/** The request window for a picked period, or { error } when it can't be fetched. */
export function logWindow(period) {
  if (!period.start || !period.end) return { error: "Pick a From and a To date." };
  const start = parseDateKey(period.start);
  const end = parseDateKey(period.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Pick a From and a To date." };
  end.setDate(end.getDate() + 1);
  if ((end - start) / 86400000 > MAX_DAYS) return { error: "Pick a year or less." };
  return { from: start.getTime(), to: end.getTime(), fromDay: period.start, toDay: period.end };
}

export function fetchDailyLog({ from, to, fromDay, toDay }) {
  const query = new URLSearchParams({ from: String(from), to: String(to), fromDay, toDay });
  return api("/api/daily-log?" + query.toString());
}

// The filter chips, in order. "all" is every event.
export const LOG_FILTERS = [
  { key: "all", label: "All" },
  { key: "payments", label: "Payments" },
  { key: "members", label: "Members" },
  { key: "plans", label: "Plans" },
  { key: "expenses", label: "Expenses" },
  { key: "settings", label: "Settings" },
];

const FILTER_OF = {
  payment: "payments",
  purchase: "payments",
  payment_edited: "payments",
  payment_date_changed: "payments",
  payment_deleted: "payments",
  member_added: "members",
  member_updated: "members",
  member_removed: "members",
  trainer_added: "members",
  trainer_updated: "members",
  trainer_removed: "members",
  plan_changed: "plans",
  expense_added: "expenses",
  expense_edited: "expenses",
  expense_deleted: "expenses",
  settings_updated: "settings",
};
export const filterOf = (event) => FILTER_OF[event.type] || "all";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const plan = (p) => (p ? `${planLabel(p)} ${currency(p.fee)}` : "");

/** "2026-11" or a dated term → what the member would call it. */
function termName(line, member, domain) {
  if (line.kind === "admission") return "Admission fee";
  if (line.kind === "opening-balance") return "Opening balance";
  if (member) return domain.getBillingPeriodLabel(line.period, member);
  return line.period.length === 7 ? dateFormatter({ month: "short", year: "numeric" }).format(parseDateKey(line.period + "-01")) : displayDate(line.period);
}

// "02 Sept 2026 – 01 Nov 2026": every term a collection paid, first day to last.
function termsRange(lines, member, domain) {
  const terms = lines.filter((line) => line.kind === "membership");
  if (!terms.length) return "";
  if (!member) return terms.map((line) => termName(line, member, domain)).join(", ");
  const starts = terms.map((line) => domain.periodStartDate(line.period)).filter((date) => !Number.isNaN(date.getTime()));
  const ends = terms.map((line) => domain.periodEndDate(member, line.period)).filter((date) => !Number.isNaN(date.getTime()));
  if (!starts.length || !ends.length) return terms.map((line) => termName(line, member, domain)).join(", ");
  const first = new Date(Math.min(...starts));
  const last = new Date(Math.max(...ends));
  last.setDate(last.getDate() - 1);
  return `${displayDate(localDateKey(first))} – ${displayDate(localDateKey(last))}`;
}

const chip = (text, tone = "") => (text ? { text, tone } : null);
const shortDate = (key) => (key ? dateFormatter({ day: "numeric", month: "short" }).format(parseDateKey(key)) : "");

const FIELD_LABELS = {
  name: "Name",
  phone: "Phone",
  address: "Address",
  startDate: "Joining date",
  trainer: "Trainer",
  admissionFee: "Admission fee",
  photo: "Photo",
  title: "Title",
  category: "Category",
  amount: "Amount",
  date: "Date",
  mode: "Mode",
  specialty: "Specialty",
  shift: "Shift",
  status: "Status",
  gymName: "Gym name",
  gymPhone: "Gym phone",
  billingCycleMode: "Billing cycle",
  customBillingDays: "Cycle days",
  defaultCollectionTiming: "Fee collected",
  allowExpiredCheckin: "Expired members can check in",
  weeklyHolidays: "Weekly holidays",
  holidayDates: "Holidays",
  logo: "Logo",
  theme: "Colours",
};
const CYCLE_LABELS = { "month-start": "Calendar month", "30-days": "Every 30 days", "custom-days": "Custom days" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// One changed value, worded for people: dates, money, modes and the like.
function fieldValue(field, value, domain) {
  if (value === "" || value === null || value === undefined) return "—";
  if (["startDate", "date"].includes(field) || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return displayDate(String(value).slice(0, 10));
  if (["amount", "admissionFee"].includes(field)) return currency(value);
  if (field === "mode") return domain.paymentModeLabel(value) || "—";
  if (field === "category") return domain.expenseCategoryLabel(value);
  if (field === "billingCycleMode") return CYCLE_LABELS[value] || String(value);
  if (field === "defaultCollectionTiming") return collectionTimingLabel(value);
  if (field === "allowExpiredCheckin") return value === true || value === "true" || value === 1 ? "Yes" : "No";
  if (field === "weeklyHolidays") return String(value).split(", ").map((day) => WEEKDAYS[Number(day)] || day).join(", ");
  return String(value);
}

// "Phone: 98765… → 91234…", one chip per changed field.
function changeChips(list, domain) {
  return (list || []).map((item) => {
    const label = FIELD_LABELS[item.field] || item.field;
    if (["photo", "logo", "theme"].includes(item.field)) return chip(`${label} changed`, "change");
    return chip(`${label}: ${fieldValue(item.field, item.from, domain)} → ${fieldValue(item.field, item.to, domain)}`, "change");
  });
}

// "By Sujal (owner)" on everything recorded.
function byChip(event) {
  if (!event.by?.name && !event.by?.role) return null;
  const role = event.by.role === "staff" ? "staff" : event.by.role === "gym_admin" ? "owner" : event.by.role === "super_admin" ? "support" : "";
  return chip(`By ${event.by.name || role}${event.by.name && role ? ` (${role})` : ""}`, "by");
}

// What one recorded payment row was for: its term, or its kind.
function lineChip(line, member, domain) {
  if (!line) return null;
  if (line.kind === "admission") return chip("Admission fee", "admission");
  if (line.kind === "other") return chip(line.note ? `Other: ${line.note}` : "Other payment", "note");
  if (line.kind === "opening-balance") return chip("Opening balance", "opening");
  return chip(termsRange([line], member, domain), "term");
}

/**
 * One event as a log line:
 * { icon, tone, who, tag: { text, tone }, chips: [{ text, tone }], amount,
 *   money: "in" | "out" | "", what, detail, memberId }
 * `tone` colours the icon; the tag says what happened in a coloured pill and
 * each chip is one fact (term, admission fee, mode, what is still due...) in
 * a colour of its kind. `what`/`detail` are the same in plain text (CSV).
 */
export function describeEvent(event, { domain, memberById }) {
  const member = event.memberId ? memberById.get(event.memberId) : null;
  const mode = chip(domain.paymentModeLabel(event.mode), "mode");
  const line = (fields) => {
    const chips = (fields.chips || []).filter(Boolean);
    return {
      memberId: member ? member.id : "",
      who: event.memberName || "",
      amount: 0,
      money: "",
      ...fields,
      chips,
      what: fields.tag.text.toLowerCase(),
      detail: chips.map((item) => item.text).join(" · "),
    };
  };
  switch (event.type) {
    case "member_added": {
      const lines = event.lines || [];
      const terms = lines.filter((item) => item.kind === "membership");
      const admission = lines.find((item) => item.kind === "admission");
      if (event.existing) {
        // Past payments entered today: each was collected on its own date, so
        // none of it is money in today.
        const termChips = terms.slice(0, 3).map((item) =>
          chip(`${termsRange([item], member, domain)} · ${currency(item.amount)}${item.dateKnown && item.date ? ` paid ${shortDate(item.date)}` : ""}`, "term"),
        );
        return line({
          icon: "person_add",
          tone: "member",
          tag: { text: "Existing member added", tone: "member" },
          amount: event.historyTotal || 0,
          history: (event.historyTotal || 0) > 0,
          chips: [
            chip(plan(event.plan), "plan"),
            event.startDate ? chip(`Joined ${displayDate(event.startDate)}`, "date") : null,
            ...termChips,
            terms.length > 3 ? chip(`+${terms.length - 3} more past payments`, "term") : null,
            admission ? chip(`Admission fee ${currency(admission.amount)}${admission.dateKnown && admission.date ? ` paid ${shortDate(admission.date)}` : ""}`, "admission") : null,
            event.openingBalance > 0 ? chip(`Opening balance ${currency(event.openingBalance)} due`, "opening") : null,
            event.removed ? chip("Since removed", "due") : null,
            byChip(event),
          ],
        });
      }
      return line({
        icon: "person_add",
        tone: "member",
        tag: { text: "Joined", tone: "member" },
        amount: event.amount,
        money: event.amount > 0 ? "in" : "",
        chips: [
          chip(plan(event.plan), "plan"),
          terms.length ? chip(`First ${domain.getPeriodUnitLabel(event.plan || {})} ${currency(terms.reduce((total, item) => total + item.amount, 0))}`, "term") : null,
          admission ? chip(`Admission fee ${currency(admission.amount)}`, "admission") : null,
          lines[0]?.mode ? chip(domain.paymentModeLabel(lines[0].mode), "mode") : null,
          event.removed ? chip("Since removed", "due") : null,
          byChip(event),
        ],
      });
    }
    case "member_updated":
      return line({
        icon: "edit",
        tone: "edit",
        tag: { text: "Profile updated", tone: "edit" },
        chips: [...changeChips(event.changes, domain), event.removed ? chip("Since removed", "due") : null, byChip(event)],
      });
    case "member_removed":
      return line({
        icon: "person_remove",
        tone: "removed",
        tag: { text: "Removed", tone: "removed" },
        chips: [event.plan ? chip(plan(event.plan), "plan") : null, event.owed > 0 ? chip(`Owed ${currency(event.owed)} when removed`, "due") : null, byChip(event)],
      });
    case "payment": {
      const lines = event.lines || [];
      const admission = lines.filter((item) => item.kind === "admission").reduce((sum, item) => sum + item.amount, 0);
      const opening = lines.filter((item) => item.kind === "opening-balance").reduce((sum, item) => sum + item.amount, 0);
      // What is still owed now on the terms this collection part-paid.
      const partTerms = lines.filter((item) => item.kind === "membership" && item.periodFee !== null && item.amount < item.periodFee);
      // Recorded: what was left right after this payment. Rebuilt: what is left now.
      const due = event.recorded
        ? Number(event.dueAfter || 0)
        : member
          ? partTerms.reduce((sum, item) => sum + domain.getPeriodDue(member, item.period).balance, 0)
          : 0;
      const onlyAdmission = lines.length > 0 && lines.every((item) => item.kind === "admission");
      return line({
        icon: "payments",
        tone: "in",
        tag: onlyAdmission ? { text: "Admission fee", tone: "admission" } : event.part ? { text: "Part payment", tone: "part" } : { text: "Paid", tone: "in" },
        amount: event.amount,
        money: "in",
        chips: [
          chip(termsRange(lines, member, domain), "term"),
          admission > 0 && !onlyAdmission ? chip(`Admission fee ${currency(admission)}`, "admission") : null,
          opening > 0 ? chip(`Opening balance ${currency(opening)}`, "opening") : null,
          mode,
          due > 0 ? chip(`${currency(due)} due`, "due") : null,
          byChip(event),
        ],
      });
    }
    case "purchase":
      return line({
        icon: "shopping_bag",
        tone: "in",
        tag: { text: "Purchase", tone: "purchase" },
        amount: event.amount,
        money: "in",
        chips: [chip((event.lines || []).map((item) => item.note).filter(Boolean).join(", "), "note"), mode, byChip(event)],
      });
    case "payment_edited": {
      if (event.recorded) {
        return line({
          icon: "edit_note",
          tone: "edit",
          tag: { text: "Payment edited", tone: "edit" },
          chips: [
            lineChip(event.line, member, domain),
            chip(`Amount: ${currency(event.from)} → ${currency(event.to)}`, "change"),
            Number(event.dueAfter || 0) > 0 ? chip(`${currency(event.dueAfter)} due`, "due") : null,
            byChip(event),
          ],
        });
      }
      const lines = event.lines || [];
      const admission = lines.some((item) => item.kind === "admission");
      return line({
        icon: "edit_note",
        tone: "edit",
        tag: { text: "Payment edited", tone: "edit" },
        chips: [
          admission ? chip("Admission fee", "admission") : chip(termsRange(lines, member, domain) || lines.map((item) => termName(item, member, domain)).join(", "), "term"),
          chip(`Now ${currency(event.amount)}`, "now"),
        ],
      });
    }
    case "plan_changed":
      return line({
        icon: "swap_horiz",
        tone: "plan",
        tag: { text: "Plan changed", tone: "plan" },
        amount: event.amount,
        money: event.amount > 0 ? "in" : "",
        chips: [
          chip(`${plan(event.from)} → ${plan(event.to)}`, "plan"),
          chip(`From ${displayDate(event.effectiveDate)}`, "date"),
          event.waived > 0 ? chip(`${currency(event.waived)} waived`, "due") : null,
          event.amount > 0 ? mode : null,
          event.note ? chip(event.note, "note") : null,
          byChip(event),
        ],
      });
    case "payment_date_changed":
      return line({
        icon: "event",
        tone: "edit",
        tag: { text: "Payment date changed", tone: "edit" },
        chips: [
          lineChip(event.line, member, domain),
          chip(event.from ? `Paid on: ${displayDate(event.from)} → ${displayDate(event.to)}` : `Paid on set to ${displayDate(event.to)}`, "change"),
          byChip(event),
        ],
      });
    case "payment_deleted":
      return line({
        icon: "delete",
        tone: "removed",
        tag: { text: "Payment deleted", tone: "removed" },
        amount: event.amount,
        struck: true,
        chips: [
          lineChip(event.line, member, domain),
          event.line?.dateKnown && event.line?.date ? chip(`Was paid ${displayDate(event.line.date)}`, "date") : null,
          event.line?.mode ? chip(domain.paymentModeLabel(event.line.mode), "mode") : null,
          byChip(event),
        ],
      });
    case "expense_added":
      return line({
        icon: "receipt_long",
        tone: "out",
        who: event.title || domain.expenseCategoryLabel(event.category),
        tag: { text: "Expense", tone: "out" },
        amount: event.amount,
        money: "out",
        chips: [
          chip(domain.expenseCategoryLabel(event.category), "category"),
          event.date !== localDateKey(new Date()) ? chip(`For ${displayDate(event.date)}`, "date") : null,
          mode,
          byChip(event),
        ],
      });
    case "expense_edited":
      return line({
        icon: "edit_note",
        tone: "edit",
        who: event.title || domain.expenseCategoryLabel(event.category),
        tag: { text: "Expense edited", tone: "edit" },
        chips: event.changes
          ? [...changeChips(event.changes, domain), byChip(event)]
          : [chip(`Now ${currency(event.amount)}`, "now"), chip(domain.expenseCategoryLabel(event.category), "category")],
      });
    case "expense_deleted":
      return line({
        icon: "delete",
        tone: "removed",
        who: event.title || domain.expenseCategoryLabel(event.category),
        tag: { text: "Expense deleted", tone: "removed" },
        amount: event.amount,
        struck: true,
        chips: [chip(domain.expenseCategoryLabel(event.category), "category"), event.date ? chip(`For ${displayDate(event.date)}`, "date") : null, byChip(event)],
      });
    case "trainer_added":
      return line({
        who: event.trainerName,
        icon: "exercise",
        tone: "member",
        tag: { text: "Trainer added", tone: "member" },
        chips: [chip(event.specialty, "category"), chip(event.shift, "date"), byChip(event)],
      });
    case "trainer_updated":
      return line({
        who: event.trainerName,
        icon: "exercise",
        tone: "edit",
        tag: { text: "Trainer updated", tone: "edit" },
        chips: [...changeChips(event.changes, domain), byChip(event)],
      });
    case "trainer_removed":
      return line({ who: event.trainerName, icon: "person_remove", tone: "removed", tag: { text: "Trainer removed", tone: "removed" }, chips: [byChip(event)] });
    case "settings_updated":
      return line({
        who: "Gym settings",
        icon: "settings",
        tone: "edit",
        tag: { text: "Settings changed", tone: "edit" },
        chips: [...changeChips(event.changes, domain), byChip(event)],
      });
    default:
      return line({ icon: "history", tone: "edit", tag: { text: String(event.type), tone: "edit" } });
  }
}

/** "4:35 pm" */
export const eventTime = (event) => dateFormatter({ hour: "numeric", minute: "2-digit" }).format(new Date(event.at));

/**
 * Events grouped by local day, newest first, with each day's totals. Days
 * with only check-ins are kept: a day the gym was open is worth a row.
 */
export function groupLogByDay(events, checkins = {}) {
  const days = new Map();
  const dayOf = (key) => {
    if (!days.has(key)) days.set(key, { date: key, events: [], moneyIn: 0, moneyOut: 0, checkins: Number(checkins[key] || 0) });
    return days.get(key);
  };
  for (const event of events) {
    const day = dayOf(localDateKey(new Date(event.at)));
    day.events.push(event);
  }
  for (const key of Object.keys(checkins)) if (checkins[key] > 0) dayOf(key);
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Money in and out of described lines. */
export function dayMoney(lines) {
  return lines.reduce(
    (sum, line) => ({
      in: sum.in + (line.money === "in" ? line.amount : 0),
      out: sum.out + (line.money === "out" ? line.amount : 0),
    }),
    { in: 0, out: 0 },
  );
}

/** "Today", "Yesterday", or "Monday". */
export function dayName(key) {
  const today = todayKey();
  if (key === today) return "Today";
  const yesterday = parseDateKey(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDateKey(yesterday)) return "Yesterday";
  return dateFormatter({ weekday: "long" }).format(parseDateKey(key));
}

export function logCsvRows(rows) {
  return [
    ["Date", "Time", "Who / what", "Action", "Detail", "Amount"],
    ...rows.map(({ event, line }) => [
      localDateKey(new Date(event.at)),
      eventTime(event),
      line.who,
      line.what,
      line.detail,
      line.money === "in" ? String(line.amount) : line.money === "out" ? String(-line.amount) : "",
    ]),
  ];
}
