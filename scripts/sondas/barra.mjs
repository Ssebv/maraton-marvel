#!/usr/bin/env node
// Barra de la app en escritorio (16 sep 2026): Maratón / Perfil / Multiverso
// fijos arriba y separados de filtros y herramientas.
import { abre, espera, informe } from './lib.mjs'

let malas = 0
for (const ancho of [1280, 1920]) {
  const { cdp, navega, cierra, errores } = await abre({ movil: false, ancho, alto: 900 })
  const filas = []
  try {
    await navega('#crono')
    await espera(1500)
    await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    const arriba = await cdp.eval(`(() => { const b = document.querySelector('.barra-app'), n = b && b.querySelector('nav.tabs'), m = b && b.querySelector('.barra-app-marca')
      return { barra: !!b, nav: !!n, navEnToolbar: !!document.querySelector('.toolbar nav.tabs'), ajustes: !!(b && b.querySelector('.chip-ajustes')),
        marca: m ? +getComputedStyle(m).opacity : -1, fondo: +getComputedStyle(b, '::before').opacity, ancho: document.documentElement.scrollWidth, vp: innerWidth } })()`)
    filas.push([arriba.barra && arriba.nav && !arriba.navEnToolbar && arriba.ajustes, `secciones y Ajustes en la barra de la app, no en la de herramientas (${JSON.stringify({ nav: arriba.nav, enToolbar: arriba.navEnToolbar })})`])
    filas.push([arriba.marca < 0.05 && arriba.fondo < 0.05, `arriba en Maratón: marca ${arriba.marca} y fondo ${arriba.fondo} (transparentes sobre el titular)`])
    filas.push([arriba.ancho <= arriba.vp, `sin scroll horizontal: ${arriba.ancho} de ${arriba.vp}`])

    await cdp.eval(`window.scrollTo({ top: 2400, behavior: 'instant' })`)
    await espera(600)
    const abajo = await cdp.eval(`(() => { const b = document.querySelector('.barra-app').getBoundingClientRect(), t = document.querySelector('.toolbar').getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), tb: Math.round(t.top), marca: +getComputedStyle(document.querySelector('.barra-app-marca')).opacity, fondo: +getComputedStyle(document.querySelector('.barra-app'), '::before').opacity } })()`)
    filas.push([abajo.top === 0 && abajo.tb >= abajo.bottom && abajo.tb - abajo.bottom <= 12, `al bajar: barra en 0–${abajo.bottom}, herramientas pegadas debajo en ${abajo.tb}`])
    filas.push([abajo.marca > 0.95 && abajo.fondo > 0.95, `al bajar: marca ${abajo.marca}, fondo ${abajo.fondo}`])

    // tecla 2 → Perfil
    await cdp.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))`)
    await cdp.hasta(`location.hash === '#stats' || !!document.querySelector('.cabecera-destino')`, 4000)
    await espera(900)
    const perfil = await cdp.eval(`(() => { const t = document.querySelector('.toolbar'), m = document.querySelector('.barra-app-marca'), a = document.querySelector('.barra-app .tab[aria-current="page"]')
      return { toolbar: t ? getComputedStyle(t).display : 'no', marca: +getComputedStyle(m).opacity, activa: a && a.textContent.trim() } })()`)
    filas.push([perfil.toolbar === 'none' && perfil.marca > 0.95 && /Perfil/.test(perfil.activa), `Perfil con la tecla 2: activa «${perfil.activa}», herramientas ${perfil.toolbar}, marca ${perfil.marca}`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 3).join(' | ')}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe(`barra de escritorio · ${ancho}`, filas)
}
{
  const { cdp, navega, cierra, errores } = await abre({})
  const filas = []
  try {
    await navega('#crono')
    await espera(1200)
    const m = await cdp.eval(`({ barra: !!document.querySelector('.barra-app'), dock: !!document.querySelector('body > nav.tabs') })`)
    filas.push([!m.barra && m.dock, `móvil: sin barra de escritorio (${m.barra}), dock en <body> (${m.dock})`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe('barra · móvil 390', filas)
}
process.exitCode = malas ? 1 : 0
