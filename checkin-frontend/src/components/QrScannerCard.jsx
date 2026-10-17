import useQrScanner from "../hooks/useQrScanner.js";
import Icon from "./Icon.jsx";

export default function QrScannerCard({ onScan }) {
  const { videoRef, status, error, start, stop } = useQrScanner({ onResult: onScan });
  const live = status === "scanning" || status === "starting";

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm flex flex-col gap-3">
      {/* Kept mounted so the hook always has a video element to attach the stream to. */}
      <div
        className={`relative w-full aspect-square max-w-[16rem] mx-auto rounded-xl overflow-hidden bg-gray-900 ${
          live ? "" : "hidden"
        }`}
      >
        <video className="absolute inset-0 w-full h-full object-cover" muted playsInline ref={videoRef} />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="text-white text-[32px] animate-spin" name="progress_activity" />
          </div>
        )}
      </div>

      <button
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-60 ${
          live ? "bg-gray-100 text-gray-700" : "bg-primary text-white shadow-sm"
        }`}
        disabled={status === "unsupported"}
        onClick={live ? stop : start}
        type="button"
      >
        <Icon className="text-[20px]" name={live ? "close" : "qr_code_scanner"} />
        {live ? "Cancel" : "Scan QR code"}
      </button>

      {status === "unsupported" && (
        <p className="text-xs text-gray-500 text-center">Camera isn’t available here.</p>
      )}
      {error && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">{error}</p>}
    </div>
  );
}
