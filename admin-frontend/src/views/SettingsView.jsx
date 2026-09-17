import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { displayDate } from "../lib/dates.js";
import { getInitials } from "../lib/format.js";
import { normalizeTheme } from "../lib/theme.js";
import { readPhoto } from "../lib/photo.js";

const THEME_FIELDS = [
  { key: "primary", label: "Primary" },
  { key: "primaryDark", label: "Sidebar" },
  { key: "accent", label: "Accent" },
  { key: "danger", label: "Danger" },
  { key: "background", label: "Background" },
  { key: "panel", label: "Panel" },
  { key: "text", label: "Text" },
];

const WEEKDAYS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
];

export default function SettingsView() {
  const { settings, setSettings, settingsRevision, saveSettings, domain, showToast } = useApp();

  // The form is a draft; nothing but the logo is persisted before "Save settings",
  // exactly as in the original.
  const [gymName, setGymName] = useState(settings.gymName || "Gym Admin");
  const [billingCycleMode, setBillingCycleMode] = useState(() => domain.getBillingCycleMode());
  const [customBillingDays, setCustomBillingDays] = useState(() => String(domain.getBillingCycleDays()));
  const [defaultCollectionTiming, setDefaultCollectionTiming] = useState(() => domain.getDefaultCollectionTiming());
  const [allowExpiredCheckin, setAllowExpiredCheckin] = useState(settings.allowExpiredCheckin === false ? "deny" : "allow");
  const [weeklyHolidays, setWeeklyHolidays] = useState(() => domain.getWeeklyHolidays());
  const [theme, setTheme] = useState(() => normalizeTheme(settings.theme));
  const [holidayDateInput, setHolidayDateInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the draft only when settings arrive from the server (login, gym
  // switch, save) — not on in-place edits such as adding a holiday date.
  useEffect(() => {
    setGymName(settings.gymName || "Gym Admin");
    setBillingCycleMode(["month-start", "30-days", "custom-days"].includes(settings.billingCycleMode) ? settings.billingCycleMode : "month-start");
    setCustomBillingDays(String(settings.billingCycleMode === "30-days" ? 30 : Math.round(Number(settings.customBillingDays || 25)) || 25));
    setDefaultCollectionTiming(settings.defaultCollectionTiming === "fixed-day" ? "fixed-day" : "at-join");
    setAllowExpiredCheckin(settings.allowExpiredCheckin === false ? "deny" : "allow");
    setWeeklyHolidays(Array.isArray(settings.weeklyHolidays) ? settings.weeklyHolidays.map(Number) : []);
    setTheme(normalizeTheme(settings.theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsRevision]);

  const name = settings.gymName || "Gym Admin";
  const initials = getInitials(name) || "GA";
  const holidayDates = domain.getHolidayDates();

  const addHolidayDate = () => {
    const value = String(holidayDateInput || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      showToast("Pick a valid date first");
      return;
    }
    const dates = new Set(holidayDates);
    dates.add(value);
    setSettings((current) => ({ ...current, holidayDates: [...dates].sort() }));
    setHolidayDateInput("");
  };

  const removeHolidayDate = (date) => {
    setSettings((current) => ({ ...current, holidayDates: holidayDates.filter((item) => item !== date) }));
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const logo = await readPhoto(file, 512);
    try {
      await saveSettings({ ...settings, logo });
      showToast("Logo updated");
    } catch (error) {
      showToast(error.message);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const next = {
      ...settings,
      gymName: gymName.trim() || "Gym Admin",
      billingCycleMode,
      customBillingDays: Math.max(1, Math.round(Number(customBillingDays || 25))),
      defaultCollectionTiming: defaultCollectionTiming === "fixed-day" ? "fixed-day" : "at-join",
      allowExpiredCheckin: allowExpiredCheckin !== "deny",
      weeklyHolidays: [...weeklyHolidays].sort((a, b) => a - b),
      holidayDates,
      theme: normalizeTheme(theme),
    };
    try {
      await saveSettings(next);
      showToast("Settings saved");
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleWeeklyHoliday = (day, checked) => {
    setWeeklyHolidays((current) =>
      checked ? [...new Set([...current, day])] : current.filter((item) => item !== day),
    );
  };

  return (
    <section className="panel settings-panel" id="settings">
      <div className="panel-head compact">
        <div>
          <h2>Settings</h2>
          <p>Update gym profile, logo, and billing cycle.</p>
        </div>
      </div>
      <form id="settingsForm" className="settings-form" onSubmit={onSubmit}>
        <div className="settings-logo-row">
          <div className="settings-logo" id="settingsLogoPreview">
            {settings.logo ? <img src={settings.logo} alt={`${name} logo`} /> : initials}
          </div>
          <label className="logo-upload">
            Upload logo
            <input id="gymLogoInput" type="file" accept="image/*" onChange={handleLogoChange} />
          </label>
        </div>
        <label>
          Gym name
          <input id="gymNameInput" name="gymName" required value={gymName} onChange={(event) => setGymName(event.target.value)} />
        </label>
        <fieldset className="theme-settings">
          <legend>App colours</legend>
          <div className="theme-grid">
            {THEME_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type="color"
                  data-theme-color={field.key}
                  value={theme[field.key]}
                  onChange={(event) => setTheme((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="billing-cycle-settings">
          <legend>Billing cycle</legend>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="billingCycleMode"
              value="month-start"
              checked={billingCycleMode === "month-start"}
              onChange={() => setBillingCycleMode("month-start")}
            />
            <span>
              <strong>1st day of every month</strong>
              <small>Fees are due from the 1st of each month, even for members who joined later in that month.</small>
            </span>
          </label>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="billingCycleMode"
              value="30-days"
              checked={billingCycleMode === "30-days"}
              onChange={() => setBillingCycleMode("30-days")}
            />
            <span>
              <strong>30-day membership</strong>
              <small>Each member is billed every 30 days from their start date.</small>
            </span>
          </label>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="billingCycleMode"
              value="custom-days"
              checked={billingCycleMode === "custom-days"}
              onChange={() => setBillingCycleMode("custom-days")}
            />
            <span>
              <strong>Custom days</strong>
              <small>Set your own membership length, such as 25 days.</small>
            </span>
          </label>
          <label className="custom-billing-days">
            Custom membership days
            <input
              id="customBillingDaysInput"
              name="customBillingDays"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              disabled={billingCycleMode !== "custom-days"}
              value={customBillingDays}
              onChange={(event) => setCustomBillingDays(event.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className="billing-cycle-settings">
          <legend>Payment collection</legend>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="defaultCollectionTiming"
              value="at-join"
              checked={defaultCollectionTiming === "at-join"}
              onChange={() => setDefaultCollectionTiming("at-join")}
            />
            <span>
              <strong>Collect at join (upfront)</strong>
              <small>
                Members pay when they join. Their first term is marked paid and the next payment is due one cycle later.
              </small>
            </span>
          </label>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="defaultCollectionTiming"
              value="fixed-day"
              checked={defaultCollectionTiming === "fixed-day"}
              onChange={() => setDefaultCollectionTiming("fixed-day")}
            />
            <span>
              <strong>Collect after the period</strong>
              <small>
                Nothing is recorded at join. Each period's fee falls due at the end of that period, not the start.
              </small>
            </span>
          </label>
          <small className="custom-billing-days">
            This is the default for new members. You can change it per member while adding them.
          </small>
        </fieldset>
        <fieldset className="billing-cycle-settings">
          <legend>Expired memberships</legend>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="allowExpiredCheckin"
              value="allow"
              checked={allowExpiredCheckin === "allow"}
              onChange={() => setAllowExpiredCheckin("allow")}
            />
            <span>
              <strong>Allow check-in after expiry</strong>
              <small>
                Members whose renewal has lapsed can still check in. Those visits are flagged red in the attendance
                history so you can follow up.
              </small>
            </span>
          </label>
          <label className="billing-cycle-option">
            <input
              type="radio"
              name="allowExpiredCheckin"
              value="deny"
              checked={allowExpiredCheckin === "deny"}
              onChange={() => setAllowExpiredCheckin("deny")}
            />
            <span>
              <strong>Block check-in after expiry</strong>
              <small>
                The check-in page shows "Membership expired — access denied" until the member renews. No attendance is
                recorded.
              </small>
            </span>
          </label>
        </fieldset>
        <fieldset className="billing-cycle-settings holiday-settings">
          <legend>Gym holidays</legend>
          <small className="holiday-hint">
            Pick the weekdays your gym stays closed. Holidays are excluded from each member's attendance rate.
          </small>
          <div className="weekday-picker" id="weeklyHolidayPicker">
            {WEEKDAYS.map(([day, label]) => (
              <label className="weekday-chip" key={day}>
                <input
                  type="checkbox"
                  name="weeklyHoliday"
                  value={day}
                  checked={weeklyHolidays.includes(day)}
                  onChange={(event) => toggleWeeklyHoliday(day, event.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="holiday-date-add">
            <label className="custom-billing-days">
              Add a specific holiday date (festival, event)
              <input
                id="holidayDateInput"
                type="date"
                value={holidayDateInput}
                onChange={(event) => setHolidayDateInput(event.target.value)}
              />
            </label>
            <button className="secondary-action" id="addHolidayDate" type="button" onClick={addHolidayDate}>
              Add date
            </button>
          </div>
          <div className="holiday-date-list" id="holidayDateList">
            {holidayDates.length ? (
              holidayDates.map((date) => (
                <span className="holiday-chip" key={date}>
                  {displayDate(date)}
                  <button
                    type="button"
                    className="holiday-chip-remove"
                    aria-label={`Remove ${displayDate(date)}`}
                    onClick={() => removeHolidayDate(date)}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <p className="holiday-empty">No specific holiday dates added.</p>
            )}
          </div>
        </fieldset>
        <button className={"primary-action" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
          Save settings
        </button>
      </form>
    </section>
  );
}
