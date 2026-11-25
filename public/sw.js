const CACHE_NAME = 'to-guides-shell-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(['/', '/manifest.json', '/icon-512.png', '/apple-touch-icon.png'])
      )
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept cross-origin APIs (Google Apps Script, Firebase) or live proxy endpoints
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML navigation so deploys appear immediately; fall back to cache offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/') || caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate for static bundles & assets
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Handle incoming FCM Web Push notifications (iPhone Safari PWA + Chrome/Desktop)
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { notification: { title: 'TO Guides', body: event.data.text() } };
    }
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || "Tomorrow's Schedule";
  const body = notif.body || data.body || 'Tap to view your updated schedule.';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      tag: 'to-guides-tomorrow-dispatch',
      renotify: true,
      data: {
        type: data.type || 'tomorrow_dispatch',
        targetDateIso: data.targetDateIso || '',
      },
    })
  );
});

// Deep-link to tomorrow's schedule when the user taps the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetDateIso = typeof data.targetDateIso === 'string' ? data.targetDateIso : '';
  const targetUrl = targetDateIso
    ? `/?targetDateIso=${encodeURIComponent(targetDateIso)}`
    : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({
              type: 'OPEN_SCHEDULE_DATE',
              targetDateIso,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
