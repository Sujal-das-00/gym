const CACHE_NAME = "gym-pwa-v6";
const APP_SHELL = [
  "/",
  "/admin",
  "/checkin",
  "/manifest.json",
  "/service-worker.js",
  "/admin/style.css",
  "/admin/script.js",
  "/checkin/styles.css",
  "/checkin/checkin.js",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate" || request.destination === "document";
  const isAppShell = APP_SHELL.includes(url.pathname) || url.pathname.startsWith("/icons/");
  if (!isNavigation && !isAppShell) return;

  // Network-first: always serve the freshest HTML/JS/CSS when online so code
  // changes take effect immediately, and fall back to cache only when offline.
  // (A cache-first shell would pin stale script.js and silently break the app
  // after every deploy.)
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/admin"))),
  );
});
