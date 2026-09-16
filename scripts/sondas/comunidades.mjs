#!/usr/bin/env node
// Comunidades (fase 3) de punta a punta contra el Supabase local: crear una
// privada, el ranking con horas de la base, invitar y entrar con #i/código,
// 7 y 30 días, salir del ranking y de la comunidad, descubrir una pública y
// unirse, «Tus comunidades» y lo que ve quien no tiene cuenta.
// Uso: node scripts/sondas/comunidades.mjs   (SIN_ARRANCAR=1 si ya está levantado; QUEDA=1 para no quitarlo)
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
const siembra = (p, vistas = {}) => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': vistas,
  ...(p ? { 'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' } } : {}),
})
const escribe = (sel, valor) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
  const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${JSON.stringify(valor)})
  i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const hoja = s => s.cdp.eval(`(() => { const h = document.querySelector('.comunidad-hoja'); if (!h) return null
  return { titulo: (h.querySelector('.modal-titulo') || {}).textContent, texto: h.textContent,
    botones: [...h.querySelectorAll('.modal-acciones button, .comunidad-yo button')].map(b => b.textContent.trim()),
    ranking: [...h.querySelectorAll('.ranking-fila')].map(f => ({ nombre: [...f.querySelector('.ranking-nombre').childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').replace(' · tú', ''), horas: f.querySelector('.ranking-horas').textContent })),
    yo: !!h.querySelector('.comunidad-yo'), invitacion: (h.querySelector('.comunidad-invitacion code') || {}).textContent || null } })()`)
const esperaHoja = (s, t = 10000) => s.cdp.hasta(`!!document.querySelector('.comunidad-hoja .perfil-cab') || /no existe o es privada|No se pudo/.test((document.querySelector('.comunidad-hoja') || {}).textContent || '')`, t)
const esperaRanking = s => s.cdp.hasta(`!/Calculando/.test((document.querySelector('.comunidad-ranking') || {}).textContent || 'Calculando')`, 8000)
const cierraHoja = async s => {
  await s.cdp.eval(`document.querySelector('.comunidad-hoja .cerrar') && document.querySelector('.comunidad-hoja .cerrar').click()`)
  await s.cdp.hasta(`!document.querySelector('.comunidad-hoja')`, 5000)
  await espera(300)
}

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const hoy = Date.now()
  const alfa = await persona('alfa', { logan: hoy - 864e5, 'first-class': hoy - 2 * 864e5 })
  const beta = await persona('beta', { deadpool1: hoy - 3 * 864e5, logan: hoy - 20 * 864e5 })
  const gamma = await persona('gamma', {})
  // una comunidad pública de gamma, creada por la API
  const nombrePub = `Maratón Chile ${sello}`, dirPub = `maraton-chile-${sello}`
  let r = await fetch(`${REST}/comunidades`, { method: 'POST', headers: gamma.h, body: JSON.stringify({ direccion: dirPub, nombre: nombrePub, tipo: 'publica', portada: 'logan', dueno: gamma.id }) })
  prueba(r.ok, `tres cuentas de prueba y una comunidad pública de gamma ${r.ok ? '' : await r.text()}`)

  // ── sin cuenta ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(null) })
  try {
    await s.navega('#comunidades')
    await s.cdp.hasta(`!/Cargando/.test((document.querySelector('.comunidades') || {}).textContent || 'Cargando')`, 10000)
    const v = await s.cdp.eval(`({ entra: !![...document.querySelectorAll('.comunidades-cab button')].find(b => /Entra para unirte/.test(b.textContent)), descubrir: [...document.querySelectorAll('.comunidad-nombre')].map(x => x.textContent), subvista: !![...document.querySelectorAll('.subvista')].find(a => a.textContent === 'Comunidades') })`)
    prueba(v.subvista && v.entra && v.descubrir.includes(nombrePub), `sin cuenta: subvista Comunidades, «Entra para unirte» y la pública en Descubrir (${v.descubrir.length})`)
  } finally { await s.cierra() }

  // ── alfa crea una privada ──
  const nombrePriv = `Los del Multiverso ${sello}`
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa) })
  let dirPriv, codigo
  try {
    await s.navega('#comunidades')
    await espera(2500)
    await s.cdp.eval(`[...document.querySelectorAll('.comunidades-cab button')].find(b => /Crear comunidad/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!!document.querySelector('.crea-comunidad')`, 8000)
    await s.cdp.eval(escribe('#comunidad-nombre', nombrePriv))
    await s.cdp.eval(escribe('#comunidad-descripcion', 'Para ver todo antes de Doomsday'))
    await s.cdp.hasta(`/Libre/.test(document.querySelector('#comunidad-direccion-estado').textContent)`, 8000)
    dirPriv = await s.cdp.eval(`document.querySelector('#comunidad-direccion').value`)
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-tipo')].find(b => /Privada/.test(b.textContent)).click(); document.querySelectorAll('.crea-comunidad .crea-avatar')[3].click()`)
    await espera(200)
    await s.cdp.eval(`document.querySelector('.crea-comunidad').requestSubmit()`)
    await esperaHoja(s)
    await esperaRanking(s)
    let h = await hoja(s)
    const k = await servicio(`comunidades?direccion=eq.${dirPriv}&select=id,tipo,dueno,portada,miembros`)
    prueba(dirPriv === `los-del-multiverso-${sello}` && k[0] && k[0].tipo === 'privada' && k[0].dueno === alfa.id && k[0].portada === 'first-class' && k[0].miembros === 1,
      `crear: dirección «${dirPriv}» sacada del nombre, privada, dueña alfa, portada y 1 miembro`)
    prueba(h && h.titulo === nombrePriv && /Doomsday/.test(h.texto), 'al crearla se abre su hoja con nombre y descripción')
    // ranking opt-in (revisión de seguridad): recién creada, nadie aparece hasta sumarse
    prueba(h.ranking.length === 0 && /No apareces en el ranking/.test(h.texto), 'ranking opt-in: recién creada, nadie aparece y se explica qué se comparte')
    await s.cdp.eval(`[...document.querySelectorAll('.ranking-optin button')].find(b => /Aparecer/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!document.querySelector('.ranking-optin') && document.querySelectorAll('.ranking-fila').length === 1`, 8000).catch(() => null)
    h = await hoja(s)
    const esperadas = (await servicio(`catalogo?id=in.(logan,first-class)&select=minutos`)).reduce((a, x) => a + x.minutos, 0)
    prueba(h.ranking.length === 1 && h.ranking[0].nombre === `@${alfa.nombre}` && h.ranking[0].horas.replace(/\s/g, ' ') === `${Math.floor(esperadas / 60)} h ${esperadas % 60} min`.replace(' 0 min', ''),
      `ranking de 7 días con horas del catálogo: ${JSON.stringify(h.ranking)} (esperaba ${esperadas} min)`)
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-hoja .modal-acciones button')].find(b => b.textContent.trim() === 'Invitar').click()`)
    await s.cdp.hasta(`!!document.querySelector('.comunidad-invitacion code')`, 8000)
    h = await hoja(s)
    codigo = (h.invitacion.match(/#i\/([a-f0-9]+)$/) || [])[1]
    prueba(codigo && codigo.length >= 16, `invitar: enlace …#i/${codigo}`)
    await cierraHoja(s)
    // «Tus comunidades» con el distintivo de dueña, y unirse a la pública desde Descubrir
    await s.cdp.eval(`location.hash = 'stats'`); await espera(600); await s.cdp.eval(`location.hash = 'comunidades'`)
    await s.cdp.hasta(`[...document.querySelectorAll('.comunidad-nombre')].some(x => x.textContent === ${JSON.stringify(nombrePriv)})`, 10000)
    const mias = await s.cdp.eval(`[...document.querySelectorAll('.comunidades-bloque')][0].textContent`)
    prueba(mias.includes(nombrePriv) && /Dueño/.test(mias), '«Tus comunidades» la lista con «Dueño»')
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-tarjeta')].find(b => b.textContent.includes(${JSON.stringify(nombrePub)})).click()`)
    await esperaHoja(s)
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-hoja .modal-acciones button')].find(b => b.textContent.trim() === 'Unirme').click()`)
    await s.cdp.hasta(`!!document.querySelector('.comunidad-yo')`, 8000)
    const mPub = await servicio(`membresias?usuario=eq.${alfa.id}&select=comunidad:comunidades(direccion)`)
    prueba(mPub.some(m => m.comunidad.direccion === dirPub), 'Descubrir › Unirme: alfa entra en la pública de gamma')
    await cierraHoja(s)
    // código que no vale
    await s.cdp.eval(escribe('#comunidad-codigo', 'https://ejemplo/#i/0123456789abcdef0123'))
    await s.cdp.eval(`document.querySelector('.comunidades-codigo').requestSubmit()`)
    await s.cdp.hasta(`/no vale/.test((document.querySelector('.comunidades-codigo') || {}).textContent)`, 8000).catch(() => null)
    const err = await s.cdp.eval(`(document.querySelector('.comunidades-codigo .import-error') || {}).textContent || ''`)
    prueba(/no vale/.test(err), `un código que no vale lo dice: «${err}»`)
    prueba(s.errores.length === 0, `errores en consola (alfa): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── beta: no la ve, entra con la invitación ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(beta) })
  try {
    await s.navega('#crono')
    await espera(2500)
    await s.cdp.eval(`location.hash = 'c/${dirPriv}'`)
    await esperaHoja(s)
    let h = await s.cdp.eval(`(document.querySelector('.comunidad-hoja') || {}).textContent || ''`)
    prueba(/no existe o es privada/.test(h), 'beta abre #c/… de la privada sin ser miembro: «no existe o es privada»')
    await cierraHoja(s)
    await s.cdp.eval(`location.hash = 'i/${codigo}'`)
    await esperaHoja(s, 15000)
    await s.cdp.hasta(`!!document.querySelector('.ranking-optin button')`, 10000).catch(() => null)
    await s.cdp.eval(`document.querySelector('.ranking-optin button').click()`)
    await s.cdp.hasta(`document.querySelectorAll('.ranking-fila').length === 2`, 10000).catch(() => null)
    h = await hoja(s)
    const mB = await servicio(`membresias?comunidad=eq.${(await servicio(`comunidades?direccion=eq.${dirPriv}&select=id`))[0].id}&select=usuario,papel`)
    prueba(h && h.titulo === nombrePriv && mB.length === 2 && h.yo, `#i/código: beta entra y se abre la comunidad (${mB.length} miembros)`)
    const nombres = h.ranking.map(x => x.nombre)
    prueba(nombres[0] === `@${alfa.nombre}` && nombres.includes(`@${beta.nombre}`), `ranking con las dos, alfa primero: ${nombres.join(', ')}`)
    const horasBeta7 = h.ranking.find(x => x.nombre === `@${beta.nombre}`).horas
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-ranking .tab')].find(b => /30/.test(b.textContent)).click()`)
    await espera(300)
    await esperaRanking(s)
    h = await hoja(s)
    const horasBeta30 = h.ranking.find(x => x.nombre === `@${beta.nombre}`).horas
    prueba(horasBeta7 !== horasBeta30, `30 días suma lo de hace 20 días: beta ${horasBeta7} → ${horasBeta30}`)
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-yo .crea-edad')].find(l => /ranking/.test(l.textContent)).querySelector('input').click()`)
    await s.cdp.hasta(`![...document.querySelectorAll('.ranking-nombre')].some(n => n.textContent.includes(${JSON.stringify(beta.nombre)}))`, 8000).catch(() => null)
    h = await hoja(s)
    prueba(!h.ranking.some(x => x.nombre === `@${beta.nombre}`), 'desmarcar «Aparecer en el ranking» la quita del ranking')
    await s.cdp.eval(`[...document.querySelectorAll('.comunidad-yo button')].find(b => /Salir/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!document.querySelector('.comunidad-yo')`, 8000).catch(() => null)
    const mB2 = await servicio(`membresias?usuario=eq.${beta.id}&select=comunidad`)
    h = await s.cdp.eval(`(document.querySelector('.comunidad-hoja') || {}).textContent || ''`)
    prueba(mB2.length === 0 && /no existe o es privada/.test(h), 'salir: la membresía se borra y la privada deja de verse')
    prueba(s.errores.length === 0, `errores en consola (beta): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── sin cuenta: la invitación se recuerda hasta entrar (code-review) ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(null) })
  try {
    await s.navega(`#i/${codigo}`)
    await espera(1500)
    await s.navega('#crono') // como volver de Google: la dirección ya no lleva el #i/
    await espera(800)
    const guardada = await s.cdp.eval(`localStorage.getItem('maraton-marvel-invitacion-v1')`)
    prueba(guardada === codigo, `sin cuenta, la invitación queda guardada para después de entrar (${guardada && guardada.slice(0, 8)}…)`)
  } finally { await s.cierra() }
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message)
} finally {
  if (!process.env.QUEDA) await para()
}
process.exitCode = informe('comunidades (Supabase local)', filas) ? 1 : 0
