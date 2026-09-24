#!/usr/bin/env node
// Portada del foro (24 sep 2026) de punta a punta contra el Supabase local:
// órdenes En alza / Nuevos / Top semana calculados por la base
// (rpc/foro_portada), filtros por saga y etiqueta, velo en la lista, la 4.ª
// sección «Comunidad» en el dock y en la lateral, y publicar eligiendo título.
// Uso: node scripts/sondas/foro.mjs   (SIN_ARRANCAR=1 si ya está levantado; QUEDA=1 para no quitarlo)
import { abre, espera, informe, captura } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, PUERTOS } from '../comunidad/local.mjs'

const AUTH = PROXY['/auth/v1'], REST = PROXY['/rest/v1']
const APP = `http://localhost:${PUERTOS.app}`
const sello = Date.now() % 1000000
const json = r => r.text().then(t => (t ? JSON.parse(t) : null))
const admin = { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}`, 'Content-Type': 'application/json' }

async function persona(nombre, { vistas = {} } = {}) {
  const email = `${nombre}${sello}@prueba.local`, password = 'clave-de-prueba-123'
  await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) })
  const s = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json)
  const h = { apikey: CLAVES.anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const n = `${nombre}_${sello}`
  let r = await fetch(`${REST}/perfiles`, { method: 'POST', headers: h, body: JSON.stringify({ id: s.user.id, nombre: n, avatar: 'logan', edad_confirmada_en: new Date().toISOString() }) })
  if (!r.ok) throw new Error('perfil ' + (await r.text()))
  r = await fetch(`${REST}/progreso`, { method: 'POST', headers: h, body: JSON.stringify({ usuario: s.user.id, vistas, eps: {}, actualizado: new Date().toISOString() }) })
  if (!r.ok) throw new Error('progreso ' + (await r.text()))
  await fetch(`${REST}/perfiles?id=eq.${s.user.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ creado: new Date(Date.now() - 3 * 864e5).toISOString() }) })
  return { id: s.user.id, nombre: n, email, rt: s.refresh_token, vistas }
}
const siembra = p => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': p.vistas,
  'maraton-marvel-cuenta-v1': { uid: p.id, rt: p.rt, nombre: '', email: p.email, foto: '' },
  'maraton-marvel-guia-ios-v1': String(Date.now()), 'maraton-marvel-pista-cajon-v1': '1',
})
const escribe = (sel, valor) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
  const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${JSON.stringify(valor)})
  i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true })()`
const clic = (sel, texto) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim() === ${JSON.stringify(texto)}); if (!b) return false; b.click(); return true })()`
const titulos = s => s.cdp.eval(`[...document.querySelectorAll('.foro-portada .hilo-fila-titulo')].map(x => x.textContent)`)
const listo = s => s.cdp.hasta(`!!document.querySelector('.foro-portada') && !/Cargando/.test(document.querySelector('.foro-portada').textContent)`, 12000)

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  const alfa = await persona('alfa', { vistas: { 'first-class': Date.now() } })
  // tres hilos con edades y votos conocidos (la base los escribe como servicio)
  const H = { viejo: `Teoría vieja ${sello}`, fresco: `Pregunta fresca ${sello}`, antiguo: `Reseña antigua ${sello}` }
  const mete = async (titulo, ref, etiqueta, horas, votos) => {
    const r = await fetch(`${REST}/hilos?select=id`, { method: 'POST', headers: { ...admin, Prefer: 'return=representation' },
      body: JSON.stringify({ autor: alfa.id, titulo, titulo_ref: ref, etiqueta, cuerpo: 'texto' }) }).then(json)
    const id = r[0].id
    await fetch(`${REST}/hilos?id=eq.${id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ votos, creado: new Date(Date.now() - horas * 36e5).toISOString() }) })
    return id
  }
  await mete(H.viejo, 'loki2', 'teoria', 72, 10)
  await mete(H.fresco, 'first-class', 'pregunta', 1, 2)
  await mete(H.antiguo, 'loki2', 'resena', 240, 50)
  const deBase = await fetch(`${REST}/rpc/foro_portada`, { method: 'POST', headers: { apikey: CLAVES.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ orden: 'semana' }) }).then(json)
  prueba(Array.isArray(deBase) && deBase.some(h => h.titulo === H.viejo) && !deBase.some(h => h.titulo === H.antiguo), `la función responde sin cuenta y «semana» deja fuera lo de hace 10 días (${Array.isArray(deBase) ? deBase.length : JSON.stringify(deBase)} hilos)`)

  const s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra(alfa) })
  try {
    await s.navega('#foro'); await listo(s); await espera(800)
    const nav = await s.cdp.eval(`({ dock: document.querySelectorAll('nav.tabs .tab').length, rotulo: [...document.querySelectorAll('nav.tabs .tab')].map(t => t.textContent.trim()).join('|'), sub: [...document.querySelectorAll('.subvistas .subvista')].map(t => t.textContent).join('|') })`)
    prueba(nav.dock === 4 && /Comunidad/.test(nav.rotulo) && nav.sub === 'Foro|Comunidades', `4.ª sección en el dock y sus dos vistas: ${JSON.stringify(nav)}`)
    const mios = t => t.filter(x => x.endsWith(String(sello)))
    let t = mios(await titulos(s))
    prueba(t[0] === H.fresco, `En alza: lo fresco con pocos votos gana a lo viejo votado: ${t.join(' / ')}`)
    await captura(s.cdp, process.env.CAPTURA || '/dev/null')
    await s.cdp.eval(clic('.foro-orden .tab', 'Nuevos')); await espera(300); await listo(s); await espera(400)
    t = mios(await titulos(s))
    prueba(t.join('|') === [H.fresco, H.viejo, H.antiguo].join('|'), `Nuevos: por fecha: ${t.join(' / ')}`)
    await s.cdp.eval(clic('.foro-orden .tab', 'Top semana')); await espera(300); await listo(s); await espera(400)
    t = mios(await titulos(s))
    prueba(t.join('|') === [H.viejo, H.fresco].join('|'), `Top semana: por votos y sin lo de hace 10 días: ${t.join(' / ')}`)
    await s.cdp.eval(clic('.foro-orden .tab', 'Nuevos'))
    await s.cdp.eval(clic('.foro-filtros .chip-btn', 'X-Men')); await espera(300); await listo(s); await espera(400)
    t = mios(await titulos(s))
    prueba(t.join('|') === H.fresco, `filtro X-Men: ${t.join(' / ')}`)
    await s.cdp.eval(clic('.foro-filtros .chip-btn', 'Todo'))
    await s.cdp.eval(clic('.foro-filtros .chip-btn', 'Reseña')); await espera(300); await listo(s); await espera(400)
    t = mios(await titulos(s))
    prueba(t.join('|') === H.antiguo, `filtro Reseña: ${t.join(' / ')}`)
    await s.cdp.eval(clic('.foro-filtros .chip-btn', 'Reseña')); await espera(300); await listo(s); await espera(400)
    const velo = await s.cdp.eval(`[...document.querySelectorAll('.foro-portada .hilo-fila')].filter(b => b.textContent.includes('${sello}')).map(b => ({ t: b.querySelector('.hilo-fila-titulo').textContent.split(' ')[0], sinVer: /Sin ver/.test(b.textContent), cara: !!b.querySelector('.hilo-cara') }))`)
    prueba(velo.length === 3 && velo.every(v => v.cara) && velo.find(v => v.t === 'Pregunta').sinVer === false && velo.find(v => v.t === 'Teoría').sinVer === true,
      `carátula en cada hilo y «Sin ver» solo en lo de Loki (alfa vio Primera generación): ${JSON.stringify(velo)}`)
    // publicar desde la portada eligiendo el título
    await espera(1500)
    await s.cdp.eval(clic('.foro-cab button', 'Nuevo hilo'))
    await s.cdp.hasta(`!!document.querySelector('.foro-escribe .nuevo-hilo')`, 5000)
    const porDefecto = await s.cdp.eval(`document.querySelector('.foro-escribe > label select').value`)
    await s.cdp.eval(escribe('.foro-escribe > label select', 'loki2')); await espera(200)
    const conEpisodios = await s.cdp.eval(`document.querySelectorAll('.foro-escribe .nuevo-hilo select option').length`)
    const nuevo = `Hilo desde la portada ${sello}`
    await s.cdp.eval(escribe('.foro-escribe .nuevo-hilo input', nuevo))
    await s.cdp.eval(escribe('.foro-escribe .nuevo-hilo textarea', 'Probando la portada'))
    await espera(200)
    await s.cdp.eval(`document.querySelector('.foro-escribe .nuevo-hilo').requestSubmit()`)
    await s.cdp.hasta(`!!document.querySelector('.hilo-hoja .modal-titulo')`, 12000).catch(() => null)
    const fila = await fetch(`${REST}/hilos?titulo=eq.${encodeURIComponent(nuevo)}&select=titulo_ref,comunidad`, { headers: admin }).then(json)
    prueba(porDefecto === 'first-class' && conEpisodios > 1 && fila[0] && fila[0].titulo_ref === 'loki2' && fila[0].comunidad === null,
      `publicar: título por defecto lo último visto (${porDefecto}), con episodios al elegir Loki T2 (${conEpisodios} opciones), hilo en su foro: ${JSON.stringify(fila[0])}`)
    await s.cdp.eval(`history.back()`); await espera(800)
    t = await titulos(s)
    prueba(t.includes(nuevo), 'al volver, el hilo nuevo ya está en la portada')
    prueba(s.errores.length === 0, `sin errores de consola (${s.errores.length})`)
  } finally { await s.cierra() }
} catch (e) { prueba(false, 'la sonda se cayó: ' + (e && e.message)) }
finally { if (!process.env.QUEDA && !process.env.SIN_ARRANCAR) await para() }
process.exitCode = informe('portada del foro', filas) ? 1 : 0
