import { useState } from "react";
import Icon from "../components/Icon.jsx";
import StatusNote from "../components/StatusNote.jsx";

// Digits only, matching how the backend normalises Indian numbers before lookup.
const isCompletePhone = (value) => value.replace(/\D/g, "").length >= 10;

export default function AccountPanel({ busy, error, onUnlock }) {
  const [gymId, setGymId] = useState("");
  const [phone, setPhone] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  // Membership ID is the username, phone is the password — both must belong to
  // the same member. See hooks/useMemberAccount.js.
  const ready = gymId.trim().length > 0 && isCompletePhone(phone);

  const submit = (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    onUnlock(gymId, phone, trustDevice);
  };

  return (
    <div
      aria-labelledby="tab-account"
      className="flex flex-col gap-4 animate-panel-in"
      id="panel-account"
      role="tabpanel"
    >
      <h2 className="font-headline-lg text-2xl font-bold text-gray-900 tracking-tight">Sign in</h2>

      <form
        className="p-5 rounded-2xl bg-white border border-primary/15 shadow-md shadow-primary/5 flex flex-col gap-4 "
        onSubmit={submit}
      >
        <div className="flex flex-col gap-1.5">
          <label
            className="font-label-md text-xs font-bold uppercase tracking-wider text-gray-700"
            htmlFor="member-gym-id"
          >
            Member ID
          </label>
          <div className="flex items-center rounded-xl bg-gray-50 border border-gray-200 focus-within:bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all px-3 py-1">
                        <input
              autoCapitalize="characters"
              autoComplete="username"
              className="w-full bg-transparent border-0 py-2.5 px-1 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0 placeholder:text-gray-400 tracking-wider"
              id="member-gym-id"
              onChange={(event) => setGymId(event.target.value)}
              placeholder="GYM1001"
              type="text"
              value={gymId}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="font-label-md text-xs font-bold uppercase tracking-wider text-gray-700"
            htmlFor="member-phone"
          >
            Mobile number
          </label>
          <div className="flex items-center rounded-xl bg-gray-50 border border-gray-200 focus-within:bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all px-3 py-1">
            <span className="flex items-center gap-1 pr-2 text-gray-700 font-mono font-semibold text-xs border-r border-gray-200">
              +91
            </span>
            <input
              autoComplete="tel"
              className="w-full bg-transparent border-0 py-2.5 px-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0 placeholder:text-gray-400 tracking-wide"
              id="member-phone"
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="98765 43210"
              type="tel"
              value={phone}
            />
          </div>
        </div>

        <div className="flex items-center pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              checked={trustDevice}
              className="w-4 h-4 rounded text-primary focus:ring-0 focus:ring-offset-0 accent-primary cursor-pointer border-gray-300"
              onChange={(event) => setTrustDevice(event.target.checked)}
              type="checkbox"
            />
            <span className="font-body-sm text-xs font-medium text-gray-700">Keep me signed in</span>
          </label>
                  </div>

        <button
          className="w-full mt-1 py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-headline-sm text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary/25 transition-all disabled:opacity-60 disabled:active:scale-100"
          disabled={!ready || busy}
          type="submit"
        >
          <Icon
            className={`text-[20px] ${busy ? "animate-spin" : ""}`}
            name={busy ? "sync" : "login"}
          />
          <span>{busy ? "Signing in…" : "Sign in"}</span>
        </button>

        {error && <StatusNote tone="err">{error}</StatusNote>}
      </form>
    </div>
  );
}
