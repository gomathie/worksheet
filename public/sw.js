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
