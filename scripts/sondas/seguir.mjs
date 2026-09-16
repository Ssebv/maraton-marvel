#!/usr/bin/env node
// Perfil público (#u/nombre) y seguir, de punta a punta contra el Supabase
// local: lo que se ve sin cuenta y con cuenta según la privacidad de cada
// bloque, seguir y dejar de seguir, la lista «Sigues a…» y buscar por @.
// Uso: node scripts/sondas/seguir.mjs   (SIN_ARRANCAR=1 si ya está levantado; QUEDA=1 para no quitarlo)
import { abre, espera, informe } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, PUERTOS } from '../comunidad/local.mjs'

const AUTH = PROXY['/auth/v1'], REST = PROXY['/rest/v1']
const APP = `http://localhost:${PUERTOS.app}`
const sello = Date.now() % 1000000
const json = r => r.text().then(t => (t ? JSON.parse(t) : null))
const admin = { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}`, 'Content-Type': 'application/json' }

async function persona(nombre, vistas, notas) {
  const email = `${nombre}${sello}@prueba.local`, password = 'clave-de-prueba-123'
  await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })
  const s = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json)
  const h = { apikey: CLAVES.anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const n = `${nombre}_${sello}`
  let r = await fetch(`${REST}/perfiles`, { method: 'POST', headers: h, body: JSON.stringify({ id: s.user.id, nombre: n, avatar: 'logan', bio: `Soy ${nombre}`, edad_confirmada_en: new Date().toISOString() }) })
  if (!r.ok) throw new Error('perfil ' + (await r.text()))
  r = await fetch(`${REST}/progreso`, { method: 'POST', headers: h, body: JSON.stringify({ usuario: s.user.id, vistas, notas, actualizado: new Date().toISOString() }) })
  if (!r.ok) throw new Error('progreso ' + (await r.text()))
  return { id: s.user.id, nombre: n, email, rt: s.refresh_token, h }
}
const cambia = (p, cuerpo) => fetch(`${REST}/perfiles?id=eq.${p.id}`, { method: 'PATCH', headers: p.h, body: JSON.stringify(cuerpo) })
const servicio = ruta => fetch(`${REST}/${ruta}`, { headers: admin }).then(json)
const siembra = (p, vistas = {}) => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': vistas,
  ...(p ? { 'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' } } : {}),
})
// abrir un perfil como lo haría un enlace dentro de la app
const abrePerfil = async (s, nombre) => {
  await s.cdp.eval(`location.hash = 'u/${nombre}'`)
  await s.cdp.hasta(`!!document.querySelector('.perfil-hoja .perfil-cab') || /No hay nadie|No se pudo/.test((document.querySelector('.perfil-hoja') || {}).textContent || '')`, 10000)
  await espera(400)
}
const cierra = async s => {
  await s.cdp.eval(`document.querySelector('.perfil-hoja .cerrar') && document.querySelector('.perfil-hoja .cerrar').click()`)
  await s.cdp.hasta(`!document.querySelector('.perfil-hoja')`, 5000)
  await espera(300)
}
const hoja = s => s.cdp.eval(`(() => { const h = document.querySelector('.perfil-hoja'); if (!h) return null
  const b = [...h.querySelectorAll('.modal-acciones button')].map(x => x.textContent.trim())
  return { titulo: (h.querySelector('.modal-titulo') || {}).textContent, botones: b, cifras: !!h.querySelector('.perfil-cuerpo .stats'),
    titulos: (h.querySelectorAll('.perfil-cuerpo .stat-num')[1] || {}).textContent, valoradas: !!h.querySelector('.perfil-valoradas'),
    logros: !!h.querySelector('.perfil-cuerpo .logros-grupo, .perfil-cuerpo .logros'), privado: !!h.querySelector('.perfil-privado'),
    seguidores: (h.querySelector('.perfil-cuenta b') || {}).textContent, texto: h.textContent } })()`)

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const hoy = Date.now()
  const alfa = await persona('alfa', { 'first-class': hoy }, {})
  const beta = await persona('beta', { logan: hoy, 'first-class': hoy - 864e5, deadpool1: hoy - 2 * 864e5 }, { logan: { p: 5, txt: 'obra maestra' } })
  prueba(true, `dos cuentas de prueba con perfil y progreso: @${alfa.nombre}, @${beta.nombre}`)

  // ── sin cuenta ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(null) })
  try {
    await s.navega('#crono')
    await espera(1200)
    await abrePerfil(s, beta.nombre)
    let h = await hoja(s)
    prueba(h && h.titulo === `@${beta.nombre}` && /Soy beta/.test(h.texto), `sin cuenta se ve la cabecera de @${beta.nombre} y su bio`)
    prueba(h && h.privado && !h.cifras && h.botones.includes('Entra para seguir'), `progreso privado: sin cifras y «Entra para seguir» (${h && h.botones.join(' / ')})`)
    await cierra(s)
    await abrePerfil(s, 'nadie_existe')
    h = await s.cdp.eval(`(document.querySelector('.perfil-hoja') || {}).textContent || ''`)
    prueba(/No hay nadie/.test(h), 'un @nombre que no existe lo dice')
    await cierra(s)
    // enlace compartido: abrir la app directamente en #u/…
    await s.navega(`#u/${beta.nombre}`)
    await s.cdp.hasta(`!!document.querySelector('.perfil-hoja .perfil-cab')`, 10000).catch(() => null)
    h = await hoja(s)
    prueba(h && h.titulo === `@${beta.nombre}`, 'un enlace …/#u/nombre abre la app con ese perfil encima')
  } finally { await s.cierra() }

  // ── alfa sigue a beta ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa, { 'first-class': hoy }) })
  try {
    await s.navega('#crono')
    await espera(2500)
    await abrePerfil(s, beta.nombre)
    let h = await hoja(s)
    prueba(h && h.botones.includes('Seguir') && h.seguidores === '0', `con cuenta: botón Seguir, ${h && h.seguidores} seguidores`)
    await s.cdp.eval(`[...document.querySelectorAll('.perfil-hoja .modal-acciones button')].find(b => b.textContent.trim() === 'Seguir').click()`)
    await espera(2000)
    h = await hoja(s)
    const fila = await servicio(`seguimientos?seguidor=eq.${alfa.id}&seguido=eq.${beta.id}&select=seguidor`)
    prueba(h.botones.includes('Siguiendo') && h.seguidores === '1' && fila.length === 1, `seguir: «Siguiendo», 1 seguidor y la fila en la base (${fila.length})`)
    prueba(h.privado && !h.cifras, 'siguiéndola, su progreso privado sigue sin verse')
    await cierra(s)

    await cambia(beta, { priv_progreso: 'seguidores', priv_logros: 'seguidores' })
    await abrePerfil(s, beta.nombre)
    h = await hoja(s)
    prueba(h.cifras && /^3/.test(h.titulos || '') && h.logros && !h.valoradas, `«solo seguidores»: alfa ve sus cifras (${h.titulos}) y logros, no sus reseñas privadas`)
    await cierra(s)

    // lista «Sigues a…» en Ajustes y abrir desde ahí
    await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.chip-ajustes').click()`)
    await s.cdp.hasta(`!!document.querySelector('.cuenta-sigo-item')`, 8000).catch(() => null)
    const lista = await s.cdp.eval(`[...document.querySelectorAll('.cuenta-sigo-item')].map(b => b.textContent.trim())`)
    prueba(lista.includes(`@${beta.nombre}`), `Ajustes › Cuenta: «Sigues a 1» con @${beta.nombre} (${lista.join(', ')})`)
    await s.cdp.eval(`document.querySelector('.cuenta-sigo-item').click()`)
    await s.cdp.hasta(`!!document.querySelector('.perfil-hoja .perfil-cab')`, 8000).catch(() => null)
    // Ajustes sale animado: se espera a que termine y el perfil debe seguir abierto
    await s.cdp.hasta(`!document.querySelector('.cuenta-ajuste')`, 3000).catch(() => null)
    await espera(400)
    const tras = await s.cdp.eval(`({ ajustes: !!document.querySelector('.cuenta-ajuste'), hoja: (document.querySelector('.perfil-hoja .modal-titulo') || {}).textContent })`)
    prueba(!tras.ajustes && tras.hoja === `@${beta.nombre}`, `tocarla cierra Ajustes y abre su perfil (${JSON.stringify(tras)})`)
    await cierra(s)

    // buscar por @ y el perfil propio
    await s.cdp.eval(`document.querySelector('.chip-ajustes').click()`)
    await s.cdp.hasta(`!!document.querySelector('#cuenta-buscar')`, 8000)
    await s.cdp.eval(`(() => { const i = document.querySelector('#cuenta-buscar'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '@${alfa.nombre.toUpperCase()}'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.cuenta-buscar').requestSubmit() })()`)
    await s.cdp.hasta(`!!document.querySelector('.perfil-hoja .perfil-cab')`, 8000).catch(() => null)
    h = await hoja(s)
    prueba(h && h.titulo === `@${alfa.nombre}` && !h.botones.includes('Seguir') && /Así ves tu perfil/.test(h.texto), 'buscar «@ALFA_…» abre el perfil propio: sin Seguir y con la nota de privacidad')
    await cierra(s)

    // dejar de seguir
    await abrePerfil(s, beta.nombre)
    await s.cdp.eval(`[...document.querySelectorAll('.perfil-hoja .modal-acciones button')].find(b => b.textContent.trim() === 'Siguiendo').click()`)
    await espera(2000)
    h = await hoja(s)
    const quedan = await servicio(`seguimientos?seguidor=eq.${alfa.id}&seguido=eq.${beta.id}&select=seguidor`)
    prueba(h.botones.includes('Seguir') && h.seguidores === '0' && quedan.length === 0 && h.privado, `dejar de seguir: 0 seguidores, sin fila y el progreso «de seguidores» se oculta de nuevo`)
    prueba(s.errores.length === 0, `errores en consola: ${s.errores.length} ${s.errores.slice(0, 3).join(' | ')}`)
  } finally { await s.cierra() }

  // ── público: lo ve cualquiera ──
  await cambia(beta, { priv_progreso: 'publico', priv_resenas: 'publico' })
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(null) })
  try {
    await s.navega('#crono')
    await espera(1200)
    await abrePerfil(s, beta.nombre)
    const h = await hoja(s)
    prueba(h.cifras && h.valoradas && !h.logros, `público: sin cuenta se ven cifras y reseñas; los logros «de seguidores» no (${JSON.stringify({ cifras: h.cifras, valoradas: h.valoradas, logros: h.logros })})`)
  } finally { await s.cierra() }
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message)
} finally {
  if (!process.env.QUEDA) await para()
}
process.exitCode = informe('perfil público y seguir (Supabase local)', filas) ? 1 : 0
