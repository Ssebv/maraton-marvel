// Service worker de Maratón Marvel:
// - navegación: red primero (para no servir versiones viejas), caché como respaldo sin conexión
// - pósters, fotos, fondos y fuentes: caché primero (no cambian)
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
    (url.origin === location.origin && (url.pathname.includes('/posters/') || url.pathname.includes('/people/') ||
      url.pathname.includes('/mini/') || url.pathname.includes('/fondo/') || url.pathname.endsWith('/social.jpg'))) ||
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

// ── Recordatorios de estreno ──
// Con la PWA instalada (Chrome/Android), una sincronización periódica revisa
// novedades.json y lanza una notificación cuando algo se estrena hoy o mañana.
const marcaCache = 'avisos-marca'
async function leeMarca() {
  const hit = await caches.match(marcaCache)
  return hit ? hit.text() : ''
}
async function guardaMarca(v) {
  const c = await caches.open(CACHE)
  await c.put(marcaCache, new Response(v))
}
async function revisaEstrenos() {
  try {
    const r = await fetch('novedades.json', { cache: 'no-store' })
    if (!r.ok) return
    const { eventos } = await r.json()
    const hoy = new Date().toISOString().slice(0, 10)
    const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
    const cerca = eventos.filter(e => e.f === hoy || e.f === manana)
    if (!cerca.length) return
    const marca = await leeMarca()
    const nuevos = cerca.filter(e => !marca.includes(e.f + e.t))
    if (!nuevos.length) return
    await guardaMarca(marca + nuevos.map(e => e.f + e.t).join('|'))
    const cuerpo = nuevos.map(e => `${e.t} · ${e.f === hoy ? 'hoy' : 'mañana'}`).join('\n')
    await self.registration.showNotification('🍿 Maratón Marvel', {
      body: cuerpo, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'estrenos',
    })
  } catch {}
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'estrenos') e.waitUntil(revisaEstrenos())
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws =>
    ws.length ? ws[0].focus() : clients.openWindow('./')
  ))
})
