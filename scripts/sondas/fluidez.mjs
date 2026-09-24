#!/usr/bin/env node
// Fluidez al cambiar de sección (Maratón ⇄ Perfil ⇄ Multiverso) con la CPU a
// ×4, como un móvil, en varias pasadas (una sola medición baila mucho):
//  - espera: del toque a que arranca la animación (t.ready de la View
//    Transition): es lo que se nota como «tarda en responder»;
//  - render: lo que dura el callback de la transición (React pintando la
//    sección nueva); mientras dura se ve la página vieja quieta;
//  - tirones: fotogramas de >50 ms (Long Animation Frames) que empiezan
//    DURANTE la animación, que es lo que se nota como «a trompicones».
// Uso: node scripts/sondas/fluidez.mjs [movil|escritorio] [pasadas]
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const modo = process.argv[2] || 'movil'
const PASADAS = +process.argv[3] || 3
const movil = modo === 'movil'
const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 45).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const notas = {}
ids.slice(0, 12).forEach((id, i) => notas[id] = { p: 1 + (i % 5) })

const mediana = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0 }
const datos = {}
const errores = []
for (let pasada = 0; pasada < PASADAS; pasada++) {
  const s = await abre({ movil, ancho: movil ? 390 : 1280, alto: movil ? 844 : 860,
    siembra: { 'maraton-marvel-v1': vistas, 'maraton-marvel-notas-v1': notas } })
  try {
    await s.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      window.__vt = []; window.__loaf = []
      const org = document.startViewTransition && document.startViewTransition.bind(document)
      if (org) document.startViewTransition = arg => {
        const f = typeof arg === 'function' ? arg : arg && arg.update
        const reg = { t0: performance.now() }
        const envuelto = async () => { const a = performance.now(); try { return await f() } finally { reg.render = performance.now() - a } }
        const t = org(typeof arg === 'function' ? envuelto : { ...arg, update: envuelto })
        t.ready.then(() => { reg.listo = performance.now() }, () => {})
        t.finished.then(() => { reg.fin = performance.now() }, () => {})
        window.__vt.push(reg); return t
      }
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__loaf.push({ t: e.startTime, dur: e.duration }) }).observe({ type: 'long-animation-frame' })
    })()` })
    await s.navega('#crono')
    await espera(2500)
    await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    for (const destino of ['mio', 'maraton', 'multiverso', 'maraton']) {
      await s.cdp.eval(`window.__vt.length = 0; window.__loaf.length = 0`)
      const t0 = await s.cdp.eval(`(() => { const i = { maraton: 0, mio: 1, multiverso: 2 }[${JSON.stringify(destino)}]; const t = performance.now(); document.querySelectorAll('nav.tabs .tab')[i].click(); return t })()`)
      await espera(1400)
      const r = await s.cdp.eval(`({ vt: window.__vt[0] || null, loaf: window.__loaf })`)
      const k = destino + (datos[destino + '1'] && datos[destino + '1'].length > pasada ? '2' : '1')
      const d = datos[k] = datos[k] || []
      if (!r.vt || r.vt.listo == null) { d.push({ espera: NaN, render: NaN, tirones: NaN }); continue }
      const durante = r.loaf.filter(e => e.t >= r.vt.listo - 5 && e.t <= (r.vt.fin || r.vt.listo + 500))
      d.push({ espera: Math.round(r.vt.listo - t0), render: Math.round(r.vt.render), tirones: durante.length, peorTiron: Math.round(Math.max(0, ...durante.map(e => e.dur))) })
    }
    errores.push(...s.errores)
  } finally { await s.cierra() }
}
const tabla = Object.entries(datos).map(([k, v]) => ({ cambio: 'a ' + k.replace(/[12]$/, '') + (k.endsWith('2') ? ' (otra vez)' : ''),
  esperaMs: mediana(v.map(x => x.espera)), renderMs: mediana(v.map(x => x.render)), tirones: v.map(x => x.tirones).join('/'), peorTironMs: Math.max(...v.map(x => x.peorTiron || 0)) }))
console.table(tabla)
const peorEspera = Math.max(...tabla.map(t => t.esperaMs))
// un tirón suelto en una pasada es ruido de la máquina (visto tras correr otras
// sondas: 1 de 12 y luego 0 de 24); falla si se repite en el mismo cambio
const repetidos = tabla.filter(t => t.tirones.split('/').filter(x => +x > 0).length >= 2).map(t => t.cambio)
process.exitCode = informe(`fluidez · ${modo} · CPU ×4 · ${PASADAS} pasadas`, [
  // tope 320 desde el 24 sep 2026: el cambio de vista espera a propósito hasta
  // 120 ms a que las carátulas visibles estén decodificadas (caratulasListas en
  // App.jsx) para que la vista nueva no entre con huecos; con CPU ×4 Chrome
  // decodifica despacio y llega al tope. En Safari a velocidad real, ~50 ms.
  [peorEspera <= 320, `peor espera hasta que arranca la animación (mediana): ${peorEspera} ms (tope 320 = 200 + la espera de carátulas; las cifras bailan con la carga del Mac: para comparar, A/B alterno con DIST=)`],
  [repetidos.length === 0, `fotogramas de >50 ms durante la animación que se repiten en 2+ pasadas: ${repetidos.join(', ') || 'ninguno'}`],
  [errores.length === 0, `errores en consola: ${errores.length}`],
]) ? 1 : 0
