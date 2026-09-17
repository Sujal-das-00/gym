import Icon from "./Icon.jsx";

/** Shown when the URL has no gym slug — /checkin instead of /checkin/nova-fitness. */
export default function MissingGymNotice() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm flex flex-col items-center text-center gap-2">
      <div className="w-12 h-12 rounded-2xl bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
        <Icon className="text-[24px]" name="location_off" />
      </div>
      <h2 className="text-base font-bold font-headline-md text-gray-900">Choose your gym</h2>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[18rem]">
        This link is missing your gym. Scan the QR on the front desk below, or open the link your gym gave
        you.
      </p>
    </div>
  );
}
