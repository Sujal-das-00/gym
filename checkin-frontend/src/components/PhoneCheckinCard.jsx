import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import StatusNote from "./StatusNote.jsx";

export default function PhoneCheckinCard({ busy, disabled, initialCode, initialValue, onSubmit, result }) {
  const [identifier, setIdentifier] = useState(initialValue || "");
  const [code, setCode] = useState(initialCode || "");
  const [localError, setLocalError] = useState("");

  // A remembered id arrives after the first paint, so seed the field when it lands.
  useEffect(() => {
    setIdentifier(initialValue || "");
  }, [initialValue]);

  // A scan (or a QR link opened directly) hands us today's code — drop it in so
  // the member only has to type their number.
  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  const submit = (event) => {
    event.preventDefault();
    const value = identifier.trim();
    const digits = code.trim();
    if (!value || busy || disabled) return;
    if (!/^\d{4}$/.test(digits)) {
      setLocalError("Enter the 4-digit code or scan the QR code.");
      return;
    }
    setLocalError("");
    onSubmit(value, digits);
  };

  return (
    <form
      className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm flex flex-col gap-4"
      onSubmit={submit}
    >
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="attendance-identifier">
          Mobile number or member ID
        </label>
        <input
          autoComplete="tel"
          className="w-full bg-gray-50 rounded-xl border border-gray-200 px-3.5 py-3 text-sm font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
          id="attendance-identifier"
          inputMode="text"
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="98765 43210 or GYM1001"
          value={identifier}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="attendance-code">
          4-digit code
        </label>
        <input
          autoComplete="one-time-code"
          className="w-full bg-gray-50 rounded-xl border border-gray-200 px-3.5 py-3 text-lg font-bold font-mono text-gray-900 placeholder:text-gray-400 placeholder:font-normal tracking-[0.4em] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          disabled={disabled}
          id="attendance-code"
          inputMode="numeric"
          maxLength={4}
          // Digits only, so a stray keystroke can't quietly make the code invalid.
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
          pattern="\d{4}"
          placeholder="0000"
          value={code}
        />
      </div>

      <button
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.99] text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-60 disabled:active:scale-100"
        disabled={busy || disabled}
        type="submit"
      >
        {busy && <Icon className="text-[19px] animate-spin" name="progress_activity" />}
        <span>{busy ? "Checking in…" : "Check in"}</span>
      </button>

      {localError && <StatusNote tone="err">{localError}</StatusNote>}
      {!localError && result && <StatusNote tone={result.tone}>{result.message}</StatusNote>}
    </form>
  );
}
