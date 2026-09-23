#!/usr/bin/env node
// Arranque en Safari (WebKit, el motor del iPhone), por WebDriver (23 sep 2026).
// Las demás sondas usan Chrome; esta mide lo que ve un iPhone: el primer
// pintado, cuándo la cartelera de Inicio está a la vista (usable) y cuánto
// tarda el script en ejecutarse. Sin red lenta (safaridriver no la simula):
// sirve para comparar builds, no para cifras absolutas de un móvil.
// Requisitos: Safari › Ajustes › Desarrollo › «Permitir automatización remota».
// Uso: node scripts/sondas/safari.mjs [pasadas]   (DIST=<carpeta> para otra build)
import { spawn } from 'node:child_process'
import { servidor, espera, informe } from './lib.mjs'

const PASADAS = +process.argv[2] || 5
const PUERTO_WD = 4480 + Math.floor(Math.random() * 400)
const wd = spawn('safaridriver', ['-p', String(PUERTO_WD)], { stdio: 'ignore' })
const srv = await servidor()
const base = `http://localhost:${srv.address().port}/`
const pide = async (metodo, ruta, cuerpo) => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO_WD}${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      const j = await r.json()
      if (j.value && j.value.error) throw new Error(j.value.message)
      return j.value
    } catch (e) { if (i === 39 || !/fetch failed|ECONNREFUSED/.test(String(e) + String(e.cause))) throw e; await espera(250) }
  }
}
const mediana = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN }
const filas = []
let sesion
try {
  sesion = (await pide('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })).sessionId
  const ejecuta = (js, args = []) => pide('POST', `/session/${sesion}/execute/sync`, { script: js, args })
  await pide('POST', `/session/${sesion}/window/rect`, { width: 430, height: 932 })
  // semilla: bienvenida vista, idioma y algo de progreso
  await pide('POST', `/session/${sesion}/url`, { url: base + '?semilla' })
  await ejecuta(`localStorage.clear(); localStorage.setItem('maraton-marvel-bienvenida-v1','1'); localStorage.setItem('maraton-marvel-aviso-v1','2026-09-03'); localStorage.setItem('maraton-marvel-idioma-v1','es'); localStorage.setItem('maraton-marvel-pais-v1','CL'); localStorage.setItem('maraton-marvel-guia-ios-v1', String(Date.now())); const v = {}; ['first-class','origins-wolverine','xmen1','x2','cap1'].forEach((id, i) => v[id] = Date.now() - i * 864e5); localStorage.setItem('maraton-marvel-v1', JSON.stringify(v))`)
  const res = []
  for (let i = 0; i < PASADAS; i++) {
    await pide('POST', `/session/${sesion}/url`, { url: 'about:blank' })
    await pide('POST', `/session/${sesion}/url`, { url: base + '?p=' + i + Date.now() })
    let m = null
    for (let k = 0; k < 60 && !m; k++) {
      m = await ejecuta(`const n = performance.getEntriesByType('navigation')[0], f = performance.getEntriesByName('first-contentful-paint')[0], u = performance.getEntriesByName('inicio-usable')[0]
        return u ? { html: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), fcp: f ? Math.round(f.startTime) : null, usable: Math.round(u.startTime), js: Math.round(u.startTime - n.responseEnd), carga: Math.round(n.loadEventEnd) } : null`)
      if (!m) await espera(100)
    }
    await espera(1500)
    m.errores = await ejecuta(`return (window.__errores || []).length`)
    res.push(m)
  }
  console.table(res)
  const med = k => mediana(res.map(r => r[k]))
  filas.push([Number.isFinite(med('usable')), `Safari · del HTML a Inicio listo ${med('js')} ms · usable ${med('usable')} ms · primer pintado ${med('fcp')} ms · DOMContentLoaded ${med('dcl')} ms · load ${med('carga')} ms`])
} catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally {
  if (sesion) await pide('DELETE', `/session/${sesion}`).catch(() => {})
  wd.kill(); srv.close()
}
process.exitCode = informe('arranque en Safari (WebKit)', filas) ? 1 : 0
