#!/usr/bin/env node
// Memoria en uso tras recorrer la app muchas veces. Una fuga se ve como
// crecimiento entre la vuelta de la mitad y la última (la 1 incluye cachés que se llenan
// una sola vez). Mide heap tras GC, nodos del DOM, oyentes, temporizadores
// vivos y animaciones. Uso: node scripts/sondas/memoria.mjs [vueltas]
import { abre, memoria, toca, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const VUELTAS = Math.max(2, +process.argv[2] || 10), MITAD = Math.ceil(VUELTAS / 2)
const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
// progreso a medias: un tercio visto con fechas repartidas en 60 días
const vistas = {}
ids.slice(0, Math.floor(ids.length / 3)).forEach((id, i) => vistas[id] = Date.now() - i * 86400000 * 0.4)

const { cdp, navega, cierra, errores } = await abre({ siembra: { 'maraton-marvel-v1': vistas } })
try {
  // cuenta de temporizadores vivos, instalada antes de que cargue la app
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const vivos = new Set(); window.__temporizadores = vivos
    const si = setInterval, ci = clearInterval
    window.setInterval = (...a) => { const id = si(...a); vivos.add(id); return id }
    window.clearInterval = id => { vivos.delete(id); ci(id) }
  })()` })
  await navega('#crono')
  await espera(2500)
  const vistasApp = ['crono', 'stats', 'multiverso', 'galeria', 'tiempo', 'listas', 'comics', 'animacion', 'estreno']
  const filas = []
  let abiertas = 0
  const toma = async etiqueta => {
    const m = await memoria(cdp)
    m.intervalos = await cdp.eval('window.__temporizadores.size')
    filas.push({ etiqueta, ...m })
  }
  await toma('arranque')
  for (let v = 1; v <= VUELTAS; v++) {
    for (const vista of vistasApp) {
      await cdp.eval(`location.hash = '${vista}'`)
      await espera(350)
    }
    await cdp.eval(`location.hash = 'crono'`)
    await espera(400)
    // abrir y cerrar tres fichas
    for (let f = 0; f < 3; f++) {
      await cdp.eval(`window.scrollTo({ top: ${f * 1500}, behavior: 'instant' })`)
      await espera(150)
      const ok = await cdp.eval(`(() => { const b = [...document.querySelectorAll('.card .abrir')].find(b => { const r = b.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 60 }); if (!b) return false; b.click(); return true })()`)
      if (!ok) continue
      await cdp.hasta(`!!document.querySelector('.modal')`, 5000)
      abiertas++
      await espera(700)
      await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await cdp.hasta(`!document.querySelector('.modal')`, 5000)
      await espera(300)
    }
    if (v === 1 || v === MITAD || v === VUELTAS) await toma(`vuelta ${v}`)
  }
  console.table(filas)
  const v5 = filas.find(f => f.etiqueta === `vuelta ${MITAD}`), vN = filas.at(-1)
  const crece = (vN.heapMB - v5.heapMB) / v5.heapMB
  const malas = informe('memoria', [
    [crece < 0.05, `heap de la vuelta ${MITAD} a la ${VUELTAS}: ${v5.heapMB} → ${vN.heapMB} MB (${(crece * 100).toFixed(1)} %, tope 5 %)`],
    [vN.nodos - v5.nodos < 500, `nodos: ${v5.nodos} → ${vN.nodos} (tope +500)`],
    [vN.oyentes - v5.oyentes < 50, `oyentes: ${v5.oyentes} → ${vN.oyentes} (tope +50)`],
    [vN.intervalos <= filas[0].intervalos + 2, `intervalos vivos: ${filas[0].intervalos} al arrancar, ${vN.intervalos} al final`],
    [abiertas >= VUELTAS * 2, `fichas abiertas y cerradas: ${abiertas} de ${VUELTAS * 3}`],
    [errores.length === 0, `errores en consola: ${errores.length}${errores.length ? '\n    ' + errores.slice(0, 5).join('\n    ') : ''}`],
  ])
  process.exitCode = malas ? 1 : 0
} finally { await cierra() }
