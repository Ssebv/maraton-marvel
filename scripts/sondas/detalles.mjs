#!/usr/bin/env node
// Detalles del repaso con capturas del 16 sep 2026:
//  - la barra de una era plegada llena el hueco entre años y cuenta (móvil);
//  - ningún nombre con guion («X-Men», «One-Shot») se parte en dos líneas;
//  - el texto de ejemplo del buscador cabe entero en el móvil;
//  - en escritorio las cifras de la portada van a lo ancho cuando bajan de
//    fila (1280) y siguen junto al titular cuando caben (1600);
//  - dos avisos Deshacer seguidos con el mismo texto cambian la región viva.
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 45).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const siembra = { 'maraton-marvel-v1': vistas }
let malas = 0

{
  const { cdp, navega, cierra, errores } = await abre({ siembra })
  const filas = []
  try {
    await navega('#crono')
    await espera(1500)
    const eras = await cdp.eval(`[...document.querySelectorAll('.era.plegada .era-head')].map(h => {
      const r = h.querySelector('.era-rango').getBoundingClientRect(), p = h.querySelector('.era-prog').getBoundingClientRect(), c = h.querySelector('.era-count').getBoundingClientRect()
      return { hueco1: Math.round(p.left - r.right), hueco2: Math.round(c.left - p.right), ancho: Math.round(p.width) } })`)
    const buenas = eras.filter(e => e.ancho > 100 && e.hueco1 >= 8 && e.hueco1 <= 16 && e.hueco2 >= 8 && e.hueco2 <= 16)
    filas.push([eras.length > 0 && buenas.length === eras.length, `barra de era entre años y cuenta: ${buenas.length} de ${eras.length} (${JSON.stringify(eras[0])})`])

    // se mide con el texto DENTRO del campo (scrollWidth): medirlo con canvas
    // decía que cabía y en la captura seguía cortado — un type=search reserva
    // el hueco del botón de borrar
    const cabe = await cdp.eval(`(() => { const b = document.querySelector('.controles .busca'), ph = b.placeholder
      const antes = b.value; b.value = ph; const r = { sobra: b.scrollWidth - b.clientWidth, ph, ancho: b.offsetWidth }; b.value = antes; return r })()`)
    filas.push([cabe.sobra <= 0, `«${cabe.ph}» dentro del buscador de ${cabe.ancho} px: se sale ${cabe.sobra} px`])

    // nombres con guion: recorrer la lista entera por tramos
    let partidos = 0, vistosN = 0
    const alto = await cdp.eval('document.documentElement.scrollHeight')
    for (let y = 0; y < alto; y += 700) {
      await cdp.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' })`)
      await espera(60)
      const r = await cdp.eval(`(() => { const s = [...document.querySelectorAll('.sinparto')].filter(e => { const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight })
        return [s.length, s.filter(e => e.getClientRects().length > 1).length] })()`)
      vistosN = Math.max(vistosN, r[0]); partidos += r[1]
    }
    filas.push([vistosN > 0 && partidos === 0, `nombres con guion partidos en la lista: ${partidos} (hasta ${vistosN} a la vista)`])

    // aviso repetido
    await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    const region = 'document.querySelector(".solo-lector[role=status]").textContent'
    // Deshacer sale al DESMARCAR: marcar una pendiente, desmarcarla, deshacer
    // y desmarcarla otra vez → dos «Pendiente: X» seguidos
    const id = await cdp.eval(`(() => { const c = document.querySelector('.card:not(.vista)'); c.querySelector('.checkbox').click(); return c.id })()`)
    await espera(400)
    await cdp.eval(`document.getElementById(${JSON.stringify(id)}).querySelector('.checkbox').click()`)
    await cdp.hasta(`!!document.querySelector('.deshacer')`, 3000)
    const t1 = await cdp.eval(region)
    await cdp.eval(`document.querySelector('.deshacer button').click()`)
    await espera(400)
    await cdp.eval(`document.getElementById(${JSON.stringify(id)}).querySelector('.checkbox').click()`)
    await cdp.hasta(`!!document.querySelector('.deshacer')`, 3000)
    const t2 = await cdp.eval(region)
    filas.push([t1.trim() === t2.trim() && t1 !== t2 && t1.length > 10, `mismo aviso dos veces, región distinta: ${JSON.stringify(t1)} → ${JSON.stringify(t2)}`])

    // ficha desplazada: el asa lleva franja del color de la hoja y va por
    // encima del contenido (el texto asomaba cortado alrededor, 21 sep)
    await cdp.eval(`document.querySelector('.deshacer button')?.click()`)
    await cdp.eval(`document.querySelector('.card .abrir').click()`)
    await cdp.hasta(`!!document.querySelector('.modal')`, 3000)
    await espera(900)
    const asa = y => cdp.eval(`(() => { const m = document.querySelector('.modal'); m.scrollTop = ${y}; const b = getComputedStyle(m, '::before'); return { sombra: b.boxShadow, z: b.zIndex, fondo: getComputedStyle(m).backgroundColor } })()`)
    const a0 = await asa(0); await espera(300); const a1 = await asa(400); await espera(300)
    const a1b = await asa(400)
    filas.push([/^rgba\(0, 0, 0, 0\)/.test(a0.sombra) && a1b.sombra.startsWith(a1b.fondo) && a1b.z === '2', `asa de la ficha: sin franja arriba (${a0.sombra.slice(0, 18)}), con franja al bajar (${a1b.sombra.slice(0, 18)} = ${a1b.fondo}), z ${a1b.z}`])
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await espera(700)

    // diario de Perfil: 6 filas por meses y «Ver N más» abre el resto
    await navega('#stats')
    await cdp.hasta(`!!document.querySelector('.diario')`, 4000)
    const d0 = await cdp.eval(`({ filas: document.querySelectorAll('.diario-fila').length, meses: document.querySelectorAll('.diario-mes').length, boton: document.querySelector('.diario-ver')?.textContent })`)
    await cdp.eval(`document.querySelector('.diario-ver').click()`)
    await espera(300)
    const d1 = await cdp.eval(`({ filas: document.querySelectorAll('.diario-fila').length, entran: document.querySelectorAll('.diario-fila.entra').length, meses: [...document.querySelectorAll('.diario-mes')].map(m => m.textContent), boton: document.querySelector('.diario-ver')?.textContent })`)
    filas.push([d0.filas === 6 && d0.meses >= 1 && /24/.test(d0.boton) && d1.filas === 30 && d1.entran === 24 && d1.meses.length >= 2 && /menos/.test(d1.boton), `diario: ${d0.filas} filas («${d0.boton}») → ${d1.filas} (${d1.entran} entran en cascada) en ${d1.meses.join(', ')} («${d1.boton}»)`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 3).join(' | ')}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe('detalles · móvil 390', filas)
}

// logro desbloqueado en el momento: sin progreso, marcar el primer título
// saca «Primer paso» arriba y en la región viva; tocarlo lleva a los logros;
// una marca que no desbloquea nada no saca aviso
{
  const { cdp, navega, cierra, errores } = await abre()
  const filas = []
  try {
    await navega('#crono')
    await espera(2600) // lo que cambia al arrancar no avisa
    const antes = await cdp.eval(`!!document.querySelector('.logro-aviso')`)
    await cdp.eval(`document.querySelector('.card:not(.vista) .checkbox').click()`)
    await cdp.hasta(`!!document.querySelector('.logro-aviso')`, 2000).catch(() => {})
    const r = await cdp.eval(`({ nombre: document.querySelector('.logro-aviso-nombre')?.textContent, region: [...document.querySelectorAll('.solo-lector[role=status]')].map(e => e.textContent).find(t => /Logro/.test(t)) })`)
    filas.push([!antes && r.nombre === 'Primer paso' && /Logro desbloqueado: Primer paso/.test(r.region || ''), `aviso de logro al marcar el primero: «${r.nombre}», región «${r.region}»`])
    await cdp.eval(`document.querySelector('.logro-aviso').click()`)
    await espera(900)
    const ir = await cdp.eval(`({ hash: location.hash, aviso: !!document.querySelector('.logro-aviso'), nuevo: !!document.querySelector('.logro.nuevo') })`)
    filas.push([ir.hash === '#stats' && !ir.aviso && ir.nuevo, `tocarlo lleva a los logros (${ir.hash}, «Nuevo» ${ir.nuevo}) y se cierra (${!ir.aviso})`])
    await navega('#crono')
    await espera(2600)
    await cdp.eval(`document.querySelector('.card:not(.vista) .checkbox').click()`)
    await espera(600)
    const otra = await cdp.eval(`!!document.querySelector('.logro-aviso')`)
    filas.push([!otra, `una marca sin logro no avisa (${otra})`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe('detalles · logro desbloqueado', filas)
}

for (const ancho of [1280, 1600]) {
  const { cdp, navega, cierra, errores } = await abre({ movil: false, ancho, alto: 900, siembra })
  const filas = []
  try {
    await navega('#crono')
    await espera(1500)
    await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await espera(300)
    const m = await cdp.eval(`(() => { const s = document.querySelector('.stats').getBoundingClientRect(), t = document.querySelector('.hero h1').getBoundingClientRect(), w = document.querySelector('.hero').getBoundingClientRect()
      return { stats: Math.round(s.width), hero: Math.round(w.width), junto: s.top < t.bottom } })()`)
    if (ancho === 1280) filas.push([!m.junto && Math.abs(m.stats - m.hero) <= 2, `1280: cifras bajo el titular a lo ancho (${m.stats} de ${m.hero} px)`])
    else filas.push([m.junto && m.stats <= 880, `1600: cifras junto al titular (${m.junto}), ${m.stats} px`])
    // dos columnas salvo con una saga plegada, que va a una a propósito
    const l = await cdp.eval(`({ cols: getComputedStyle(document.querySelector('main.crono')).gridTemplateColumns, plegada: !!document.querySelector('main.crono .saga.plegada') })`)
    const dos = /^[\d.]+px [\d.]+px$/.test(l.cols)
    filas.push([dos !== l.plegada, `lista: ${l.cols}${l.plegada ? ' (una saga plegada: una columna)' : ''}`])
    // «Siguiente» con carátula y «Marcar» dentro de su celda (21 sep 2026)
    const sg = await cdp.eval(`(() => { const s = document.querySelector('.siguiente-stat')?.getBoundingClientRect(), b = document.querySelector('.siguiente-marcar')?.getBoundingClientRect(), i = document.querySelector('.stat-sig-img')
      return s && b ? { dentro: b.width > 40 && b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom, img: !!i && i.getBoundingClientRect().width > 30 } : null })()`)
    filas.push([!!sg && sg.dentro && sg.img, `«Siguiente» con carátula y «Marcar» dentro de la tarjeta: ${JSON.stringify(sg)}`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length}`])
  } catch (e) { filas.push([false, 'la sonda se cayó: ' + e.message]) } finally { await cierra() }
  malas += informe(`detalles · escritorio ${ancho}`, filas)
}
process.exitCode = malas ? 1 : 0
