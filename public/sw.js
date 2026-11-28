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
  const pushType = data.type || 'tomorrow_dispatch';
  const isTripReport = pushType === 'trip_report';

  const title =
    notif.title ||
    data.title ||
    (isTripReport ? 'Post-Trip Report Reminder' : "Tomorrow's Schedule");
  const body =
    notif.body ||
    data.body ||
    (isTripReport
      ? 'Tap to submit your post-trip report.'
      : 'Tap to view your updated schedule.');

  const tag = isTripReport
    ? data.tourKey
      ? `to-guides-trip-report-${data.tourKey}`
      : 'to-guides-trip-report'
    : 'to-guides-tomorrow-dispatch';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      tag,
      renotify: true,
      data: {
        type: pushType,
        targetDateIso: data.targetDateIso || data.dateIso || '',
        dateIso: data.dateIso || data.targetDateIso || '',
        tourIdx: data.tourIdx !== undefined ? String(data.tourIdx) : '',
        tourKey: data.tourKey || '',
        openReport: isTripReport ? '1' : '',
      },
    })
  );
});

// Deep-link when the user taps a Web Push notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const isTripReport = data.type === 'trip_report' || data.openReport === '1';

  let targetUrl = '/';
  let clientMessage = null;

  if (isTripReport) {
    const dateIso = typeof data.dateIso === 'string' ? data.dateIso : '';
    const tourIdx = typeof data.tourIdx === 'string' ? data.tourIdx : '';
    const tourKey = typeof data.tourKey === 'string' ? data.tourKey : '';
    const qs = new URLSearchParams();
    qs.set('openReport', '1');
    if (dateIso) qs.set('dateIso', dateIso);
    if (tourIdx !== '') qs.set('tourIdx', tourIdx);
    if (tourKey) qs.set('tourKey', tourKey);
    targetUrl = `/?${qs.toString()}`;
    clientMessage = {
      type: 'OPEN_TRIP_REPORT',
      dateIso,
      tourIdx,
      tourKey,
    };
  } else {
    const targetDateIso = typeof data.targetDateIso === 'string' ? data.targetDateIso : '';
    targetUrl = targetDateIso
      ? `/?targetDateIso=${encodeURIComponent(targetDateIso)}`
      : '/';
    clientMessage = {
      type: 'OPEN_SCHEDULE_DATE',
      targetDateIso,
    };
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage(clientMessage);
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
