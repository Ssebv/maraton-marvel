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
    // la marca invisible no se enfoca: el Tab tras «Saltar al contenido» va a Maratón
    await cdp.eval(`document.querySelector('.saltar').focus()`)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await espera(150)
    const tab = await cdp.eval(`({ vis: getComputedStyle(document.querySelector('.barra-app-marca')).visibility, foco: document.activeElement.className + ' ' + document.activeElement.textContent.trim().slice(0, 20) })`)
    filas.push([tab.vis === 'hidden' && !/barra-app-marca/.test(tab.foco), `marca oculta arriba (${tab.vis}); el Tab va a «${tab.foco}»`])
    filas.push([arriba.ancho <= arriba.vp, `sin scroll horizontal: ${arriba.ancho} de ${arriba.vp}`])

    await cdp.eval(`window.scrollTo({ top: 2400, behavior: 'instant' })`)
    await espera(600)
    const abajo = await cdp.eval(`(() => { const b = document.querySelector('.barra-app').getBoundingClientRect(), t = document.querySelector('.toolbar').getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), tb: Math.round(t.top), marca: +getComputedStyle(document.querySelector('.barra-app-marca')).opacity, fondo: +getComputedStyle(document.querySelector('.barra-app'), '::before').opacity } })()`)
    filas.push([abajo.top === 0 && abajo.tb >= abajo.bottom && abajo.tb - abajo.bottom <= 12, `al bajar: barra en 0–${abajo.bottom}, herramientas pegadas debajo en ${abajo.tb}`])
    const vis = await cdp.eval(`getComputedStyle(document.querySelector('.barra-app-marca')).visibility`)
    filas.push([abajo.marca > 0.95 && abajo.fondo > 0.95 && vis === 'visible', `al bajar: marca ${abajo.marca} (${vis}), fondo ${abajo.fondo}`])

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
    // «Leer menos» (va aquí: sin progreso sembrado la descripción de X-Men no está plegada) no pierde su clase ni el foco al cerrar (code-review).
    // En el móvil la descripción vive dentro de «Sobre esta saga» y este bloque
    // está oculto: el fallo era latente. Se enseña a la fuerza para probarlo.
    await cdp.eval(`(() => { const e = document.createElement('style'); e.textContent = '.saga-desc-wrap{display:block !important}'; document.head.append(e); window.scrollTo({ top: 0, behavior: 'instant' }) })()`)
    await espera(600)
    const leer = await cdp.eval(`new Promise(async res => {
    const w = [...document.querySelectorAll('.saga-desc-wrap.larga')].find(x => x.querySelector('.leer-mas').getClientRects().length)
    if (!w) return res(null)
    const b = w.querySelector('.leer-mas')
    b.focus(); b.click()
    await new Promise(r => setTimeout(r, 300))
    b.click()
    await new Promise(r => requestAnimationFrame(r))
    res({ larga: w.classList.contains('larga'), visible: getComputedStyle(b).display !== 'none', foco: document.activeElement === b, texto: b.textContent })
  })`)
    filas.push([leer && leer.larga && leer.visible && leer.foco, `«Leer menos» → «${leer && leer.texto}» en el primer fotograma: clase ${leer && leer.larga}, visible ${leer && leer.visible}, foco ${leer && leer.foco}`])

    filas.push([errores.length === 0, `errores en consola: ${errores.length}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe('barra · móvil 390', filas)
}
// Barra ordenada (22 sep): Buscar, Filtros (con su cuenta) y Más a la vista
// en el móvil; los filtros y las acciones viven en sus hojas
{
  const filas = []
  const { cdp, navega, cierra } = await abre()
  try {
    await navega('#crono')
    await cdp.hasta(`!!document.querySelector('.ctrl-filtros')`, 5000)
    await espera(400)
    const v = await cdp.eval(`(() => { const r = s => { const e = document.querySelector(s); const c = e.getBoundingClientRect(); return { x: Math.round(c.x), der: Math.round(c.right) } }
      return { busca: r('.busca'), filtros: r('.ctrl-filtros'), mas: r('.ctrl-mas'), vw: innerWidth, chips: document.querySelectorAll('.controles .chip-btn').length } })()`)
    filas.push([v.busca.x >= 0 && v.filtros.der <= v.vw && v.mas.der <= v.vw, `móvil: Buscar, Filtros y Más caben sin deslizar (${JSON.stringify(v)})`])
    await cdp.eval(`document.querySelector('.ctrl-filtros').click()`)
    await cdp.hasta(`!!document.querySelector('.filtro-fila')`, 3000)
    const n = await cdp.eval(`document.querySelectorAll('.filtro-fila').length`)
    await cdp.eval(`[...document.querySelectorAll('.filtro-fila')].find(b => b.textContent.includes('Solo pendientes')).click()`)
    await espera(300)
    const puesto = await cdp.eval(`(() => { const b = [...document.querySelectorAll('.filtro-fila')].find(x => x.textContent.includes('Solo pendientes'))
      return { marcado: b.getAttribute('aria-checked'), cuenta: (document.querySelector('.ctrl-cuenta') || {}).textContent } })()`)
    await cdp.eval(`document.querySelector('.overlay .cerrar').click()`); await espera(500)
    await cdp.eval(`document.querySelector('.ctrl-mas').click()`)
    await cdp.hasta(`!!document.querySelector('.filtro-fila')`, 3000)
    const acciones = await cdp.eval(`[...document.querySelectorAll('.filtro-fila b')].map(b => b.textContent)`)
    filas.push([n === 6 && puesto.marcado === 'true' && puesto.cuenta === '1', `hoja de Filtros: ${n} filtros, «Solo pendientes» queda puesto y el botón lleva la cuenta (${puesto.cuenta})`])
    filas.push([acciones.length === 4 && acciones.includes('Modo cine'), `hoja de Más: ${JSON.stringify(acciones)}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe('barra ordenada · móvil 390', filas)
}

process.exitCode = malas ? 1 : 0
