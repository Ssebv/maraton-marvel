#!/usr/bin/env node
// Navegación y scroll (auditoría del 17 sep 2026), en el móvil:
//  - una subvista sin posición guardada empieza en su principio (la barra
//    pegada con el contenido debajo), no a la altura de la anterior;
//  - Perfil abierto desde mitad de la lista empieza arriba, y volver a
//    Maratón devuelve a la misma tarjeta;
//  - una Tierra del Multiverso y una lista de Perfil son carpetas: se entra
//    viendo su cabecera, atrás vuelve al mapa o a Mis listas (no a Maratón)
//    donde estabas, y tocar la pestaña activa sale de la carpeta;
//  - en la hoja, lo nuevo (biografía, título abierto desde ella) empieza
//    arriba y al volver cada pantalla recupera su scroll;
//  - volver a Maratón con el dock es UNA transición, con su desliz.
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 45).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const listas = [{ id: 'l1', nombre: 'Sonda', items: ids.slice(0, 20), prog: {} }]
const siembra = { 'maraton-marvel-v1': vistas, 'maraton-marvel-listas-v1': listas }

const { cdp, navega, cierra, errores } = await abre({ siembra })
const filas = []
const ev = e => cdp.eval(e)
const y = () => ev('Math.round(scrollY)')
const baja = async top => { await ev(`new Promise(r => { window.scrollTo({ top: ${top}, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(() => r(1))) })`); await espera(400) }
const subvista = v => ev(`document.querySelector('nav.subvistas a[href="#${v}"]').click()`)
const dock = i => ev(`document.querySelectorAll('nav.tabs .tab')[${i}].click()`)
const tarjetaArriba = `(() => { const tb = document.querySelector('.toolbar'); const y0 = tb.getBoundingClientRect().bottom
  const c = [...document.querySelectorAll('.card[id]')].find(e => e.getBoundingClientRect().bottom > y0 + 4); return c && c.id })()`
try {
  await navega('#crono')
  await espera(1500)

  // subvista desde mitad de la lista
  await baja(0); await baja(4000)
  await subvista('galeria'); await espera(900)
  const g = await ev(`({ y: Math.round(scrollY), barra: Math.round(document.querySelector('.toolbar').getBoundingClientRect().top), sub: Math.round(document.querySelector('nav.subvistas').getBoundingClientRect().top) })`)
  filas.push([g.y < 1000 && g.barra === 0 && g.sub > 0 && g.sub < 120, `Galería desde y=4000 empieza en su principio: y=${g.y}, barra en ${g.barra}, subvistas en ${g.sub}`])
  await subvista('crono'); await espera(900)

  // Perfil desde mitad de la lista y vuelta
  await baja(3800)
  const antes = await ev(tarjetaArriba)
  await dock(1); await espera(1000)
  const yPerfil = await y()
  filas.push([yPerfil === 0, `Perfil desde y=3800 empieza arriba: y=${yPerfil}`])
  // una sola transición al volver, con desliz
  await ev(`window.__vt = []; const o = document.startViewTransition.bind(document); document.startViewTransition = a => { window.__vt.push(document.documentElement.dataset.vt); return o(a) }; 1`)
  await dock(0)
  const anim = await ev(`new Promise(r => setTimeout(() => r(document.getAnimations().filter(a => a.effect && a.effect.pseudoElement === '::view-transition-new(root)').map(a => a.animationName)), 100))`)
  await espera(900)
  const vt = await ev('window.__vt')
  filas.push([vt.length === 1 && anim[0] === 'vtEntraIzq', `volver a Maratón con el dock: ${vt.length} transición(es) ${JSON.stringify(vt)}, animación ${JSON.stringify(anim)}`])
  const despues = await ev(tarjetaArriba)
  filas.push([!!antes && antes === despues, `Maratón vuelve a la misma tarjeta: ${antes} → ${despues}`])

  // Tierra del Multiverso
  await dock(2); await espera(1000)
  await ev(`document.querySelectorAll('.mv-modos .tab')[2].click()`); await espera(800)
  await ev(`(() => { const cs = document.querySelectorAll('.mv-card'); cs[cs.length - 2].scrollIntoView({ block: 'center', behavior: 'instant' }) })()`); await espera(500)
  const yMapa = await y()
  await ev(`(() => { const cs = document.querySelectorAll('.mv-card'); cs[cs.length - 2].click() })()`); await espera(900)
  const t = await ev(`(() => { const v = document.querySelector('.tierra > .chip-btn'); return v && Math.round(v.getBoundingClientRect().top) })()`)
  filas.push([t !== null && t >= 0 && t < 300, `Tierra abierta desde y=${yMapa}: «← Volver» a la vista en ${t}`])
  await ev('history.back()'); await espera(1200)
  const tb = await ev(`({ tierra: !!document.querySelector('.tierra'), hash: location.hash, y: Math.round(scrollY) })`)
  filas.push([!tb.tierra && tb.hash === '#multiverso' && Math.abs(tb.y - yMapa) < 4, `atrás desde la Tierra vuelve al mapa donde estabas: ${JSON.stringify(tb)}`])
  await ev(`(() => { const cs = document.querySelectorAll('.mv-card'); cs[cs.length - 2].click() })()`); await espera(900)
  await dock(2); await espera(1000)
  filas.push([!(await ev(`!!document.querySelector('.tierra')`)), 'tocar Multiverso dentro de una Tierra vuelve al mapa'])

  // lista de Perfil
  await dock(1); await espera(1000)
  await subvista('listas'); await espera(900)
  await ev(`document.querySelector('.lista-card').click()`); await espera(900)
  await baja(1200)
  await ev('history.back()'); await espera(1200)
  const l = await ev(`({ hash: location.hash, detalle: !!document.querySelector('.lista-hero'), tarjetas: document.querySelectorAll('.lista-card').length })`)
  filas.push([l.hash === '#listas' && !l.detalle && l.tarjetas > 0, `atrás desde una lista vuelve a Mis listas: ${JSON.stringify(l)}`])

  // hoja: biografía y título abierto desde ella
  await dock(0); await espera(1000)
  await ev(`document.getElementById('card-infinitywar').scrollIntoView({ block: 'center', behavior: 'instant' })`); await espera(600)
  await ev(`(() => { const e = document.querySelector('#card-infinitywar .titulo'), r = e.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + r.height / 2 }
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) e.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o)); e.click() })()`)
  await cdp.hasta(`!!document.querySelector('.overlay .modal .persona')`)
  await espera(800)
  const hoja = `document.querySelector('.overlay .modal')`
  await ev(`${hoja}.scrollTop = 200`); await espera(200)
  // la primera persona con títulos que abrir
  let bio = false
  for (let i = 1; i < 6 && !bio; i++) {
    await ev(`document.querySelectorAll('.overlay .modal .persona')[${i}].click()`); await espera(1500)
    bio = await ev(`document.querySelectorAll('.overlay .modal .pf-item:not([disabled])').length > 1`)
    if (!bio) { await ev('history.back()'); await espera(900); await ev(`${hoja}.scrollTop = 200`); await espera(200) }
  }
  const stBio = await ev(`${hoja}.scrollTop`)
  await ev(`${hoja}.scrollTop = 150`)
  await ev(`[...document.querySelectorAll('.overlay .modal .pf-item')].find(x => !x.disabled).click()`); await espera(1200)
  const stTitulo = await ev(`${hoja}.scrollTop`)
  filas.push([bio && stBio === 0 && stTitulo === 0, `lo nuevo empieza arriba: biografía ${stBio}, título desde ella ${stTitulo} (la ficha iba a 200 y la biografía a 150)`])
  await ev('history.back()'); await espera(1200)
  const v1 = await ev(`${hoja}.scrollTop`)
  await ev('history.back()'); await espera(1200)
  const v2 = await ev(`${hoja}.scrollTop`)
  filas.push([Math.abs(v1 - 150) < 2 && Math.abs(v2 - 200) < 2, `al volver cada pantalla recupera su scroll: biografía ${v1} (150), ficha ${v2} (200)`])

  filas.push([errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 2).join(' | ')}`])
} catch (e) {
  filas.push([false, 'la sonda se cayó: ' + e.message])
} finally {
  await cierra()
}
process.exitCode = informe('Navegación y scroll (móvil)', filas) ? 1 : 0
