#!/usr/bin/env node
// Moderación (fase 5 de comunidades, 21 sep 2026) de punta a punta contra el
// Supabase local: editar lo propio en las primeras 24 h (hilo y respuesta), la
// cola de reportes de quien modera una comunidad (ocultar y resolver,
// descartar), la cola global de la administración (foros abiertos) y bloquear
// y desbloquear desde el perfil público.
// Uso: node scripts/sondas/moderacion.mjs   (SIN_ARRANCAR=1 si ya está levantado)
import { abre, espera, informe } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, PUERTOS } from '../comunidad/local.mjs'

const AUTH = PROXY['/auth/v1'], REST = PROXY['/rest/v1']
const APP = `http://localhost:${PUERTOS.app}`
const sello = Date.now() % 1000000
const json = r => r.text().then(t => (t ? JSON.parse(t) : null))
const admin = { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}`, 'Content-Type': 'application/json' }
const servicio = ruta => fetch(`${REST}/${ruta}`, { headers: admin }).then(json)

async function persona(nombre) {
  const email = `${nombre}${sello}@prueba.local`, password = 'clave-de-prueba-123'
  await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })
  const s = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json)
  const h = { apikey: CLAVES.anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const n = `${nombre}_${sello}`
  let r = await fetch(`${REST}/perfiles`, { method: 'POST', headers: h, body: JSON.stringify({ id: s.user.id, nombre: n, avatar: 'logan', edad_confirmada_en: new Date().toISOString() }) })
  if (!r.ok) throw new Error('perfil ' + (await r.text()))
  await fetch(`${REST}/progreso`, { method: 'POST', headers: h, body: JSON.stringify({ usuario: s.user.id, vistas: {}, eps: {}, actualizado: new Date().toISOString() }) })
  await fetch(`${REST}/perfiles?id=eq.${s.user.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ creado: new Date(Date.now() - 3 * 864e5).toISOString() }) })
  return { id: s.user.id, nombre: n, email, rt: s.refresh_token, h }
}
const post = async (p, ruta, cuerpo) => {
  const r = await fetch(`${REST}/${ruta}`, { method: 'POST', headers: { ...p.h, Prefer: 'return=representation' }, body: JSON.stringify(cuerpo) })
  if (!r.ok) throw new Error(ruta + ' ' + (await r.text()))
  return json(r)
}
const siembra = p => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' },
})
const escribe = (sel, valor) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
  const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${JSON.stringify(valor)})
  i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const clic = (sel, texto) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => ${JSON.stringify(texto)} ? x.textContent.includes(${JSON.stringify(texto)}) : true); if (!b) return false; b.click(); return true })()`

// botón de la fila de un reporte concreto (por su texto: motivo · tipo)
const enFila = (patron, boton) => `(() => { const f = [...document.querySelectorAll('.cola-fila')].find(x => ${patron}.test(x.querySelector('.cola-que').textContent)); if (!f) return false
  const b = [...f.querySelectorAll('.chip-btn')].find(x => x.textContent.includes(${JSON.stringify(boton)})); if (!b) return false; b.click(); return true })()`
const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const mala = await persona('mala'), mod = await persona('mod'), rep = await persona('rep'), jefa = await persona('jefa')
  await fetch(`${REST}/admins`, { method: 'POST', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ usuario: jefa.id }) })
  const dir = `mod-${sello}`
  const [k] = await post(mod, 'comunidades', { direccion: dir, nombre: `Moderada ${sello}`, tipo: 'publica', dueno: mod.id })
  for (const p of [mala, rep]) await fetch(`${REST}/membresias`, { method: 'POST', headers: p.h, body: JSON.stringify({ comunidad: k.id, usuario: p.id }) }) // , { comunidad: k.id, usuario: p.id })
  const [h1] = await post(mala, 'hilos', { comunidad: k.id, autor: mala.id, titulo: 'Hilo con problemas', cuerpo: 'algo feo' })
  const [r1] = await post(mala, 'respuestas', { hilo: h1.id, autor: mala.id, cuerpo: 'respuesta fea' })
  const [h2] = await post(mala, 'hilos', { comunidad: k.id, autor: mala.id, titulo: 'Mi hilo para editar', cuerpo: 'primera versión' })
  const [r2] = await post(mala, 'respuestas', { hilo: h2.id, autor: mala.id, cuerpo: 'respuesta original' })
  const [h3] = await post(mala, 'hilos', { titulo_ref: 'first-class', autor: mala.id, titulo: 'En el foro abierto', cuerpo: 'spam spam' })
  const [h4] = await post(mod, 'hilos', { comunidad: k.id, autor: mod.id, titulo: 'Hilo de la dueña', cuerpo: 'polémico' })
  await fetch(`${REST}/reportes`, { method: 'POST', headers: rep.h, body: JSON.stringify({ reportante: rep.id, tipo: 'hilo', ref: String(h4.id), comunidad: k.id, motivo: 'odio' }) })
  for (const [tipo, ref, comunidad, motivo] of [['hilo', h1.id, k.id, 'acoso'], ['respuesta', r1.id, k.id, 'spam'], ['hilo', h3.id, null, 'spam']])
    await fetch(`${REST}/reportes`, { method: 'POST', headers: rep.h, body: JSON.stringify({ reportante: rep.id, tipo, ref: String(ref), comunidad, motivo }) })
  prueba(true, 'cuentas (mala, mod dueña, rep, jefa administradora), comunidad, 3 hilos y 3 reportes')

  // ── mala edita su hilo y su respuesta ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(mala) })
  try {
    await s.navega('#crono'); await espera(3000)
    await s.cdp.eval(`location.hash = 'h/${h2.id}'`)
    await s.cdp.hasta(`!!document.querySelector('.hilo-hoja .modal-titulo')`, 12000); await espera(800)
    prueba(await s.cdp.eval(clic('.hilo-acciones .hilo-accion', 'Editar')), 'su hilo tiene «Editar»')
    await s.cdp.hasta(`!!document.querySelector('.hilo-hoja .edita-texto')`, 3000)
    await s.cdp.eval(escribe('.hilo-hoja .edita-texto input', 'Mi hilo, ya editado'))
    await s.cdp.eval(escribe('.hilo-hoja .edita-texto textarea', 'segunda versión'))
    await espera(100)
    await s.cdp.eval(`document.querySelector('.hilo-hoja .edita-texto').requestSubmit()`)
    await s.cdp.hasta(`/ya editado/.test(document.querySelector('.hilo-hoja .modal-titulo')?.textContent || '')`, 8000).catch(() => null)
    const fh = (await servicio(`hilos?id=eq.${h2.id}&select=titulo,cuerpo,editado`))[0]
    const marca = await s.cdp.eval(`/editado/.test(document.querySelector('.hilo-hoja .perfil-cuenta').textContent)`)
    prueba(fh.titulo === 'Mi hilo, ya editado' && fh.cuerpo === 'segunda versión' && fh.editado && marca, `hilo editado en la base y «editado» en pantalla: ${JSON.stringify(fh)}`)
    await s.cdp.eval(clic('.respuesta .hilo-accion', 'Editar'))
    await s.cdp.hasta(`!!document.querySelector('.respuesta .edita-texto')`, 3000)
    await s.cdp.eval(escribe('.respuesta .edita-texto textarea', 'respuesta corregida'))
    await espera(100)
    await s.cdp.eval(`document.querySelector('.respuesta .edita-texto').requestSubmit()`)
    await s.cdp.hasta(`/respuesta corregida/.test(document.querySelector('.respuesta .respuesta-cuerpo')?.textContent || '')`, 8000).catch(() => null)
    const fr = (await servicio(`respuestas?id=eq.${r2.id}&select=cuerpo`))[0]
    const editada = await s.cdp.eval(`/editada/.test(document.querySelector('.respuesta .muro-cuando').textContent)`)
    prueba(fr.cuerpo === 'respuesta corregida' && editada, `respuesta editada: «${fr.cuerpo}», marcada «editada» (${editada})`)
    // guardar cuando ya pasaron las 24 h (editor abierto a tiempo): la base no
    // cambia nada y la app lo dice, no cierra como si hubiera guardado
    await s.cdp.eval(clic('.respuesta .hilo-accion', 'Editar'))
    await s.cdp.hasta(`!!document.querySelector('.respuesta .edita-texto')`, 3000)
    await fetch(`${REST}/respuestas?id=eq.${r2.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ creado: new Date(Date.now() - 2 * 864e5).toISOString() }) })
    await s.cdp.eval(escribe('.respuesta .edita-texto textarea', 'tarde'))
    await espera(100)
    await s.cdp.eval(`document.querySelector('.respuesta .edita-texto').requestSubmit()`)
    await s.cdp.hasta(`!!document.querySelector('.respuesta .edita-texto [role=alert]')`, 8000).catch(() => null)
    const tarde = await s.cdp.eval(`(document.querySelector('.respuesta .edita-texto [role=alert]') || {}).textContent || ''`)
    const fr2 = (await servicio(`respuestas?id=eq.${r2.id}&select=cuerpo`))[0]
    prueba(/24 h/.test(tarde) && fr2.cuerpo === 'respuesta corregida', `fuera de plazo: aviso «${tarde}» y el texto no cambia`)
    await s.cdp.eval(clic('.respuesta .edita-texto .chip-btn', 'Cancelar'))
    // pasadas las 24 h ya no hay «Editar» (la base tampoco lo deja)
    await fetch(`${REST}/hilos?id=eq.${h2.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ creado: new Date(Date.now() - 2 * 864e5).toISOString() }) })
    await s.cdp.eval(`document.querySelector('.hilo-hoja .cerrar').click()`); await espera(700)
    await s.cdp.eval(`location.hash = 'h/${h2.id}'`)
    await s.cdp.hasta(`!!document.querySelector('.hilo-hoja .modal-titulo')`, 12000); await espera(800)
    prueba(!(await s.cdp.eval(`[...document.querySelectorAll('.hilo-acciones .hilo-accion')].some(b => /Editar/.test(b.textContent))`)), 'con más de 24 h el hilo ya no ofrece «Editar»')
    prueba(s.errores.length === 0, `errores en consola (mala): ${s.errores.length} ${s.errores.slice(0, 2).join(' | ')}`)
  } finally { await s.cierra() }

  // ── mod: cola de su comunidad ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(mod) })
  try {
    await s.navega('#crono'); await espera(3000)
    await s.cdp.eval(`location.hash = 'c/${dir}'`)
    await s.cdp.hasta(`!!document.querySelector('.cola-reportes')`, 12000)
    await espera(800)
    const n = await s.cdp.eval(`({ filas: document.querySelectorAll('.cola-fila').length, propios: [...document.querySelectorAll('.cola-fila')].filter(f => /contenido tuyo/.test(f.textContent) && !f.querySelector('.chip-btn')).length })`)
    prueba(n.filas === 3 && n.propios === 1, `la dueña ve la cola de su comunidad: ${n.filas} reportes (el del foro abierto no), ${n.propios} de su propio hilo sin botones`)
    await s.cdp.eval(enFila('/^Acoso o insultos · Hilo/', 'Ocultar y resolver'))
    await s.cdp.hasta(`document.querySelectorAll('.cola-fila').length === 2`, 8000).catch(() => null)
    await s.cdp.eval(enFila('/^Spam · Respuesta/', 'Descartar'))
    await s.cdp.hasta(`document.querySelectorAll('.cola-fila').length === 1`, 8000).catch(() => null)
    const porRef = async (tipo, ref) => (await servicio(`reportes?tipo=eq.${tipo}&ref=eq.${ref}&select=estado,resuelto_por`))[0]
    const reps = [await porRef('hilo', h1.id), await porRef('respuesta', r1.id)]
    const oculto = (await servicio(`hilos?id=eq.${h1.id}&select=oculto`))[0].oculto
    const reg = await servicio(`registro_moderacion?comunidad=eq.${k.id}&select=accion`)
    prueba(reps[0].estado === 'resuelto' && reps[1].estado === 'descartado' && reps.every(r => r.resuelto_por === mod.id) && oculto === true,
      `ocultar y resolver + descartar: ${JSON.stringify(reps.map(r => r.estado))}, hilo oculto ${oculto}`)
    prueba(reg.some(r => r.accion === 'reporte:resuelto') && reg.some(r => r.accion === 'reporte:descartado'), `en el registro de moderación: ${reg.map(r => r.accion).join(', ')}`)
    prueba(s.errores.length === 0, `errores en consola (mod): ${s.errores.length}`)
  } finally { await s.cierra() }

  // ── jefa: cola global ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(jefa) })
  try {
    await s.navega('#comunidades')
    await s.cdp.hasta(`!!document.querySelector('.cola-reportes')`, 12000)
    const txt = await s.cdp.eval(`document.querySelector('.cola-reportes').textContent`)
    prueba(/Spam/.test(txt) && /Hilo/.test(txt), 'la administración ve el reporte del foro abierto en Comunidades')
    const antes = await s.cdp.eval(`document.querySelectorAll('.cola-fila').length`)
    await s.cdp.eval(enFila('/^Spam · Hilo/', 'Ocultar y resolver'))
    await s.cdp.hasta(`document.querySelectorAll('.cola-fila').length === ${antes - 1}`, 8000).catch(() => null)
    const e3 = (await servicio(`reportes?ref=eq.${h3.id}&tipo=eq.hilo&select=estado`))[0].estado
    prueba(e3 === 'resuelto', `resuelto desde la cola global: ${e3}`)
  } finally { await s.cierra() }

  // ── rep bloquea a mala desde su perfil ──
  s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(rep) })
  try {
    await s.navega('#crono'); await espera(3000)
    await s.cdp.eval(`location.hash = 'u/${mala.nombre}'`)
    await s.cdp.hasta(`!!document.querySelector('.perfil-seguridad')`, 12000)
    await s.cdp.eval(clic('.perfil-seguridad .hilo-accion', 'Bloquear'))
    // el aviso sale al momento (optimista): se espera a que la escritura acabe
    await s.cdp.hasta(`/Bloqueaste/.test(document.querySelector('.perfil-hoja').textContent) && !document.querySelector('.perfil-seguridad .hilo-accion').disabled`, 8000).catch(() => null)
    let b = await servicio(`bloqueos?quien=eq.${rep.id}&a_quien=eq.${mala.id}&select=quien`)
    prueba(b.length === 1, `bloquear: fila en la base (${b.length}) y aviso en pantalla`)
    await s.cdp.eval(clic('.perfil-seguridad .hilo-accion', 'Desbloquear'))
    await s.cdp.hasta(`!/Bloqueaste/.test(document.querySelector('.perfil-hoja').textContent) && !document.querySelector('.perfil-seguridad .hilo-accion').disabled`, 8000).catch(() => null)
    b = await servicio(`bloqueos?quien=eq.${rep.id}&a_quien=eq.${mala.id}&select=quien`)
    prueba(b.length === 0, `desbloquear: ${b.length} filas`)
    prueba(s.errores.length === 0, `errores en consola (rep): ${s.errores.length}`)
  } finally { await s.cierra() }
} catch (e) { prueba(false, 'la sonda se cayó: ' + e.message) } finally {
  if (!process.env.SIN_ARRANCAR && !process.env.QUEDA) await para()
}
process.exitCode = informe('moderación (Supabase local)', filas) ? 1 : 0
