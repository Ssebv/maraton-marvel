#!/usr/bin/env node
// Muro y retos (fase 3, parte 2) de punta a punta contra el Supabase local:
// lo que se marca y valora en la app sale en el muro solo con el muro activo,
// se aplaude, y la moderación crea y quita retos con el progreso de cada uno.
// Uso: node scripts/sondas/muro.mjs   (SIN_ARRANCAR=1 si ya está levantado; QUEDA=1 para no quitarlo)
import { abre, espera, informe } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, PUERTOS } from '../comunidad/local.mjs'

const AUTH = PROXY['/auth/v1'], REST = PROXY['/rest/v1']
const APP = `http://localhost:${PUERTOS.app}`
const sello = Date.now() % 1000000
const json = r => r.text().then(t => (t ? JSON.parse(t) : null))
const admin = { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}`, 'Content-Type': 'application/json' }
const servicio = ruta => fetch(`${REST}/${ruta}`, { headers: admin }).then(json)

async function persona(nombre, vistas) {
  const email = `${nombre}${sello}@prueba.local`, password = 'clave-de-prueba-123'
  await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })
  const s = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json)
  const h = { apikey: CLAVES.anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const n = `${nombre}_${sello}`
  let r = await fetch(`${REST}/perfiles`, { method: 'POST', headers: h, body: JSON.stringify({ id: s.user.id, nombre: n, avatar: 'logan', edad_confirmada_en: new Date().toISOString() }) })
  if (!r.ok) throw new Error('perfil ' + (await r.text()))
  r = await fetch(`${REST}/progreso`, { method: 'POST', headers: h, body: JSON.stringify({ usuario: s.user.id, vistas, actualizado: new Date().toISOString() }) })
  if (!r.ok) throw new Error('progreso ' + (await r.text()))
  return { id: s.user.id, nombre: n, email, rt: s.refresh_token, h }
}
const siembra = (p, vistas) => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': vistas,
  'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' },
})

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const hoy = Date.now()
  const alfa = await persona('alfa', { 'first-class': hoy - 864e5 })
  const beta = await persona('beta', {})
  const dir = `muro-${sello}`
  let r = await fetch(`${REST}/comunidades?select=id`, { method: 'POST', headers: { ...alfa.h, Prefer: 'return=representation' }, body: JSON.stringify({ direccion: dir, nombre: `Muro ${sello}`, tipo: 'publica', dueno: alfa.id }) })
  const com = (await json(r))[0].id
  await fetch(`${REST}/membresias`, { method: 'POST', headers: beta.h, body: JSON.stringify({ comunidad: com, usuario: beta.id }) })
  await fetch(`${REST}/membresias?comunidad=eq.${com}&usuario=eq.${beta.id}`, { method: 'PATCH', headers: beta.h, body: JSON.stringify({ muro_activo: true }) })
  prueba(true, `comunidad pública de alfa con beta dentro y el muro de beta activo`)

  // ── beta marca y valora en la app ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(beta, {}) })
  try {
    await s.navega('#crono')
    await espera(3500) // perfil + fusión + ¿muro activo?
    await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    const marcado = await s.cdp.eval(`(() => { const c = [...document.querySelectorAll('.card')].find(c => !c.classList.contains('vista')); c.querySelector('.checkbox').click(); return c.id.replace(/^card-/, '') })()`)
    await espera(2000)
    let act = await servicio(`actividad?usuario=eq.${beta.id}&select=tipo,ref,estrellas&order=id`)
    prueba(act.length === 1 && act[0].tipo === 'titulo' && act[0].ref === marcado, `marcar «${marcado}» con el muro activo lo publica: ${JSON.stringify(act)}`)
    await s.navega(`?t=${marcado}`)
    await s.cdp.hasta(`!!document.querySelector('.modal .valoracion .estrella')`, 10000)
    await espera(800)
    await s.cdp.eval(`document.querySelectorAll('.modal .valoracion .estrella')[3].click()`)
    await espera(2000)
    act = await servicio(`actividad?usuario=eq.${beta.id}&select=tipo,ref,estrellas&order=id`)
    prueba(act.length === 2 && act[1].tipo === 'resena' && act[1].estrellas === 4, `poner 4 estrellas lo publica como valoración: ${JSON.stringify(act[1])}`)
    await s.cdp.eval(`document.querySelectorAll('.modal .valoracion .estrella')[3].click()`) // quitarlas no publica
    await espera(1500)
    act = await servicio(`actividad?usuario=eq.${beta.id}&select=id`)
    prueba(act.length === 2, `quitar las estrellas no publica nada (${act.length})`)
  } finally { await s.cierra() }

  // con el muro apagado no se publica
  await fetch(`${REST}/membresias?comunidad=eq.${com}&usuario=eq.${beta.id}`, { method: 'PATCH', headers: beta.h, body: JSON.stringify({ muro_activo: false }) })
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(beta, {}) })
  try {
    await s.navega('#crono')
    await espera(3500)
    await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    await s.cdp.eval(`(() => { const c = [...document.querySelectorAll('.card')].find(c => !c.classList.contains('vista')); c.querySelector('.checkbox').click() })()`)
    await espera(2000)
    const act = await servicio(`actividad?usuario=eq.${beta.id}&select=id`)
    prueba(act.length === 2, `con el muro apagado, marcar no publica (${act.length})`)
    prueba(s.errores.length === 0, `errores en consola (beta): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }
  await fetch(`${REST}/membresias?comunidad=eq.${com}&usuario=eq.${beta.id}`, { method: 'PATCH', headers: beta.h, body: JSON.stringify({ muro_activo: true }) })

  // ── alfa: ve el muro, aplaude y gestiona retos ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa, { 'first-class': hoy - 864e5 }) })
  try {
    await s.navega('#crono')
    await espera(2500)
    await s.cdp.eval(`location.hash = 'c/${dir}'`)
    await s.cdp.hasta(`!!document.querySelector('.muro-item') || /Aún no hay nada/.test((document.querySelector('.comunidad-muro') || {}).textContent || '')`, 15000)
    const items = await s.cdp.eval(`[...document.querySelectorAll('.muro-item .muro-texto')].map(x => x.textContent)`)
    prueba(items.length === 2 && items.some(t => /valoró/.test(t) && /★★★★/.test(t)) && items.some(t => /vio/.test(t)), `el muro de la comunidad: ${items.map(t => t.replace(/\s+/g, ' ').slice(0, 60)).join(' | ')}`)
    await s.cdp.eval(`document.querySelector('.muro-aplaudir').click()`)
    await espera(1500)
    const ap = await servicio(`aplausos?usuario=eq.${alfa.id}&select=actividad`)
    const boton = await s.cdp.eval(`document.querySelector('.muro-aplaudir').textContent`)
    prueba(ap.length === 1 && /· 1/.test(boton), `aplaudir: fila en la base y «${boton}»`)

    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-retos button')].find(b => /Nuevo reto/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!!document.querySelector('.reto-nuevo')`, 5000)
    await s.cdp.eval(`[...document.querySelectorAll('.reto-nuevo [role=radio]')].find(b => /saga X-Men/.test(b.textContent)).click()`)
    await espera(200)
    await s.cdp.eval(`document.querySelector('.reto-nuevo').requestSubmit()`)
    await s.cdp.hasta(`!!document.querySelector('.reto')`, 10000)
    await espera(800)
    const reto = await s.cdp.eval(`(() => { const r = document.querySelector('.reto'); return { nombre: r.querySelector('.reto-nombre').textContent, plazo: r.querySelector('.reto-plazo').textContent, grupo: r.querySelector('.reto-grupo').textContent, mio: (r.querySelector('.reto-mio') || {}).textContent } })()`)
    const fila = await servicio(`retos?comunidad=eq.${com}&select=nombre,titulos,hasta`)
    prueba(fila.length === 1 && fila[0].titulos.length === 17 && /quedan \d+ días/.test(reto.plazo) && /Tú: 1 de 17/.test(reto.mio || ''),
      `reto «${reto.nombre}» hasta ${fila[0] && fila[0].hasta}: ${reto.plazo} · ${reto.grupo} · ${reto.mio}`)
    await s.cdp.eval(`[...document.querySelectorAll('.reto button')].find(b => /Quitar reto/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!document.querySelector('.reto')`, 8000).catch(() => null)
    const quedan = await servicio(`retos?comunidad=eq.${com}&select=id`)
    prueba(quedan.length === 0, 'quitar el reto lo borra')
    prueba(s.errores.length === 0, `errores en consola (alfa): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message)
} finally {
  if (!process.env.QUEDA) await para()
}
process.exitCode = informe('muro y retos (Supabase local)', filas) ? 1 : 0
