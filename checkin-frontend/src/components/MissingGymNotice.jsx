import Icon from "./Icon.jsx";

const COPY = {
  // No gym in the URL: the app's own first run, before any QR has been scanned.
  missing: {
    title: "Find your gym",
    body: "Scan your gym’s QR code to get started.",
  },
  // A gym that used to work and now 404s — closed, or a stale QR.
  unknown: {
    title: "Gym not found",
    body: "This gym is no longer available. Scan your gym’s QR code again.",
  },
};

/**
 * Shown when the app has no gym to work with — the bare /checkin with nothing
 * remembered yet, or a remembered gym the server no longer knows.
 */
export default function MissingGymNotice({ reason = "missing" }) {
  const copy = COPY[reason] || COPY.missing;
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm flex flex-col items-center text-center gap-2">
      <div className="w-12 h-12 rounded-2xl bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
        <Icon className="text-[24px]" name="qr_code_scanner" />
      </div>
      <h2 className="text-base font-bold font-headline-md text-gray-900">{copy.title}</h2>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[18rem]">{copy.body}</p>
    </div>
  );
}
