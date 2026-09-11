// Dashboard shell only. Network first so updates land immediately; the cache is just the
// offline fallback. API responses are never cached: they hold private messages and data.
const CACHE = 'elev8-dashboard-v2'
const SHELL = ['/dashboard/', '/dashboard/app.js', '/dashboard/app.css', '/dashboard/manifest.webmanifest', '/dashboard/icons/icon-192.png', '/logo.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (!url.pathname.startsWith('/dashboard/') && url.pathname !== '/logo.png') return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('/dashboard/'))),
  )
})

// ---------- notifications ----------
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'S&S ELEV8', {
      body: d.body || '',
      icon: '/dashboard/icons/icon-192.png',
      badge: '/dashboard/icons/badge-96.png',
      tag: d.tag || undefined,
      lang: 'nl',
      data: { url: typeof d.url === 'string' && d.url.startsWith('/dashboard/') ? d.url : '/dashboard/' },
    }),
  )
})

// Tapping a notification reuses an open dashboard window and sends it to the right page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data?.url || '/dashboard/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => new URL(c.url).pathname.startsWith('/dashboard/'))
      if (!win) return self.clients.openWindow(target)
      win.postMessage({ open: target })
      return win.focus()
    }),
  )
})
