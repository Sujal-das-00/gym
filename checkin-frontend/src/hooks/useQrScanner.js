import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Cameras are only reachable from a secure context; plain http on a LAN address
// silently yields no devices, so say that up front instead of failing at start().
const cameraSupported = () =>
  Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

const FAILURE_MESSAGES = {
  NotAllowedError: "Camera permission denied. Allow camera access, or type your number below.",
  NotFoundError: "No camera found on this device. Use the number check-in below.",
  NotReadableError: "The camera is already in use by another app. Close it and try again.",
};

/**
 * Drives the viewfinder: holds the camera stream, decodes frames, and reports the
 * first QR it reads. Uses the native BarcodeDetector where it exists (Chrome and
 * Android do the decoding off the main thread) and falls back to jsQR elsewhere.
 *
 * `status` is one of: unsupported | idle | starting | scanning | error.
 */
export default function useQrScanner({ onResult }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const detectorRef = useRef(null);
  const canvasRef = useRef(null);
  // The decode loop must not fire onResult again while the caller is still
  // handling the first hit, and must survive re-renders — hence a ref, not state.
  const settledRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [status, setStatus] = useState(() => (cameraSupported() ? "idle" : "unsupported"));
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus(cameraSupported() ? "idle" : "unsupported");
  }, []);

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || settledRef.current) return null;
    if (video.readyState < video.HAVE_CURRENT_DATA) return null;

    if (detectorRef.current) {
      const codes = await detectorRef.current.detect(video).catch(() => []);
      return codes[0]?.rawValue || null;
    }

    const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return jsQR(image.data, width, height, { inversionAttempts: "dontInvert" })?.data || null;
  }, []);

  const start = useCallback(async () => {
    if (!cameraSupported()) {
      setStatus("unsupported");
      setError("This browser can't open the camera here. Check in with your number below.");
      return;
    }
    setError("");
    setStatus("starting");
    settledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        // Unmounted while the permission prompt was open — don't leak the camera.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      if (!detectorRef.current && "BarcodeDetector" in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      }
      setStatus("scanning");

      const tick = async () => {
        if (settledRef.current) return;
        const value = await decodeFrame();
        if (value) {
          settledRef.current = true;
          stop();
          onResultRef.current?.(value);
          return;
        }
        frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    } catch (cause) {
      stop();
      setStatus("error");
      setError(FAILURE_MESSAGES[cause?.name] || "Could not start the camera. Try the number check-in below.");
    }
  }, [decodeFrame, stop]);

  // Release the camera on unmount and whenever the tab is backgrounded, so the
  // indicator light doesn't stay on behind a switched-away PWA.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [stop]);

  return { videoRef, status, error, start, stop };
}
