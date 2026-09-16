#!/usr/bin/env node
// Discusiones (fase 4) de punta a punta contra el Supabase local: el foro de un
// título desde su ficha, un hilo de episodio con spoiler en línea y mención, el
// velo para quien no lo ha visto, votos, respuestas anidadas, reportes, avisos,
// hilos de comunidad con fijar y ocultar, y el foro abierto cerrado a cuentas
// de menos de 24 h.
// Uso: node scripts/sondas/discusiones.mjs   (SIN_ARRANCAR=1 si ya está levantado; QUEDA=1 para no quitarlo)
import { abre, espera, informe } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, PUERTOS } from '../comunidad/local.mjs'

const AUTH = PROXY['/auth/v1'], REST = PROXY['/rest/v1']
const APP = `http://localhost:${PUERTOS.app}`
const sello = Date.now() % 1000000
const json = r => r.text().then(t => (t ? JSON.parse(t) : null))
const admin = { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}`, 'Content-Type': 'application/json' }
const servicio = ruta => fetch(`${REST}/${ruta}`, { headers: admin }).then(json)

async function persona(nombre, { vistas = {}, eps = {}, vieja = true } = {}) {
  const email = `${nombre}${sello}@prueba.local`, password = 'clave-de-prueba-123'
  await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })
  const s = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json)
  const h = { apikey: CLAVES.anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const n = `${nombre}_${sello}`
  let r = await fetch(`${REST}/perfiles`, { method: 'POST', headers: h, body: JSON.stringify({ id: s.user.id, nombre: n, avatar: 'logan', edad_confirmada_en: new Date().toISOString() }) })
  if (!r.ok) throw new Error('perfil ' + (await r.text()))
  r = await fetch(`${REST}/progreso`, { method: 'POST', headers: h, body: JSON.stringify({ usuario: s.user.id, vistas, eps, actualizado: new Date().toISOString() }) })
  if (!r.ok) throw new Error('progreso ' + (await r.text()))
  // «vieja»: más de 24 h, para poder escribir en los foros abiertos
  if (vieja) await fetch(`${REST}/perfiles?id=eq.${s.user.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ creado: new Date(Date.now() - 3 * 864e5).toISOString() }) })
  return { id: s.user.id, nombre: n, email, rt: s.refresh_token, h, vistas, eps }
}
const siembra = p => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': p.vistas, 'maraton-marvel-eps-v1': p.eps,
  'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' },
})
const escribe = (sel, valor) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
  const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${JSON.stringify(valor)})
  i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true })()`
const clic = (sel, texto) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => ${JSON.stringify(texto)} ? x.textContent.includes(${JSON.stringify(texto)}) : true); if (!b) return false; b.click(); return true })()`
const esperaHilo = s => s.cdp.hasta(`!!document.querySelector('.hilo-hoja .modal-titulo')`, 12000)

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const hoy = Date.now()
  const alfa = await persona('alfa', { vistas: { 'first-class': hoy } })
  const beta = await persona('beta', { eps: { 'loki2:1:6': hoy - 864e5 } })
  const nueva = await persona('nueva', { vieja: false })
  prueba(true, 'cuentas: alfa (no ha visto Loki T2, episodio 6), beta (sí), y una cuenta nueva')

  // ── alfa abre el foro de Loki desde su ficha y crea un hilo del episodio 6 ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa) })
  let hiloId
  const tituloHilo = `Lo que hace Loki al final ${sello}`
  try {
    await s.navega('?t=loki2')
    await s.cdp.hasta(`!!document.querySelector('.modal .valoracion button.chip-btn')`, 12000)
    await espera(3000) // la cuenta tiene que estar lista para escribir
    prueba(await s.cdp.eval(clic('.modal .valoracion .chip-btn', 'Hablar de este título')), 'la ficha tiene «Hablar de este título»')
    await s.cdp.hasta(`!!document.querySelector('.foro-hoja') && !/Cargando/.test(document.querySelector('.foro-hoja').textContent)`, 10000)
    await s.cdp.eval(clic('.foro-hoja .modal-acciones button', 'Nuevo hilo'))
    await s.cdp.hasta(`!!document.querySelector('.nuevo-hilo')`, 5000)
    await s.cdp.eval(clic('.nuevo-hilo [role=radio]', 'Teoría'))
    // loki2 guarda sus episodios como temporada 1 (DESPLAZA_TEMPORADA): la clave es loki2:1:6
    await s.cdp.eval(escribe('.nuevo-hilo select', '1:6'))
    await s.cdp.eval(escribe('.nuevo-hilo input', tituloHilo))
    await s.cdp.eval(escribe('.nuevo-hilo textarea', `Creo que >!sostiene las ramas!< y eso cambia Doomsday. ¿Qué opinas @${beta.nombre}?`))
    await espera(200)
    await s.cdp.eval(`document.querySelector('.nuevo-hilo').requestSubmit()`)
    await esperaHilo(s)
    const fila = await servicio(`hilos?titulo=eq.${encodeURIComponent(tituloHilo)}&select=id,titulo_ref,episodio_ref,etiqueta,comunidad`)
    hiloId = fila[0] && fila[0].id
    prueba(fila[0] && fila[0].titulo_ref === 'loki2' && fila[0].episodio_ref === 'loki2:1:6' && fila[0].etiqueta === 'teoria' && fila[0].comunidad === null,
      `hilo publicado en el foro abierto: ${JSON.stringify(fila[0])}`)
    await espera(600)
    const velo = await s.cdp.eval(`({ velado: !!document.querySelector('.hilo-hoja .hilo-velado'), texto: (document.querySelector('.hilo-velo') || {}).textContent || '' })`)
    prueba(velo.velado && /Loki \(T2\) · E6/.test(velo.texto), `alfa no ha visto el episodio 6: el texto sale velado («${velo.texto.replace(/Ver igual/, '').trim()}»)`)
    await s.cdp.eval(clic('.hilo-velo button', 'Ver igual'))
    await espera(300)
    const sp = await s.cdp.eval(`(() => { const b = document.querySelector('.hilo-hoja .spoiler'); if (!b) return null; const antes = getComputedStyle(b.querySelector('span')).color; b.click(); return { antes, expandido: b.getAttribute('aria-expanded') } })()`)
    await espera(200)
    const sp2 = await s.cdp.eval(`getComputedStyle(document.querySelector('.hilo-hoja .spoiler span')).color`)
    const mencion = await s.cdp.eval(`(document.querySelector('.hilo-hoja .mencion') || {}).textContent`)
    prueba(sp && /rgba\(0, 0, 0, 0\)|transparent/.test(sp.antes) && !/rgba\(0, 0, 0, 0\)/.test(sp2) && mencion === `@${beta.nombre}`,
      `«Ver igual» enseña el texto con el spoiler tapado (${sp && sp.antes}) hasta tocarlo (${sp2}) y la mención como enlace`)
    prueba(s.errores.length === 0, `errores en consola (alfa): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── beta: lo ha visto, vota, responde y reporta ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(beta) })
  try {
    await s.navega('#crono')
    await espera(3000)
    await s.cdp.eval(`location.hash = 'h/${hiloId}'`)
    await esperaHilo(s)
    await espera(800)
    const velado = await s.cdp.eval(`!!document.querySelector('.hilo-hoja .hilo-velado')`)
    prueba(!velado, 'beta, que marcó ese episodio, lo lee sin velo')
    await s.cdp.eval(clic('.hilo-acciones .voto', '▲'))
    await s.cdp.hasta(`/▲ 1/.test(document.querySelector('.hilo-acciones .voto').textContent)`, 8000).catch(() => null)
    const votos = await servicio(`hilos?id=eq.${hiloId}&select=votos`)
    prueba(votos[0].votos === 1, `votar: ${votos[0].votos} voto y el botón «${await s.cdp.eval(`document.querySelector('.hilo-acciones .voto').textContent`)}»`)
    await s.cdp.eval(escribe('.hilo-respuestas > .respuesta-form textarea', 'Totalmente, y además >!Kang no vuelve!<'))
    await s.cdp.eval(`document.querySelector('.hilo-respuestas > .respuesta-form').requestSubmit()`)
    await s.cdp.hasta(`document.querySelectorAll('.hilo-hoja .respuesta').length === 1`, 8000).catch(() => null)
    const rs = await servicio(`respuestas?hilo=eq.${hiloId}&select=id,profundidad`)
    prueba(rs.length === 1 && rs[0].profundidad === 0, `responder: la respuesta aparece y está en la base (${rs.length})`)
    await s.cdp.eval(clic('.hilo-acciones .hilo-accion', 'Reportar'))
    await s.cdp.hasta(`!!document.querySelector('.hilo-acciones .reportar select')`, 5000)
    await s.cdp.eval(escribe('.hilo-acciones .reportar select', 'spoiler'))
    await s.cdp.hasta(`/Reportado/.test(document.querySelector('.hilo-acciones').textContent)`, 8000).catch(() => null)
    const rep = await servicio(`reportes?reportante=eq.${beta.id}&select=tipo,ref,motivo`)
    prueba(rep.length === 1 && rep[0].motivo === 'spoiler' && rep[0].ref === String(hiloId), `reportar: ${JSON.stringify(rep[0])}`)
    prueba(s.errores.length === 0, `errores en consola (beta): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── alfa: aviso de respuesta, respuesta anidada, y hilos de comunidad ──
  const dir = `charla-${sello}`
  const com = (await json(await fetch(`${REST}/comunidades?select=id`, { method: 'POST', headers: { ...alfa.h, Prefer: 'return=representation' }, body: JSON.stringify({ direccion: dir, nombre: `Charla ${sello}`, tipo: 'publica', dueno: alfa.id }) })))[0].id
  await fetch(`${REST}/membresias`, { method: 'POST', headers: beta.h, body: JSON.stringify({ comunidad: com, usuario: beta.id }) })
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa) })
  try {
    await s.navega('#comunidades')
    await s.cdp.hasta(`!!document.querySelector('.aviso-fila')`, 12000).catch(() => null)
    const aviso = await s.cdp.eval(`(document.querySelector('.aviso-fila') || {}).textContent || ''`)
    prueba(new RegExp(`@${beta.nombre} te respondió en «${tituloHilo}»`).test(aviso), `aviso en Comunidades: «${aviso.replace(/\s+/g, ' ').slice(0, 90)}»`)
    await s.cdp.eval(`document.querySelector('.aviso-fila').click()`)
    await esperaHilo(s)
    await espera(1500)
    const leidos = await servicio(`avisos?para=eq.${alfa.id}&leido=is.false&select=id`)
    prueba(leidos.length === 0, 'tocar el aviso abre el hilo y lo marca leído')
    // alfa sigue sin verlo: las respuestas también están veladas hasta «Ver igual»
    const veladas = await s.cdp.eval(`/también están veladas/.test(document.querySelector('.hilo-respuestas').textContent)`)
    prueba(veladas, 'para quien no lo ha visto, las respuestas también salen veladas')
    await s.cdp.eval(clic('.hilo-velo button', 'Ver igual'))
    await s.cdp.hasta(`!!document.querySelector('.respuesta .hilo-accion')`, 5000)
    await s.cdp.eval(clic('.respuesta .hilo-accion', 'Responder'))
    await s.cdp.hasta(`!!document.querySelector('.respuesta .respuesta-form')`, 5000)
    await s.cdp.eval(escribe('.respuesta .respuesta-form textarea', 'Buen punto'))
    await s.cdp.eval(`document.querySelector('.respuesta .respuesta-form').requestSubmit()`)
    await s.cdp.hasta(`document.querySelectorAll('.hilo-hoja .respuestas .respuestas .respuesta').length === 1`, 8000).catch(() => null)
    const anid = await servicio(`respuestas?hilo=eq.${hiloId}&profundidad=eq.1&select=id`)
    prueba(anid.length === 1, 'respuesta anidada (segundo nivel) en pantalla y en la base')
    // la administración oculta la respuesta de beta: la de alfa, debajo, no debe desaparecer (code-review)
    const r1 = (await servicio(`respuestas?hilo=eq.${hiloId}&profundidad=eq.0&select=id`))[0].id
    await fetch(`${REST}/respuestas?id=eq.${r1}`, { method: 'PATCH', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ oculto: true }) })
    await s.cdp.eval(`document.querySelector('.hilo-hoja .cerrar').click()`)
    await s.cdp.hasta(`!document.querySelector('.hilo-hoja')`, 5000)
    await espera(400)

    // hilo de comunidad: escribir, fijar y ocultar una respuesta como dueña
    await s.cdp.eval(`location.hash = 'c/${dir}'`)
    await s.cdp.hasta(`!!document.querySelector('.comunidad-hilos')`, 12000)
    await s.cdp.eval(clic('.comunidad-hilos button', 'Ver todo y escribir'))
    await s.cdp.hasta(`!!document.querySelector('.foro-hoja') && !/Cargando/.test(document.querySelector('.foro-hoja').textContent)`, 10000)
    await s.cdp.hasta(`[...document.querySelectorAll('.foro-hoja .modal-acciones button')].some(b => /Nuevo hilo/.test(b.textContent))`, 8000)
    await s.cdp.eval(clic('.foro-hoja .modal-acciones button', 'Nuevo hilo'))
    await s.cdp.hasta(`!!document.querySelector('.nuevo-hilo')`, 5000)
    await s.cdp.eval(escribe('.nuevo-hilo input', `Plan del sábado ${sello}`))
    await s.cdp.eval(`document.querySelector('.nuevo-hilo').requestSubmit()`)
    await esperaHilo(s)
    await espera(800)
    await s.cdp.eval(clic('.hilo-acciones .hilo-accion', 'Fijar'))
    await s.cdp.hasta(`/Fijado/.test(document.querySelector('.hilo-hoja .hilo-fila-cab').textContent)`, 8000).catch(() => null)
    const hc = await servicio(`hilos?comunidad=eq.${com}&select=id,fijado`)
    prueba(hc.length === 1 && hc[0].fijado, `hilo en la comunidad y fijado por la dueña (${JSON.stringify(hc[0])})`)
    const reg = await servicio(`registro_moderacion?comunidad=eq.${com}&select=accion`)
    prueba(reg.some(x => x.accion === 'fijar'), 'queda en el registro de moderación')
    prueba(s.errores.length === 0, `errores en consola (alfa 2): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── cuenta nueva: el foro abierto aún no ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(nueva) })
  try {
    // otra persona abre el hilo: la respuesta oculta no está, la de alfa (que colgaba de ella) sí
    await s.navega('#crono')
    await espera(2500)
    await s.cdp.eval(`location.hash = 'h/${hiloId}'`)
    await esperaHilo(s)
    await espera(1200)
    await s.cdp.eval(clic('.hilo-velo button', 'Ver igual'))
    await espera(500)
    const rsp = await s.cdp.eval(`[...document.querySelectorAll('.hilo-hoja .respuesta-cuerpo')].map(x => x.textContent)`)
    prueba(rsp.includes('Buen punto') && !rsp.some(t => /Totalmente/.test(t)), `respuesta bajo una oculta sigue visible: ${JSON.stringify(rsp)}`)
    await s.cdp.eval(`document.querySelector('.hilo-hoja .cerrar').click()`)
    await s.cdp.hasta(`!document.querySelector('.hilo-hoja')`, 5000)
    await s.navega('?t=logan')
    await s.cdp.hasta(`!!document.querySelector('.modal .valoracion button.chip-btn')`, 12000)
    await espera(3000)
    await s.cdp.eval(clic('.modal .valoracion .chip-btn', 'Hablar de este título'))
    await s.cdp.hasta(`!!document.querySelector('.foro-hoja') && !/Cargando/.test(document.querySelector('.foro-hoja').textContent)`, 10000)
    await s.cdp.eval(clic('.foro-hoja .modal-acciones button', 'Nuevo hilo'))
    await s.cdp.hasta(`!!document.querySelector('.nuevo-hilo')`, 5000)
    await s.cdp.eval(escribe('.nuevo-hilo input', 'Hola a todos'))
    await s.cdp.eval(`document.querySelector('.nuevo-hilo').requestSubmit()`)
    await s.cdp.hasta(`!!document.querySelector('.nuevo-hilo .import-error')`, 8000).catch(() => null)
    const err = await s.cdp.eval(`(document.querySelector('.nuevo-hilo .import-error') || {}).textContent || ''`)
    prueba(/24 h/.test(err), `cuenta de menos de 24 h en el foro abierto: «${err}»`)
  } finally { await s.cierra() }
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message)
} finally {
  if (!process.env.QUEDA) await para()
}
process.exitCode = informe('discusiones (Supabase local)', filas) ? 1 : 0
