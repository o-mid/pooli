const CACHE = "pooli-shell-v6";
const STATIC = ["/", "/app", "/manifest.webmanifest", "/brand/logo-color.svg", "/brand/mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  // Never intercept API — always hit the network/origin rewrite.
  if (url.pathname.startsWith("/api")) return;

  // Auth pages + HTML navigations: network-first so login/register updates are visible.
  const isNavigate = request.mode === "navigate" || request.destination === "document";
  const isAuthPage = url.pathname === "/login" || url.pathname === "/register";
  if (isNavigate || isAuthPage) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/") || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin && !url.pathname.startsWith("/api")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/") || Response.error());
    }),
  );
});
