// Movimiento con física (14 sep 2026), con Motion (motion.dev).
// Lo que entra solo (hojas, iconos, casillas, pulsaciones) va en CSS con
// muelles que Motion convierte a `linear()` (scripts/muelles.mjs → tokens
// --muelle-* de styles.css): cero JavaScript por fotograma. Aquí queda lo que
// no puede ser CSS porque depende del dedo o de dónde está cada cosa:
//  · soltar una hoja o una capa arrastrada: vuelve o se va con la VELOCIDAD
//    que llevaba el dedo, no con una duración fija;
//  · tirar más allá del tope: goma elástica, como el scroll de iOS;
//  · el indicador de la opción activa, que viaja de una a otra con un muelle
//    y se puede interrumpir a mitad sin saltos.
// Solo se importa `animateValue`, el motor de muelles (7 kB comprimido): el
// `animate` completo de Motion pesaba 21 kB y aquí no hacía falta nada más.
import { useLayoutEffect, useRef } from 'react'
import { animateValue } from 'motion'

export const reducido = () => typeof window !== 'undefined' && !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Muelles con rigidez y amortiguación (no duración): así heredan la velocidad
// del gesto. `volver` pasa unos píxeles de largo y asienta; `irse` no rebota
// (sale de la pantalla); `indicador` apenas se pasa.
export const MUELLE = {
  volver: { type: 'spring', stiffness: 520, damping: 34 },
  irse: { type: 'spring', stiffness: 280, damping: 34 },
  indicador: { type: 'spring', stiffness: 560, damping: 42 },
}

// La goma de iOS: cuanto más tiras, menos se mueve; nunca pasa de `dim`.
export const goma = (d, dim) => (1 - 1 / (d * 0.55 / Math.max(1, dim) + 1)) * dim

// Velocidad del dedo en px/s con las muestras de los últimos 80 ms. Si el dedo
// se paró antes de soltar, la velocidad es cero: soltar quieto no es un latigazo.
export function velocimetro() {
  let m = []
  return {
    anota(t, v) {
      m.push([t, v])
      while (m.length > 2 && t - m[0][0] > 80) m.shift()
    },
    lee(tFin) {
      if (m.length < 2) return 0
      const [t0, v0] = m[0], [t1, v1] = m[m.length - 1]
      if (tFin - t1 > 60 || t1 <= t0) return 0
      return (v1 - v0) / (t1 - t0) * 1000
    },
  }
}

const opciones = (tipo, desde, hasta, velocidad, pinta, alAcabar) => ({
  keyframes: [desde, hasta], ...MUELLE[tipo], velocity: velocidad,
  restDelta: 0.5, restSpeed: 10, onUpdate: pinta, onComplete: alAcabar,
})

// Un número que va de `desde` a `hasta` con muelle; `pinta` recibe cada valor.
// Devuelve el control (stop) o null si hay que reducir movimiento.
export function muelle(desde, hasta, tipo, velocidad, pinta, alAcabar) {
  if (reducido()) { pinta(hasta); alAcabar && alAcabar(); return null }
  return animateValue(opciones(tipo, desde, hasta, velocidad, pinta, alAcabar))
}

// Un valor que persigue a su destino con muelle y, si el destino cambia a
// mitad de camino, sale desde donde esté con la velocidad que llevaba.
function pista(alCambiar) {
  const p = { v: null, destino: null, vel: 0, anim: null }
  const para = () => { if (p.anim) { p.anim.stop(); p.anim = null } }
  p.salta = n => { para(); p.v = p.destino = n; p.vel = 0 }
  p.va = n => {
    if (p.v == null || reducido()) { p.salta(n); alCambiar(); return }
    if (n === p.destino) return
    para()
    p.destino = n
    if (n === p.v) { p.vel = 0; return }
    let tAnt = performance.now(), vAnt = p.v
    p.anim = animateValue(opciones('indicador', p.v, n, p.vel, x => {
      const t = performance.now()
      if (t > tAnt) { p.vel = (x - vAnt) / (t - tAnt) * 1000; tAnt = t; vAnt = x }
      p.v = x
      alCambiar()
    }, () => { p.v = n; p.vel = 0; p.anim = null; alCambiar() }))
  }
  p.para = para
  return p
}

// Indicador de la opción activa de un grupo (pestañas, subvistas, modos).
// Uso: const [grupo, indicador] = useIndicador(clave) — `ref={grupo}` en el
// contenedor y `<span className="indicador" ref={indicador} aria-hidden />`
// como PRIMER hijo. La activa es la que lleva aria-current="page" o
// aria-pressed="true". Se coloca sin animar la primera vez (y cuando el grupo
// se vuelve a montar, p. ej. el dock al pasar a <body> en móvil) y con muelle
// en cada cambio de `clave`. Se mueve con transform; el ancho solo se escribe
// si cambia (en el dock todas las pestañas miden lo mismo y no se toca nunca),
// y cuando cambia es la excepción consciente a «solo transform y opacity»: es
// un elemento absoluto sin hijos y su ancho no recoloca a nadie.
export function useIndicador(clave) {
  const grupo = useRef(null)
  const indicador = useRef(null)
  const estado = useRef(null)
  useLayoutEffect(() => {
    const g = grupo.current, i = indicador.current
    if (!g || !i) return undefined
    g.classList.add('con-indicador')
    const nuevo = !estado.current || estado.current.el !== i
    if (nuevo) {
      if (estado.current) ['x', 'y', 'w', 'h'].forEach(k => estado.current[k].para())
      const escrito = { t: '', w: '', h: '' }
      const escribe = () => {
        const s = estado.current
        const t = `translate(${s.x.v}px, ${s.y.v}px)`, w = s.w.v + 'px', h = s.h.v + 'px'
        if (t !== escrito.t) i.style.transform = escrito.t = t
        if (w !== escrito.w) i.style.width = escrito.w = w
        if (h !== escrito.h) i.style.height = escrito.h = h
      }
      estado.current = { el: i, escribe, x: pista(escribe), y: pista(escribe), w: pista(escribe), h: pista(escribe) }
    }
    const s = estado.current
    const coloca = animar => {
      const act = g.querySelector('[aria-current="page"], [aria-pressed="true"]')
      if (!act || !act.offsetWidth) { i.style.opacity = '0'; return }
      const d = { x: act.offsetLeft, y: act.offsetTop, w: act.offsetWidth, h: act.offsetHeight }
      const aparece = i.style.opacity === '0'
      i.style.opacity = ''
      if (!animar || aparece) { for (const k in d) s[k].salta(d[k]); s.escribe() }
      else for (const k in d) s[k].va(d[k])
    }
    coloca(!nuevo)
    // las fuentes que llegan tarde, el giro del móvil o cambiar de idioma
    // cambian el ancho de las opciones: se recoloca sin animar
    let primera = true
    const ro = new ResizeObserver(() => { if (primera) { primera = false; return } coloca(false) })
    ro.observe(g)
    for (const n of g.children) if (n !== i) ro.observe(n)
    return () => ro.disconnect()
  }, [clave])
  return [grupo, indicador]
}
