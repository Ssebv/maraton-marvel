#!/usr/bin/env node
// Los puntos de la revisión HIG del 15 sep 2026 atendidos el 16:
//  1. «¿Qué te pareció?» sigue en la ficha tras tocar una estrella, pintada y
//     como radiogroup;
//  2. el aviso Deshacer se anuncia por una región viva que ya existía, no se
//     va mientras se toca, se va al soltar y admite dos líneas;
//  3. las cabeceras de saga del índice llevan flecha.
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 30).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const pendiente = ids[40]

const { cdp, navega, cierra, errores } = await abre({ siembra: { 'maraton-marvel-v1': vistas } })
const filas = []
try {
  // 1 · estrellas rápidas
  await navega(`?t=${pendiente}`)
  await cdp.hasta(`!!document.querySelector('.modal .accion-principal')`)
  await espera(600)
  await cdp.eval(`document.querySelector('.modal .accion-principal').click()`)
  await cdp.hasta(`!!document.querySelector('.valora-rapido')`, 4000)
  await cdp.eval(`document.querySelectorAll('.valora-rapido .estrella')[3].click()`)
  await espera(400)
  const v = await cdp.eval(`(() => {
    const b = document.querySelector('.valora-rapido'); if (!b) return null
    const est = [...b.querySelectorAll('.estrella')]
    return { on: est.filter(e => e.classList.contains('on')).length, marcada: est.findIndex(e => e.getAttribute('aria-checked') === 'true'),
      grupo: b.querySelector('.estrellas').getAttribute('role'), pregunta: b.querySelector('.valora-rapido-pregunta').textContent,
      guardada: (JSON.parse(localStorage.getItem('maraton-marvel-notas-v1') || '{}')[${JSON.stringify(pendiente)}] || {}).p }
  })()`)
  filas.push([!!v, `«¿Qué te pareció?» sigue tras tocar la 4.ª estrella: ${!!v}`])
  filas.push([v && v.on === 4 && v.marcada === 3 && v.guardada === 4, `pintadas ${v && v.on}, aria-checked en la ${v && v.marcada + 1}.ª, guardada ${v && v.guardada}`])
  filas.push([v && v.grupo === 'radiogroup' && v.pregunta === 'Tu valoración', `role=${v && v.grupo}, rótulo «${v && v.pregunta}»`])

  // 2 · Deshacer
  await navega('#crono')
  await espera(1200)
  const antes = await cdp.eval(`(() => { const r = document.querySelector('.solo-lector[role=status]'); return r ? { texto: r.textContent } : null })()`)
  filas.push([antes && antes.texto === '', `región viva montada y vacía antes del aviso: ${JSON.stringify(antes)}`])
  await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
  await espera(300)
  await cdp.eval(`document.querySelector('.card.vista .checkbox').click()`)
  await cdp.hasta(`!!document.querySelector('.deshacer')`, 3000)
  const aviso = await cdp.eval(`(() => { const r = document.querySelector('.solo-lector[role=status]'), d = document.querySelector('.deshacer')
    return { vivo: r && r.textContent, rol: d.getAttribute('role'), clamp: getComputedStyle(d.querySelector('.deshacer-texto')).webkitLineClamp } })()`)
  filas.push([/Deshacer disponible/.test(aviso.vivo) && !aviso.rol, `la región viva dice «${aviso.vivo}» y el aviso visible no duplica el rol (${aviso.rol})`])
  filas.push([aviso.clamp === '2', `texto del aviso hasta ${aviso.clamp} líneas`])
  // centrado y con ancho de verdad: con left:50% se quedaba en ~195 px
  await espera(500)
  const caja = await cdp.eval(`(() => { const r = document.querySelector('.deshacer').getBoundingClientRect(), t = document.querySelector('.deshacer-texto')
    return { izq: Math.round(r.left), der: Math.round(innerWidth - r.right), ancho: Math.round(r.width), cortado: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1 } })()`)
  filas.push([Math.abs(caja.izq - caja.der) <= 2 && caja.izq >= 16, `aviso centrado: ${caja.izq} px a la izquierda, ${caja.der} a la derecha, ${caja.ancho} de ancho`])
  // se toca a los 3,5 s: quedaban 1,5 y al soltar debe dar al menos 3
  await espera(3500)
  await cdp.eval(`document.querySelector('.deshacer').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
  await espera(3000)
  const sigue = await cdp.eval(`!!document.querySelector('.deshacer')`)
  filas.push([sigue, `con el dedo encima desde el 3,5 s, sigue a los 6,5 s (se iba a los 5): ${sigue}`])
  await cdp.eval(`document.querySelector('.deshacer').dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))`)
  await espera(2000)
  const aun = await cdp.eval(`!!document.querySelector('.deshacer')`)
  await espera(1800)
  const fuera = await cdp.eval(`!document.querySelector('.deshacer')`)
  const vacia = await cdp.eval(`document.querySelector('.solo-lector[role=status]').textContent === ''`)
  filas.push([aun && fuera && vacia, `al soltar quedan 3 s: a los 2 s sigue (${aun}), a los 3,8 s se fue (${fuera}), región vacía (${vacia})`])

  // 3 · índice
  await cdp.eval(`window.scrollTo({ top: 3000, behavior: 'instant' })`)
  await cdp.hasta(`!!document.querySelector('.donde.visible')`, 4000)
  await espera(400)
  await cdp.eval(`document.querySelector('.donde').click()`)
  await cdp.hasta(`!!document.querySelector('.modal.indice .indice-saga')`, 4000)
  const ind = await cdp.eval(`(() => { const cabs = [...document.querySelectorAll('.indice-saga-cab')]
    return { cabs: cabs.length, flechas: cabs.filter(c => { const s = c.querySelector('.indice-chevron'); return s && s.getBoundingClientRect().width === 16 }).length,
      dentro: cabs.every(c => { const s = c.querySelector('.indice-chevron'); return !s || s.getBoundingClientRect().right <= c.getBoundingClientRect().right + 5 }) } })()`)
  filas.push([ind.cabs > 0 && ind.flechas === ind.cabs && ind.dentro, `índice: ${ind.flechas} de ${ind.cabs} cabeceras con flecha de 16 px, dentro de su botón (${ind.dentro})`])
  filas.push([errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 3).join(' | ')}`])
} catch (e) {
  filas.push([false, 'la sonda se cayó: ' + e.message])
} finally { await cierra() }
process.exitCode = informe('revisión HIG', filas) ? 1 : 0
