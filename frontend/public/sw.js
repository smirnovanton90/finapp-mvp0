// Minimal service worker for PWA install prompt (Chrome/Edge).
// Required for "Add to Home Screen" / "Install app" to be offered.
const CACHE_NAME = "finapp-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
