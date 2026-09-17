import useQrScanner from "../hooks/useQrScanner.js";
import Icon from "./Icon.jsx";

// The four crisp corner accents around the viewfinder.
const CORNERS = [
  "top-2 left-2 border-t-2 border-l-2 rounded-tl-sm",
  "top-2 right-2 border-t-2 border-r-2 rounded-tr-sm",
  "bottom-2 left-2 border-b-2 border-l-2 rounded-bl-sm",
  "bottom-2 right-2 border-b-2 border-r-2 rounded-br-sm",
];

// Placeholder glyph standing in for the camera feed before the scanner starts.
function QrGlyph() {
  return (
    <div className="bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm flex items-center justify-center">
      <svg className="w-24 h-24 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
        <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm13-2h3v2h-3v-2zm-3 2h2v2h-2v-2zm5 0h2v4h-2v-4zm-5 4h3v2h-3v-2zm5 2h2v2h-2v-2zm-2-4h2v2h-2v-2zm-8-9h2v2H7V7zm10 0h2v2h-2V7zM7 17h2v2H7v-2z" />
      </svg>
    </div>
  );
}

const HINTS = {
  unsupported: "Camera unavailable on this connection",
  idle: "Point camera at front desk console",
  starting: "Waiting for camera permission…",
  scanning: "Hold the front-desk QR inside the frame",
  error: "Camera unavailable — use the number below",
};

export default function QrScannerCard({ onScan }) {
  const { videoRef, status, error, start, stop } = useQrScanner({ onResult: onScan });
  const live = status === "scanning" || status === "starting";

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
      <div className="w-full flex items-center justify-between text-xs mb-2">
        <span className="font-semibold text-gray-700 flex items-center gap-1.5">
          <Icon className="text-[17px] text-primary" name="qr_code_scanner" />
          Scan Front-Desk QR
        </span>
        {live && (
          <button
            className="text-[11px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-900"
            onClick={stop}
            type="button"
          >
            Stop
          </button>
        )}
      </div>

      <div className="relative w-44 h-44 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center p-3 my-1 overflow-hidden">
        {status === "scanning" && (
          <div className="animate-scanline absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_10px_rgb(var(--brand-primary))] z-20" />
        )}
        {CORNERS.map((corner) => (
          <span className={`absolute w-4 h-4 border-primary z-10 ${corner}`} key={corner} />
        ))}

        {/* Kept mounted so the hook always has a video element to attach the stream to. */}
        <video
          className={`absolute inset-0 w-full h-full object-cover ${live ? "" : "invisible"}`}
          muted
          playsInline
          ref={videoRef}
        />

        {!live && (
          <button
            aria-label="Open camera to scan the front-desk QR"
            className="relative z-10 flex items-center justify-center active:scale-[0.98] transition-transform disabled:opacity-60"
            disabled={status === "unsupported"}
            onClick={start}
            type="button"
          >
            <QrGlyph />
          </button>
        )}
        {status === "starting" && (
          <Icon className="relative z-20 text-primary text-[32px] animate-spin" name="progress_activity" />
        )}
      </div>

      {!live && status !== "error" && status !== "unsupported" && (
        <button
          className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary hover:underline"
          onClick={start}
          type="button"
        >
          <Icon className="text-[16px]" name="photo_camera" />
          Open camera
        </button>
      )}

      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 font-medium">
        <Icon className="text-[16px] text-primary" name="photo_camera" />
        {HINTS[status]}
      </div>

      {error && (
        <p className="mt-2 w-full p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed text-left">
          {error}
        </p>
      )}
    </div>
  );
}
