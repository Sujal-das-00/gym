import { PHONE_DIGITS, PHONE_PREFIX, toPhoneDigits } from "../lib/validation.js";

// Numbers are stored as bare 10-digit national numbers, so the +91 sits outside
// the input as a fixed prefix rather than inside the value the admin edits.
export default function PhoneField({ id, label = "Mobile number", value, onChange, onBlur, error, className = "" }) {
  const errorId = `${id}-error`;
  return (
    <label className={className} htmlFor={id}>
      {label}
      <span className={"phone-input" + (error ? " has-error" : "")}>
        <span className="phone-prefix" aria-hidden="true">
          {PHONE_PREFIX}
        </span>
        <input
          id={id}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={PHONE_DIGITS}
          placeholder="98765 43210"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          value={value}
          onChange={(event) => onChange(toPhoneDigits(event.target.value))}
          onBlur={onBlur}
        />
      </span>
      {error ? (
        <small className="field-error" id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}
