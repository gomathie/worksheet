// Hand-rolled service worker for OpenSignal Ledger.
//
// Strategy:
//   /api/*            -> network only (live shared data, never cached)
//   navigations (HTML)-> network first, fall back to cached shell offline
//   /assets/* (hashed)-> cache first (content-hashed, immutable)
//   other GET         -> stale-while-revalidate
//
// Bump CACHE_VERSION to force clients onto fresh cached assets.
const CACHE_VERSION = 'ledger-v1'
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(['/', SHELL])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Only handle same-origin; let the browser deal with fonts/CDNs itself.
  if (url.origin !== self.location.origin) return

  // Never cache the API — it's live, shared, per-session data.
  if (url.pathname.startsWith('/api/')) return

  // App shell / SPA navigations: network first so deploys land immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((c) => c.put(SHELL, copy))
          return res
        })
        .catch(() => caches.match(SHELL).then((r) => r || caches.match('/'))),
    )
    return
  }

  // Content-hashed build assets never change under the same URL: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy))
            return res
          }),
      ),
    )
    return
  }

  // Everything else (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => hit)
      return hit || network
    }),
  )
})

// ------------------------------------------------------------ push messages
//
// Pushes carry no payload by design (see server/push.ts): the worker wakes,
// asks the API what is new, and shows that. Nothing about an expense passes
// through the push service.

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let title = 'OpenSignal Ledger'
      let body = 'You have a new notification.'
      let url = '/expenses'

      try {
        const res = await fetch('/api/notifications', { credentials: 'same-origin' })
        if (res.ok) {
          const all = await res.json()
          const unread = all.filter((n) => !n.read_at)
          if (unread.length === 0) return // already dealt with elsewhere
          const latest = unread[0]
          title = latest.title || title
          body =
            unread.length > 1
              ? `${latest.body || ''}\n(+${unread.length - 1} more)`.trim()
              : latest.body || body
          if (latest.voucher_id) url = `/expenses/${latest.voucher_id}`
        }
      } catch {
        // Offline or signed out: fall back to the generic message below.
      }

      await self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'ledger-notification',
        data: { url },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Reuse an open tab when there is one rather than piling up windows.
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
