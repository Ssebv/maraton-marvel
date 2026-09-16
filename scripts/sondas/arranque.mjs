#!/usr/bin/env node
// Arranque en frío en un móvil lento: perfil nuevo (sin caché ni service
// worker), red 4G lenta (150 ms, 1,6 Mbps) y CPU a ×4, en varias pasadas.
// Mide cuándo llega el HTML, el primer pintado (FCP), el mayor (LCP), cuándo
// se ve la tarjeta «Siguiente» (la app es usable) y las tareas largas.
// Uso: node scripts/sondas/arranque.mjs [pasadas]   (DIST=<carpeta> para otra build)
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const PASADAS = +process.argv[2] || 3
const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 45).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const mediana = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN }
const res = []
const errores = []
for (let i = 0; i < PASADAS; i++) {
  const s = await abre({ siembra: { 'maraton-marvel-v1': vistas } })
  try {
    await s.cdp.send('Network.enable')
    await s.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await s.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      window.__m = { largas: [] }
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime }).observe({ type: 'paint', buffered: true })
      new PerformanceObserver(l => { const e = l.getEntries().at(-1); if (e) window.__m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.largas.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true })
      const mira = () => { if (!window.__m.usable && document.querySelector('.stats-inicio .siguiente-stat, .card')) window.__m.usable = performance.now(); if (!window.__m.usable) requestAnimationFrame(mira) }
      requestAnimationFrame(mira)
    })()` })
    // la primera carga de abre() dejó caché y service worker: se limpian
    await s.cdp.send('Network.clearBrowserCache')
    await s.cdp.eval(`navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => 1) : 1`)
    await s.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const bytes = { total: 0 }
    s.cdp.r.oyentes.push(m => { if (m.method === 'Network.loadingFinished') bytes.total += m.params.encodedDataLength })
    await s.cdp.send('Page.navigate', { url: 'about:blank' })
    await espera(100)
    bytes.total = 0
    await s.cdp.send('Page.navigate', { url: s.url + '#crono' })
    await s.cdp.hasta('window.__m && window.__m.usable', 60000)
    await espera(4000)
    const m = await s.cdp.eval(`(() => { const n = performance.getEntriesByType('navigation')[0]
      return { html: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), fcp: Math.round(__m.fcp), lcp: Math.round(__m.lcp), usable: Math.round(__m.usable),
        largas: __m.largas.filter(x => x[0] < __m.usable + 3000), peor: Math.max(0, ...__m.largas.map(x => x[1])), bloqueo: __m.largas.reduce((a, x) => a + Math.max(0, x[1] - 50), 0) } })()`)
    m.kB = Math.round(bytes.total / 1024)
    res.push(m)
    errores.push(...s.errores)
  } finally { await s.cierra() }
}
console.table(res.map(r => ({ htmlMs: r.html, fcpMs: r.fcp, lcpMs: r.lcp, usableMs: r.usable, peorTareaMs: r.peor, bloqueoMs: r.bloqueo, kB: r.kB })))
console.log('tareas largas de la última pasada [inicio, ms]:', JSON.stringify(res.at(-1).largas))
const u = mediana(res.map(r => r.usable)), f = mediana(res.map(r => r.fcp)), b = mediana(res.map(r => r.bloqueo)), lcp = mediana(res.map(r => r.lcp)), kB = mediana(res.map(r => r.kB))
process.exitCode = informe(`arranque en frío · 4G lenta · CPU ×4 · ${PASADAS} pasadas (medianas)`, [
  [Number.isFinite(u), `usable («Siguiente» a la vista): ${u} ms · primer pintado ${f} ms · mayor pintado (LCP) ${lcp} ms · bloqueo del hilo ${b} ms · ${kB} kB`],
  [errores.length === 0, `errores en consola: ${errores.length}`],
]) ? 1 : 0
