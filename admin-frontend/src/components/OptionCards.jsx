import Icon from "./Icon.jsx";

/**
 * Radio cards (icon, title, dot) on native radios, so keyboards and screen
 * readers work as-is. A null `value` leaves every card unselected.
 *
 * options: [{ key, icon, title }]. `firstId` names the first radio so a failed
 * submit can focus it; `invalid` outlines the cards in red.
 */
export default function OptionCards({ name, label, value, options, onChange, invalid = false, firstId }) {
  return (
    <div className={"cp-opts" + (invalid ? " has-error" : "")} role="radiogroup" aria-label={label} aria-invalid={invalid ? "true" : undefined}>
      {options.map((option, index) => (
        <label key={option.key} className={"cp-opt" + (value === option.key ? " is-on" : "")}>
          <input
            id={index === 0 ? firstId : undefined}
            type="radio"
            name={name}
            checked={value === option.key}
            onChange={() => onChange(option.key)}
          />
          <span className="cp-opt-ico" aria-hidden="true">
            <Icon name={option.icon} />
          </span>
          <strong>{option.title}</strong>
          <span className="cp-opt-dot" aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}

// The two ways a gym collects a fee, worded for a month or a package. Every
// screen that sets a plan (add member, existing member, change plan) offers
// exactly these, with neither chosen to start with.
export function billingTermOptions(unit) {
  return [
    { key: "at-join", icon: "event_upcoming", title: `Collect payment at ${unit} start` },
    { key: "fixed-day", icon: "event_available", title: `Collect payment at ${unit} end` },
  ];
}
