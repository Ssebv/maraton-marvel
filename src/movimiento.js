// Movimiento con física (14 sep 2026), con Motion (motion.dev).
// Lo que entra solo (hojas, iconos, casillas, pulsaciones) va en CSS con
// muelles que Motion convierte a `linear()` (scripts/muelles.mjs → tokens
// --muelle-* de styles.css): cero JavaScript por fotograma. Aquí queda lo que
// no puede ser CSS porque depende del dedo o de dónde está cada cosa:
//  · soltar una hoja o una capa arrastrada: vuelve o se va con la VELOCIDAD
//    que llevaba el dedo, no con una duración fija;
//  · tirar más allá del tope: goma elástica, como el scroll de iOS;
//  (el indicador de la opción activa se movía aquí con un muelle en JS; desde
//  el 16 sep 2026 es una animación WAAPI en el compositor: ver useIndicador)
// Solo se importa `animateValue`, el motor de muelles (7 kB comprimido): el
// `animate` completo de Motion pesaba 21 kB y aquí no hacía falta nada más.
import { useLayoutEffect, useRef } from 'react'
import { animateValue } from 'motion'

export const reducido = () => typeof window !== 'undefined' && !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Muelles con rigidez y amortiguación (no duración): así heredan la velocidad
// del gesto. `volver` pasa unos píxeles de largo y asienta; `irse` no rebota
// (sale de la pantalla).
export const MUELLE = {
  volver: { type: 'spring', stiffness: 520, damping: 34 },
  irse: { type: 'spring', stiffness: 280, damping: 34 },
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

// Indicador de la opción activa de un grupo (pestañas, subvistas, modos).
// Uso: const [grupo, indicador] = useIndicador(clave) — `ref={grupo}` en el
// contenedor y `<span className="indicador" ref={indicador} aria-hidden />`
// como PRIMER hijo. La activa es la que lleva aria-current="page" o
// aria-pressed="true". Se coloca sin animar la primera vez (y cuando el grupo
// se vuelve a montar, p. ej. el dock al pasar a <body> en móvil) y viajando en
// cada cambio de `clave`.
//
// 16 sep 2026 («al cambiar de Maratón a Perfil va a trompicones»): antes lo
// movía un muelle de Motion en JavaScript, un estilo por fotograma en el hilo
// principal, justo el que está ocupado pintando la sección nueva (medido con
// la CPU a ×4: 64 ms de render a Perfil). Ahora es una animación WAAPI solo de
// `transform`, que corre en el compositor aunque el hilo principal esté
// ocupado: el tamaño final se escribe una vez y el viaje es FLIP (translate +
// scale desde la caja vieja). A mitad de camino se estira en horizontal y se
// afina un poco, como una gota, con la curva del token --muelle. Si se toca
// otra opción a mitad, sale desde donde se ve en ese instante.
const cajaVisible = (i, final) => {
  const m = new DOMMatrixReadOnly(getComputedStyle(i).transform === 'none' ? undefined : getComputedStyle(i).transform)
  return { x: m.e, y: m.f, w: final.w * m.a, h: final.h * m.d }
}
const curvaMuelle = () => {
  const cs = getComputedStyle(document.documentElement)
  // «350ms» con muelles, «.24s» en la reserva sin linear()
  const txt = cs.getPropertyValue('--muelle-dur').trim()
  const dur = (parseFloat(txt) || 0.35) * (/ms$/.test(txt) ? 1 : 1000)
  const curva = cs.getPropertyValue('--muelle-curva').trim()
  const vale = curva && typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', curva)
  return { duration: dur, easing: vale ? curva : 'cubic-bezier(.22, 1, .36, 1)' }
}
export function useIndicador(clave) {
  const grupo = useRef(null)
  const indicador = useRef(null)
  const ultimo = useRef(null) // { el, d } — la caja final escrita
  useLayoutEffect(() => {
    const g = grupo.current, i = indicador.current
    if (!g || !i) return undefined
    g.classList.add('con-indicador')
    i.style.transformOrigin = '0 0'
    const escribe = d => {
      i.style.width = d.w + 'px'
      i.style.height = d.h + 'px'
      i.style.transform = `translate(${d.x}px, ${d.y}px)`
    }
    const coloca = animar => {
      const act = g.querySelector('[aria-current="page"], [aria-pressed="true"], [aria-checked="true"]')
      const previo = ultimo.current && ultimo.current.el === i ? ultimo.current.d : null
      if (!act || !act.offsetWidth) { i.style.opacity = '0'; ultimo.current = { el: i, d: null }; return }
      const d = { x: act.offsetLeft, y: act.offsetTop, w: act.offsetWidth, h: act.offsetHeight }
      const aparece = i.style.opacity === '0' || !previo
      i.style.opacity = ''
      if (previo && previo.x === d.x && previo.y === d.y && previo.w === d.w && previo.h === d.h) return
      // lo que se ve AHORA (quizá a mitad de un viaje) antes de cortar
      const desde = !aparece && animar && !reducido() && i.animate ? cajaVisible(i, previo) : null
      i.getAnimations().forEach(a => a.cancel())
      escribe(d)
      ultimo.current = { el: i, d }
      if (!desde || !d.w || !d.h) return
      const dx = d.x - desde.x
      if (Math.abs(dx) < 1 && Math.abs(d.y - desde.y) < 1 && Math.abs(d.w - desde.w) < 1) return
      const fl = c => `translate(${c.x}px, ${c.y}px) scale(${c.w / d.w}, ${c.h / d.h})`
      // la gota: a medio viaje, más ancha según la distancia y un poco más fina
      const wMedio = (desde.w + d.w) / 2, hMedio = (desde.h + d.h) / 2
      const estira = 1 + Math.min(0.35, Math.abs(dx) / (wMedio * 4))
      const afina = hMedio >= 16 ? 1 - (estira - 1) * 0.3 : 1
      const medio = { w: wMedio * estira, h: hMedio * afina }
      medio.x = (desde.x + d.x) / 2 - (medio.w - wMedio) / 2
      medio.y = (desde.y + d.y) / 2 + (hMedio - medio.h) / 2
      i.animate([
        { transform: fl(desde) },
        { transform: fl(medio), offset: 0.45 },
        { transform: fl(d) },
      ], curvaMuelle())
    }
    // se mide en el fotograma siguiente, cuando el navegador maqueta de todas
    // formas: medir aquí mismo (efecto de layout) forzaba maquetar la página
    // nueva entera dentro del cambio de sección (21 ms con la CPU a ×4)
    const raf = requestAnimationFrame(() => coloca(true))
    // las fuentes que llegan tarde, el giro del móvil o cambiar de idioma
    // cambian el ancho de las opciones: se recoloca sin animar
    let primera = true
    const ro = new ResizeObserver(() => { if (primera) { primera = false; return } coloca(false) })
    ro.observe(g)
    for (const n of g.children) if (n !== i) ro.observe(n)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [clave])
  return [grupo, indicador]
}
