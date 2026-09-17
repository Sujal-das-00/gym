import { useEffect, useRef, useState } from "react";

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/**
 * The page ships the shared /manifest.json, whose start_url is the admin panel —
 * installing from a gym's check-in page would open the wrong app. So the install
 * is given its own manifest pointing at the route the member is on right now,
 * e.g. /checkin/nova-fitness, and the installed icon lands straight on that gym.
 *
 * The daily ?c= code is deliberately left out of start_url: it expires, the slug
 * doesn't. Every URL is absolute because the manifest is served from a blob:,
 * which has no path of its own for relative URLs to resolve against.
 */
function buildManifest(appName) {
  const { origin, pathname } = window.location;
  const startUrl = `${origin}${pathname.startsWith("/checkin") ? pathname : "/checkin"}`;
  const name = appName || document.title || "Gym Check-in";
  return {
    id: startUrl,
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description: "Quick member check-in for your gym.",
    start_url: startUrl,
    scope: `${origin}/checkin/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f86a10",
    orientation: "portrait",
    icons: [
      { src: `${origin}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${origin}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

/** The beforeinstallprompt handling that used to live inline in index.html. */
export default function useInstallPrompt(appName = "") {
  const promptEvent = useRef(null);
  const blobUrl = useRef("");
  const [canInstall, setCanInstall] = useState(false);

  // Swap the <link rel="manifest"> for one describing this gym. Chrome reads the
  // manifest before it fires beforeinstallprompt, so this has to be in place
  // early — it is refreshed again on the click in case the route or gym name
  // changed since (a scanned QR swaps gyms with pushState).
  const applyManifest = () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const json = JSON.stringify(buildManifest(appName));
    const next = URL.createObjectURL(new Blob([json], { type: "application/manifest+json" }));
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = next;
    link.setAttribute("href", next);
  };

  useEffect(() => {
    applyManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName]);

  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );

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

  return { canInstall, promptInstall };
}
