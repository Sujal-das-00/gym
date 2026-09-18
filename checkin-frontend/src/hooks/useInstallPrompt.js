import { useEffect, useRef, useState } from "react";

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/**
 * The page ships the shared /manifest.json, whose start_url is the admin panel —
 * installing from a gym's check-in page would open the wrong app. So the install
 * is pointed at /checkin/manifest.json?slug=..., a real network resource generated
 * per gym by the backend (see backend/src/routes/frontendRoutes.js), rather than a
 * blob: URL built here. A blob only gets picked up by the JS-driven
 * beforeinstallprompt flow; Android Chrome's own "Add to Home screen" menu — the
 * fallback on devices where beforeinstallprompt never fires — reads the <link>
 * href directly and needs something it can actually fetch, or it falls back to
 * the shared manifest and opens the admin panel instead of this gym.
 *
 * The daily ?c= code is deliberately left out of start_url: it expires, the slug
 * doesn't.
 */
function manifestHref(slug, appName) {
  const params = new URLSearchParams({ slug });
  if (appName) params.set("name", appName);
  return `/checkin/manifest.json?${params.toString()}`;
}

/** The beforeinstallprompt handling that used to live inline in index.html. */
export default function useInstallPrompt(appName = "", slug = "") {
  const promptEvent = useRef(null);
  const [canInstall, setCanInstall] = useState(false);

  // Swap the <link rel="manifest"> for one describing this gym. Chrome reads the
  // manifest before it fires beforeinstallprompt, so this has to be in place
  // early — it is refreshed again on the click in case the route or gym name
  // changed since (a scanned QR swaps gyms with pushState). Without a slug there
  // is no gym to install, so the link is left alone.
  const applyManifest = () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !slug) return;
    link.setAttribute("href", manifestHref(slug, appName));
  };

  useEffect(() => {
    applyManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, slug]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      promptEvent.current = event;
      if (!isInstalled()) setCanInstall(true);
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setCanInstall(false);
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
    applyManifest();
    promptEvent.current.prompt();
    await promptEvent.current.userChoice;
    promptEvent.current = null;
    setCanInstall(false);
  };

  return { canInstall: canInstall && Boolean(slug), promptInstall };
}
