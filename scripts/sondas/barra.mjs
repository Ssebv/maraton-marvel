#!/usr/bin/env node
// Barra de la app en escritorio (16 sep 2026): Maratón / Perfil / Multiverso
// fijos arriba y separados de filtros y herramientas.
import { abre, espera, informe } from './lib.mjs'

let malas = 0
// la barra de arriba vive entre 721 y 1099 px; desde 1100, la lateral (abajo)
for (const ancho of [1024]) {
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
// Barra lateral al estilo Norte (23 sep 2026), desde 1100 px
for (const ancho of [1280, 1920]) {
  const { cdp, navega, cierra, errores } = await abre({ movil: false, ancho, alto: 900 })
  const filas = []
  try {
    await navega('#crono')
    await espera(1500)
    const l = await cdp.eval(`(() => { const a = document.querySelector('.lateral'), r = a && a.getBoundingClientRect()
      return { lateral: !!r && r.width > 200 && r.left === 0, filas: a ? a.querySelectorAll('.lat-fila').length : 0,
        activa: (document.querySelector('.lat-fila[aria-current="page"]') || {}).textContent,
        viejas: ['.barra-app', '.toolbar', '.subvistas', '.hero-maraton'].filter(s => document.querySelector(s)),
        titulo: (document.querySelector('.pagina-t') || {}).textContent, main: Math.round(document.querySelector('main').getBoundingClientRect().left),
        ancho: document.documentElement.scrollWidth, vp: innerWidth } })()`)
    filas.push([l.lateral && l.filas >= 10 && l.activa === 'Cronológico' && !l.viejas.length, `lateral con ${l.filas} filas, activa «${l.activa}», sin barra de arriba ni herramientas (${JSON.stringify(l.viejas)})`])
    const alto = await cdp.eval(`(() => { const a = document.querySelector('.lateral'); return a.scrollHeight - a.clientHeight })()`)
    filas.push([alto <= 0, `la barra lateral no se desplaza a 900 px de alto (sobra ${alto} px)`])
    filas.push([l.titulo === 'Cronológico' && l.main >= 288 && l.ancho <= l.vp, `título «${l.titulo}», contenido desde x=${l.main}, sin scroll horizontal (${l.ancho}/${l.vp})`])
    // «/» enfoca la búsqueda de la lateral
    await cdp.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))`)
    await espera(150)
    filas.push([await cdp.eval(`!!document.activeElement.closest('.lat-busca')`), '«/» enfoca la búsqueda de la barra lateral'])
    await cdp.eval(`document.activeElement.blur()`)
    // una fila lleva a su vista
    await cdp.eval(`[...document.querySelectorAll('.lat-fila')].find(a => a.textContent === 'Galería').click()`)
    await cdp.hasta(`location.hash === '#galeria'`, 3000).catch(() => null)
    await espera(700)
    filas.push([await cdp.eval(`location.hash === '#galeria' && (document.querySelector('.lat-fila[aria-current="page"]') || {}).textContent === 'Galería'`), 'la fila «Galería» lleva a su vista y queda activa'])
    // Filtros abre su hoja; la tarjeta de abajo abre el panel
    await cdp.eval(`document.querySelector('.lat-icono[aria-label^="Filtros"]').click()`)
    const hoja = await cdp.hasta(`!!document.querySelector('.overlay:not(.saliendo) .filtro-fila')`, 3000).then(() => true, () => false)
    filas.push([hoja, 'Filtros abre su hoja'])
    await cdp.eval(`document.querySelector('.overlay .cerrar').click()`)
    await cdp.hasta(`!document.querySelector('.overlay')`, 3000).catch(() => null)
    // el panel (mapa, estrenos, cuenta atrás) no va en la página: sale en vertical junto a la lateral
    const enPagina = await cdp.eval(`!!document.querySelector('.panel-superior, .panel-resumen')`)
    await cdp.eval(`document.querySelector('.lat-tarjeta').click()`)
    await espera(600)
    // sin desplazamiento (Sebastián: «no me gusta que tenga scroll»): cuenta atrás, cuatro sagas y los estrenos
    const pv = await cdp.eval(`(() => { const p = document.querySelector('.panel-lat'); return { p: !!p.querySelector('.pm-estreno .pm-reloj'), sagas: p.querySelectorAll('.pm-saga').length,
      prox: p.querySelectorAll('.pm-proximo').length, scroll: p.scrollHeight - p.clientHeight, capa: (history.state || {}).capa || 0 } })()`)
    filas.push([!enPagina && pv.p && pv.sagas === 4 && pv.prox >= 1 && pv.scroll <= 0 && pv.capa === 1, `panel solo en vertical y sin desplazar: ${JSON.stringify({ enPagina, ...pv })}`])
    // una saga lleva a su lista y cierra el panel
    await cdp.eval(`[...document.querySelectorAll('.pm-saga')].find(b => /Cómics/.test(b.textContent)).click()`)
    await espera(700)
    filas.push([await cdp.eval(`location.hash === '#comics' && !document.querySelector('.panel-lat')`), 'tocar «Cómics» en el panel lleva a Cómics y lo cierra'])
    await cdp.eval(`document.querySelector('.lat-tarjeta').click()`)
    await espera(600)
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await espera(500)
    filas.push([await cdp.eval(`!document.querySelector('.panel-lat')`), 'Esc cierra el panel vertical'])
    // tecla 2 → Perfil, con Estadísticas activa en la lateral
    await cdp.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))`)
    await cdp.hasta(`location.hash === '#stats'`, 4000).catch(() => null)
    await espera(700)
    filas.push([await cdp.eval(`(document.querySelector('.lat-fila[aria-current="page"]') || {}).textContent === 'Estadísticas'`), 'la tecla 2 lleva a Perfil › Estadísticas'])
    filas.push([errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 3).join(' | ')}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe(`barra lateral · ${ancho}`, filas)
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
  const { cdp, navega, cierra, errores } = await abre()
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
    // la hoja que sale sigue montada 360 ms (useSaliente): se espera a que no
    // quede ninguna y se pregunta solo por la abierta (code-review)
    await cdp.eval(`document.querySelector('.overlay .cerrar').click()`)
    await cdp.hasta(`!document.querySelector('.overlay')`, 3000)
    await cdp.eval(`document.querySelector('.ctrl-mas').click()`)
    await cdp.hasta(`!!document.querySelector('.overlay:not(.saliendo) .filtro-fila')`, 3000)
    const acciones = await cdp.eval(`[...document.querySelectorAll('.overlay:not(.saliendo) .filtro-fila b')].map(b => b.textContent)`)
    filas.push([n === 6 && puesto.marcado === 'true' && puesto.cuenta === '1', `hoja de Filtros: ${n} filtros, «Solo pendientes» queda puesto y el botón lleva la cuenta (${puesto.cuenta})`])
    filas.push([acciones.length === 4 && acciones.includes('Modo cine'), `hoja de Más: ${JSON.stringify(acciones)}`])
    // atrás cierra la hoja abierta sin salir de la vista (regla del proyecto:
    // toda capa nueva se registra en useVolverCierra)
    // Preact registra la capa en un efecto, un fotograma después de pintar la hoja
    await cdp.hasta(`(history.state || {}).capa === 1`, 2000).catch(() => null)
    const conCapa = await cdp.eval(`({ capa: (history.state || {}).capa || 0 })`)
    // fuera de la evaluación: si atrás navegara, CDP cortaría la respuesta
    await cdp.eval(`setTimeout(() => history.back(), 0), 1`)
    await espera(800)
    const tras = await cdp.eval(`({ hoja: !!document.querySelector('.overlay:not(.saliendo)'), hash: location.hash })`)
    filas.push([conCapa.capa >= 1 && !tras.hoja && tras.hash === '#crono', `la hoja añade su paso atrás (capa ${conCapa.capa}) y atrás la cierra sin salir de la vista (${JSON.stringify(tras)})`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message])} finally { await cierra() }
  malas += informe('barra ordenada · móvil 390', filas)
}

process.exitCode = malas ? 1 : 0
