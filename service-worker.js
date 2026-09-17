const CACHE_NAME = "gym-pwa-v9";
const APP_SHELL = [
  "/",
  "/admin",
  "/checkin",
  "/manifest.json",
  "/service-worker.js",
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
  // Both frontends are hashed Vite bundles, so their assets can't be listed in
  // APP_SHELL up front — match them by prefix and cache them as they load.
  const isAppShell =
    APP_SHELL.includes(url.pathname) ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/admin/assets/") ||
    url.pathname.startsWith("/checkin/assets/");
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
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Offline navigation: fall back to the shell for whichever app was asked for.
          return caches.match(url.pathname.startsWith("/checkin") ? "/checkin" : "/admin");
        }),
      ),
  );
});
