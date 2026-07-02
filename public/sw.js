// Service Worker - aktuell minimal (kein Offline-Caching).
// Wird bei Bedarf in Phase 2 erweitert.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Kein fetch-Handler - alle Requests gehen direkt ans Netzwerk.
