import { useCallback, useEffect, useRef, useState } from "react";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  window.navigator.standalone === true;

// Matches the URL the server already injected into the shell's <link rel="manifest">
// (backend/src/routes/frontendRoutes.js), which is what makes the installed icon
// open this gym instead of the admin panel.
const manifestHref = (slug) =>
  slug ? `/checkin/manifest.json?slug=${encodeURIComponent(slug)}` : "/checkin/manifest.json";

/**
 * Which "Add to Home screen" walkthrough to show. Chrome fires
 * beforeinstallprompt only on some phones and never on iOS, so on the rest the
 * member is walked to the browser's own menu rather than left with nothing.
 */
function readPlatform() {
  const ua = window.navigator.userAgent || "";
  const iPadOS = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export default function useInstallPrompt(slug = "") {
  const promptEvent = useRef(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const [platform] = useState(readPlatform);
  // A page served over plain http:// (a LAN IP during local testing, say) can only
  // ever produce a browser bookmark — no service worker, no install. Worth saying
  // out loud rather than letting the member wonder why the icon has an address bar.
  const secure = window.isSecureContext;

  // The shell arrives with the right manifest already linked, so this only has to
  // keep up with gym changes that happen without a page load. Swapping the href
  // in place leaves some browsers on the manifest they already parsed, so the
  // whole <link> is replaced to force a fresh read.
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const next = manifestHref(slug);
    if (link.getAttribute("href") === next) return;
    const fresh = document.createElement("link");
    fresh.rel = "manifest";
    fresh.href = next;
    link.replaceWith(fresh);
  }, [slug]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      promptEvent.current = event;
      setCanPrompt(!isStandalone());
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Opening the installed icon runs the same app, so hide the banner the moment
  // the window turns into a standalone one rather than a browser tab.
  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setInstalled(isStandalone());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /**
   * Returns false when there is no prompt to show — the banner then falls back to
   * the browser-menu instructions instead of the tap doing nothing.
   */
  const promptInstall = useCallback(async () => {
    if (!promptEvent.current) return false;
    promptEvent.current.prompt();
    const choice = await promptEvent.current.userChoice;
    // A dismissed prompt can't be re-shown with the same event, so it's dropped
    // either way and the banner switches to the manual steps.
    promptEvent.current = null;
    setCanPrompt(false);
    if (choice?.outcome === "accepted") setInstalled(true);
    return choice?.outcome === "accepted";
  }, []);

  return { canPrompt, installed, platform, promptInstall, secure };
}
