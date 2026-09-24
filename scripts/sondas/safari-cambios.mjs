// Cambios de vista, fichas y marcas en Safari (WebKit, el motor del iPhone), por
// WebDriver (24 sep 2026). Mide el montaje de cada vista y cuándo empieza a
// moverse la transición, cuántas carátulas visibles faltan al tomar la foto de
// la vista nueva (debe ser 0: si faltan, la vista entra con huecos y se ve como
// una recarga), cuándo sube la hoja de la ficha y cuánto tarda en pintarse una marca.
// Requisitos: Safari › Ajustes › Desarrollo › «Permitir automatización remota».
// Uso: node scripts/sondas/safari-cambios.mjs   (DIST=<carpeta> para otra build)
import { spawn } from 'node:child_process'
import { servidor, espera } from './lib.mjs'
const PUERTO_WD = 4480 + Math.floor(Math.random() * 400)
const wd = spawn('safaridriver', ['-p', String(PUERTO_WD)], { stdio: 'ignore' })
const srv = await servidor()
const base = `http://localhost:${srv.address().port}/`
const pide = async (metodo, ruta, cuerpo) => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO_WD}${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      const j = await r.json(); if (j.value && j.value.error) throw new Error(j.value.message); return j.value
    } catch (e) { if (i === 39 || !/fetch failed|ECONNREFUSED/.test(String(e) + String(e.cause))) throw e; await espera(250) }
  }
}
const med = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN }
let sesion
try {
  sesion = (await pide('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })).sessionId
  const ejecuta = (js, args = []) => pide('POST', `/session/${sesion}/execute/sync`, { script: js, args })
  const asinc = (js, args = []) => pide('POST', `/session/${sesion}/execute/async`, { script: js, args })
  await pide('POST', `/session/${sesion}/window/rect`, { width: 430, height: 932 })
  await pide('POST', `/session/${sesion}/url`, { url: base + '?semilla' })
  await ejecuta(`localStorage.clear(); localStorage.setItem('maraton-marvel-bienvenida-v1','1'); localStorage.setItem('maraton-marvel-aviso-v1','2026-09-03'); localStorage.setItem('maraton-marvel-idioma-v1','es'); localStorage.setItem('maraton-marvel-pais-v1','CL'); localStorage.setItem('maraton-marvel-guia-ios-v1', String(Date.now())); localStorage.setItem('maraton-marvel-pista-cajon-v1','1'); const v = {}; ['first-class','origins-wolverine','xmen1','x2','cap1'].forEach((id, i) => v[id] = Date.now() - i * 864e5); localStorage.setItem('maraton-marvel-v1', JSON.stringify(v))`)
  await pide('POST', `/session/${sesion}/url`, { url: base + '?x=' + Date.now() + '#crono' })
  await espera(2500)
  await ejecuta(`window.__vt = []; const org = document.startViewTransition.bind(document); document.startViewTransition = a => { const f = typeof a === 'function' ? a : a.update; const reg = { t0: performance.now() }; const t = org(async () => { const x = performance.now(); try { return await f() } finally { reg.render = performance.now() - x; const vis = [...document.querySelectorAll('main img, .modal img')].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 }); reg.imgs = vis.length; reg.faltan = vis.filter(i => !i.complete || !i.naturalWidth).length } }); t.ready.then(() => { reg.listo = performance.now() - reg.t0 }, () => {}); window.__vt.push(reg); return t }; return 1`)
  const vistas = { render: [], listo: [] }
  for (const v of ['estreno', 'comics', 'animacion', 'galeria', 'tiempo', 'galeria', 'animacion', 'comics', 'estreno', 'crono']) {
    await ejecuta(`document.querySelector('nav.subvistas a[href="#${v}"]').click(); return 1`); await espera(1200)
    const r = await ejecuta(`const r = window.__vt[window.__vt.length - 1] || {}; return [r.render, r.listo, r.faltan, r.imgs]`)
    vistas.render.push(Math.round(r[0])); vistas.listo.push(Math.round(r[1])); (vistas.faltan ||= []).push(r[2] + '/' + r[3])
  }
  const fichas = []
  for (let k = 0; k < 4; k++) {
    await ejecuta(`const b = [...document.querySelectorAll('main .card .abrir')][${5 + k * 3}]; b.scrollIntoView({ block: 'center' }); return 1`); await espera(400)
    await ejecuta(`document.querySelectorAll('main .card .abrir')[${5 + k * 3}].click(); return 1`); await espera(1300)
    fichas.push(Math.round((await ejecuta(`const r = window.__vt[window.__vt.length - 1] || {}; return r.listo`))))
    await ejecuta(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1`); await espera(1000)
  }
  const marcas = []
  for (let k = 0; k < 5; k++) {
    const t = await asinc(`const done = arguments[arguments.length - 1]; const c = [...document.querySelectorAll('.card')][${20 + k}]; c.scrollIntoView({ block: 'center' }); requestAnimationFrame(() => { const t0 = performance.now(); c.querySelector('.checkbox').click(); requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - t0))) })`)
    marcas.push(Math.round(t)); await espera(500)
  }
  console.log('carátulas visibles sin cargar al tomar la foto de la vista nueva:', vistas.faltan.join('  '))
  console.log(`Safari · cambio de vista: montaje med ${med(vistas.render)} ms (${vistas.render.join(',')}) · empieza a moverse med ${med(vistas.listo)} ms · ficha: la hoja sube a los ${med(fichas)} ms (${fichas.join(',')}) · marcar hasta pintar ${med(marcas)} ms (${marcas.join(',')})`)
} catch (e) { console.log('se cayó:', e.message, e.stack) } finally {
  if (sesion) await pide('DELETE', `/session/${sesion}`).catch(() => {})
  wd.kill(); srv.close()
}
