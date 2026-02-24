// IMAP Service Worker – v1.10
const CACHE_NAME = "imap-v30";
// Derive base path from SW location (works for both "/" and "/imap-bangladesh/")
const BASE = new URL("./", self.location.href).href;
const STATIC_ASSETS = [
  BASE,
  BASE + "index.html",
];

// ── Install: cache shell ──
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first, fallback to cache ──
self.addEventListener("fetch", e => {
  // Skip non-GET and cross-origin API calls
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses for static assets
        if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached =>
          cached || caches.match(BASE + "index.html")
        )
      )
  );
});

// ── Push Notifications ──
self.addEventListener("push", e => {
  const data = e.data?.json() || {};
  const title = data.title || "IMAP নোটিফিকেশন";
  const options = {
    body: data.body || "আপনার বুকিং আপডেট আছে।",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    actions: [
      { action: "view",    title: "দেখুন" },
      { action: "dismiss", title: "বাতিল" }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ──
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action !== "dismiss") {
    const url = e.notification.data?.url || "/";
    e.waitUntil(clients.openWindow(url));
  }
});
