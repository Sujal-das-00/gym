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
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <span className="font-label-sm text-[11px] font-bold uppercase tracking-widest text-primary">
            Secure area
          </span>
        </div>
        <h2 className="font-headline-lg text-2xl font-bold text-gray-900 tracking-tight">
          Access Member Vault &amp; Records
        </h2>
      </div>

      <form
        className="p-5 rounded-2xl bg-white border border-primary/15 shadow-md shadow-primary/5 flex flex-col gap-4 relative overflow-hidden"
        onSubmit={submit}
      >
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

        <div className="flex flex-col gap-1.5">
          <label
            className="font-label-md text-xs font-bold uppercase tracking-wider text-gray-700"
            htmlFor="member-gym-id"
          >
            Membership ID
          </label>
          <div className="flex items-center rounded-xl bg-gray-50 border border-gray-200 focus-within:bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all px-3 py-1">
            <Icon className="text-gray-400 text-[18px] mr-1.5" name="badge" />
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
            {gymId.trim().length > 0 && (
              <Icon
                className="text-primary text-[20px]"
                name="check_circle"
                style={{ fontVariationSettings: '"FILL" 1' }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="font-label-md text-xs font-bold uppercase tracking-wider text-gray-700"
            htmlFor="member-phone"
          >
            Registered Mobile Number
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
            {ready && (
              <Icon
                className="text-primary text-[20px]"
                name="check_circle"
                style={{ fontVariationSettings: '"FILL" 1' }}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              checked={trustDevice}
              className="w-4 h-4 rounded text-primary focus:ring-0 focus:ring-offset-0 accent-primary cursor-pointer border-gray-300"
              onChange={(event) => setTrustDevice(event.target.checked)}
              type="checkbox"
            />
            <span className="font-body-sm text-xs font-medium text-gray-700">Trust this device</span>
          </label>
          <span className="font-label-sm text-[11px] font-medium text-gray-500 bg-gray-100 py-0.5 px-2.5 rounded-full border border-gray-200">
            {trustDevice ? "30-day session" : "12-hour session"}
          </span>
        </div>

        <button
          className="w-full mt-1 py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-headline-sm text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 shadow-md shadow-primary/25 transition-all disabled:opacity-60 disabled:active:scale-100"
          disabled={!ready || busy}
          type="submit"
        >
          <Icon
            className={`text-[20px] ${busy ? "animate-spin" : ""}`}
            name={busy ? "sync" : "lock_open"}
          />
          <span>{busy ? "Verifying Vault Access…" : "Unlock Member Vault"}</span>
        </button>

        {error && <StatusNote tone="err">{error}</StatusNote>}
      </form>

      <div className="flex items-start gap-2.5 px-1 text-[11px] text-gray-500 leading-relaxed">
        <Icon className="text-primary text-[16px] shrink-0 mt-0.5" name="shield_lock" />
        <span>
          Unlocks your admin-filled address, remaining plan days, payment receipts and digital gym ID card.
        </span>
      </div>
    </div>
  );
}
