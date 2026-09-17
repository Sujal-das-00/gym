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
      setLocalError("Enter today's 4-digit code from the front-desk screen, or scan the QR above.");
      return;
    }
    setLocalError("");
    onSubmit(value, digits);
  };

  return (
    <form
      className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm flex flex-col space-y-3"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-700 text-xs flex items-center gap-1.5">
          <Icon className="text-[17px] text-primary" name="how_to_reg" />
          Quick number check-in
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary-tint text-primary border border-primary/25">
          CHECKIN
        </span>
      </div>

      <div>
        <label
          className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1"
          htmlFor="attendance-identifier"
        >
          Mobile number or member ID
        </label>
        <div className="relative flex items-center bg-gray-50 rounded-xl border border-gray-200 px-3.5 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <span className="text-xs font-bold text-gray-700 font-mono pr-2 border-r border-gray-200">+91</span>
          <input
            autoComplete="tel"
            className="w-full bg-transparent border-0 p-0 pl-2.5 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 tracking-wide"
            disabled={disabled}
            id="attendance-identifier"
            inputMode="text"
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="98765 43210 or GYM1001"
            value={identifier}
          />
          <Icon className="text-gray-400 text-[20px]" name="keyboard" />
        </div>
      </div>

      <div>
        <label
          className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1"
          htmlFor="attendance-code"
        >
          Today's code
          {initialCode && code === initialCode && (
            <span className="ml-1.5 text-primary font-bold normal-case tracking-normal">· filled from QR</span>
          )}
        </label>
        <div className="relative flex items-center bg-gray-50 rounded-xl border border-gray-200 px-3.5 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Icon className="text-primary text-[20px]" name="pin" />
          <input
            autoComplete="one-time-code"
            className="w-full bg-transparent border-0 p-0 pl-2.5 text-lg font-bold font-mono text-gray-900 placeholder:text-gray-400 placeholder:font-normal placeholder:text-sm tracking-[0.4em] focus:outline-none focus:ring-0"
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
        <p className="mt-1 text-[11px] text-gray-500">
          Shown on the front-desk screen, and changes every day.
        </p>
      </div>

      <button
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.99] text-white font-headline-sm text-sm font-bold tracking-wide uppercase shadow-md shadow-primary/25 transition-all disabled:opacity-60 disabled:active:scale-100"
        disabled={busy || disabled}
        type="submit"
      >
        <Icon className={`text-[19px] ${busy ? "animate-spin" : ""}`} name={busy ? "progress_activity" : "lock_open"} />
        <span>{busy ? "Checking in…" : "Mark Attendance Now"}</span>
      </button>

      {localError && <StatusNote tone="err">{localError}</StatusNote>}
      {!localError && result && <StatusNote tone={result.tone}>{result.message}</StatusNote>}
    </form>
  );
}
