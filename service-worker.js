const STATIC_CACHE = "live-tfl-arrivals-static-v13";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=2026-06-10-bottomnav2",
  "/app.js?v=2026-06-17-elizabeth-departures",
  "/manifest.webmanifest?v=2026-06-08-pwa",
  "/icon.svg?v=2026-06-08-pwa",
  "/icon-maskable.svg?v=2026-06-08-pwa",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = normaliseNotificationUrl(event.notification.data?.url);
  event.waitUntil(clients.openWindow(targetUrl));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: "Live TfL Arrivals",
      body: event.data?.text() || "Your scheduled transport reminder is ready.",
    };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Live TfL Arrivals", {
      body: payload.body || "Your scheduled transport reminder is ready.",
      icon: "/icon.svg?v=2026-06-08-pwa",
      badge: "/icon-maskable.svg?v=2026-06-08-pwa",
      tag: "live-tfl-arrivals-server-schedule",
      data: {
        url: normaliseNotificationUrl(payload.url || "/?page=scheduler"),
      },
    }),
  );
});

function normaliseNotificationUrl(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    if (url.origin !== self.location.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}
