// Service worker de Maratón Marvel:
// - navegación: red primero (para no servir versiones viejas), caché como respaldo sin conexión
// - pósters, fotos y fuentes: caché primero (no cambian)
const CACHE = 'maraton-marvel-v1'

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copia = r.clone()
          caches.open(CACHE).then(c => c.put('shell', copia))
          return r
        })
        .catch(() => caches.match('shell'))
    )
    return
  }
  const esEstatico =
    (url.origin === location.origin && (url.pathname.includes('/posters/') || url.pathname.includes('/people/'))) ||
    url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com'
  if (esEstatico) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        if (r.ok) {
          const copia = r.clone()
          caches.open(CACHE).then(c => c.put(e.request, copia))
        }
        return r
      }))
    )
  }
})
