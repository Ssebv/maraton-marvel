#!/usr/bin/env node
// La cuenta de la comunidad de punta a punta, contra un Supabase LOCAL (Docker,
// scripts/comunidad/local.mjs) y la app construida, como lo haría una persona
// con dos dispositivos: entrar con enlace por correo (el mismo canje PKCE que
// Google), crear el perfil, subir lo local, entrar en otro navegador y fundir,
// marcar en uno y verlo en el otro, privacidad, y borrar la cuenta.
// Uso: node scripts/sondas/cuenta.mjs   (deja Supabase local levantado con QUEDA=1)
import { abre, espera, informe } from './lib.mjs'
import { arranca, para, PROXY, CLAVES, ultimoCorreo, PUERTOS } from '../comunidad/local.mjs'

const REST = PROXY['/rest/v1']
const servicio = ruta => fetch(`${REST}/${ruta}`, { headers: { apikey: CLAVES.service, Authorization: `Bearer ${CLAVES.service}` } }).then(r => r.json())
const correo = `sonda${Date.now()}@prueba.local`
const nombre = `sonda_${Date.now() % 1000000}`
const ahora = Date.now()
const APP = `http://localhost:${PUERTOS.app}`
const siembra = vistas => ({
  'maraton-marvel-nube-pruebas-v1': { url: APP, anon: CLAVES.anon },
  'maraton-marvel-v1': vistas,
})
// escribir en un input controlado por React
const escribe = (sel, valor) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(valor)})
  i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`

const filas = []
const prueba = (ok, t) => filas.push([!!ok, t])
// entrar con enlace por correo en un navegador ya abierto
async function entra(s) {
  await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.chip-ajustes').click()`)
  await s.cdp.hasta(`!!document.querySelector('#cuenta-correo')`, 8000)
  await s.cdp.eval(escribe('#cuenta-correo', correo))
  await s.cdp.eval(`document.querySelector('.cuenta-correo').requestSubmit()`)
  await s.cdp.hasta(`/Listo/.test(document.querySelector('.cuenta-correo').textContent)`, 10000)
  const m = await ultimoCorreo(correo)
  const enlace = m && (m.Text.match(/https?:\/\/\S+verify\S+/) || [])[0]
  if (!enlace) throw new Error('sin correo de acceso')
  // cada petición de enlace deja un correo: se borran para que el siguiente sea el nuevo
  await fetch(`${PROXY['/auth/v1'].replace(/:\d+$/, ':' + PUERTOS.mail)}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await s.cdp.send('Page.navigate', { url: enlace })
  await s.cdp.hasta(`location.pathname === '/' && document.readyState === 'complete' && !!document.querySelector('#root > *')`, 15000)
  return enlace
}

try {
  if (!process.env.SIN_ARRANCAR) await arranca({ silencio: true })
  prueba(true, 'Supabase local (Postgres, GoTrue, PostgREST, Mailpit) levantado con la migración')

  // ── dispositivo 1 ──
  let s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra({ 'first-class': ahora - 864e5 }) })
  try {
    await s.navega('#crono')
    await espera(1500)
    const hayCuenta = await s.cdp.eval(`(() => { document.querySelector('.chip-ajustes').click(); return new Promise(r => setTimeout(() => r(!!document.querySelector('.cuenta-ajuste')), 800)) })()`)
    prueba(hayCuenta, 'Ajustes enseña la sección Cuenta cuando hay proyecto configurado')
    await s.cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await espera(600)
    await entra(s)
    await s.cdp.hasta(`!!document.querySelector('.crea-perfil')`, 15000)
    prueba(true, 'el enlace del correo vuelve con ?code=, se canjea y pide crear el perfil')
    const urlLimpia = await s.cdp.eval(`!/[?&]code=/.test(location.href)`)
    prueba(urlLimpia, 'el código no se queda en la URL')
    await s.cdp.eval(escribe('#crea-nombre', nombre))
    await s.cdp.hasta(`/Libre/.test(document.querySelector('#crea-nombre-estado').textContent)`, 8000)
    await s.cdp.eval(`document.querySelectorAll('.crea-avatar')[2].click(); document.querySelector('.crea-edad input').click()`)
    await espera(200)
    await s.cdp.eval(`document.querySelector('.crea-perfil').requestSubmit()`)
    await s.cdp.hasta(`!document.querySelector('.crea-perfil')`, 10000)
    await espera(2500)
    const p1 = await servicio(`perfiles?nombre=eq.${nombre}&select=id,avatar,priv_progreso`)
    prueba(p1.length === 1 && p1[0].avatar === 'xmen97' && p1[0].priv_progreso === 'privado', `perfil creado en la base: ${JSON.stringify(p1[0])}`)
    const pr1 = await servicio(`progreso?usuario=eq.${p1[0] && p1[0].id}&select=vistas`)
    prueba(pr1[0] && pr1[0].vistas['first-class'], `lo visto en este navegador subió a la cuenta: ${JSON.stringify(pr1[0] && pr1[0].vistas)}`)
    const sesion = await s.cdp.eval(`(() => { const c = JSON.parse(localStorage.getItem('maraton-marvel-cuenta-v1') || 'null'); return c && { uid: c.uid, rt: !!c.rt } })()`)
    prueba(sesion && sesion.uid === (p1[0] && p1[0].id) && sesion.rt, 'la sesión queda guardada para la próxima vez')

    // ── dispositivo 2, con otra cosa vista ──
    await s.cierra()
    s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: siembra({ logan: ahora - 2 * 864e5 }) })
    // la primera lectura del progreso en la nube falla (red): la fusión debe
    // quedar pendiente, sin pisar lo local, y reintentarse al volver (code-review)
    await s.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      if (sessionStorage.getItem('fallo-hecho')) return
      const f = window.fetch
      window.fetch = (u, o) => { if (String(u).includes('/rest/v1/progreso?usuario=') && (!o || !o.method || o.method === 'GET') && !sessionStorage.getItem('fallo-hecho')) { sessionStorage.setItem('fallo-hecho', '1'); return Promise.reject(new TypeError('red caída')) } return f(u, o) }
    })()` })
    await s.navega('#crono')
    await espera(1200)
    await entra(s)
    await espera(3000)
    const pendiente = await s.cdp.eval(`({ fusion: (JSON.parse(localStorage.getItem('maraton-marvel-cuenta-v1')) || {}).fusion, logan: !!JSON.parse(localStorage.getItem('maraton-marvel-v1')).logan, fc: !!JSON.parse(localStorage.getItem('maraton-marvel-v1'))['first-class'] })`)
    prueba(pendiente.fusion === true && pendiente.logan && !pendiente.fc, `fusión caída por red: queda pendiente y lo local sigue intacto (${JSON.stringify(pendiente)})`)
    await s.cdp.eval(`window.dispatchEvent(new Event('online'))`)
    await espera(3500)
    const sinModal = await s.cdp.eval(`!document.querySelector('.crea-perfil')`)
    prueba(sinModal, 'en el segundo navegador el perfil ya existe: no lo pide otra vez')
    const pr2 = await servicio(`progreso?usuario=eq.${p1[0].id}&select=vistas`)
    const local2 = await s.cdp.eval(`JSON.parse(localStorage.getItem('maraton-marvel-v1'))`)
    const fusionTrasReintento = await s.cdp.eval(`(JSON.parse(localStorage.getItem('maraton-marvel-cuenta-v1')) || {}).fusion`)
    prueba(fusionTrasReintento === undefined, 'al volver la conexión se reintenta y la fusión se completa')
    prueba(pr2[0].vistas['first-class'] && pr2[0].vistas.logan && local2['first-class'] && local2.logan,
      `se funden los dos: nube ${Object.keys(pr2[0].vistas).join(', ')} · navegador ${Object.keys(local2).join(', ')}`)

    // marcar aquí y que llegue a la nube
    await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    const marcado = await s.cdp.eval(`(() => { const c = [...document.querySelectorAll('.card')].find(c => !c.classList.contains('vista')); c.querySelector('.checkbox').click(); return c.id.replace(/^card-/, '') })()`)
    await espera(3000)
    const pr3 = await servicio(`progreso?usuario=eq.${p1[0].id}&select=vistas`)
    prueba(pr3[0].vistas[marcado], `marcar «${marcado}» sube a la nube en ~1 s`)

    // ── dispositivo 3: vuelve con la sesión guardada y TIRA lo de la nube ──
    const guardada = await s.cdp.eval(`localStorage.getItem('maraton-marvel-cuenta-v1')`)
    await s.cierra()
    s = await abre({ puerto: PUERTOS.app, proxy: PROXY, siembra: { ...siembra({}), 'maraton-marvel-cuenta-v1': guardada } })
    await s.navega('#crono')
    await s.cdp.hasta(`(JSON.parse(localStorage.getItem('maraton-marvel-v1') || '{}'))[${JSON.stringify(marcado)}] > 0`, 15000).catch(() => null)
    const local3 = await s.cdp.eval(`Object.keys(JSON.parse(localStorage.getItem('maraton-marvel-v1') || '{}'))`)
    prueba(local3.includes(marcado) && local3.includes('logan') && local3.includes('first-class'), `con la sesión guardada, al abrir trae la nube: ${local3.join(', ')}`)
    const rt3 = await s.cdp.eval(`JSON.parse(localStorage.getItem('maraton-marvel-cuenta-v1')).rt`)
    prueba(rt3 && rt3 !== JSON.parse(guardada).rt, 'la sesión se renovó y guardó el token de refresco nuevo (Supabase lo rota)')

    // privacidad
    await s.cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.chip-ajustes').click()`)
    await s.cdp.hasta(`!!document.querySelector('.cuenta-privacidad')`, 8000)
    await s.cdp.eval(`document.querySelectorAll('.cuenta-priv-fila')[0].querySelectorAll('button')[0].click()`)
    await espera(1500)
    const priv = await servicio(`perfiles?id=eq.${p1[0].id}&select=priv_progreso`)
    prueba(priv[0].priv_progreso === 'publico', `privacidad de «lo que has visto» a público: ${priv[0].priv_progreso}`)

    // borrar la cuenta
    await s.cdp.eval(`[...document.querySelectorAll('.cuenta-ajuste button')].find(b => /Borrar mi cuenta/.test(b.textContent)).click()`)
    await espera(300)
    await s.cdp.eval(`[...document.querySelectorAll('.cuenta-ajuste button')].find(b => /Sí, borrar/.test(b.textContent)).click()`)
    await s.cdp.hasta(`!!document.querySelector('.cuenta-entrar')`, 10000)
    const quedan = await servicio(`perfiles?id=eq.${p1[0].id}&select=id`)
    const quedanPr = await servicio(`progreso?usuario=eq.${p1[0].id}&select=usuario`)
    const localSigue = await s.cdp.eval(`Object.keys(JSON.parse(localStorage.getItem('maraton-marvel-v1'))).length`)
    prueba(quedan.length === 0 && quedanPr.length === 0 && localSigue >= 2, `borrar la cuenta: perfil ${quedan.length}, progreso ${quedanPr.length}; en el navegador siguen ${localSigue} marcas`)
    prueba(s.errores.length === 0, `errores en consola: ${s.errores.length} ${s.errores.slice(0, 3).join(' | ')}`)
  } finally { await s.cierra() }
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message)
} finally {
  if (!process.env.QUEDA) await para()
}
process.exitCode = informe('cuenta de la comunidad (Supabase local)', filas) ? 1 : 0
