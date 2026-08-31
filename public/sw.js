// Service worker de Maratón Marvel:
// - navegación: red primero (para no servir versiones viejas), caché como respaldo sin conexión
// - pósters, fotos, fondos y fuentes: caché primero (no cambian)
// La versión va en el nombre: al subirla, el activate borra las cachés viejas.
// Sin esto una carátula sustituida se quedaba con la vieja para siempre en quien
// ya la tuviera guardada.
const CACHE = 'maraton-marvel-v3'

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  const nombres = await caches.keys()
  await Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n)))
  await clients.claim()
})()))

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copia = r.clone()
          // waitUntil: sin él el navegador puede matar el evento antes de que
          // termine de guardar, y el respaldo sin conexión se queda a medias
          e.waitUntil(caches.open(CACHE).then(c => c.put('shell', copia)))
          return r
        })
        .catch(() => caches.match('shell'))
    )
    return
  }
  const esEstatico =
    (url.origin === location.origin && (url.pathname.includes('/posters/') || url.pathname.includes('/people/') ||
      url.pathname.includes('/mini/') || url.pathname.includes('/fondo/') || url.pathname.includes('/fonts/') || url.pathname.endsWith('/social.jpg'))) ||
    url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com'
  if (esEstatico) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        if (r.ok) {
          const copia = r.clone()
          e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copia)))
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
// La app espeja el horario de visionado en la caché 'maraton-marvel-horario'
// (el service worker no ve localStorage). El día que toca sesión, un aviso
// por la mañana — una sola vez por día y nunca después de la hora.
async function revisaSesion() {
  try {
    const c = await caches.open('maraton-marvel-horario')
    const hit = await c.match('config')
    if (!hit) return
    const h = await hit.json()
    if (!h || !Array.isArray(h.dias)) return
    const ahora = new Date()
    if (!h.dias.includes(ahora.getDay())) return
    const [hh, mm] = String(h.hora || '21:00').split(':').map(Number)
    const sesion = new Date(ahora)
    sesion.setHours(hh || 21, mm || 0, 0, 0)
    if (ahora > sesion) return
    const clave = 'sesion' + ahora.toISOString().slice(0, 10)
    const marca = await leeMarca()
    if (marca.includes(clave)) return
    await guardaMarca(marca + '|' + clave)
    await self.registration.showNotification('🍿 Maratón Marvel', {
      body: h.idioma === 'en'
        ? `Marathon session today at ${h.hora}`
        : `Hoy hay sesión de maratón a las ${h.hora}`,
      icon: 'icon-192.png', badge: 'icon-192.png', tag: 'sesion',
    })
  } catch {}
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'estrenos') e.waitUntil(Promise.all([revisaEstrenos(), revisaSesion()]))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws =>
    ws.length ? ws[0].focus() : clients.openWindow('./')
  ))
})
