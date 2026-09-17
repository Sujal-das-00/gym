const CACHE_NAME = "gym-pwa-v10";
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

/* ---------------------------------------------------------------------------
 * Web Push
 *
 * These two handlers are why the notification works with every GymBoo tab shut:
 * the browser wakes this worker on delivery, it draws the notification, and it
 * opens the app on click. Nothing here touches the network or the cache.
 * ------------------------------------------------------------------------- */

const FALLBACK_NOTIFICATION = {
  title: "GymBoo",
  body: "You have a new update from your gym.",
  url: "/checkin",
  tag: "gymboo",
  icon: "/icons/icon-192.png",
};

// The payload is built by backend/src/services/pushService.js. A push whose body
// isn't the JSON we send (a malformed send, or a browser test push with no data)
// must still show something rather than throw and show the browser's own
// "This site has been updated in the background" placeholder.
function readPayload(event) {
  if (!event.data) return { ...FALLBACK_NOTIFICATION };
  try {
    const data = event.data.json();
    return {
      title: String(data.title || FALLBACK_NOTIFICATION.title),
      body: String(data.body || ""),
      url: String(data.url || FALLBACK_NOTIFICATION.url),
      tag: String(data.tag || FALLBACK_NOTIFICATION.tag),
      kind: String(data.kind || "custom"),
      icon: String(data.icon || FALLBACK_NOTIFICATION.icon),
      badge: String(data.badge || FALLBACK_NOTIFICATION.icon),
    };
  } catch {
    return { ...FALLBACK_NOTIFICATION, body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      // Per-member tag: a second reminder for the same member replaces the first
      // instead of stacking, while two different members' pushes stay separate.
      tag: payload.tag,
      renotify: true,
      // Fee reminders are money — keep them on screen until the member acts.
      requireInteraction: payload.kind === "fee-reminder",
      // The click handler below reads this back; `url` is always a same-origin
      // path, enforced server-side in notificationService.safeClickUrl().
      data: { url: payload.url, kind: payload.kind },
      actions: [{ action: "open", title: payload.kind === "fee-reminder" ? "View dues" : "Open GymBoo" }],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || FALLBACK_NOTIFICATION.url, self.location.origin);

  // Focus a GymBoo window that is already open rather than piling up new ones;
  // only open a fresh window when there is nothing to focus.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const open = new URL(client.url);
        if (open.origin !== target.origin) continue;
        if ("focus" in client) {
          // Same app, different screen: steer the open tab instead of reloading it.
          if (open.pathname !== target.pathname || open.search !== target.search) {
            if ("navigate" in client) return client.navigate(target.href).then((navigated) => navigated?.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

// Chrome can rotate a subscription's keys; the old endpoint stops working the
// moment it does. The member app re-subscribes and re-registers on its next
// load (usePushNotifications), and any send to the dead endpoint is cleaned up
// server-side on the 410 it returns.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.showNotification("GymBoo notifications need a refresh", {
      body: "Open GymBoo once to keep receiving fee reminders.",
      icon: FALLBACK_NOTIFICATION.icon,
      tag: "gymboo-resubscribe",
      data: { url: "/checkin", kind: "custom" },
    }),
  );
});
