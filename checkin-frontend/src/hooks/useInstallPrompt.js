import { useEffect, useRef, useState } from "react";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

// Matches the URL the server already injected into the shell's <link rel="manifest">
// (backend/src/routes/frontendRoutes.js), which is what makes the installed icon
// open this gym instead of the admin panel.
const manifestHref = (slug) => `/checkin/manifest.json?slug=${encodeURIComponent(slug)}`;

export default function useInstallPrompt(slug = "") {
  const promptEvent = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);

  // The shell arrives with the right manifest already linked, so this only has to
  // keep up with gym changes that happen without a page load — a scanned QR swaps
  // gyms with pushState.
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !slug) return;
    const next = manifestHref(slug);
    if (link.getAttribute("href") !== next) link.setAttribute("href", next);
  }, [slug]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      promptEvent.current = event;
      setCanInstall(!isStandalone());
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!promptEvent.current) return;
    promptEvent.current.prompt();
    await promptEvent.current.userChoice;
    promptEvent.current = null;
    setCanInstall(false);
  };

  return { canInstall: canInstall && Boolean(slug), installed, promptInstall };
}
