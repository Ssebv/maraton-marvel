import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { DATA, ESTRENOS, JOYA_MIN, KEY, MULTIVERSO } from './data.js'
import { POSTERS } from './posters.js'
import { PEOPLE } from './people.js'
import { EPISODES } from './episodes.js'
import { TMDB, TMDB_KEY, DESPLAZA_TEMPORADA } from './tmdb.js'
import { FOTOGRAMAS } from './fondos.js'
import { ORDEN_CONGELADO } from './orden.js'
import { PLATAFORMAS, PAISES } from './plataformas.js'
import { TITULOS_LATAM } from './titulos.js'
import { TITULOS_EN } from './titulos-en.js'
import { latiniza } from './latam.js'
import { EPISODIOS_LATAM } from './episodios-latam.js'
import { EPISODIOS_EN } from './episodios-en.js'
import { EN_TEXTOS } from './en-textos.js'
import { clasifica, guardaArchivo, leeArchivo, borraArchivo, metaArchivo, abreComic, fmtTam, listaArchivos, persistencia, pidePersistencia, espacio } from './lector.js'
import { NUBE, urlGoogle, enviaEnlace, canjeaCodigo, refrescaToken, salirNube, rest } from './nube.js'
import { goma, muelle, useIndicador, velocimetro } from './movimiento.js'

const KEY_EPS = 'maraton-marvel-eps-v1'
const KEY_SYNC = 'maraton-marvel-sync-v1'
const KEY_NOTAS = 'maraton-marvel-notas-v1'
const KEY_COMPACTO = 'maraton-marvel-compacto'
// Sagas plegadas a mano: { xmen: 1 | 0 }. Sin entrada, la saga decide sola
// (plegada si estaba completa al cargar la página).
const KEY_PLEGADAS = 'maraton-marvel-plegadas-v1'
// El lote «Marvel One-Shots (cortos)» se partió en cinco tarjetas, cada una en
// su año (11 sep 2026): quien lo tenía marcado, o en una lista, conserva la
// marca en las cinco. El id viejo sigue ocupando su bit en orden.js.
// Cambio de vista con View Transitions: la vista vieja y la nueva se funden
// con un desliz corto hacia el lado de la pestaña (adelante / atrás) y las
// barras se quedan quietas. Sin soporte o con «reducir movimiento», directo.
// Mientras dura el render de la transición las tarjetas no se escalonan:
// una animación por cambio, no dos.
let enTransicion = false
function conTransicion(dir, fn) {
  if (typeof document === 'undefined' || !document.startViewTransition || movimientoReducido()) { fn(); return }
  const raiz = document.documentElement
  raiz.dataset.vt = dir
  const t = document.startViewTransition(() => {
    enTransicion = true
    try { flushSync(fn) } finally { enTransicion = false }
  })
  // si se salta (otra transición encima, pestaña oculta), `ready` se rechaza:
  // sin recogerlo salía «AbortError: Transition was skipped» en consola
  t.ready.catch(() => {})
  vigilaTransicion(t)
  t.finished.finally(() => { if (raiz.dataset.vt === dir) delete raiz.dataset.vt })
}
// La carátula vuela entre la ficha y lo que tocaste (14 sep 2026): una
// transición de elemento compartido. Al abrir, la carátula de la tarjeta (de
// la lista, la galería, una tira, «Siguiente»…) lleva view-transition-name
// «portada» en la instantánea vieja y la de la ficha en la nueva: el
// navegador la hace volar de un sitio a otro por ENCIMA de todo, siguiendo a
// la hoja mientras sube, sin que la recorte su overflow. Al cerrar, vuelve a
// su tarjeta. El resto de la página no se funde (la raíz se pinta viva, ver
// styles.css): la hoja entra y sale con sus animaciones de siempre. Mientras
// vuela se esconde la pieza de ORIGEN, que en la página viva seguiría en su
// sitio; la de destino no: un elemento con nombre no se pinta en la raíz, y
// escondido dejaba vacía la imagen nueva del vuelo (volaba medio transparente).
// Sin View Transitions queda el vuelo de reserva de Detalle (WAAPI).
let vueloEnCurso = false
let ultimoToque = null
// Mientras dura una View Transition (el vuelo de la carátula al cerrar, ~0,5 s;
// el desliz al cambiar de pestaña) el navegador pone su capa encima de toda la
// página y el toque cae en <html>, no en lo que hay debajo: cerrar la ficha y
// volver a tocar la tarjeta enseguida hacía la animación y no abría nada
// (`::view-transition{pointer-events:none}` no lo evita en Chrome). Así que un
// toque durante la transición la termina ya, y el clic que cayó en <html> se
// entrega a lo que de verdad está bajo el dedo.
// iOS: un campo dentro de una hoja fija (tus notas en la ficha, el nombre de
// una lista, el código de sincronización) quedaba bajo el teclado, porque
// Safari desplaza la página y no la hoja. Cuando el teclado termina de subir
// (~350 ms), si el campo quedó fuera de lo visible se centra en su hoja.
if (typeof window !== 'undefined') {
  window.addEventListener('focusin', e => {
    const campo = e.target
    if (!ES_TACTIL || !campo || !campo.matches || !campo.matches('input:not([type=file]):not([type=checkbox]), textarea, select')) return
    if (!campo.closest('.overlay .modal')) return
    setTimeout(() => {
      if (document.activeElement !== campo) return
      const alto = window.visualViewport ? window.visualViewport.height : window.innerHeight
      const r = campo.getBoundingClientRect()
      if (r.bottom > alto - 16 || r.top < 0) campo.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
  })
}
let vtActiva = null
function vigilaTransicion(t) {
  vtActiva = t
  t.finished.finally(() => { if (vtActiva === t) vtActiva = null })
}
if (typeof window !== 'undefined') {
  let saltadaEn = -1e9
  window.addEventListener('pointerdown', () => {
    if (!vtActiva) return
    try { vtActiva.skipTransition() } catch {}
    saltadaEn = performance.now()
  }, { capture: true, passive: true })
  window.addEventListener('click', e => {
    if (e.target !== document.documentElement || performance.now() - saltadaEn > 1000) return
    e.stopPropagation()
    const { clientX: x, clientY: y } = e
    // la capa de la transición se retira en el siguiente pintado
    setTimeout(() => {
      const el = document.elementFromPoint(x, y)
      const destino = el && el !== document.documentElement && el.closest('button, a[href], [role="button"], summary')
      if (destino) destino.click()
    }, 32)
  }, { capture: true })
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', e => { ultimoToque = { el: e.target, t: performance.now() }; precargaFicha(e.target) }, { capture: true, passive: true })
}
// Al apoyar el dedo sobre un título (tarjeta, galería, línea temporal) se piden
// ya sus datos de TMDB y, en cuanto llegan, su fotograma: entre el toque y que
// la ficha termina de subir pasan ~500 ms, y sin esto el fotograma empezaba a
// bajar solo cuando la ficha pedía los datos (medido: llegaba a ~680 ms con
// 4G lenta). Lo ya cacheado no hace petición.
function precargaFicha(el) {
  const nodo = el && el.closest && el.closest('[id^="card-"], [id^="gal-"], [id^="tl-"]')
  if (!nodo || el.closest('.checkbox')) return
  const itemId = nodo.id.slice(nodo.id.indexOf('-') + 1)
  const pide = ruta => { const img = new Image(); img.decoding = 'async'; img.src = `${TMDB_IMG}w780${ruta}` }
  // el fotograma conocido (src/fondos.js) empieza a bajar ya, sin esperar a la API
  if (FOTOGRAMAS[itemId]) pide(FOTOGRAMAS[itemId])
  cargaTmdb(itemId).then(d => { if (d && d.fondo && d.fondo !== FOTOGRAMAS[itemId]) pide(d.fondo) }).catch(() => {})
}
const enPantalla = (el, dentro) => {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  const c = dentro ? dentro.getBoundingClientRect() : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }
  return r.width > 16 && r.height > 16 && r.bottom > c.top + 16 && r.top < c.bottom - 16 && r.right > c.left && r.left < c.right
}
const puedeVolar = () => typeof document !== 'undefined' && !!document.startViewTransition && !movimientoReducido()
// la carátula de lo último que se tocó (hace menos de 1,5 s) o, si no, la de
// la tarjeta del título en la lista
function portadaEnLista(id) {
  const cands = []
  if (ultimoToque && performance.now() - ultimoToque.t < 1500 && ultimoToque.el.isConnected && !ultimoToque.el.closest('[role="dialog"]')) {
    const cont = ultimoToque.el.closest('button, a, [role="button"], article, li')
    if (cont) cands.push(cont.matches('.cover') ? cont : cont.querySelector('.cover'))
  }
  const tarjeta = document.getElementById('card-' + id)
  if (tarjeta) cands.push(tarjeta.querySelector('.cover'))
  return cands.find(el => enPantalla(el)) || null
}
// Un vuelo puede empezar antes de que acabe el anterior (cerrar y volver a
// abrir enseguida): el nuevo salta al viejo, y la limpieza del viejo llega
// tarde. Por eso cada vuelo quita el nombre a lo que dejó nombrado otro (dos
// «portada» a la vez invalidan la transición) y solo limpia lo suyo si sigue
// siendo el último.
let vueloGen = 0
let conNombre = []
function vuela(dir, desde, antes, fn, despues) {
  const raiz = document.documentElement
  const escondidos = []
  let hasta = null
  const gen = ++vueloGen
  conNombre.forEach(el => { if (el !== desde) el.style.viewTransitionName = '' })
  conNombre = [desde]
  desde.style.viewTransitionName = 'portada'
  raiz.dataset.vt = dir
  const t = document.startViewTransition(async () => {
    desde.style.viewTransitionName = ''
    desde.style.visibility = 'hidden'; escondidos.push(desde)
    if (antes) antes(escondidos)
    enTransicion = true; vueloEnCurso = true
    try { flushSync(fn) } finally { enTransicion = false; vueloEnCurso = false }
    hasta = despues()
    if (!hasta) return
    hasta.style.viewTransitionName = 'portada'
    conNombre.push(hasta)
    // sin decodificar, la instantánea nueva saldría vacía y la carátula
    // parpadearía al aterrizar; como mucho 120 ms de espera
    if (hasta.decode) await Promise.race([hasta.decode().catch(() => {}), new Promise(r => setTimeout(r, 120))])
  })
  // si se salta (otra transición encima, pestaña oculta), `ready` se rechaza:
  // sin recogerlo salía «AbortError: Transition was skipped» en consola
  t.ready.catch(() => {})
  vigilaTransicion(t)
  t.finished.finally(() => {
    if (hasta && gen === vueloGen) hasta.style.viewTransitionName = ''
    escondidos.forEach(el => { el.style.visibility = '' })
    if (raiz.dataset.vt === dir) delete raiz.dataset.vt
  })
}
function abreConVuelo(id, abre) {
  const desde = puedeVolar() && portadaEnLista(id)
  if (!desde) { abre(); return }
  ultimoOrigen = { id, el: desde }
  vuela('portada', desde, null, abre, () => document.querySelector('.overlay:not(.saliendo) .modal-portada .cover'))
}
// de dónde salió la última ficha: al cerrar vuelve ahí aunque no sea una
// tarjeta de la lista (galería, tiras, «Siguiente»), si sigue en pantalla
let ultimoOrigen = null
const origenDe = id => (ultimoOrigen && ultimoOrigen.id === id && enPantalla(ultimoOrigen.el) && ultimoOrigen.el) || portadaEnLista(id)
function cierraConVuelo(id, cierra) {
  // En el móvil la ficha es una hoja que baja: la carátula se va con ella. El
  // vuelo de vuelta hacía dos movimientos a la vez en sentidos opuestos (la
  // hoja hacia abajo y la carátula hacia arriba, a su tarjeta) y durante unos
  // cuadros se veían dos carátulas; se leía forzado. Abrir sí vuela.
  if (window.matchMedia('(max-width:720px)').matches) { cierra(); return }
  const marco = document.querySelector('.overlay:not(.saliendo) .modal-portada')
  const modal = marco && marco.closest('.modal')
  const desde = marco && marco.querySelector('.cover')
  // no si la hoja se arrastró fuera (ya se ha ido con el dedo) ni si la
  // carátula quedó fuera de la hoja al desplazarla
  const hasta = puedeVolar() && id && modal && !modal.style.transform && enPantalla(desde, modal) && origenDe(id)
  if (!hasta) { cierra(); return }
  // la ficha sale sin su carátula: la que se ve es la que vuela
  vuela('portada-cierra', desde, esc => { marco.style.visibility = 'hidden'; esc.push(marco) }, cierra, () => hasta)
}
// cuántas series tiene la bóveda de animación: se cuenta, no se escribe
const N_SERIES_BOVEDA = DATA.find(s => s.saga === 'animacion').eras.reduce((a, e) => a + e.items.length, 0)
// todos los títulos del catálogo (la bienvenida decía «117» escrito a mano)
const N_TITULOS_TODOS = DATA.reduce((a, s) => a + s.eras.reduce((b, e) => b + e.items.length, 0), 0)
const ONESHOTS_PARTIDOS = ['oneshot-martillo', 'oneshot-consultor', 'oneshot-item47', 'oneshot-rey', 'oneshot-carter']
const migraMarcas = v => {
  if (!v || !v.oneshots) return v
  const n = { ...v }
  ONESHOTS_PARTIDOS.forEach(id => { if (!n[id]) n[id] = v.oneshots })
  delete n.oneshots
  return n
}
// Modo sin spoilers: '1' esconde sinopsis, post-créditos y títulos de episodio
// de lo que aún no has visto (la ficha deja mostrarlos a mano).
const KEY_SPOILERS = 'maraton-marvel-spoilers-v1'
const KEY_LISTAS = 'maraton-marvel-listas-v1'
const KEY_PANEL = 'maraton-marvel-panel-v1'
const KEY_FONDO = 'maraton-marvel-fondo-v1'
const KEY_RESCATE = 'maraton-marvel-rescate-v1'
// página por la que va cada cómic leído en la app: { id: { p, t } }
const KEY_LECTOR = 'maraton-marvel-lector-v1'
// horario de visionado: { dias: [0-6], min, hora: 'HH:MM', exp }
const KEY_HORARIO = 'maraton-marvel-horario-v1'
// Dónde ibas en la lista, para volver ahí al reabrir la app. En iPhone la app
// instalada se descarga al cambiar a otra app un rato y vuelve a arrancar
// desde arriba: se guarda el ancla (tarjeta bajo la barra) y se restaura si
// hace menos de una hora y es la misma vista. Pasada la hora se empieza por
// el principio, que es lo que espera quien abre la app un día nuevo.
const KEY_POSICION = 'maraton-marvel-posicion-v1'
const POSICION_VIVA = 60 * 60 * 1000
// el navegador no restaura por píxel al recargar: con content-visibility las
// tarjetas fuera de pantalla no tienen aún su alto y caía en cualquier sitio
try { history.scrollRestoration = 'manual' } catch {}
function leePosicion(vista) {
  try {
    const g = JSON.parse(localStorage.getItem(KEY_POSICION))
    if (!g || g.v !== vista || typeof g.t !== 'number' || Date.now() - g.t > POSICION_VIVA) return {}
    return { [vista]: { id: typeof g.id === 'string' ? g.id : null, dy: Number(g.dy) || 0, y: Number(g.y) || 0 } }
  } catch { return {} }
}
// sesión de la cuenta (Supabase): { uid, rt, nombre, email, foto }
const KEY_CUENTA = 'maraton-marvel-cuenta-v1'
// Entrar con Google o con enlace por correo vuelve a la app con ?code= (o
// ?error=). Se lee al cargar el módulo: el efecto de la URL la reescribe al
// montar y se lo llevaría por delante.
const RETORNO_CUENTA = (() => {
  try {
    const p = new URLSearchParams(window.location.search)
    const code = p.get('code')
    if (code && /^[\w-]{8,100}$/.test(code)) return { code }
    const error = p.get('error_description') || p.get('error')
    return error ? { error: error.slice(0, 200) } : null
  } catch { return null }
})()
// #u/nombre abre el perfil de esa persona en la comunidad (enlace compartido)
const PERFIL_EN_URL = (() => {
  try { const m = window.location.hash.match(/^#u\/([a-z0-9_]{3,20})$/); return m ? m[1] : null } catch { return null }
})()
const enlacePerfil = nombre => `${window.location.origin}${window.location.pathname}#u/${nombre}`
// #c/direccion abre una comunidad; #i/codigo es una invitación
const COMUNIDAD_EN_URL = (() => {
  try { const m = window.location.hash.match(/^#c\/([a-z0-9-]{3,30})$/); return m ? m[1] : null } catch { return null }
})()
const INVITACION_EN_URL = (() => {
  try { const m = window.location.hash.match(/^#i\/([a-f0-9]{16,40})$/); return m ? m[1] : null } catch { return null }
})()
const enlaceComunidad = d => `${window.location.origin}${window.location.pathname}#c/${d}`
const enlaceInvitacion = c => `${window.location.origin}${window.location.pathname}#i/${c}`
const TIPOS_COMUNIDAD = [
  ['publica', 'Pública', 'Public', 'Cualquiera la encuentra y entra.', 'Anyone can find it and join.'],
  ['invitacion', 'Con invitación', 'Invite only', 'Cualquiera la ve; para entrar hace falta un enlace de invitación.', 'Anyone can see it; joining needs an invite link.'],
  ['privada', 'Privada', 'Private', 'Solo la ven sus miembros; se entra con invitación.', 'Only members can see it; joining needs an invite.'],
]
const CAMPOS_COMUNIDAD = 'id,direccion,nombre,descripcion,portada,tipo,dueno,miembros,creado'
const saneaComunidad = x => (esObj(x) && typeof x.id === 'string' && typeof x.direccion === 'string' && typeof x.nombre === 'string' ? {
  id: x.id, direccion: x.direccion.slice(0, 30), nombre: x.nombre.slice(0, 60),
  descripcion: typeof x.descripcion === 'string' ? x.descripcion.slice(0, 500) : '',
  portada: typeof x.portada === 'string' ? x.portada : null,
  tipo: ['publica', 'invitacion', 'privada'].includes(x.tipo) ? x.tipo : 'publica',
  dueno: typeof x.dueno === 'string' ? x.dueno : null, miembros: Number(x.miembros) || 0,
} : null)
// Retos: plantillas sacadas de data.js (un título nuevo entra solo)
const idsDeSaga = saga => (DATA.find(s => s.saga === saga) || { eras: [] }).eras.flatMap(e => e.items.map(i => i.id))
const PLANTILLAS_RETO = [
  { id: 'express', es: 'Ruta express', en: 'Express route', ids: () => DATA.filter(s => s.saga === 'xmen' || s.saga === 'ucm').flatMap(s => s.eras.flatMap(e => e.items.filter(i => i.exp).map(i => i.id))) },
  { id: 'xmen', es: 'Toda la saga X-Men', en: 'The whole X-Men saga', ids: () => idsDeSaga('xmen') },
  { id: 'infinito', es: 'La Saga del Infinito', en: 'The Infinity Saga', ids: () => { const u = idsDeSaga('ucm'); const i = u.indexOf('endgame'); return i >= 0 ? u.slice(0, i + 1) : u } },
  { id: 'ucm', es: 'Todo el UCM', en: 'The whole MCU', ids: () => idsDeSaga('ucm') },
]
// ── Discusiones (fase 4) ──
const ETIQUETAS_HILO = [['charla', 'Charla', 'Chat'], ['teoria', 'Teoría', 'Theory'], ['resena', 'Reseña', 'Review'], ['pregunta', 'Pregunta', 'Question'], ['noticia', 'Noticia', 'News'], ['meme', 'Meme', 'Meme']]
const CAMPOS_HILO = 'id,comunidad,titulo,etiqueta,titulo_ref,episodio_ref,votos,respuestas,fijado,oculto,creado,autor:perfiles!hilos_autor_fkey(id,nombre,avatar)'
const saneaHilo = x => (esObj(x) && typeof x.id === 'number' && typeof x.titulo === 'string' ? {
  id: x.id, comunidad: typeof x.comunidad === 'string' ? x.comunidad : null, titulo: x.titulo.slice(0, 140),
  etiqueta: ETIQUETAS_HILO.some(e => e[0] === x.etiqueta) ? x.etiqueta : 'charla',
  titulo_ref: typeof x.titulo_ref === 'string' ? x.titulo_ref : null, episodio_ref: typeof x.episodio_ref === 'string' ? x.episodio_ref : null,
  votos: Number(x.votos) || 0, respuestas: Number(x.respuestas) || 0, fijado: x.fijado === true, oculto: x.oculto === true,
  creado: Date.parse(x.creado) || Date.now(), cuerpo: typeof x.cuerpo === 'string' ? x.cuerpo.slice(0, 10000) : '',
  editado: typeof x.editado === 'string',
  autor: esObj(x.autor) && typeof x.autor.nombre === 'string' ? { id: x.autor.id, nombre: x.autor.nombre, avatar: x.autor.avatar } : { id: null, nombre: '?', avatar: null },
} : null)
// El velo es una cortesía, no un secreto (el texto llega al teléfono): un hilo
// de un episodio o título que aún no marcaste sale borroso hasta que lo marques
// o pidas verlo igual.
const hiloVelado = (h, vistas, eps) => (h.episodio_ref ? !(eps[h.episodio_ref] || (h.titulo_ref && vistas[h.titulo_ref]))
  : h.titulo_ref ? !vistas[h.titulo_ref] : false)
// «T2·E6», o solo «E6» si el título tiene una sola temporada en data.js: Loki
// (T2) guarda sus episodios como temporada 1 y decía «Loki (T2) · T1·E6»
const etiquetaEp = (id, t, n) => {
  const l = EPISODES[id] || []
  return l.length && l.every(e => e.s === l[0].s) ? `E${n}` : `${tr('T', 'S')}${t}·E${n}`
}
const nombreRef = h => {
  const d = h.titulo_ref && buscaItem(h.titulo_ref)
  if (!d) return ''
  const partes = h.episodio_ref ? h.episodio_ref.split(':') : null
  return partes && partes.length === 3 ? `${d.item.t} · ${etiquetaEp(partes[0], partes[1], partes[2])}` : d.item.t
}

// >!spoiler!< tapado hasta tocarlo, y @menciones que abren el perfil
function Spoiler({ texto }) {
  const [ver, setVer] = useState(false)
  return (
    <button type="button" className={`spoiler${ver ? ' visto' : ''}`} aria-expanded={ver} onClick={() => setVer(true)}>
      <span aria-hidden={!ver}>{texto}</span>
      {!ver && <span className="solo-lector">{tr('Spoiler oculto: toca para verlo', 'Hidden spoiler: tap to reveal')}</span>}
    </button>
  )
}
function CuerpoTexto({ texto, onPerfil, className = 'hilo-cuerpo' }) {
  const partes = []
  const re = />!([\s\S]+?)!<|@([a-z0-9_]{3,20})/g
  let i = 0, m, k = 0
  while ((m = re.exec(texto))) {
    if (m.index > i) partes.push(texto.slice(i, m.index))
    const nombre = m[2]
    partes.push(m[1] != null ? <Spoiler key={k++} texto={m[1]} />
      : <button key={k++} type="button" className="mencion" onClick={() => onPerfil(nombre)}>@{nombre}</button>)
    i = re.lastIndex
  }
  if (i < texto.length) partes.push(texto.slice(i))
  return <p className={className}>{partes}</p>
}

function HilosLista({ hilos, vistas, eps, onAbrir, conRef = true }) {
  return (
    <ul className="hilos-lista">
      {hilos.map(h => {
        const velado = hiloVelado(h, vistas, eps)
        const et = ETIQUETAS_HILO.find(e => e[0] === h.etiqueta)
        return (
          <li key={h.id}>
            <button className={`hilo-fila${h.oculto ? ' oculto' : ''}`} onClick={() => onAbrir(h.id)}>
              <span className="hilo-fila-cab">
                <span className="tipo opc">{et ? tr(et[1], et[2]) : ''}</span>
                {h.fijado && <span className="tipo esp">{tr('Fijado', 'Pinned')}</span>}
                {velado && <span className="tipo serie">{tr('Sin ver', 'Unwatched')}</span>}
                {h.oculto && <span className="tipo plat">{tr('Oculto', 'Hidden')}</span>}
              </span>
              <span className="hilo-fila-titulo">{h.titulo}</span>
              <span className="hilo-fila-meta">
                @{h.autor.nombre} · {haceCuanto(h.creado)}{conRef && h.titulo_ref ? ` · ${nombreRef(h)}` : ''}
                {' · '}▲ {h.votos} · {h.respuestas === 1 ? tr('1 respuesta', '1 reply') : tr(`${h.respuestas} respuestas`, `${h.respuestas} replies`)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Un foro: el abierto de un título (desde su ficha) o el de una comunidad.
function ForoHoja({ saliendo, foro, cuenta, token, vistas, eps, recarga, onCerrar, onAbrirHilo, onEntrar, onCreado }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [orden, setOrden] = useState('nuevos')
  const [hilos, setHilos] = useState(null)
  const [escribiendo, setEscribiendo] = useState(false)
  const [puede, setPuede] = useState(null)
  const [grupo, indicador] = useIndicador(orden)
  const d = foro.tipo === 'titulo' ? buscaItem(foro.id) : null
  const episodios = d && EPISODES[foro.id] ? EPISODES[foro.id] : null
  useEffect(() => {
    let vivo = true
    setHilos(null)
    ;(async () => {
      try {
        const t = cuenta ? await token() : null
        const filtro = foro.tipo === 'titulo' ? `comunidad=is.null&titulo_ref=eq.${foro.id}` : `comunidad=eq.${foro.id}`
        const filas = await rest(t, `hilos?${filtro}&select=${CAMPOS_HILO}&order=${orden === 'nuevos' ? 'fijado.desc,creado.desc' : 'fijado.desc,votos.desc,respuestas.desc'}&limit=40`)
        if (vivo) setHilos((Array.isArray(filas) ? filas : []).map(saneaHilo).filter(Boolean))
      } catch { if (vivo) setHilos([]) }
    })()
    return () => { vivo = false }
  }, [foro.tipo, foro.id, orden, recarga, cuenta && cuenta.uid])
  // en una comunidad escriben sus miembros; en el foro abierto, cuentas de más de 24 h (lo decide la base)
  useEffect(() => {
    if (!cuenta || foro.tipo !== 'comunidad') { setPuede(!!cuenta); return undefined }
    let vivo = true
    token().then(t => rest(t, `membresias?comunidad=eq.${foro.id}&usuario=eq.${cuenta.uid}&select=papel`))
      .then(f => { if (vivo) setPuede(Array.isArray(f) && f.length > 0) }).catch(() => { if (vivo) setPuede(false) })
    return () => { vivo = false }
  }, [foro.id, cuenta && cuenta.uid])
  const titulo = foro.tipo === 'titulo' ? (d ? d.item.t : foro.id) : foro.nombre
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-labelledby="foro-titulo">
      <div className="modal foro-hoja" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <p className="valoracion-label">{foro.tipo === 'titulo' ? tr('Conversación sobre', 'Conversation about') : tr('Conversación en', 'Conversation in')}</p>
          <h2 className="modal-titulo" id="foro-titulo">{titulo}</h2>
          <div className="modal-acciones">
            {!cuenta && <button className="accion-principal" onClick={onEntrar}>{tr('Entra para escribir', 'Sign in to post')}</button>}
            {cuenta && puede && !escribiendo && <button className="accion-principal" onClick={() => setEscribiendo(true)}>{tr('Nuevo hilo', 'New thread')}</button>}
            {cuenta && puede === false && <p className="ajuste-pista">{tr('Únete a la comunidad para escribir.', 'Join the community to post.')}</p>}
            <div className="tabs grafica-modos" ref={grupo} role="group" aria-label={tr('Orden', 'Order')}>
              <span className="indicador" ref={indicador} aria-hidden="true" />
              <button type="button" className="tab" aria-pressed={orden === 'nuevos'} onClick={() => setOrden('nuevos')}>{tr('Nuevos', 'New')}</button>
              <button type="button" className="tab" aria-pressed={orden === 'populares'} onClick={() => setOrden('populares')}>{tr('Populares', 'Top')}</button>
            </div>
          </div>
          {escribiendo && <NuevoHilo foro={foro} episodios={episodios} cuenta={cuenta} token={token} onCancelar={() => setEscribiendo(false)}
            onCreado={id => { setEscribiendo(false); onCreado(); onAbrirHilo(id) }} />}
          {hilos === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
            : hilos.length === 0 ? <p className="ajuste-pista">{tr('Aún no hay hilos. Abre el primero.', 'No threads yet. Start the first one.')}</p>
            : <HilosLista hilos={hilos} vistas={vistas} eps={eps} onAbrir={onAbrirHilo} conRef={foro.tipo !== 'titulo'} />}
        </div>
      </div>
    </div>
  )
}

function NuevoHilo({ foro, episodios, cuenta, token, onCancelar, onCreado }) {
  const [etiqueta, setEtiqueta] = useState('charla')
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [episodio, setEpisodio] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const publica = async e => {
    e.preventDefault()
    if (titulo.trim().length < 3) return
    setEnviando(true); setError('')
    try {
      const body = { autor: cuenta.uid, etiqueta, titulo: titulo.trim(), cuerpo: cuerpo.trim() }
      if (foro.tipo === 'titulo') { body.titulo_ref = foro.id; if (episodio) body.episodio_ref = `${foro.id}:${episodio}` }
      else body.comunidad = foro.id
      const filas = await rest(await token(), 'hilos?select=id', { method: 'POST', prefer: 'return=representation', body })
      if (!Array.isArray(filas) || typeof filas[0].id !== 'number') throw new Error('respuesta')
      onCreado(filas[0].id)
    } catch (er) {
      setEnviando(false)
      setError(er && /24 h/.test(er.message) ? tr('Los foros abiertos se abren a las 24 h de crear la cuenta. Mientras, escribe en tus comunidades.', 'Open forums unlock 24 h after creating your account. Meanwhile, post in your communities.')
        : er && /enlace no permitido/.test(er.message) ? tr('Ese enlace no se puede publicar (sitios de piratería).', 'That link can’t be posted (piracy sites).')
        : er && /límite/.test(er.message) ? tr('Has publicado mucho en poco rato: espera un poco.', 'You’ve posted a lot in a short time: wait a bit.')
        : tr('No se pudo publicar. Inténtalo otra vez.', 'Could not post. Try again.'))
    }
  }
  return (
    <form className="nuevo-hilo" onSubmit={publica}>
      <span className="ajuste-ops" role="radiogroup" aria-label={tr('Tipo de hilo', 'Thread type')}>
        {ETIQUETAS_HILO.map(([id, es, en]) => (
          <button type="button" key={id} className="chip-btn" role="radio" aria-checked={etiqueta === id} onClick={() => setEtiqueta(id)}>{tr(es, en)}</button>
        ))}
      </span>
      {episodios && (
        <label className="crea-edad">
          <span>{tr('Sobre', 'About')}</span>
          <select className="selector" value={episodio} onChange={e => setEpisodio(e.target.value)}>
            <option value="">{tr('La serie entera', 'The whole series')}</option>
            {episodios.map(ep => <option key={`${ep.s}:${ep.n}`} value={`${ep.s}:${ep.n}`}>{`${etiquetaEp(foro.id, ep.s, ep.n)} · ${ep.t}`}</option>)}
          </select>
        </label>
      )}
      <input className="busca sync-input" maxLength={140} placeholder={tr('Título del hilo', 'Thread title')} aria-label={tr('Título del hilo', 'Thread title')} value={titulo} onChange={e => setTitulo(e.target.value)} />
      <textarea className="busca sync-input comunidad-descripcion" maxLength={10000} rows={5} aria-label={tr('Texto', 'Text')}
        placeholder={tr('Escribe… Para esconder un spoiler: >!así!<', 'Write… To hide a spoiler: >!like this!<')} value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
      {error && <p className="import-error" role="alert">{error}</p>}
      <span className="ajuste-ops">
        <button className="accion-principal" type="submit" disabled={titulo.trim().length < 3 || enviando}>{enviando ? tr('Publicando…', 'Posting…') : tr('Publicar', 'Post')}</button>
        <button className="chip-btn" type="button" onClick={onCancelar}>{tr('Cancelar', 'Cancel')}</button>
      </span>
    </form>
  )
}

const MOTIVOS_REPORTE = [['spoiler', 'Spoiler sin avisar', 'Unmarked spoiler'], ['acoso', 'Acoso o insultos', 'Harassment or insults'], ['odio', 'Odio', 'Hate'], ['spam', 'Spam', 'Spam'], ['pirateria', 'Piratería', 'Piracy'], ['sexual', 'Contenido sexual', 'Sexual content'], ['datos', 'Datos personales', 'Personal data'], ['otro', 'Otro', 'Other']]
function Reportar({ tipo, refId, comunidad, cuenta, token }) {
  const [abierto, setAbierto] = useState(false)
  const [hecho, setHecho] = useState(false)
  if (!cuenta) return null
  if (hecho) return <span className="ajuste-pista" role="status">{tr('Reportado. Gracias.', 'Reported. Thanks.')}</span>
  if (!abierto) return <button type="button" className="hilo-accion" onClick={() => setAbierto(true)}>{tr('Reportar', 'Report')}</button>
  return (
    <span className="reportar">
      <select className="selector" aria-label={tr('Motivo', 'Reason')} defaultValue="" onChange={async e => {
        const motivo = e.target.value
        if (!motivo) return
        try {
          await rest(await token(), 'reportes', { method: 'POST', prefer: 'return=minimal', body: { reportante: cuenta.uid, tipo, ref: String(refId), comunidad: comunidad || null, motivo } })
          setHecho(true)
        } catch { setAbierto(false) }
      }}>
        <option value="" disabled>{tr('¿Por qué?', 'Why?')}</option>
        {MOTIVOS_REPORTE.map(([id, es, en]) => <option key={id} value={id}>{tr(es, en)}</option>)}
      </select>
      <button type="button" className="hilo-accion" onClick={() => setAbierto(false)}>{tr('Cancelar', 'Cancel')}</button>
    </span>
  )
}

function RespuestaForm({ hilo, padre, cuenta, token, onHecha, onCancelar, autoFocus }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <form className="respuesta-form" onSubmit={async e => {
      e.preventDefault()
      if (!texto.trim()) return
      setEnviando(true); setError('')
      try {
        await rest(await token(), 'respuestas', { method: 'POST', prefer: 'return=minimal', body: { hilo, padre: padre || null, autor: cuenta.uid, cuerpo: texto.trim() } })
        setTexto(''); setEnviando(false); onHecha()
      } catch (er) {
        setEnviando(false)
        setError(er && /enlace no permitido/.test(er.message) ? tr('Ese enlace no se puede publicar.', 'That link can’t be posted.')
          : er && /límite/.test(er.message) ? tr('Has respondido mucho en poco rato: espera un poco.', 'You’ve replied a lot in a short time: wait a bit.')
          : tr('No se pudo responder.', 'Could not reply.'))
      }
    }}>
      <textarea className="busca sync-input comunidad-descripcion" rows={3} maxLength={5000} autoFocus={autoFocus} aria-label={tr('Tu respuesta', 'Your reply')}
        placeholder={tr('Responde… (>!spoiler!<, @nombre)', 'Reply… (>!spoiler!<, @name)')} value={texto} onChange={e => setTexto(e.target.value)} />
      {error && <span className="import-error" role="alert">{error}</span>}
      <span className="ajuste-ops">
        <button className="chip-btn destacado" type="submit" disabled={!texto.trim() || enviando}>{enviando ? tr('Enviando…', 'Sending…') : tr('Responder', 'Reply')}</button>
        {onCancelar && <button className="chip-btn" type="button" onClick={onCancelar}>{tr('Cancelar', 'Cancel')}</button>}
      </span>
    </form>
  )
}

// Un hilo (#h/id): el texto (velado si toca), votos, respuestas en árbol de 3
// niveles, reportar y, para quien modera, ocultar y fijar.
function HiloHoja({ saliendo, id, cuenta, token, vistas, eps, onCerrar, onVerPerfil, onEntrar, onCambio }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [h, setH] = useState(null)
  const [resp, setResp] = useState([])
  const [votados, setVotados] = useState({ hilo: false, resp: {} })
  const [modera, setModera] = useState(false)
  const [revela, setRevela] = useState(false)
  const [respondiendo, setRespondiendo] = useState(null)
  const carga = async () => {
    try {
      const t = cuenta ? await token() : null
      const filas = await rest(t, `hilos?id=eq.${id}&select=${CAMPOS_HILO},cuerpo,editado`)
      const hilo = Array.isArray(filas) && saneaHilo(filas[0])
      if (!hilo) { setH(false); return }
      setH(hilo)
      const rs = await rest(t, `respuestas?hilo=eq.${id}&select=id,padre,profundidad,cuerpo,votos,hijos,oculto,creado,autor:perfiles!respuestas_autor_fkey(id,nombre,avatar)&order=creado.asc&limit=300`)
      const lista = (Array.isArray(rs) ? rs : []).filter(r => esObj(r) && typeof r.id === 'number' && typeof r.cuerpo === 'string' && esObj(r.autor))
      setResp(lista)
      if (cuenta) {
        const [vh, vr, mod] = await Promise.all([
          rest(t, `votos_hilos?usuario=eq.${cuenta.uid}&hilo=eq.${id}&select=hilo`),
          lista.length ? rest(t, `votos_respuestas?usuario=eq.${cuenta.uid}&respuesta=in.(${lista.map(r => r.id).join(',')})&select=respuesta`) : Promise.resolve([]),
          hilo.comunidad ? rest(t, 'rpc/modera', { method: 'POST', body: { c: hilo.comunidad } }) : rest(t, 'rpc/es_admin', { method: 'POST', body: {} }),
        ])
        setVotados({ hilo: Array.isArray(vh) && vh.length > 0, resp: Object.fromEntries((Array.isArray(vr) ? vr : []).map(v => [v.respuesta, true])) })
        setModera(mod === true)
      }
    } catch { setH('error') }
  }
  useEffect(() => { setH(null); carga() }, [id, cuenta && cuenta.uid])
  const ok = esObj(h)
  const velado = ok && !revela && hiloVelado(h, vistas, eps)
  const vota = async (tipo, rid) => {
    if (!cuenta) { onEntrar(); return }
    const ya = tipo === 'hilo' ? votados.hilo : !!votados.resp[rid]
    const t = await token()
    try {
      if (tipo === 'hilo') {
        if (ya) await rest(t, `votos_hilos?usuario=eq.${cuenta.uid}&hilo=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
        else await rest(t, 'votos_hilos', { method: 'POST', prefer: 'return=minimal', body: { usuario: cuenta.uid, hilo: id } })
      } else if (ya) await rest(t, `votos_respuestas?usuario=eq.${cuenta.uid}&respuesta=eq.${rid}`, { method: 'DELETE', prefer: 'return=minimal' })
      else await rest(t, 'votos_respuestas', { method: 'POST', prefer: 'return=minimal', body: { usuario: cuenta.uid, respuesta: rid } })
      await carga()
    } catch {}
  }
  const moderar = async (tipo, rid, accion) => {
    try { await rest(await token(), 'rpc/moderar', { method: 'POST', body: { tipo_in: tipo, id_in: rid, accion_in: accion } }); await carga(); onCambio() } catch {}
  }
  const borrar = async (tipo, rid) => {
    try {
      await rest(await token(), `${tipo === 'hilo' ? 'hilos' : 'respuestas'}?id=eq.${rid}`, { method: 'DELETE', prefer: 'return=minimal' })
      onCambio()
      if (tipo === 'hilo') onCerrar(); else await carga()
    } catch {}
  }
  // una respuesta cuyo padre no llega (oculto por moderación o de alguien que
  // bloqueaste) sube al primer nivel en vez de desaparecer con él (code-review)
  const idsResp = new Set(resp.map(r => r.id))
  const hijos = padre => resp.filter(r => (padre === null ? !r.padre || !idsResp.has(r.padre) : r.padre === padre))
  const pintaRespuesta = r => {
    const propia = cuenta && r.autor.id === cuenta.uid
    return (
      <li key={r.id} className={`respuesta${r.oculto ? ' oculto' : ''}`}>
        <div className="respuesta-cab">
          <button className="muro-quien" onClick={() => onVerPerfil(r.autor.nombre)}>@{r.autor.nombre}</button>
          <span className="muro-cuando">{haceCuanto(Date.parse(r.creado))}{r.oculto ? tr(' · oculta por moderación', ' · hidden by moderators') : ''}</span>
        </div>
        <CuerpoTexto texto={r.cuerpo} onPerfil={onVerPerfil} className="respuesta-cuerpo" />
        <div className="respuesta-acciones">
          <button type="button" className={`hilo-accion voto${votados.resp[r.id] ? ' hecho' : ''}`} aria-pressed={!!votados.resp[r.id]} onClick={() => vota('respuesta', r.id)}
            aria-label={tr(`Votar a favor, ${r.votos} votos`, `Upvote, ${r.votos} votes`)}>▲ {r.votos}</button>
          {cuenta && r.profundidad < 2 && <button type="button" className="hilo-accion" onClick={() => setRespondiendo(r.id)}>{tr('Responder', 'Reply')}</button>}
          {!propia && <Reportar tipo="respuesta" refId={r.id} comunidad={h.comunidad} cuenta={cuenta} token={token} />}
          {propia && r.hijos === 0 && <button type="button" className="hilo-accion" onClick={() => borrar('respuesta', r.id)}>{tr('Borrar', 'Delete')}</button>}
          {modera && <button type="button" className="hilo-accion" onClick={() => moderar('respuesta', r.id, r.oculto ? 'mostrar' : 'ocultar')}>{r.oculto ? tr('Mostrar', 'Unhide') : tr('Ocultar', 'Hide')}</button>}
        </div>
        {respondiendo === r.id && <RespuestaForm hilo={id} padre={r.id} cuenta={cuenta} token={token} autoFocus onCancelar={() => setRespondiendo(null)} onHecha={() => { setRespondiendo(null); carga(); onCambio() }} />}
        {hijos(r.id).length > 0 && <ul className="respuestas">{hijos(r.id).map(pintaRespuesta)}</ul>}
      </li>
    )
  }
  const et = ok && ETIQUETAS_HILO.find(e => e[0] === h.etiqueta)
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-label={ok ? h.titulo : tr('Hilo', 'Thread')}>
      <div className="modal hilo-hoja" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          {h === null && <p className="modal-res" role="status">{tr('Cargando hilo…', 'Loading thread…')}</p>}
          {h === false && <p className="modal-res" role="status">{tr('Este hilo no existe o no puedes verlo.', 'This thread doesn’t exist or you can’t see it.')}</p>}
          {h === 'error' && <p className="aviso-sin-red" role="status">{tr('No se pudo cargar. Revisa la conexión.', 'Could not load. Check your connection.')}</p>}
          {ok && (
            <>
              <span className="hilo-fila-cab">
                <span className="tipo opc">{et ? tr(et[1], et[2]) : ''}</span>
                {h.fijado && <span className="tipo esp">{tr('Fijado', 'Pinned')}</span>}
                {h.oculto && <span className="tipo plat">{tr('Oculto por moderación', 'Hidden by moderators')}</span>}
                {h.titulo_ref && <span className="hilo-ref">{nombreRef(h)}</span>}
              </span>
              <h2 className="modal-titulo">{h.titulo}</h2>
              <p className="perfil-cuenta">
                <button className="muro-quien" onClick={() => onVerPerfil(h.autor.nombre)}>@{h.autor.nombre}</button> · {haceCuanto(h.creado)}{h.editado ? tr(' · editado', ' · edited') : ''}
              </p>
              {h.cuerpo && (velado ? (
                <div className="hilo-velado">
                  <p className="hilo-cuerpo borroso" aria-hidden="true">{h.cuerpo.slice(0, 280)}</p>
                  <div className="hilo-velo">
                    <span>{tr(`Lo verás cuando marques ${nombreRef(h)}`, `You’ll see it once you mark ${nombreRef(h)}`)}</span>
                    <button className="chip-btn" onClick={() => setRevela(true)}>{tr('Ver igual', 'Show anyway')}</button>
                  </div>
                </div>
              ) : <CuerpoTexto texto={h.cuerpo} onPerfil={onVerPerfil} />)}
              <div className="respuesta-acciones hilo-acciones">
                <button type="button" className={`chip-btn voto${votados.hilo ? ' hecho' : ''}`} aria-pressed={votados.hilo} onClick={() => vota('hilo')}>▲ {h.votos}</button>
                {cuenta && h.autor.id !== cuenta.uid && <Reportar tipo="hilo" refId={h.id} comunidad={h.comunidad} cuenta={cuenta} token={token} />}
                {cuenta && h.autor.id === cuenta.uid && h.respuestas === 0 && <button type="button" className="hilo-accion" onClick={() => borrar('hilo', h.id)}>{tr('Borrar hilo', 'Delete thread')}</button>}
                {modera && <button type="button" className="hilo-accion" onClick={() => moderar('hilo', h.id, h.fijado ? 'desfijar' : 'fijar')}>{h.fijado ? tr('Desfijar', 'Unpin') : tr('Fijar', 'Pin')}</button>}
                {modera && <button type="button" className="hilo-accion" onClick={() => moderar('hilo', h.id, h.oculto ? 'mostrar' : 'ocultar')}>{h.oculto ? tr('Mostrar', 'Unhide') : tr('Ocultar', 'Hide')}</button>}
              </div>
              <section className="hilo-respuestas">
                <h3 className="grafica-titulo">{h.respuestas === 1 ? tr('1 respuesta', '1 reply') : tr(`${h.respuestas} respuestas`, `${h.respuestas} replies`)}</h3>
                {velado && resp.length > 0 ? <p className="ajuste-pista">{tr('Las respuestas también están veladas.', 'Replies are hidden too.')}</p>
                  : <ul className="respuestas">{hijos(null).map(pintaRespuesta)}</ul>}
                {cuenta ? (!h.oculto && respondiendo === null && <RespuestaForm hilo={id} cuenta={cuenta} token={token} onHecha={() => { carga(); onCambio() }} />)
                  : <button className="chip-btn" onClick={onEntrar}>{tr('Entra para responder', 'Sign in to reply')}</button>}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const haceCuanto = ts => {
  const s = (Date.now() - ts) / 1000
  const f = new Intl.RelativeTimeFormat(LOC(), { numeric: 'auto' })
  if (s < 60) return f.format(0, 'second')
  if (s < 3600) return f.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return f.format(-Math.round(s / 3600), 'hour')
  return f.format(-Math.round(s / 86400), 'day')
}
const direccionDe = nombre => nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
// El perfil público de la comunidad (tabla perfiles)
const CAMPOS_PERFIL = 'id,nombre,nombre_visible,avatar,bio,saga_favorita,priv_progreso,priv_resenas,priv_logros'
const PRIVACIDADES = ['publico', 'seguidores', 'privado']
const saneaPerfil = x => {
  if (!esObj(x) || typeof x.id !== 'string' || typeof x.nombre !== 'string') return null
  const priv = v => (PRIVACIDADES.includes(v) ? v : 'privado')
  return {
    id: x.id, nombre: x.nombre.slice(0, 20),
    nombre_visible: typeof x.nombre_visible === 'string' ? x.nombre_visible.slice(0, 40) : '',
    avatar: typeof x.avatar === 'string' ? x.avatar.slice(0, 40) : 'logan',
    bio: typeof x.bio === 'string' ? x.bio.slice(0, 280) : '',
    priv_progreso: priv(x.priv_progreso), priv_resenas: priv(x.priv_resenas), priv_logros: priv(x.priv_logros),
  }
}
// los avatares son carátulas del catálogo: no se suben fotos (nada que
// moderar ni que almacenar en el plan gratuito)
const AVATARES = ['logan', 'deadpool2', 'xmen97', 'first-class', 'ironman1', 'cap1', 'blackpanther', 'gotg1',
  'ragnarok', 'nwh', 'loki1', 'wandavision', 'msmarvel', 'moonknight', 'drstrange', 'xmen-tas']
// idioma de la app: 'es' (con el matiz del país) o 'en'
const KEY_IDIOMA = 'maraton-marvel-idioma-v1'

// Pósters propios (public/mini, 200 px) para el fondo del encabezado y las franjas de saga
const MURO = ['avengers1', 'endgame', 'logan', 'deadpool1', 'cap1', 'blackpanther',
  'dofp', 'first-class', 'drstrange', 'infinitywar', 'thor1', 'capmarvel']
// Un fotograma apaisado por saga (TMDB): recortar pósters verticales en una
// banda daba fragmentos sueltos que parecían un error de maquetación.
const FRANJA = ['xmen', 'ucm', 'comics', 'animacion']
const FONDOS = [
  { id: 'banner', nombre: 'Banner', en: 'Banner' },
  { id: 'muro', nombre: 'Muro', en: 'Wall' },
  { id: 'no', nombre: 'Sin fondo', en: 'No background' },
]

// El código de sincronización lo escribe cualquiera y trae la URL a la que la
// app hará PUT de todo el progreso. Comprobar que el texto CONTENGA "firebaseio"
// no vale: se lo cuelan como ruta (atacante.com/firebaseio.com), como parámetro,
// como fragmento o como subdominio falso (firebaseio.com.atacante.com). Aquí se
// mira el host de verdad, y solo por https.
const DOMINIOS_DB = ['.firebaseio.com', '.firebasedatabase.app']
function normalizaDbUrl(txt) {
  let u = (txt || '').trim().replace(/\/+$/, '')
  if (!u) return null
  if (!/^https?:\/\//.test(u)) u = 'https://' + u
  try {
    const url = new URL(u)
    if (url.protocol !== 'https:') return null
    if (!DOMINIOS_DB.some(d => url.hostname.endsWith(d))) return null
    // solo el origen: una ruta en el código sobra y es por donde se colaba
    return url.origin
  } catch { return null }
}
const codigoSync = (url, room) => btoa(unescape(encodeURIComponent(url + '|' + room)))
const decodificaSync = cod => {
  try {
    const [url, room] = decodeURIComponent(escape(atob(cod.trim()))).split('|')
    if (normalizaDbUrl(url) && room) return { url: normalizaDbUrl(url), room }
  } catch {}
  return null
}
const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// \u2500\u2500 Saneado de todo lo que entra de fuera \u2500\u2500
// Un try/catch protege de lo ilegible, no de un dato con la forma equivocada:
// una lista que sea objeto revienta en `listas.map`, y un texto que sea objeto
// revienta React entero. Lo peor es que estas cuatro estructuras se PERSISTEN,
// as\u00ed que un dato malo que entre una vez deja la app rota en cada arranque
// hasta borrar los datos del sitio. Por eso se sanean en los dos extremos: al
// recibirlas de la red y al leerlas del navegador.
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x)
// { clave: cu\u00e1ndo se marc\u00f3 } \u2014 vistas y episodios
const saneaMarcas = x => {
  if (!esObj(x)) return null
  const out = {}
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'number' && isFinite(v)) out[k] = v
    else if (v === 1 || v === true) out[k] = 1
  }
  return out
}
const saneaPlegadas = x => {
  if (!esObj(x)) return null
  const out = {}
  for (const [k, v] of Object.entries(x)) if (v === 0 || v === 1) out[k] = v
  return out
}
// { id: { p: 1-5, txt: "\u2026" } }
const saneaLector = x => {
  if (!esObj(x)) return null
  const out = {}
  for (const [k, v] of Object.entries(x)) {
    if (esObj(v) && Number.isInteger(v.p) && Number.isInteger(v.t) && v.p >= 0 && v.t > 0) out[k] = { p: Math.min(v.p, v.t - 1), t: v.t, ...(Number.isInteger(v.f) ? { f: v.f } : {}) }
  }
  return out
}
const saneaNotas = x => {
  if (!esObj(x)) return null
  const out = {}
  for (const [k, n] of Object.entries(x)) {
    if (!esObj(n)) continue
    const limpia = {}
    if (typeof n.p === 'number' && n.p >= 1 && n.p <= 5) limpia.p = Math.round(n.p)
    if (typeof n.txt === 'string') limpia.txt = n.txt.slice(0, 4000)
    if (Object.keys(limpia).length) out[k] = limpia
  }
  return out
}
// [ { id, nombre, items: [ids], prog: { id: 1 } } ]
const saneaListas = x => {
  if (!Array.isArray(x)) return null
  return x.filter(esObj).map(l => ({
    id: typeof l.id === 'string' ? l.id : Math.random().toString(36).slice(2, 9),
    nombre: typeof l.nombre === 'string' ? l.nombre.slice(0, 80) : 'Lista',
    items: Array.isArray(l.items) ? l.items.filter(i => typeof i === 'string') : [],
    prog: saneaMarcas(l.prog) || {},
  }))
}
// { dias: [días de la semana como los cuenta getDay()], min: por sesión,
//   hora: 'HH:MM', exp: solo ruta express }. Sin días o sin minutos no hay
//   horario: se descarta entero.
const saneaHorario = x => {
  if (!esObj(x)) return null
  const dias = Array.isArray(x.dias) ? [...new Set(x.dias.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : []
  if (!dias.length) return null
  if (typeof x.min !== 'number' || !isFinite(x.min) || x.min < 15 || x.min > 600) return null
  const hora = typeof x.hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora) ? x.hora : '21:00'
  return { dias, min: Math.round(x.min), hora, exp: x.exp !== false }
}
const saneaCuenta = x => {
  if (!esObj(x)) return null
  if (typeof x.uid !== 'string' || !x.uid || typeof x.rt !== 'string' || !x.rt) return null
  return {
    uid: x.uid.slice(0, 128),
    rt: x.rt,
    nombre: typeof x.nombre === 'string' ? x.nombre.slice(0, 80) : '',
    email: typeof x.email === 'string' ? x.email.slice(0, 120) : '',
    foto: typeof x.foto === 'string' && x.foto.startsWith('https://') ? x.foto : '',
    ...(x.fusion === true ? { fusion: true } : {}),
  }
}
// La vista que estás mirando —búsqueda y filtros— vive en la URL: así se puede
// compartir «los pendientes de X-Men que son joyas» y, de paso, sobrevive a una
// recarga, que antes se la llevaba por delante.
const FILTROS_URL = ['series', 'opc', 'vistas', 'joyas', 'express', 'disney']
const sinFiltros = () => Object.fromEntries(FILTROS_URL.map(k => [k, false]))
const leeVistaUrl = () => {
  try {
    const p = new URLSearchParams(window.location.search)
    const puestos = (p.get('f') || '').split(',')
    return {
      busca: (p.get('q') || '').slice(0, 80),
      filtros: Object.fromEntries(FILTROS_URL.map(k => [k, puestos.includes(k)])),
    }
  } catch { return { busca: '', filtros: sinFiltros() } }
}

// Lee una clave del navegador ya saneada; si estaba corrupta, la limpia sola.
const leeGuardado = (clave, sanea, porDefecto) => {
  try {
    const crudo = localStorage.getItem(clave)
    if (crudo == null) return porDefecto
    const limpio = sanea(JSON.parse(crudo))
    if (limpio == null) {
      // Descartarlo a secas era peor que el problema: si lo roto es el
      // progreso, borrarlo lo pierde para siempre. Se aparta con otro nombre,
      // que además entra en la copia de seguridad y en la del salvavidas.
      try { localStorage.setItem(clave + '-roto', crudo) } catch {}
      localStorage.removeItem(clave)
      return porDefecto
    }
    return limpio
  } catch { return porDefecto }
}

// ── Dos órdenes distintos, que antes eran el mismo y por eso se peleaban ──
// ORDEN_VISTA es el de la pantalla: sale de data.js y cambia cuando un estreno
// nuevo se coloca en su hueco cronológico, que es donde tiene que ir.
// ORDEN_IDS y ORDEN_EPS son los de los BITS: vienen congelados de orden.js y no
// se mueven nunca. Lo que aún no esté congelado entra al final. Así un título
// nuevo puede salir en medio de la lista sin corromper un solo enlace
// compartido — que es exactamente lo que pasaba antes.
const congela = (congelado, actuales) => {
  const yaEsta = new Set(congelado)
  return [...congelado, ...actuales.filter(x => !yaEsta.has(x))]
}
const ORDEN_VISTA = (() => {
  const a = []
  DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => a.push(it.id))))
  return a
})()
const ORDEN_IDS = congela(ORDEN_CONGELADO.ids, ORDEN_VISTA)
const ORDEN_EPS = congela(ORDEN_CONGELADO.eps, (() => {
  const a = []
  ORDEN_VISTA.forEach(id => (EPISODES[id] || []).forEach(e => a.push(`${id}:${e.s}:${e.n}`)))
  return a
})())
const aBits = (marcas, orden) => {
  const bytes = new Uint8Array(Math.ceil(orden.length / 8))
  orden.forEach((clave, i) => { if (marcas[clave]) bytes[i >> 3] |= 1 << (i & 7) })
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const deBits = (b64, orden) => {
  const set = {}
  try {
    const bin = atob((b64 || '').replace(/-/g, '+').replace(/_/g, '/'))
    orden.forEach((clave, i) => { if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) set[clave] = 1 })
  } catch {}
  return set
}

// Acepta un enlace de perfil compartible (o solo su código) y devuelve el snapshot
const parsePerfilCod = entrada => {
  try {
    let cod = (entrada || '').trim()
    if (cod.includes('perfil=')) cod = new URL(cod).searchParams.get('perfil') || ''
    const j = JSON.parse(decodeURIComponent(escape(atob(cod.replace(/-/g, '+').replace(/_/g, '/')))))
    // el código llega por URL: puede venir de cualquiera y con cualquier forma.
    // Sin comprobar tipos, un nombre que no sea texto deja la app en blanco.
    if (!j || typeof j !== 'object' || typeof j.v !== 'string' || !j.v) return null
    const nombre = typeof j.n === 'string' && j.n.trim() ? j.n.trim().slice(0, 40) : 'Alguien'
    return {
      n: nombre,
      v: j.v,
      e: typeof j.e === 'string' ? j.e : '',
      t: typeof j.t === 'number' && isFinite(j.t) ? j.t : null,
    }
  } catch { return null }
}
// El duelo y el club comparan «el maratón», que es lo mismo que cuenta la
// cabecera: las películas y series que se ven. Los cómics y la bóveda llevan su
// cuenta aparte, y si aquí entraran, la misma persona vería 10/134 en el duelo
// y 10/91 dos pantallas más allá.
const ID_MARATON = (() => {
  const s = new Set()
  DATA.forEach(sg => { if (sg.saga === 'comics' || sg.saga === 'animacion') return
    sg.eras.forEach(era => era.items.forEach(it => s.add(it.id))) })
  return s
})()
const resumenMaraton = (vistasSet, epsSet) => {
  let n = 0, min = 0
  DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
    if (!ID_MARATON.has(it.id)) return
    if (vistasSet[it.id]) { n++; min += it.d || 0 }
    else if (it.tipo === 'serie' && EPISODES[it.id]) {
      const tot = EPISODES[it.id].length
      const vistos = EPISODES[it.id].filter(ep => epsSet[`${it.id}:${ep.s}:${ep.n}`]).length
      if (vistos) min += Math.round((it.d || 0) * vistos / tot)
    }
  })))
  return { n, min }
}

// ── TMDB: tráilers, fotogramas y dónde ver (caché de 7 días en el navegador) ──
const TMDB_IMG = 'https://image.tmdb.org/t/p/'
// El mapeo id-nuestro → TMDB, leído al revés: sirve para saber si una
// película de la filmografía de alguien está en el maratón.
const TMDB_INV = {}
Object.keys(TMDB).forEach(id => {
  const m = TMDB[id]
  if (Array.isArray(m) && m.length === 2) TMDB_INV[`${m[1]}:${m[0]}`] = id
})
const tmdbMem = {}
const clave = n => (n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const personaMem = {}
async function cargaPersona(tmdbId) {
  const idi = tmdbIdioma()
  const k = (idi === 'en-US' ? 'en:' : '') + tmdbId
  if (personaMem[k]) return personaMem[k]
  const ls = 'maraton-marvel-persona-v3:' + k
  try {
    const g = JSON.parse(localStorage.getItem(ls))
    if (g && Date.now() - g.t < 30 * 864e5) { personaMem[k] = g.d; return g.d }
  } catch {}
  const j = await tmdbJson(`/person/${tmdbId}?append_to_response=combined_credits`, idi)
  const d = {
    bio: typeof j.biography === 'string' ? j.biography.trim() : '',
    nacimiento: typeof j.birthday === 'string' ? j.birthday : null,
    lugar: typeof j.place_of_birth === 'string'
      ? (j.place_of_birth.replace(/\s*\[[^\]]*\]/g, '').trim() || null) : null,
    foto: typeof j.profile_path === 'string' ? j.profile_path : null,
    // solo los títulos que están EN el maratón: la lista completa serían
    // cientos de entradas por persona en localStorage
    enMaraton: (() => {
      const cc = j.combined_credits || {}
      const todo = [...(Array.isArray(cc.cast) ? cc.cast : []), ...(Array.isArray(cc.crew) ? cc.crew : [])]
      return [...new Set(todo
        .filter(c => c && typeof c.id === 'number' && (c.media_type === 'movie' || c.media_type === 'tv'))
        .map(c => TMDB_INV[`${c.media_type}:${c.id}`])
        .filter(Boolean))]
    })(),
  }
  personaMem[k] = d
  try { localStorage.setItem(ls, JSON.stringify({ t: Date.now(), d })) } catch {}
  return d
}

// El idioma vivo también manda en lo que se pide a TMDB: con la interfaz en
// English, las sinopsis de episodio y las biografías llegan en inglés en vez
// de quedarse en español. La caché va separada por idioma (prefijo «en:»)
// para que cambiar de idioma no enseñe la mezcla ni pise la otra.
const tmdbIdioma = () => (IDIOMA_ACTUAL === 'en' ? 'en-US' : 'es-ES')
const tmdbPref = () => (IDIOMA_ACTUAL === 'en' ? 'en:' : '')
// el idioma viaja como argumento: una carga con varias peticiones (base +
// temporadas) lo congela AL ENTRAR — si se leyera en cada petición, cambiar
// de idioma a mitad guardaba un objeto mezclado bajo la clave del idioma
// viejo durante 7 días
async function tmdbJson(ruta, idi = tmdbIdioma()) {
  const r = await fetch(`https://api.themoviedb.org/3${ruta}${ruta.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=${idi}`)
  if (!r.ok) throw new Error('tmdb ' + r.status)
  return r.json()
}
// Las cachés de TMDB (fichas y biografías) viven en el MISMO localStorage que
// el progreso, y el cupo es de ~5 MB en Safari. Con todo el catálogo abierto
// en los dos idiomas ocupan ~1,7 MB más las biografías (medido el 16 sep
// 2026), y lo caducado no se borraba nunca: solo se pisaba al reabrir esa
// ficha. Si el cupo se llenaba, marcar un título fallaba EN SILENCIO (todas
// las escrituras van en try/catch). Dos defensas:
//  1. al arrancar, en un momento libre, se barren las versiones viejas de la
//     caché y las entradas caducadas (la fecha va al principio del JSON: se
//     lee con una regex, sin parsear megas);
//  2. si una escritura que NO es de caché no cabe, se vacían las cachés y se
//     reintenta: el progreso manda, las fichas se vuelven a bajar solas.
const ES_CACHE = /^maraton-marvel-(tmdb|persona)-v[0-9]+:/
const CACHE_VIVA = { 'maraton-marvel-tmdb-v12:': 7 * 864e5, 'maraton-marvel-persona-v3:': 30 * 864e5 }
function podaCaches(todo = false) {
  let n = 0
  try {
    for (const k of Object.keys(localStorage)) {
      if (!ES_CACHE.test(k)) continue
      const viva = Object.keys(CACHE_VIVA).find(p => k.startsWith(p))
      const t = !todo && viva && +(/^\{"t":(\d+)/.exec(localStorage.getItem(k) || '') || [])[1]
      if (!t || Date.now() - t > CACHE_VIVA[viva]) { localStorage.removeItem(k); n++ }
    }
  } catch {}
  return n
}
try {
  const escribe = Storage.prototype.setItem
  Storage.prototype.setItem = function (k, v) {
    try { return escribe.call(this, k, v) } catch (e) {
      if (this !== localStorage || ES_CACHE.test(k) || !podaCaches(true)) throw e
      return escribe.call(this, k, v)
    }
  }
} catch {}
;(window.requestIdleCallback || (f => setTimeout(f, 3000)))(() => podaCaches())
// una sola petición en vuelo por título: la precarga al tocar y la ficha que se
// abre enseguida piden lo mismo a la vez
const tmdbPend = {}
function cargaTmdb(itemId) {
  const k = (tmdbIdioma() === 'en-US' ? 'en:' : '') + itemId
  if (tmdbMem[k]) return Promise.resolve(tmdbMem[k])
  if (!tmdbPend[k]) tmdbPend[k] = cargaTmdbRed(itemId).finally(() => { delete tmdbPend[k] })
  return tmdbPend[k]
}
const nombreProveedor = n => {
  const s = n.trim().replace(/\s+(standard\s+)?with ads$/i, '')
  const canal = s.match(/^(.+?)\s+(amazon|apple tv) channel$/i)
  const limpio = x => x.replace(/^disney plus$/i, 'Disney+').replace(/^amazon prime video$/i, 'Prime Video')
    .replace(/^movistartv$/i, 'Movistar TV').replace(/^vix$/i, 'ViX').replace(/^google play movies$/i, 'Google Play')
    .replace(/^amazon video$/i, 'Prime Video').replace(/^apple tv store$/i, 'Apple TV')
  return canal ? `${limpio(canal[1])} (${canal[2].toLowerCase() === 'amazon' ? 'Prime Video' : 'Apple TV'})` : limpio(s)
}
async function cargaTmdbRed(itemId) {
  const idi = tmdbIdioma()
  const k = (idi === 'en-US' ? 'en:' : '') + itemId
  if (tmdbMem[k]) return tmdbMem[k]
  const m = TMDB[itemId]
  if (!m) return null
  // v9: guarda los proveedores de los seis países de Ajustes, no solo España
  // v10: loki2 pedía la temporada 1 de TMDB (fotogramas y sinopsis de Loki T1)
  // v11: provPais pasó de 6 a 19 países — una entrada v10 no trae los nuevos
  // y la ficha caía a los proveedores de España bajo «Hoy en Bolivia»
  // v12: proveedores con nombre limpio, gratis con anuncios y, si no hay
  // ninguno, el alquiler (antes Hulk en Chile no enseñaba nada)
  const claveLS = 'maraton-marvel-tmdb-v12:' + k
  try {
    const g = JSON.parse(localStorage.getItem(claveLS))
    if (g && Date.now() - g.t < 7 * 864e5) { tmdbMem[k] = g.d; return g.d }
  } catch {}
  const [tid, tipo] = m
  const base = await tmdbJson(`/${tipo}/${tid}?append_to_response=videos,watch/providers,${tipo === 'tv' ? 'aggregate_credits' : 'credits'}`, idi)
  const vids = (base.videos && base.videos.results) || []
  const tr = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
    || vids.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || vids.find(v => v.site === 'YouTube' && v.type === 'Teaser')
  const regiones = (base['watch/providers'] && base['watch/providers'].results) || {}
  // TMDB repite plataformas («Netflix» y «Netflix Standard with Ads») y llama
  // «Universal+ Amazon Channel» a suscribirse a Universal+ desde Prime Video
  const proveedores = region => {
    const r = regiones[region] || {}
    const lista = (arr, marca) => (Array.isArray(arr) ? arr : [])
      .filter(p => p && typeof p.provider_name === 'string')
      .map(p => ({ n: nombreProveedor(p.provider_name), l: typeof p.logo_path === 'string' ? p.logo_path : null, ...marca }))
    const vistos = new Set()
    const unicos = arr => arr.filter(p => p.n && !vistos.has(p.n.toLowerCase()) && vistos.add(p.n.toLowerCase()))
    // hasta 4 de suscripción y 2 gratis: lo gratis no se queda fuera por ir detrás
    const ven = [...unicos(lista(r.flatrate)).slice(0, 4), ...unicos([...lista(r.free, { g: 1 }), ...lista(r.ads, { g: 1 })]).slice(0, 2)]
    return ven.length ? ven : unicos([...lista(r.rent, { a: 1 }), ...lista(r.buy, { a: 1 })]).slice(0, 4)
  }
  const cred = base.credits || base.aggregate_credits
  const reparto = {}
  ;((cred && cred.crew) || []).filter(c => /Director/i.test(c.job || (c.jobs && c.jobs[0] && c.jobs[0].job) || ''))
    .slice(0, 4).forEach(c => { reparto[clave(c.name)] = { id: c.id, papel: '', foto: c.profile_path || null } })
  const elenco = []
  ;((cred && cred.cast) || []).filter(c => c && typeof c.name === 'string').slice(0, 18).forEach(c => {
    // TMDB cuela apostillas en inglés: "(24 Years)", "(voice)", "(uncredited)"
    const papel = (c.character || (c.roles && c.roles[0] && c.roles[0].character) || '')
      .replace(/\s*\((?:[^)]*\b(?:years?|voice|uncredited|young|older|archive|footage)\b[^)]*)\)/gi, '')
      .trim()
    const foto = typeof c.profile_path === 'string' ? c.profile_path : null
    reparto[clave(c.name)] = { id: c.id, papel, foto }
    elenco.push({ n: c.name, p: typeof papel === 'string' ? papel : '', f: foto, id: c.id })
  })
  const d = {
    trailer: tr ? tr.key : null,
    fondo: base.backdrop_path || null,
    reparto,
    elenco,
    prov: proveedores('ES'),
    provPais: Object.fromEntries(PAISES.map(p => [p.id, proveedores(p.id)])),
    eps: {},
  }
  if (tipo === 'tv' && EPISODES[itemId]) {
    const temporadas = [...new Set(EPISODES[itemId].map(e => e.s))]
    for (const t of temporadas) {
      try {
        const sd = await tmdbJson(`/tv/${tid}/season/${t + (DESPLAZA_TEMPORADA[itemId] || 0)}`, idi)
        ;(sd.episodes || []).forEach(ep => {
          d.eps[`${t}:${ep.episode_number}`] = { im: ep.still_path || null, o: ep.overview || null }
        })
      } catch {}
    }
  }
  tmdbMem[k] = d
  try { localStorage.setItem(claveLS, JSON.stringify({ t: Date.now(), d })) } catch {}
  return d
}
function useTmdb(item, idioma) {
  const [extra, setExtra] = useState(() => tmdbMem[tmdbPref() + item.id] || null)
  // si TMDB no responde (sin conexión, caído) la ficha lo dice en vez de dejar
  // huecos: fotograma reservado vacío, sin «Hoy en…» y sin reparto
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    let vivo = true
    // al cambiar de idioma se enseña lo cacheado en ese idioma (o nada)
    // mientras llega lo nuevo, nunca la mezcla
    setExtra(tmdbMem[tmdbPref() + item.id] || null)
    setFallo(false)
    cargaTmdb(item.id).then(d => { if (vivo && d) setExtra(d) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [item.id, idioma])
  return [extra, fallo]
}

// «Thwip» sutil al marcar (solo si el usuario lo activa en el pie)
// Un toque háptico al marcar, como el conmutador nativo. En iOS no hay
// navigator.vibrate: Safari (17.4+) solo vibra al cambiar un
// <input type="checkbox" switch>, y lo hace también si se cambia con click()
// dentro de un gesto del usuario. Se usa uno escondido fuera de pantalla
// (con display:none no vibra). Donde no exista, no pasa nada.
let interruptorTic = null
function tic() {
  if (!ES_TACTIL) return
  try {
    if (!interruptorTic) {
      interruptorTic = document.createElement('input')
      interruptorTic.type = 'checkbox'
      interruptorTic.setAttribute('switch', '')
      interruptorTic.tabIndex = -1
      interruptorTic.setAttribute('aria-hidden', 'true')
      interruptorTic.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.appendChild(interruptorTic)
    }
    interruptorTic.click()
  } catch {}
}
function suenaPop() {
  try {
    if (localStorage.getItem('maraton-marvel-sonido-v1') !== '1') return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = suenaPop.ctx || (suenaPop.ctx = new Ctx())
    if (ctx.state === 'suspended') ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(620, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.09)
    g.gain.setValueAtTime(0.1, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.22)
  } catch {}
}

// Temas de acento por universo (alias sobre los tokens existentes, ya adaptados a claro/oscuro)
// Tema: por defecto el del sistema; elegir uno fijo pone data-theme en <html>
// (index.html lo repone antes del primer pintado) y ajusta el color de la barra
// del navegador, que con los <meta media=…> seguiría al sistema.
const KEY_TEMA = 'maraton-marvel-tema-v1'
const TEMAS = [
  { id: 'sistema', nombre: 'Como el sistema', en: 'Follow system' },
  { id: 'light', nombre: 'Claro', en: 'Light' },
  { id: 'dark', nombre: 'Oscuro', en: 'Dark' },
]
const COLOR_BARRA = { light: '#F3EDDE', dark: '#0A0C14' }
// Cambiar de tema o de acento cambia fondo, sombra y opacidad de casi todo a la
// vez: sin esto cada transición viva se dispara junta y el cambio se emborrona en
// vez de saltar. Se apagan, se fuerza el cálculo de estilos con el tema nuevo ya
// sin ellas y se devuelven en un temporizador (no en rAF: con la pestaña oculta
// no llega nunca y se quedarían apagadas).
function sinTransiciones(cambia) {
  const s = document.createElement('style')
  s.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.appendChild(s)
  cambia()
  getComputedStyle(document.body).backgroundColor
  setTimeout(() => s.remove(), 1)
}
const ACENTOS = [
  // `c`: el token base de cada acento para su muestra en Ajustes (el de
  // Tierra-616 es --peligro, que nunca se redefine: --red cambia con el acento)
  { id: '616', nombre: 'Tierra-616', en: 'Earth-616', c: 'var(--peligro)' },
  { id: 'xmen', nombre: 'X-Men', c: 'var(--gold-texto)' },
  { id: 'tva', nombre: 'La TVA', en: 'The TVA', c: 'var(--violet)' },
  { id: 'zombi', nombre: 'Zombi', en: 'Zombie', c: 'var(--doom)' },
  { id: '828', nombre: '4 Fantásticos', en: 'Fantastic Four', c: 'var(--teal)' },
]

// Nueve pestañas eran nueve destinos planos, pero seis de ellas son formas
// de mirar el mismo catálogo. Arriba quedan tres; el resto pasa a ser un
// selector dentro de cada uno. Los ids de vista y el hash no cambian: los
// enlaces antiguos siguen abriendo lo que abrían.
const DESTINOS = [
  { id: 'maraton', label: 'Maratón', en: 'Marathon', vistas: ['crono', 'estreno', 'comics', 'animacion', 'galeria', 'tiempo'] },
  // Perfil abre en lo tuyo (progreso, racha, logros); las listas, después
  // Comunidades solo existe con la cuenta encendida (src/nube.js)
  { id: 'mio', label: 'Perfil', en: 'Profile', vistas: NUBE ? ['stats', 'listas', 'comunidades'] : ['stats', 'listas'] },
  { id: 'multiverso', label: 'Multiverso', en: 'Multiverse', vistas: ['multiverso'] },
]
const destinoDe = v => (DESTINOS.find(d => d.vistas.includes(v)) || DESTINOS[0]).id
// Iconos de la barra de pestañas del móvil (SVG de trazo, como los de los
// enlaces de la tarjeta: nada de emoji en controles). En escritorio no se ven.
const ICONOS_DESTINO = {
  maraton: (
    <svg className="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9.5h18V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 9.5 4.6 4.8h14.8L21 9.5M8.2 4.8l1.8 4.7M13.2 4.8l1.8 4.7" />
    </svg>
  ),
  mio: (
    <svg className="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-4.2 3.6-6.8 8-6.8s8 2.6 8 6.8z" />
    </svg>
  ),
  multiverso: (
    <svg className="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M18.2 6.6c2.6-.9 4.4-.8 4.9.3.9 1.9-3 5.9-8.7 8.9S3.7 20.1 2.8 18.2c-.5-1 .4-2.6 2.3-4.3" />
    </svg>
  ),
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'the', 'of', 'a', 'al', 'un', 'una'])

function iniciales(t) {
  const palabras = t.split(/[\s:·(]+/).filter(w => w && !STOP.has(w.toLowerCase()))
  return palabras.slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function fmtDur(d) {
  if (!d) return ''
  // espacios duros: «1 h 47 min» no se parte entre líneas en las tarjetas del móvil
  if (d >= 600) return `~${Math.round(d / 60)}\u00a0h`
  const h = Math.floor(d / 60), m = d % 60
  if (!h) return `${m}\u00a0min`
  return `${h}\u00a0h${m ? `\u00a0${m}\u00a0min` : ''}`
}

const limpiaNombre = n => n.replace(/ \((voz|creador|creadora|showrunner|creadores)\)$/, '')
const VISTAS_VALIDAS = ['crono', 'estreno', 'comics', 'animacion', 'stats', 'galeria', 'multiverso', 'listas', 'tiempo', ...(NUBE ? ['comunidades'] : [])]
const PESTANAS = [
  { id: 'crono', label: 'Cronológico', en: 'Chronological' },
  { id: 'comunidades', label: 'Comunidades', en: 'Communities' },
  { id: 'estreno', label: 'Por estreno', en: 'By release' },
  { id: 'comics', label: 'Cómics', en: 'Comics' },
  { id: 'animacion', label: 'Animación', en: 'Animation' },
  { id: 'listas', label: 'Listas', en: 'Lists' },
  { id: 'galeria', label: 'Galería', en: 'Gallery' },
  { id: 'multiverso', label: 'Multiverso', en: 'Multiverse' },
  { id: 'tiempo', label: 'Línea temporal', en: 'Timeline' },
  { id: 'stats', label: 'Estadísticas', en: 'Stats' },
]
// Dúos y casos que el split por " y "/" & " rompería
const DUOS = {
  'Anthony y Joe Russo': ['Hermanos Russo'],
  'Rhys Thomas y Bert & Bertie': ['Rhys Thomas', 'Bert & Bertie'],
  // Parejas acreditadas por apellido: partirlas por la "y" inventaba dos
  // personas llamadas "Markus" y "McFeely", cada una con su avatar.
  'Markus y McFeely': ['Markus y McFeely'],
  'Tancharoen y Whedon': ['Tancharoen y Whedon'],
  'Schwartz y Savage': ['Schwartz y Savage'],
}
const urlTrailer = t => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + tr(' tráiler español', ' trailer'))}`
const urlImdb = t => `https://www.imdb.com/find/?q=${encodeURIComponent(t)}`
const urlPersona = n => `https://www.imdb.com/find/?q=${encodeURIComponent(limpiaNombre(n))}&s=nm`

// TMDB deja en inglés los papeles genéricos aunque se pida en español
// («Additional Voices» bajo una actriz de doblaje): se traducen al pintar
// (la caché de TMDB guarda el texto original y no hace falta invalidarla)
const ROLES_ES = { 'additional voices': 'Voces adicionales', 'additional voice': 'Voz adicional', himself: 'Él mismo', herself: 'Ella misma', self: 'Como sí mismo', narrator: 'Narrador', 'narrator (voice)': 'Narrador', various: 'Varios papeles', 'various characters': 'Varios papeles' }
const rolLocal = p => tr(ROLES_ES[p.toLowerCase()] || p, p)
const tipoSello = (item, esComic) => (esComic ? tr('CÓMIC', 'COMIC') : item.tipo === 'serie' ? tr('SERIE', 'SERIES') : item.tipo === 'esp' ? tr('ESPECIAL', 'SPECIAL') : tr('PELÍCULA', 'MOVIE'))

function Cover({ item, c, esComic }) {
  const [c1, c2] = c
  const gid = `g-${item.id}`
  return (
    <svg className="cover" viewBox="0 0 120 180" role="img" aria-label={tr(`Carátula de ${item.t}`, `Cover of ${item.t}`)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1.2">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="120" height="180" rx="10" fill={`url(#${gid})`} />
      <g opacity="0.16" fill="#fff">
        {[0, 1, 2, 3, 4].map(i => (
          <circle key={i} cx={104 - i * 21} cy={18 + i * 8} r={3.4 - i * 0.5} />
        ))}
      </g>
      <path d="M0 128 L120 88 L120 180 L0 180 Z" fill="#000" opacity="0.22" />
      <text x="60" y="96" textAnchor="middle" fill="#fff" opacity="0.95"
        fontFamily="'Inter',system-ui,sans-serif"
        fontWeight="800" fontSize={esComic ? 32 : 40} letterSpacing="1">
        {iniciales(item.t)}
      </text>
      <text x="60" y="156" textAnchor="middle" fill="#fff" opacity="0.8"
        fontFamily="system-ui,sans-serif" fontWeight="600" fontSize="15">
        {item.r}
      </text>
      <text x="60" y="172" textAnchor="middle" fill="#fff" opacity="0.55"
        fontFamily="system-ui,sans-serif" fontWeight="700" fontSize="8" letterSpacing="2">
        {tipoSello(item, esComic)}
      </text>
      <rect width="120" height="180" rx="10" fill="none" stroke="#fff" strokeOpacity="0.25" />
    </svg>
  )
}

function Portada({ item, c, esComic }) {
  const [err, setErr] = useState(false)
  const [ancha, setAncha] = useState(null) // null | 'logo' | 'keyart'
  const src = POSTERS[item.id]
  if (!src || err) return <Cover item={item} c={c} esComic={esComic} />
  if (ancha) {
    if (ancha === 'logo') {
      return (
        <div className="cover logo-cover" role="img" aria-label={tr(`Carátula de ${item.t}`, `Cover of ${item.t}`)}
          style={{ background: `linear-gradient(160deg, ${c[0]}, ${c[1]})` }}>
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />
          <span className="lc-year">{item.r}</span>
          <span className="lc-tipo">{tipoSello(item, esComic)}</span>
        </div>
      )
    }
    return (
      <div className="cover keyart" role="img" aria-label={tr(`Carátula de ${item.t}`, `Cover of ${item.t}`)}>
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />
        <span className="ka-sombra" style={{ '--ka': c[0] }} />
        <span className="lc-year">{item.r}</span>
        <span className="lc-tipo">{tipoSello(item, false)}</span>
      </div>
    )
  }
  return (
    <img className="cover foto" src={src} alt={tr(`Póster de ${item.t}`, `Poster of ${item.t}`)}
      loading="lazy" decoding="async"
      onLoad={e => {
        const img = e.target
        if (img.naturalWidth <= img.naturalHeight * 1.05) return
        // logo si la imagen tiene transparencia; keyart si es fotográfica opaca
        let transparente = false
        try {
          const cv = document.createElement('canvas')
          cv.width = 24; cv.height = 24
          const ctx = cv.getContext('2d')
          ctx.drawImage(img, 0, 0, 24, 24)
          const px = ctx.getImageData(0, 0, 24, 24).data
          for (let i = 3; i < px.length; i += 4) {
            if (px[i] < 250) { transparente = true; break }
          }
        } catch {}
        setAncha(transparente ? 'logo' : 'keyart')
      }}
      onError={() => setErr(true)} />
  )
}

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 8.5l3.5 3.5 7-8" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IcoPlay = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
  </svg>
)
const IcoCerrar = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const IcoFuera = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8" /><path d="M18 14v4a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 18V7.8A1.8 1.8 0 0 1 6 6h4" />
  </svg>
)
const IcoAtras = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 6l-6 6 6 6" />
  </svg>
)
const IcoEnlace = () => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4" />
  </svg>
)

function Avatar({ nombre, grande, foto }) {
  const [err, setErr] = useState(false)
  const limpio = limpiaNombre(nombre)
  // primero la foto propia de public/people; si no hay, la de TMDB
  const src = PEOPLE[limpio] || (typeof foto === 'string' ? `${TMDB_IMG}w185${foto}` : null)
  const cls = 'avatar' + (grande ? ' avatar-grande' : '')
  if (!src || err) {
    return <span className={cls + ' avatar-ini'} aria-hidden="true">{iniciales(limpio)}</span>
  }
  return <img className={cls} src={src} alt="" loading="lazy" onError={() => setErr(true)} />
}

const fmtFecha = f => f
  ? new Date(f + 'T00:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' })
  : null

function FichaPersona({ nombre, rol, papel, tmdbId, idioma, onVolver, onAbrirTitulo, itemActualId, tituloActual }) {
  const [datos, setDatos] = useState(() => (tmdbId && personaMem[tmdbPref() + tmdbId]) || null)
  const [fallo, setFallo] = useState(false)
  const [masBio, setMasBio] = useState(false)
  useEffect(() => {
    let vivo = true
    setFallo(false)
    setDatos((tmdbId && personaMem[tmdbPref() + tmdbId]) || null)
    if (tmdbId) cargaPersona(tmdbId)
      .then(d => { if (vivo) setDatos(d) })
      .catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [tmdbId, idioma])

  // Lo que ninguna web tiene: dónde más sale dentro de TU maratón
  const tambienEn = useMemo(() => {
    const porTmdb = datos && Array.isArray(datos.enMaraton)
      ? new Set(datos.enMaraton.filter(x => typeof x === 'string'))
      : null
    const k = clave(nombre), fuera = []
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
      if (it.id === itemActualId) return
      const gente = [...(it.cast || []), ...(it.dir ? it.dir.split(/, | y | & /) : [])]
      const porNombre = gente.some(g => clave(limpiaNombre(g)) === k)
      if (porNombre || (porTmdb && porTmdb.has(it.id))) {
        fuera.push({ item: it, c: era.c, esComic: sg.saga === 'comics' })
      }
    })))
    return fuera
  }, [nombre, itemActualId, datos])

  const bio = datos && datos.bio
  const bioCorta = bio && bio.length > 420 && !masBio ? bio.slice(0, 420).replace(/\s+\S*$/, '') + '…' : bio

  return (
    <div className="persona-ficha">
      <button className="volver-ficha" onClick={onVolver}>
        <IcoAtras />{tituloActual ? tr(`Volver a ${tituloActual}`, `Back to ${tituloActual}`) : tr('Volver a la ficha', 'Back to the title')}
      </button>
      <div className="pf-cabecera">
        <Avatar nombre={nombre} grande />
        <div className="pf-titulos">
          <h3 className="pf-nombre">{nombre}</h3>
          {papel
            ? <p className="pf-papel">{tr('Interpreta a', 'Plays')} <b>{papel}</b></p>
            : <p className="pf-papel pf-papel-rol">{rol}</p>}
          {datos && (datos.nacimiento || datos.lugar) && (
            <p className="pf-datos">
              {datos.nacimiento ? new Date(datos.nacimiento + 'T00:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              {datos.nacimiento && datos.lugar ? ' · ' : ''}{datos.lugar || ''}
            </p>
          )}
        </div>
      </div>

      {bioCorta
        ? <p className="pf-bio">{bioCorta}{bio.length > 420 && (
            <button className="pf-mas" onClick={() => setMasBio(v => !v)}>{masBio ? tr('Menos', 'Less') : tr('Leer más', 'Read more')}</button>
          )}</p>
        : <p className="pf-bio pf-vacia">
            {!tmdbId ? tr('No hay ficha de esta persona en TMDB.', 'TMDB has no page for this person.')
              : fallo ? tr('No se pudo cargar su biografía. Comprueba tu conexión.', 'Could not load their biography. Check your connection.')
              : datos ? tr('TMDB no tiene biografía en español de esta persona.', 'TMDB has no biography for this person.')
              : tr('Cargando su biografía…', 'Loading their biography…')}
          </p>}

      {tambienEn.length > 0 && (
        <div className="pf-tambien">
          <h4 className="pf-sub">{tr('También en tu maratón', 'Also in your marathon')} ({tambienEn.length})</h4>
          <div className="pf-lista">
            {tambienEn.map(({ item, c, esComic }) => (
              <button className="pf-item" key={item.id} onClick={() => onAbrirTitulo({ item, c, esComic })}>
                <Portada item={item} c={c} esComic={esComic} />
                <span className="pf-item-t">{item.t}</span>
                <span className="pf-item-h">{item.h}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CuentaAtras({ meta, horario, sesionHoy, sim, onHorario }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const objetivo = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > ahora)
  let cuenta = null
  if (objetivo) {
    const diff = new Date(objetivo.fecha + 'T00:00:00') - ahora
    const dias = Math.floor(diff / 86400000)
    const hh = String(Math.floor(diff / 3600000) % 24).padStart(2, '0')
    const mm = String(Math.floor(diff / 60000) % 60).padStart(2, '0')
    const ss = String(Math.floor(diff / 1000) % 60).padStart(2, '0')
    cuenta = { dias, hh, mm, ss }
  }
  if (!objetivo || !cuenta) return null
  return (
    <div className="cuenta">
          <div className="cuenta-info">
            <span className="cuenta-label">{tr('Próximo gran estreno', 'Next big premiere')}</span>
            <span className="cuenta-titulo">{objetivo.t}</span>
            <span className="cuenta-fecha">{fmtFecha(objetivo.fecha)} · {objetivo.tipo}</span>
          </div>
      <div className="cuenta-reloj" role="timer">
        <span className="cr-bloque"><b>{cuenta.dias}</b><small>{tr('días', 'days')}</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.hh}</b><small>{tr('horas', 'hours')}</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.mm}</b><small>min</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.ss}</b><small>{tr('seg', 'sec')}</small></span>
      </div>
      {meta && (
        <div className="objetivo">
          <span className="objetivo-linea">
            {tr('Ruta express: ', 'Express route: ')}{meta.restante > 0
              ? <>{tr('quedan ', '')}<b>{fmtDur(meta.restante)}</b>{tr(' · necesitas ', ' left · you need ')}<b>{meta.necesario} {tr('min/día', 'min/day')}</b></>
              : <b>{tr('¡completada! Llegas de sobra al estreno', 'complete! You’ll make the premiere with room to spare')}</b>}
          </span>
          {meta.restante > 0 && (
            <span className={`objetivo-chip ${meta.ritmo === 0 ? 'neutro' : meta.alDia ? 'ok' : 'tarde'}`}>
              {meta.ritmo === 0
                ? tr('Sin ritmo todavía · marca algo y aquí verás si llegas', 'No pace yet · check something off and you’ll see if you make it')
                : meta.alDia
                  ? tr(`Vas al día · ${meta.ritmo} min/día en las últimas 2 semanas`, `On track · ${meta.ritmo} min/day over the last 2 weeks`)
                  : tr(`Acelera · llevas ${meta.ritmo} min/día en las últimas 2 semanas`, `Speed up · you’re at ${meta.ritmo} min/day over the last 2 weeks`)}
            </span>
          )}
          {meta.restante > 0 && meta.ritmo > 0 && (() => {
            const fin = new Date(Date.now() + Math.ceil(meta.restante / meta.ritmo) * 86400000)
            const llega = fin <= new Date(objetivo.fecha + 'T00:00:00')
            return (
              <span className="proyeccion">
                {tr('A tu ritmo acabarías la ruta express el ', 'At your pace you’d finish the express route on ')}<b>{fin.toLocaleDateString(LOC(), { day: 'numeric', month: 'long' })}</b>
                {llega ? tr(' — llegas al estreno', ' — you make the premiere') : tr(' — después del estreno, aprieta un poco', ' — after the premiere; push a little')}
              </span>
            )
          })()}
          {horario && sim && sim.seAcaba && sim.fin && (() => {
            const llega = sim.fin <= new Date(objetivo.fecha + 'T00:00:00')
            return (
              <span className="proyeccion">
                {tr('Con tu horario terminas el ', 'On your schedule you finish ')}
                <b>{sim.fin.toLocaleDateString(LOC(), { day: 'numeric', month: 'long' })}</b>
                {llega ? tr(' — llegas al estreno', ' — in time for the premiere') : tr(' — después del estreno: añade días o alarga la sesión', ' — after the premiere: add days or stretch the session')}
              </span>
            )
          })()}
          {horario && (() => {
            const hoyD = new Date().getDay()
            const esHoy = horario.dias.includes(hoyD)
            let prox = (hoyD + 1) % 7
            while (!horario.dias.includes(prox)) prox = (prox + 1) % 7
            // el chip no solo dice cuándo: dice QUÉ toca (el primer título de
            // la sesión de hoy, y cuántos más caen detrás)
            const que = sesionHoy && (() => {
              const t0 = sesionHoy.trozos[0]
              const resto = sesionHoy.trozos.length - 1
              const nombre = t0.txt ? `${t0.item.t} (${t0.txt})` : t0.item.t
              return resto > 0 ? tr(`${nombre} y ${resto} más`, `${nombre} and ${resto} more`) : nombre
            })()
            return (
              <span className="objetivo-chip neutro">
                {esHoy
                  ? (que
                    ? tr(`Hoy a las ${horario.hora}: ${que} · ~${fmtDur(sesionHoy.min)}`, `Today at ${horario.hora}: ${que} · ~${fmtDur(sesionHoy.min)}`)
                    : tr(`Hoy hay sesión a las ${horario.hora} · ${fmtDur(horario.min)}`, `Session today at ${horario.hora} · ${fmtDur(horario.min)}`))
                  : tr(`Próxima sesión: ${DIA_LARGO[prox]} a las ${horario.hora}`, `Next session: ${DIA_LARGO_EN[prox]} at ${horario.hora}`)}
              </span>
            )
          })()}
          <button className="chip-btn aviso-btn" onClick={onHorario}>{horario ? tr('Horario', 'Schedule') : tr('Ponerme un horario', 'Set a schedule')}</button>
          <button className="chip-btn aviso-btn" onClick={() => descargaIcs(objetivo)}>{tr('Al calendario', 'Add to calendar')}</button>
          <AvisosBtn />
        </div>
      )}
    </div>
  )
}

// ── Calendario del maratón: qué viste cada día, mes a mes ──
// Cada marca (título, episodio, cómic) guarda su fecha; esto las coloca en un
// calendario de pared navegable. El día se pinta con la intensidad del mapa
// de calor y, al tocarlo, abajo sale la lista de ese día con su hora.
const diaClave = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
function Calendario({ vistas, eps, indice, onAbrir, idioma, notas = {}, diaInicial = null, sinMarco = false }) {
  const dias = useMemo(() => {
    const m = new Map()
    const de = ts => {
      // las marcas antiguas valen 1 (sin fecha): esas no pueden ir al calendario
      if (typeof ts !== 'number' || ts < 1e12) return null
      const k = diaClave(ts)
      if (!m.has(k)) m.set(k, { titulos: [], series: new Map(), n: 0, resenas: 0 })
      return m.get(k)
    }
    Object.entries(vistas).forEach(([id, ts]) => {
      const d = de(ts)
      if (d && indice[id]) {
        d.titulos.push({ id, ts }); d.n++
        // estrellas o reseña de ese título: el día lleva un punto
        const nt = notas[id]
        if (nt && (nt.p || (nt.txt && nt.txt.trim()))) d.resenas++
      }
    })
    Object.entries(eps).forEach(([clave, ts]) => {
      const d = de(ts)
      if (!d) return
      const sid = clave.split(':')[0]
      if (!indice[sid]) return
      const s = d.series.get(sid) || { n: 0, ts }
      s.n++; if (ts < s.ts) s.ts = ts
      d.series.set(sid, s); d.n++
    })
    return m
  }, [vistas, eps, notas])
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  // abre en `diaInicial` si se lo piden (un día tocado en la semana de la
  // portada, que puede ser del mes anterior) y con ese día elegido
  const inicio = diaInicial ? new Date(diaInicial) : hoy
  const [mes, setMes] = useState(() => new Date(inicio.getFullYear(), inicio.getMonth(), 1))
  const [sel, setSel] = useState(() => (dias.has(diaClave(inicio.getTime())) ? diaClave(inicio.getTime()) : null))
  const primero = useMemo(() => {
    let min = Infinity
    const mira = ts => { if (typeof ts === 'number' && ts > 1e12 && ts < min) min = ts }
    Object.values(vistas).forEach(mira)
    Object.values(eps).forEach(mira)
    return isFinite(min) ? new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1) : null
  }, [vistas, eps])
  if (!primero) return sinMarco ? <p className="grafica-sub">{tr('Aún no hay marcas con fecha: las que hagas desde ahora aparecerán aquí, día a día.', 'No dated check-offs yet: the ones you make from now on will show up here, day by day.')}</p> : null
  const mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const puedeAtras = mes > primero
  const puedeAlante = mes < mesActual
  const mueve = dir => { setMes(m2 => new Date(m2.getFullYear(), m2.getMonth() + dir, 1)); setSel(null) }
  const celdas = []
  for (let i = 0; i < (new Date(mes).getDay() + 6) % 7; i++) celdas.push(null) // arranca en lunes
  const nDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  for (let d = 1; d <= nDias; d++) celdas.push(new Date(mes.getFullYear(), mes.getMonth(), d))
  const max = Math.max(1, ...celdas.filter(Boolean).map(f => (dias.get(diaClave(f.getTime())) || { n: 0 }).n))
  // A diferencia del mapa de calor, AQUÍ hay texto encima (el número del día):
  // con la mezcla al 100 % la tinta sobre el rojo pleno caía a 2,5:1 en claro.
  // Capada al 45 % el número aguanta los 4,5:1 en los dos temas (medido).
  const tono = n => `color-mix(in srgb, var(--red) ${10 + 35 * n / max}%, var(--panel2))`
  const etiquetaMes = (() => {
    const t = mes.toLocaleDateString(LOC(), { month: 'long', year: 'numeric' })
    return t.charAt(0).toUpperCase() + t.slice(1)
  })()
  const delSel = sel ? dias.get(sel) : null
  const fechaSel = sel ? (() => { const [a, m2, d] = sel.split('-').map(Number); return new Date(a, m2, d) })() : null
  const hora = ts => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })
  const filasSel = delSel ? [
    ...delSel.titulos.map(({ id, ts }) => ({ ts, d: indice[id], nota: notas[id], sub: indice[id].esComic ? tr('Leído', 'Read') : tr('Completa', 'In full') })),
    ...[...delSel.series.entries()].map(([sid, s]) => ({ ts: s.ts, d: indice[sid], sub: s.n === 1 ? tr('1 episodio', '1 episode') : tr(`${s.n} episodios`, `${s.n} episodes`) })),
  ].sort((a, b) => a.ts - b.ts) : []
  return (
    <Marco sinMarco={sinMarco} titulo={tr('Calendario del maratón', 'Marathon calendar')}>
      <div className="cal-cab">
        <button className="ghost" onClick={() => mueve(-1)} disabled={!puedeAtras} aria-label={tr('Mes anterior', 'Previous month')}>‹</button>
        <span className="cal-mes">{etiquetaMes}</span>
        <button className="ghost" onClick={() => mueve(1)} disabled={!puedeAlante} aria-label={tr('Mes siguiente', 'Next month')}>›</button>
      </div>
      <div className="cal-grid" role="grid" aria-label={etiquetaMes}>
        {DIAS_ORDEN.map(d => <span key={d} className="cal-dn" aria-hidden="true">{tr(DIA_LETRA[d], DIA_LETRA_EN[d])}</span>)}
        {celdas.map((f, i) => {
          if (!f) return <span key={'v' + i} aria-hidden="true" />
          const k = diaClave(f.getTime())
          const dd = dias.get(k)
          const esHoy = f.getTime() === hoy.getTime()
          return (
            <button key={k} className={`cal-dia${dd ? ' con' : ''}${esHoy ? ' hoy' : ''}${dd && dd.resenas ? ' con-resena' : ''}`}
              style={dd ? { background: tono(dd.n) } : undefined}
              aria-pressed={sel === k} disabled={!dd}
              aria-label={`${f.toLocaleDateString(LOC(), { day: 'numeric', month: 'long' })}: ${dd ? tr(`${dd.n} marca${dd.n === 1 ? '' : 's'}`, `${dd.n} check-off${dd.n === 1 ? '' : 's'}`) : tr('sin marcas', 'nothing')}${dd && dd.resenas ? tr(', con valoración', ', rated') : ''}`}
              onClick={() => setSel(s => (s === k ? null : k))}>
              {f.getDate()}
            </button>
          )
        })}
      </div>
      {delSel && fechaSel && (
        <div className="cal-detalle">
          <p className="grafica-sub">
            {fechaSel.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{tr(`${delSel.n} marca${delSel.n === 1 ? '' : 's'}`, `${delSel.n} check-off${delSel.n === 1 ? '' : 's'}`)}
          </p>
          <div className="plan-lista">
            {filasSel.map(({ ts, d, sub, nota }, i) => (
              <button key={d.item.id + i} className="ep plan-fila" onClick={() => onAbrir(d)}>
                <span className="plan-cover"><Portada item={d.item} c={d.c} esComic={d.esComic} /></span>
                <span className="ep-info">
                  <span className="ep-titulo">{d.item.t}</span>
                  <span className="ep-fecha">{sub} · {hora(ts)}</span>
                  {/* lo que le pusiste: estrellas y el principio de tu reseña */}
                  {nota && nota.p ? (
                    <span className="cal-estrellas" aria-label={tr(`${nota.p} de 5 estrellas`, `${nota.p} out of 5 stars`)}>
                      {'★'.repeat(nota.p)}<span aria-hidden="true" className="cal-estrellas-vacias">{'★'.repeat(5 - nota.p)}</span>
                    </span>
                  ) : null}
                  {nota && nota.txt && nota.txt.trim() ? <span className="cal-resena">«{nota.txt.trim()}»</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Marco>
  )
}

// Plegado en las 6 últimas y por meses (21 sep 2026): las 30 filas de golpe
// ocupaban ~1.600 px en el móvil y dejaban los logros muy abajo.
const DIARIO_PLEGADO = 6
function Diario({ vistas, notas, pais, idioma, indice, onAbrir }) {
  const [abierto, setAbierto] = useState(false)
  const marcas = useMemo(() => (
    Object.entries(vistas)
      .filter(([id, ts]) => typeof ts === 'number' && ts > 1e12 && TITULOS[id])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
  ), [vistas, pais, idioma])
  // meses con su nombre (y el año si no es el actual), en el orden de las marcas
  const meses = useMemo(() => {
    const hoy = new Date().getFullYear(), grupos = []
    for (const [id, ts] of abierto ? marcas : marcas.slice(0, DIARIO_PLEGADO)) {
      const d = new Date(ts), clave = d.getFullYear() * 12 + d.getMonth()
      if (!grupos.length || grupos[grupos.length - 1].clave !== clave) {
        grupos.push({ clave, nombre: d.toLocaleDateString(LOC(), d.getFullYear() === hoy ? { month: 'long' } : { month: 'long', year: 'numeric' }), filas: [] })
      }
      grupos[grupos.length - 1].filas.push([id, ts])
    }
    return grupos
  }, [marcas, abierto, idioma])
  if (!marcas.length) return null
  const quedan = marcas.length - DIARIO_PLEGADO
  return (
    <section className="grafica diario">
      <h3 className="grafica-titulo">{tr('Diario del maratón', 'Marathon diary')}</h3>
      {meses.map(m => (
        <div className="diario-grupo" key={m.clave}>
          <h4 className="diario-mes">{m.nombre}</h4>
          <div className="diario-lista">
            {/* con carátula y abriendo la ficha: 30 filas solo de texto se leían
                como un registro, y todo lo demás de la app se reconoce por su póster */}
            {m.filas.map(([id, ts]) => (
              <button type="button" className={abierto && marcas.findIndex(x => x[0] === id) >= DIARIO_PLEGADO ? 'diario-fila entra' : 'diario-fila'}
                style={abierto ? { '--i': marcas.findIndex(x => x[0] === id) - DIARIO_PLEGADO } : undefined} key={id} onClick={() => indice && indice[id] && onAbrir && onAbrir(indice[id])}>
                {POSTERS[id] ? <img className="diario-cartel" src={POSTERS[id]} alt="" loading="lazy" decoding="async" /> : <span className="diario-cartel" aria-hidden="true" />}
                <span className="diario-texto">
                  <span className="diario-titulo">{TITULOS[id]}</span>
                  <span className="diario-fecha">{new Date(ts).toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric' })}</span>
                </span>
                {notas[id] && notas[id].p ? <span className="diario-estrellas" aria-label={tr(`${notas[id].p} estrellas`, `${notas[id].p} stars`)}>{'★'.repeat(notas[id].p)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
      {quedan > 0 && (
        <button type="button" className="chip-btn diario-ver" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
          {abierto ? tr('Ver menos', 'Show less') : tr(`Ver ${quedan} más`, `Show ${quedan} more`)}
        </button>
      )}
      {abierto && Object.keys(vistas).length > 30 && <p className="diario-mas">{tr('Se muestran tus últimas 30 marcas.', 'Showing your last 30 check-offs.')}</p>}
    </section>
  )
}

// ── Tu mes (21 sep 2026, etapa 3 de la Fase 8) ──
// El resumen de un mes, como el de Strava: horas, títulos, episodios, días
// activos y la mejor racha del mes, la saga que más viste, cómo va frente al
// mes anterior y tu favorito (la nota más alta de lo que marcaste ese mes).
// Las horas cuentan cada episodio por su parte de la serie; una serie marcada
// entera sin episodios cuenta su duración completa.
const ITEM_POR_ID = new Map(DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => [i.id, { item: i, saga: s.saga }]))))
const claveMes = t => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth() }
const esMarca = t => typeof t === 'number' && t > 1e12
function resumenDeMes(clave, vistas, eps, notas) {
  const dias = new Set(), porSerie = {}, conEps = new Set()
  const dia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  let min = 0, episodios = 0
  for (const [k, t] of Object.entries(eps)) {
    const id = k.slice(0, k.indexOf(':'))
    conEps.add(id)
    if (!esMarca(t) || claveMes(t) !== clave) continue
    porSerie[id] = (porSerie[id] || 0) + 1; episodios++; dias.add(dia(t))
  }
  for (const [id, n] of Object.entries(porSerie)) {
    const r = ITEM_POR_ID.get(id), L = EPISODES[id] ? EPISODES[id].length : 0
    if (r && L) min += (r.item.d || 0) * n / L
  }
  const titulos = []
  for (const [id, t] of Object.entries(vistas)) {
    const r = ITEM_POR_ID.get(id)
    if (!r || !esMarca(t) || claveMes(t) !== clave) continue
    titulos.push({ id, t, r }); dias.add(dia(t))
    if (!conEps.has(id)) min += r.item.d || 0
  }
  // mejor racha dentro del mes
  const orden = [...dias].sort((a, b) => a - b)
  let racha = 0, cur = 0
  orden.forEach((d, i) => { cur = i && d - orden[i - 1] <= 86400000 * 1.5 ? cur + 1 : 1; racha = Math.max(racha, cur) })
  const sagas = {}
  titulos.forEach(x => { sagas[x.r.saga] = (sagas[x.r.saga] || 0) + 1 })
  const top = Object.entries(sagas).sort((a, b) => b[1] - a[1])[0]
  const favorito = titulos.filter(x => notas[x.id] && notas[x.id].p)
    .sort((a, b) => notas[b.id].p - notas[a.id].p || b.t - a.t)[0] || null
  return { min, titulos: titulos.length, episodios, dias: dias.size, racha, saga: top && top[1] >= 2 ? top : null, favorito }
}
const NOMBRE_SAGA = { xmen: ['la saga X-Men', 'the X-Men saga'], ucm: ['el UCM', 'the MCU'], comics: ['los cómics', 'the comics'], animacion: ['la animación', 'animation'] }
const nombreMes = (clave, conAnio) => new Date(Math.floor(clave / 12), clave % 12, 1).toLocaleDateString(LOC(), conAnio ? { month: 'long', year: 'numeric' } : { month: 'long' })

function TuMes({ vistas, eps, notas, idioma, onAbrir }) {
  const hoy = claveMes(Date.now())
  // meses con alguna marca, del más reciente al más antiguo (y siempre el actual)
  const meses = useMemo(() => {
    const m = new Set([hoy])
    Object.values(vistas).forEach(t => { if (esMarca(t)) m.add(claveMes(t)) })
    Object.values(eps).forEach(t => { if (esMarca(t)) m.add(claveMes(t)) })
    return [...m].filter(k => k <= hoy).sort((a, b) => b - a)
  }, [vistas, eps, hoy])
  const [i, setI] = useState(0)
  const clave = meses[Math.min(i, meses.length - 1)]
  const r = useMemo(() => resumenDeMes(clave, vistas, eps, notas), [clave, vistas, eps, notas, idioma])
  const antes = useMemo(() => resumenDeMes(clave - 1, vistas, eps, notas), [clave, vistas, eps, notas])
  if (meses.length === 1 && r.dias === 0) return null
  const horas = r.min / 60, dif = Math.round(horas - antes.min / 60)
  // la cifra en horas enteras (a 390 px «12 h 7 min» iba a dos líneas); bajo
  // la hora, minutos
  const fmtH = m => m >= 60 ? `${Math.round(m / 60)} h` : `${Math.round(m)} min`
  const conAnio = Math.floor(clave / 12) !== Math.floor(hoy / 12)
  const mes = nombreMes(clave, conAnio), mesAntes = nombreMes(clave - 1, false)
  const fav = r.favorito
  const frase = []
  if (r.saga) frase.push(tr(`sobre todo ${NOMBRE_SAGA[r.saga[0]]?.[0] || r.saga[0]} (${r.saga[1]} títulos)`, `mostly ${NOMBRE_SAGA[r.saga[0]]?.[1] || r.saga[0]} (${r.saga[1]} titles)`))
  if (antes.dias > 0 && dif !== 0) frase.push(dif > 0 ? tr(`${dif} h más que en ${mesAntes}`, `${dif} h more than in ${mesAntes}`) : tr(`${-dif} h menos que en ${mesAntes}`, `${-dif} h less than in ${mesAntes}`))
  return (
    <section className="grafica tu-mes" aria-labelledby="tu-mes-titulo">
      <div className="tu-mes-cab">
        <h3 className="grafica-titulo" id="tu-mes-titulo">{tr('Tu mes', 'Your month')}</h3>
        <div className="tu-mes-nav">
          <button type="button" className="chip-btn" disabled={i >= meses.length - 1} onClick={() => setI(v => v + 1)} aria-label={tr('Mes anterior', 'Previous month')}>‹</button>
          <span className="tu-mes-nombre" aria-live="polite">{mes}</span>
          <button type="button" className="chip-btn" disabled={i === 0} onClick={() => setI(v => Math.max(0, v - 1))} aria-label={tr('Mes siguiente', 'Next month')}>›</button>
        </div>
      </div>
      {r.dias === 0
        ? <p className="grafica-sub">{tr(`Aún no has marcado nada en ${mes}.`, `Nothing checked off in ${mes} yet.`)}</p>
        : <>
          <div className="tu-mes-cifras">
            <div><b>{fmtH(r.min)}</b><span>{tr('vistas', 'watched')}</span></div>
            <div><b>{r.titulos}</b><span>{r.titulos === 1 ? tr('título', 'title') : tr('títulos', 'titles')}</span></div>
            <div><b>{r.episodios}</b><span>{r.episodios === 1 ? tr('episodio', 'episode') : tr('episodios', 'episodes')}</span></div>
            <div><b>{r.dias}</b><span>{r.dias === 1 ? tr('día activo', 'active day') : tr('días activos', 'active days')}</span>{r.racha > 1 && <span className="tu-mes-racha">{tr(`racha de ${r.racha} días`, `${r.racha}-day streak`)}</span>}</div>
          </div>
          {frase.length > 0 && <p className="grafica-sub tu-mes-frase">{(t => t[0].toUpperCase() + t.slice(1))(frase.join(' · '))}</p>}
          {fav && (
            <button type="button" className="tu-mes-fav" onClick={() => onAbrir(fav.id)}>
              {POSTERS[fav.id] ? <img src={POSTERS[fav.id]} alt="" loading="lazy" decoding="async" /> : <span className="tu-mes-fav-img" aria-hidden="true" />}
              <span className="tu-mes-fav-texto">
                <span className="tu-mes-fav-rotulo">{tr('Tu favorito del mes', 'Your favorite this month')}</span>
                <span className="tu-mes-fav-titulo">{sinPartir(fav.r.item.t)}</span>
                <span className="tu-mes-fav-nota" aria-label={tr(`${notas[fav.id].p} estrellas`, `${notas[fav.id].p} stars`)}>{'★'.repeat(notas[fav.id].p)}</span>
              </span>
            </button>
          )}
          <button type="button" className="chip-btn tu-mes-compartir" onClick={() => compartirMes({ ...r, mes, fmtH: fmtH(r.min), favTitulo: fav ? fav.r.item.t : null, favNota: fav ? notas[fav.id].p : 0, favPoster: fav ? POSTERS[fav.id] : null, frase: frase.length ? (t => t[0].toUpperCase() + t.slice(1))(frase.join(' · ')) : '' })}>
            {tr('Compartir mi mes', 'Share my month')}
          </button>
        </>}
    </section>
  )
}

// La imagen del mes, con la misma tinta nocturna que la del progreso.
async function compartirMes(m) {
  try { await document.fonts.ready } catch {}
  const W = 1080, H = 1350
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const x = cv.getContext('2d')
  x.fillStyle = OSCURO.bg; x.fillRect(0, 0, W, H)
  x.fillStyle = 'rgba(242,239,230,0.045)'
  for (let i = 20; i < W; i += 26) for (let j = 20; j < H; j += 26) { x.beginPath(); x.arc(i, j, 1.3, 0, 7); x.fill() }
  x.save(); x.translate(80, 84); x.transform(1, 0, -0.14, 1, 0, 0)
  x.fillStyle = OSCURO.red; x.fillRect(0, 0, 470, 46); x.restore()
  x.fillStyle = '#fff'; x.font = '700 21px Archivo, sans-serif'
  x.fillText(tr('MARATÓN MARVEL · MI MES', 'MARVEL MARATHON · MY MONTH'), 100, 115)
  x.fillStyle = OSCURO.ink; x.font = '400 96px "Archivo Black", Archivo, sans-serif'
  x.fillText(m.mes.toUpperCase(), 80, 250)
  x.fillStyle = OSCURO.red; x.font = '400 170px "Archivo Black", Archivo, sans-serif'
  x.fillText(m.fmtH, 74, 450)
  x.fillStyle = OSCURO.ink2; x.font = '500 34px Archivo, sans-serif'
  x.fillText(tr('de maratón', 'of marathon'), 80, 505)
  const cifras = [[m.titulos, m.titulos === 1 ? tr('título', 'title') : tr('títulos', 'titles')], [m.episodios, m.episodios === 1 ? tr('episodio', 'episode') : tr('episodios', 'episodes')], [m.dias, m.dias === 1 ? tr('día activo', 'active day') : tr('días activos', 'active days')]]
  cifras.forEach(([n, t], k) => {
    const cx = 80 + k * 310
    x.fillStyle = OSCURO.panel2; x.beginPath(); x.roundRect(cx, 560, 290, 150, 16); x.fill()
    x.fillStyle = OSCURO.ink; x.font = '400 64px "Archivo Black", Archivo, sans-serif'; x.fillText(String(n), cx + 28, 645)
    x.fillStyle = OSCURO.ink2; x.font = '600 26px Archivo, sans-serif'; x.fillText(t, cx + 28, 686)
  })
  let y = 780
  if (m.frase) { x.fillStyle = OSCURO.ink2; x.font = '500 30px Archivo, sans-serif'; x.fillText(m.frase, 80, y); y += 60 }
  if (m.favTitulo) {
    let img = null
    if (m.favPoster) {
      img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = m.favPoster })
    }
    x.strokeStyle = OSCURO.gold; x.lineWidth = 3; x.beginPath(); x.roundRect(80, y, 920, 300, 16); x.stroke()
    if (img) { x.save(); x.beginPath(); x.roundRect(110, y + 30, 160, 240, 10); x.clip(); x.drawImage(img, 110, y + 30, 160, 240); x.restore() }
    const tx = img ? 300 : 116
    x.fillStyle = OSCURO.gold; x.font = '700 24px Archivo, sans-serif'; x.fillText(tr('MI FAVORITO DEL MES', 'MY FAVORITE THIS MONTH'), tx, y + 80)
    x.fillStyle = OSCURO.ink; x.font = '400 40px "Archivo Black", Archivo, sans-serif'
    // el título en dos líneas como mucho
    const palabras = m.favTitulo.toUpperCase().split(' '), lineas = ['']
    palabras.forEach(p => { const l = lineas[lineas.length - 1]; if (x.measureText(l + ' ' + p).width > 1000 - tx - 40 && l) lineas.push(p); else lineas[lineas.length - 1] = l ? l + ' ' + p : p })
    lineas.slice(0, 2).forEach((l, k) => x.fillText(l, tx, y + 136 + k * 48))
    x.fillStyle = OSCURO.gold; x.font = '400 44px Archivo, sans-serif'; x.fillText('★'.repeat(m.favNota), tx, y + 250)
  }
  x.fillStyle = OSCURO.ink3; x.font = '600 24px Archivo, sans-serif'
  x.fillText('ssebv.github.io/maraton-marvel', 80, H - 60)
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'))
  const archivo = new File([blob], 'mi-mes-maraton.png', { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: tr('Mi mes de maratón', 'My marathon month') }); return } catch {}
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'mi-mes-maraton.png'
  a.click(); URL.revokeObjectURL(a.href)
}

// El iPad moderno se anuncia como MacIntel; lo delata el táctil
const ES_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const YA_INSTALADA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  || window.navigator.standalone === true
// Con el dedo, el placeholder dice qué se puede buscar (el atajo «/» no existe)
const ES_TACTIL = !!(window.matchMedia && window.matchMedia('(hover: none)').matches)

// Un contador que cambia (17 → 18) rueda hacia su sitio; al montar, quieto.
function Cifra({ n }) {
  const previo = useRef(n)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (previo.current !== n) { previo.current = n; setVuelta(v => v + 1) }
  }, [n])
  return <span key={vuelta} className={vuelta ? 'cifra cifra-cambio' : 'cifra'}>{n}</span>
}

function AvisosBtn() {
  // Los avisos van por periodicsync. Donde el navegador no lo tiene (todo iOS,
  // Safari y Firefox de escritorio) el botón prometería avisos que no llegarán
  // nunca: se detecta la capacidad, no la plataforma.
  const hayPeriodicSync = typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype
  const sop = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && hayPeriodicSync
  const [estado, setEstado] = useState(() => {
    if (!sop) return 'no-sop'
    if (Notification.permission === 'granted') return 'on'
    if (Notification.permission === 'denied') return 'denegado'
    return 'off'
  })
  if (estado === 'no-sop' || estado === 'denegado') return null
  const activar = async () => {
    const p = await Notification.requestPermission()
    if (p !== 'granted') { setEstado(p === 'denied' ? 'denegado' : 'off'); return }
    setEstado('on')
    try {
      const reg = await navigator.serviceWorker.ready
      if ('periodicSync' in reg) await reg.periodicSync.register('estrenos', { minInterval: 12 * 3600 * 1000 })
    } catch {}
  }
  return estado === 'on'
    ? <span className="aviso-on">{tr('Te avisaré de estrenos y de tus sesiones', 'I’ll ping you about premieres and your sessions')}</span>
    : <button className="chip-btn aviso-btn" onClick={activar}>{tr('Avisarme de estrenos y sesiones', 'Notify me of premieres and sessions')}</button>
}

// El gesto de volver atrás (borde en iOS, botón en Android) cierra la capa de
// arriba en vez de sacar de la app. Una sola entrada de historial mientras haya
// algo abierto: abrir la primera capa la crea, cerrar la última la consume, y
// entre medias solo cambia quién responde al popstate. La conciliación va en un
// microtask porque cerrar un diálogo y abrir otro pasa en el mismo commit de
// React (Ajustes → Sincronización): decidir en caliente haría un back() de más.
let capasAtras = []
// Tras recargar con una capa abierta la entrada {capa:1} sobrevive: se reutiliza
// en vez de apilar otra, o hacía falta un atrás de más para salir de la app.
let entradaAtras = !!(history.state && history.state.capa === 1)
// La última URL que compuso el efecto de App. Al consumir la entrada con back()
// se vuelve a la anterior, que aún lleva el ?t= del título recién cerrado: hay
// que volver a escribir la buena al aterrizar.
let urlEstado = null
let consumiendoAtras = false
// Largo del historial con la entrada de la capa puesta. Ir a un #hash nuevo
// (un enlace #c/…, #u/…) TAMBIÉN dispara popstate, y con una capa abierta
// (Perfil lo es: atrás vuelve a Maratón) se tomaba por un «atrás»: se reponía
// la URL anterior y el enlace se perdía (21 sep 2026). Atrás no cambia el
// largo; una navegación nueva lo alarga.
let largoAtras = history.length
function conciliaAtras() {
  queueMicrotask(() => {
    if (capasAtras.length && !entradaAtras) { history.pushState({ capa: 1 }, ''); entradaAtras = true; largoAtras = history.length }
    else if (!capasAtras.length && entradaAtras) { entradaAtras = false; consumiendoAtras = true; history.back() }
  })
}
window.addEventListener('popstate', () => {
  if (consumiendoAtras) {
    consumiendoAtras = false
    if (urlEstado != null) history.replaceState(history.state, '', urlEstado)
    return
  }
  if (!capasAtras.length || !entradaAtras) return
  if (history.length > largoAtras) { largoAtras = history.length; return }
  entradaAtras = false
  // la entrada de abajo puede llevar la URL de otra vista (se escribió antes
  // de apilar la capa: Multiverso → Perfil → una lista, atrás, dejaba
  // #multiverso y el hashchange cambiaba de sección en vez de cerrar la
  // lista). Se repone la URL de ahora antes de que llegue ese hashchange.
  if (urlEstado != null) history.replaceState(history.state, '', urlEstado)
  // No se saca del registro aquí: cerrar una capa que sigue abierta con otra
  // clave (la pila de fichas al volver un título) la re-registra en su sitio
  // y vuelve a pedir su entrada; si de verdad se cierra, su limpieza la quita
  // y concilia. Sacarla a mano dejaba la pila sin entrada al segundo atrás.
  capasAtras[capasAtras.length - 1].cierra()
})
// `abierto` puede ser una clave (la longitud de una pila): al cambiar sin
// apagarse, la capa se vuelve a registrar EN EL MISMO SITIO, no encima de las
// que se registraron en ese mismo commit (la biografía que se reabre al
// volver un título tiene que quedar por encima de la pila que la devolvió).
// `elemento` (opcional) devuelve el nodo que sigue al dedo en el gesto de
// volver; sin él se usa el diálogo que se está tocando (ver gestosDeVolver).
// `dentro` marca capas que viven dentro de una hoja (biografía, pila): el
// asa de la hoja las salta y cierra la hoja entera.
function useVolverCierra(abierto, onCerrar, elemento, dentro = false) {
  const cierra = useRef(onCerrar)
  cierra.current = onCerrar
  const el = useRef(elemento)
  el.current = elemento
  const sitio = useRef(-1)
  useEffect(() => {
    if (!abierto) { sitio.current = -1; return undefined }
    const capa = { cierra: () => cierra.current(), el: () => el.current && el.current(), dentro }
    if (sitio.current >= 0) capasAtras.splice(Math.min(sitio.current, capasAtras.length), 0, capa)
    else capasAtras.push(capa)
    sitio.current = -1
    conciliaAtras()
    return () => {
      sitio.current = capasAtras.indexOf(capa)
      capasAtras = capasAtras.filter(c => c !== capa)
      conciliaAtras()
    }
  }, [abierto])
}

// Gestos de dedo para volver. Instalada en iPhone la app no tiene barra de
// Safari ni su deslizar desde el borde, y sin eso cada capa solo se cerraba
// con el aspa. Aquí se hacen los dos gestos del sistema para TODAS las capas
// que registran useVolverCierra, sin tocar cada una:
//  · desde el borde izquierdo hacia la derecha = atrás: la capa de arriba
//    sigue al dedo (la hoja entera, el lector, el cine, o solo la biografía
//    dentro de la ficha) y, pasado el umbral o con un latigazo, se cierra;
//  · hacia abajo sobre una hoja móvil = cerrar la hoja, con el mismo
//    seguimiento: desde el asa siempre, y desde cualquier punto cuando el
//    contenido está arriba del todo (como las hojas de iOS: tirar hacia
//    abajo con el scroll en cero descarta; hacia arriba, desplaza). Se decide
//    en el primer movimiento y se corta el desplazamiento nativo en ese
//    mismo evento, o Safari se queda con el gesto y ya no lo suelta.
//    Cierra la hoja entera aunque encima haya biografía o pila (capas
//    `dentro`): es el gesto de descartar, no el de volver.
// El nodo que se mueve es el diálogo bajo el dedo (lo que se toca es lo que
// está encima), salvo que la capa haya dicho otro. Cerrar pasa por la misma
// función que el aspa o el botón atrás: el historial se concilia solo.
// La franja del borde es exclusiva del gesto (se corta la propagación en
// captura) para que pasar página en el lector o cambiar de título en la
// ficha no se disparen a la vez. El touchmove no pasivo solo se escucha
// mientras hay gesto armado: no se le quita el scroll pasivo a toda la app.
const BORDE_ATRAS = 24
const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Desmontaje diferido: la capa sigue montada 240 ms después de cerrarse, con
// la clase «saliendo», para salir animada por donde entró. Antes solo el gesto
// animaba la salida; el aspa, Escape y atrás la quitaban de golpe. Devuelve
// [montada, clase]; reabrir durante la salida la recupera sin más. Con
// movimiento reducido se desmonta al instante, como el resto de la app.
// = --dur-larga: la salida de la hoja móvil (baja y el velo se funde) dura eso
const DUR_SALIDA = 360
function useSaliente(abierto) {
  const [montada, setMontada] = useState(!!abierto)
  useEffect(() => {
    if (abierto) { setMontada(true); return undefined }
    if (movimientoReducido()) { setMontada(false); return undefined }
    const t = setTimeout(() => setMontada(false), DUR_SALIDA)
    return () => clearTimeout(t)
  }, [abierto])
  return [montada || !!abierto, abierto ? '' : ' saliendo']
}
// Carpetas dentro de una vista (17 sep 2026): una Tierra del Multiverso, una
// lista de Perfil. Antes eran un estado suelto: atrás (borde, botón) se saltaba
// la carpeta y llevaba a Maratón a media lista; al entrar desde abajo del mapa
// la cabecera y «← Volver» quedaban por encima de la pantalla (y=231, cabecera
// a -87 px), y al salir no se volvía a donde estabas. Ahora es una capa más
// (atrás la cierra), entra y sale con el mismo desliz que las pestañas,
// empieza en su principio y al salir devuelve la posición de fuera.
// `activa`: la vista donde vive la carpeta está en pantalla (fuera de ella el
// estado se conserva, pero no responde a atrás).
function useCarpeta(abierta, setAbierta, activa) {
  const fuera = useRef(null)
  const abre = v => { fuera.current = window.scrollY; conTransicion('adelante', () => setAbierta(v)) }
  const cierra = () => conTransicion('atras', () => setAbierta(null))
  useVolverCierra(activa && abierta != null, cierra, () => document.querySelector('main'))
  const previa = useRef(abierta)
  React.useLayoutEffect(() => {
    const antes = previa.current
    previa.current = abierta
    if (!activa || antes === abierta) return
    if (abierta != null) {
      // el principio de la carpeta, bajo lo que haya pegado arriba (el mismo
      // margen que usan las anclas: scroll-padding-top)
      const main = document.querySelector('main')
      if (!main) return
      const tope = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      const y = Math.max(0, main.getBoundingClientRect().top + window.scrollY - tope)
      if (window.scrollY > y + 1) window.scrollTo({ top: y, behavior: 'instant' })
    } else if (fuera.current != null) {
      window.scrollTo({ top: fuera.current, behavior: 'instant' })
      fuera.current = null
    }
  }, [abierta, activa])
  return [abre, cierra]
}
// Subir al principio (tocar la pestaña en la que ya estás): el desplazamiento
// suave del navegador dura según la distancia (1,28 s desde 6.000 px, medido
// el 17 sep 2026). Desde lejos se salta hasta una pantalla y media del
// principio y solo ese último tramo se anima, como en las apps de iOS.
function subeArriba() {
  if (movimientoReducido()) { window.scrollTo({ top: 0, behavior: 'instant' }); return }
  const cerca = window.innerHeight * 1.5
  if (window.scrollY > cerca) window.scrollTo({ top: cerca, behavior: 'instant' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function gestosDeVolver() {
  let g = null, cerrando = false
  const hoja = () => window.matchMedia('(max-width:720px)').matches
  const reducido = movimientoReducido
  const nodoDe = (capa, objetivo) => {
    const propio = capa.el()
    if (propio) return propio
    const dialogo = objetivo && objetivo.closest && objetivo.closest('[role="dialog"]')
    if (!dialogo) return null
    return (dialogo.classList.contains('overlay') && dialogo.querySelector(':scope > .modal')) || dialogo
  }
  const velo = el => el.parentElement && el.parentElement.classList.contains('overlay') ? el.parentElement : null
  // la biografía y las vistas entran con una animación con fill:both cuyo
  // último cuadro es transform:none, que pisa el transform en línea: mientras
  // el nodo sigue al dedo se le quita el relleno (no reinicia la animación)
  const agarra = el => {
    // y si aún está entrando, se la lleva al final: mientras corre, el valor
    // de la animación manda sobre el transform en línea
    try { el.getAnimations().forEach(a => a.finish()) } catch {}
    el.style.animationFillMode = 'none'; el.style.transition = 'none'
  }
  // capa propia desde que se apoya el dedo: sin ella iOS rasteriza el nodo
  // en el primer touchmove y el arranque del arrastre da un tirón
  const prepara = el => { el.style.willChange = 'transform' }
  const suelta = el => {
    el.style.transition = ''; el.style.transform = ''; el.style.animationFillMode = ''; el.style.animation = ''; el.style.willChange = ''
    const v = velo(el)
    if (v) { v.style.transition = ''; v.style.removeProperty('--arrastre') }
  }
  // ¿todo lo desplazable entre el dedo y la hoja (la propia hoja incluida)
  // está en cero? Si algo va scrolleado, tirar hacia abajo es volver arriba
  const arribaDelTodo = (desde, hasta) => {
    for (let n = desde; n; n = n.parentElement) {
      if (n.scrollTop > 0) {
        const ov = getComputedStyle(n).overflowY
        if (ov === 'auto' || ov === 'scroll') return false
      }
      if (n === hasta) break
    }
    return true
  }
  // tras cerrar por gesto: si la capa está saliendo animada (desmontaje
  // diferido) el nodo se queda donde el dedo lo dejó; recolocarlo lo haría
  // volver y salir otra vez. Si sobrevive (biografía, vista), se recoloca.
  const sueltaTrasCerrar = el => {
    if (el.closest('.saliendo')) { el.style.transition = ''; el.style.willChange = ''; return }
    suelta(el)
  }
  const arma = () => window.addEventListener('touchmove', onMove, { passive: false })
  const desarma = () => window.removeEventListener('touchmove', onMove)
  // Física al soltar (14 sep 2026, movimiento.js): la capa vuelve o se va con
  // la velocidad que llevaba el dedo, y pasado el tope tira como una goma.
  // Muelles en marcha por nodo: si el dedo vuelve a coger una hoja que aún
  // está volviendo a su sitio, se para ahí y se sigue desde donde está.
  const vivos = new Map()
  const retoma = el => {
    const v = vivos.get(el)
    if (!v) return null
    vivos.delete(el)
    v.ctl.stop()
    return v
  }
  const dimDe = (el, modo) => modo === 'x' ? el.clientWidth : el.clientHeight
  const posDe = (el, modo, crudo) => crudo >= 0 ? crudo : -goma(-crudo, dimDe(el, modo) / 4)
  // el velo se aclara con el recorrido en los dos gestos, como en iOS
  const pinta = (el, modo, p) => {
    el.style.transform = modo === 'x' ? `translateX(${p}px)` : `translateY(${p}px)`
    const v = velo(el)
    if (v) v.style.setProperty('--arrastre', Math.min(1, Math.max(0, p) / Math.max(1, dimDe(el, modo))).toFixed(3))
  }
  const quietoVelo = el => { const v = velo(el); if (v) v.style.transition = 'none' }
  const umbralDe = (el, modo) => modo === 'x' ? Math.min(140, el.clientWidth * 0.35) : 140
  const onStart = e => {
    if (cerrando || g || e.touches.length !== 1 || !capasAtras.length) return
    const t = e.touches[0]
    if (t.clientX <= BORDE_ATRAS) {
      const capa = capasAtras[capasAtras.length - 1]
      const el = nodoDe(capa, e.target)
      if (!el) return
      e.stopPropagation()
      const vivo = retoma(el)
      g = { el, capa, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, t0: e.timeStamp, modo: null, base: 0, vel: velocimetro() }
      if (vivo && vivo.modo === 'x') { g.modo = 'x'; g.base = g.p = vivo.p; agarra(el); quietoVelo(el) }
      else if (vivo) suelta(el)
      prepara(el)
      arma()
      return
    }
    // la hoja móvil: desde el asa (franja superior) se agarra ya; desde el
    // resto solo si nada entre el dedo y la hoja está desplazado, y entonces
    // el primer movimiento decide (abajo = hoja, arriba = scroll). La hoja es
    // la que se toca, y la capa a cerrar la primera desde arriba que no viva
    // dentro de ella. Una hoja que aún vuelve a su sitio se agarra desde
    // cualquier punto.
    if (!hoja()) return
    const el = e.target.closest && e.target.closest('.modal')
    if (!el || e.target.closest('input,textarea,select')) return
    const capa = [...capasAtras].reverse().find(c => !c.dentro)
    if (!capa) return
    const vivo = retoma(el)
    if (vivo && vivo.modo !== 'y') suelta(el)
    const enMarcha = !!vivo && vivo.modo === 'y'
    const enAsa = enMarcha || (t.clientY - el.getBoundingClientRect().top <= 44 && !e.target.closest('button,a'))
    if (!enAsa && !arribaDelTodo(e.target, el)) return
    g = { el, capa, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, t0: e.timeStamp, modo: enAsa ? 'y' : 'y?', base: enMarcha ? vivo.p : 0, vel: velocimetro() }
    if (enMarcha) g.p = vivo.p
    prepara(el)
    if (enAsa) { agarra(el); quietoVelo(el) }
    arma()
  }
  const onMove = e => {
    if (!g) return
    const t = e.touches[0]
    g.dx = t.clientX - g.x0; g.dy = t.clientY - g.y0
    if (g.modo === 'y?') {
      // sin zona muerta: el primer movimiento decide y, si es hacia abajo, se
      // cancela ya el desplazamiento nativo (después Safari no lo soltaría)
      if (g.dy > 0 && g.dy >= Math.abs(g.dx)) { g.modo = 'y'; agarra(g.el); quietoVelo(g.el) }
      else { g.el.style.willChange = ''; g = null; desarma(); return }
    }
    if (!g.modo) {
      if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) return
      if (g.dx <= 0 || g.dx < Math.abs(g.dy) * 1.2) { g.el.style.willChange = ''; g = null; desarma(); return }
      g.modo = 'x'
      agarra(g.el)
      quietoVelo(g.el)
    }
    e.preventDefault()
    const crudo = g.base + (g.modo === 'x' ? g.dx : g.dy)
    g.vel.anota(e.timeStamp, crudo)
    // un tic al cruzar el punto en que soltar cierra (y otro al volver atrás
    // de él), como las hojas nativas: el dedo sabe dónde está sin mirar
    const fuera = crudo > umbralDe(g.el, g.modo)
    if (fuera !== !!g.cruzado) { g.cruzado = fuera; tic() }
    g.p = posDe(g.el, g.modo, crudo)
    pinta(g.el, g.modo, g.p)
  }
  const onCancel = () => { if (!g) return; const { el } = g; g = null; desarma(); suelta(el) }
  // solo si la capa sigue registrada: un atrás del sistema durante los 240 ms
  // de salida ya la habrá cerrado, y la pila de fichas no es idempotente
  const cierraSiSigue = capa => { if (capasAtras.includes(capa)) capa.cierra() }
  const onEnd = e => {
    if (!g) return
    const { el, capa, modo, vel } = g
    const crudo = g.base + (modo === 'x' ? g.dx : g.dy)
    const desde = g.p == null ? 0 : g.p
    g = null
    desarma()
    if (!modo || modo === 'y?') { el.style.willChange = ''; return }
    const v = vel.lee(e.timeStamp)
    // se va si pasó el umbral o si soltó con un latigazo (velocidad del dedo
    // al soltar, no la media del gesto: con la media, bajar 70 px sin prisa
    // también cerraba); no si al soltar el dedo ya volvía atrás con decisión
    const latigazo = crudo > 24 && v > 650
    if ((crudo > umbralDe(el, modo) || latigazo) && v > -300) {
      if (reducido()) { cierraSiSigue(capa); requestAnimationFrame(() => sueltaTrasCerrar(el)); return }
      cerrando = true
      const destino = dimDe(el, modo) * 1.05
      let ctl = null, hecho = false
      // Una hoja entera (la que cuelga de su velo) se cierra YA al soltar y sale
      // animada por su cuenta: si se cerraba al llegar fuera, durante ~0,7 s el
      // velo transparente seguía encima de la página y el toque para reabrir la
      // misma ficha caía en él (lo tomaba por «tocar fuera» y la cerraba otra
      // vez). Cerrada, lleva `.saliendo` y no recibe toques. Lo que sobrevive al
      // cierre (la biografía deja la ficha debajo) se sigue cerrando al llegar
      // fuera, para no ver volver un cuadro.
      const hojaEntera = !!velo(el)
      // la hoja la sigue moviendo el muelle: sin esto `.saliendo` le pondría
      // además su animación CSS de salida y dos animadores sobre el mismo
      // transform pintaban cuadros con la hoja duplicada
      if (hojaEntera) { el.style.animation = 'none'; cierraSiSigue(capa) }
      const fin = () => {
        if (hecho) return
        hecho = true
        if (ctl) ctl.stop()
        cerrando = false
        if (!hojaEntera) cierraSiSigue(capa)
        requestAnimationFrame(() => sueltaTrasCerrar(el))
      }
      ctl = muelle(desde, destino, 'irse', Math.max(v, 900), q => {
        // reabierta mientras salía (la misma ficha, antes de desmontarse): se
        // para y fin() la devuelve a su sitio (ya no está `.saliendo`)
        if (hojaEntera && !el.closest('.saliendo')) { fin(); return }
        pinta(el, modo, q); if (q >= destino - 2) fin()
      }, fin)
      setTimeout(fin, 700)
    } else {
      // vuelve como un muelle con la velocidad del dedo: pasa unos píxeles
      // de largo y asienta; se puede volver a coger a mitad
      const vivo = { modo, p: desde, ctl: null }
      vivo.ctl = muelle(desde, 0, 'volver', v, q => { vivo.p = q; pinta(el, modo, q) },
        () => { if (vivos.get(el) === vivo) vivos.delete(el); if (!g || g.el !== el) suelta(el) })
      if (vivo.ctl) vivos.set(el, vivo)
    }
  }
  window.addEventListener('touchstart', onStart, { capture: true, passive: true })
  window.addEventListener('touchend', onEnd)
  window.addEventListener('touchcancel', onCancel)
}
gestosDeVolver()

// Lo que aria-modal promete: el foco entra, no se escapa con el tabulador
// y vuelve a su sitio al cerrar. Escrito una vez para todos los diálogos.
const FOCABLES = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
// Cuántas capas tienen el fondo bloqueado: solo la última en irse lo libera,
// da igual en qué orden se cierren (cine bajo ficha, lector sobre ficha…)
let capasBloqueando = 0
// html.capa-abierta: el dock móvil vive en <body> (portal) y pintaba por encima
// de hojas, lector y modo cine; con una capa abierta se retira (CSS)
const bloqueaFondo = () => { capasBloqueando++; document.body.style.overflow = 'hidden'; document.documentElement.classList.add('capa-abierta') }
const liberaFondo = () => { capasBloqueando = Math.max(0, capasBloqueando - 1); if (!capasBloqueando) { document.body.style.overflow = ''; document.documentElement.classList.remove('capa-abierta') } }
// visible de verdad: offsetParent es null también para position:fixed
const visible = el => el.getClientRects().length > 0

function useDialogo(ref, onEscape, activo = true) {
  const salir = useRef(onEscape)
  salir.current = onEscape
  useEffect(() => {
    if (!activo) return undefined
    const previo = document.activeElement
    const t = setTimeout(() => ref.current && ref.current.focus(), 0)
    bloqueaFondo()
    const onKey = e => {
      if (e.key === 'Escape') { salir.current && salir.current(); return }
      // un grupo de opciones (role="radiogroup") se recorre con las flechas,
      // como uno nativo: la siguiente queda elegida y con el foco
      if (/^Arrow(Left|Right|Up|Down)$/.test(e.key) && ref.current) {
        const radio = document.activeElement
        const grupo = radio && radio.getAttribute('role') === 'radio' && radio.closest('[role="radiogroup"]')
        if (!grupo || !ref.current.contains(grupo)) return
        const radios = [...grupo.querySelectorAll('[role="radio"]')].filter(visible)
        const paso = /Right|Down/.test(e.key) ? 1 : -1
        const sig = radios[(radios.indexOf(radio) + paso + radios.length) % radios.length]
        e.preventDefault(); e.stopImmediatePropagation()
        sig.focus(); sig.click()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const foco = [...ref.current.querySelectorAll(FOCABLES)].filter(visible)
      if (!foco.length) return
      const primero = foco[0], ultimo = foco[foco.length - 1]
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === ref.current)) {
        e.preventDefault(); ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault(); primero.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      liberaFondo()
      // sin desplazar: el fondo estuvo bloqueado, la lista sigue donde estaba, y
      // al cerrar tras pasar de título es la app quien decide a qué tarjeta ir
      try { previo && previo.focus({ preventScroll: true }) } catch {}
    }
  }, [ref, activo])
}

const TITULOS = Object.fromEntries(DATA.flatMap(s => s.eras.flatMap(e => e.items)).map(i => [i.id, i.t]))
// Los títulos de data.js son los de Disney España. Fuera de España se enseñan
// los latinos (src/titulos.js), sustituyendo `t` en el propio dato para que
// TODAS las vistas —lista, ficha, plan, cine, diario, imagen compartida— digan
// lo mismo sin tocar cada sitio. Los originales se guardan para volver y para
// que la búsqueda entienda los dos nombres. Se aplica antes de renderizar.
// Y lo mismo con los textos escritos a mano (sinopsis, notas, guías, eras,
// multiverso): src/latam.js cambia los nombres que el doblaje latino dice
// distinto, para que la ficha de «Wolverine: Inmortal» no hable de Lobezno.
// Y los episodios llevan el título con el que Disney+ los enseña en cada
// sitio (src/episodios-latam.js, por clave «temporada:número»); las claves
// de los bits (id:s:n) no cambian.
const T_ES = { ...TITULOS }
const EP_ES = Object.fromEntries(Object.entries(EPISODES).map(([id, eps]) => [id, eps.map(e => e.t)]))
const E_ES = ESTRENOS.map(e => e.t)
const ORIGINALES = new WeakMap()
// pasa: la función del modo activo — identidad (España), latiniza (América en
// español) o el diccionario EN_TEXTOS (English, con caída al español si un
// texto nuevo aún no está traducido)
function traduce(obj, campos, pasa) {
  if (!obj) return
  let orig = ORIGINALES.get(obj)
  if (!orig) { orig = {}; campos.forEach(c => { orig[c] = obj[c] }); ORIGINALES.set(obj, orig) }
  campos.forEach(c => { if (typeof orig[c] === 'string') obj[c] = pasa(orig[c]) })
}
// El idioma vivo, a nivel de módulo: lo fija aplicaTitulos antes de cada
// render que lo cambia, y lo leen tr() y ui(). Los componentes memoizados
// deben recibir `idioma` como prop o no se enteran del cambio.
let IDIOMA_ACTUAL = 'es'
const leeIdiomaGuardado = () => {
  try {
    // ?lang=en en el enlace: para publicar la app en una comunidad en inglés
    // sin pedirle a nadie que toque Ajustes. Manda sobre lo guardado (quien
    // abre ese enlace eligió ese idioma) y se persiste como si lo eligiera;
    // el efecto de la URL lo limpia al montar, como al ?ir=. En un enlace de
    // PERFIL no: ahí el efecto no limpia y un perfil compartido con ?lang
    // reprogramaría el idioma del que lo mira en cada apertura.
    const params = new URLSearchParams(window.location.search)
    const p = params.get('perfil') ? null : params.get('lang')
    if (p === 'en' || p === 'es') {
      try { localStorage.setItem(KEY_IDIOMA, p) } catch {}
      return p
    }
    const g = localStorage.getItem(KEY_IDIOMA)
    if (g === 'en' || g === 'es') return g
    if ((navigator.language || '').toLowerCase().startsWith('en')) return 'en'
  } catch {}
  return 'es'
}
function aplicaTitulos(pais, idioma = IDIOMA_ACTUAL) {
  IDIOMA_ACTUAL = idioma
  const en = idioma === 'en'
  const latino = !en && pais !== 'ES'
  const pasa = en
    ? s => (EN_TEXTOS[s] !== undefined ? EN_TEXTOS[s] : s)
    : latino ? latiniza : s => s
  const titulo = (id, saga) => {
    if (en) return TITULOS_EN[id] || E_TITULO_EN[id] || T_ES[id]
    if (latino && TITULOS_LATAM[id]) return TITULOS_LATAM[id]
    return latino && saga === 'comics' ? latiniza(T_ES[id]) : T_ES[id]
  }
  DATA.forEach(s => {
    traduce(s, ['titulo', 'desc', 'uni'], pasa)
    ;(s.guia || []).forEach(g => traduce(g, ['t', 'p'], pasa))
    s.eras.forEach(era => {
      traduce(era, ['era'], pasa)
      era.items.forEach(it => {
        it.t = titulo(it.id, s.saga)
        TITULOS[it.id] = it.t
        traduce(it, ['res', 'n', 'pc', 'pcn', 'uni'], pasa)
      })
    })
  })
  ESTRENOS.forEach((e, i) => {
    const id = Object.keys(T_ES).find(k => T_ES[k] === E_ES[i])
    e.t = (id && (en ? TITULOS_EN[id] : latino && TITULOS_LATAM[id])) || E_ES[i]
    traduce(e, ['n', 'tipo', 'aprox'], pasa)
  })
  MULTIVERSO.forEach(u => traduce(u, ['nombre', 'estado', 'desc'], pasa))
  LOGROS.forEach(l => traduce(l, ['t', 'd'], pasa))
  MAPA_ARISTAS.forEach(a => traduce(a, ['t'], pasa))
  Object.entries(EPISODES).forEach(([id, eps]) => {
    const lat = latino && EPISODIOS_LATAM[id]
    const ing = en && EPISODIOS_EN[id]
    eps.forEach((e, i) => {
      e.t = en
        ? (ing && ing[`${e.s}:${e.n}`]) || EP_ES[id][i]
        : (lat && lat[`${e.s}:${e.n}`]) || (latino ? latiniza(EP_ES[id][i]) : EP_ES[id][i])
    })
  })
}
// título inglés de los cómics: el campo `en` que data.js ya traía para la
// búsqueda de Marvel Unlimited
const E_TITULO_EN = (() => {
  const m = {}
  DATA.forEach(s => s.eras.forEach(e => e.items.forEach(it => { if (it.en) m[it.id] = it.en })))
  return m
})()

// tr: un literal de interfaz en los dos idiomas, elegido por el idioma vivo.
// Los componentes que lo usan se re-renderizan al cambiar (App entera cambia
// de estado), salvo los memoizados, que deben recibir `idioma` como prop.
const tr = (es, en) => (IDIOMA_ACTUAL === 'en' ? en : es)
// fechas y números: cada idioma con su formato
const LOC = () => (IDIOMA_ACTUAL === 'en' ? 'en-US' : 'es-ES')
// Un nombre con guion no se parte al final de la línea: el navegador corta
// tras el guion y salían «X-» / «Men», «Spider-» / «Man», «One-» / «Shot» en
// tarjetas, fichas, estrenos y logros (repaso con capturas, 16 sep 2026)
const RE_GUION = /[\p{L}\d]{1,10}-[\p{L}\d]{1,10}/gu
function sinPartir(texto) {
  if (typeof texto !== 'string' || !texto.includes('-')) return texto
  const trozos = []
  let i = 0
  for (const m of texto.matchAll(RE_GUION)) {
    if (m.index > i) trozos.push(texto.slice(i, m.index))
    trozos.push(<span className="sinparto" key={m.index}>{m[0]}</span>)
    i = m.index + m[0].length
  }
  if (i < texto.length) trozos.push(texto.slice(i))
  return trozos
}

// Textos de la interfaz que dicen «móvil» u «ordenador»: fuera de España pasan
// por el mismo diccionario que la prosa («celular», «computadora»); con la
// interfaz en inglés gana el tercer argumento
const ui = (pais, texto, en) => (IDIOMA_ACTUAL === 'en' && en !== undefined ? en : pais === 'ES' || IDIOMA_ACTUAL === 'en' ? texto : latiniza(texto))

// Ajustes › Cuenta (fase 2 de la comunidad, 16 sep 2026): entrar con Google o
// con un enlace por correo, el perfil público, su privacidad y los derechos de
// la Ley 21.719 (descargar y borrar). Solo existe si NUBE está configurado.
function CuentaAjuste({ cuenta, perfil, estado, aviso, token, onEnlace, onCrearPerfil, onPrivacidad, onDescargar, onBorrar, onSalir, onVerPerfil }) {
  const [correo, setCorreo] = useState('')
  const [busco, setBusco] = useState('')
  // a quién sigues (con su avatar), para volver a sus perfiles
  const [sigo, setSigo] = useState(null)
  useEffect(() => {
    if (!NUBE || !cuenta || !perfil) { setSigo(null); return undefined }
    let vivo = true
    ;(async () => {
      try {
        const filas = await rest(await token(), `seguimientos?seguidor=eq.${cuenta.uid}&select=seguido:perfiles!seguimientos_seguido_fkey(nombre,avatar)&order=desde.desc&limit=60`)
        if (vivo) setSigo((Array.isArray(filas) ? filas : []).map(f => f && esObj(f.seguido) && typeof f.seguido.nombre === 'string' ? f.seguido : null).filter(Boolean))
      } catch { if (vivo) setSigo([]) }
    })()
    return () => { vivo = false }
  }, [cuenta && cuenta.uid, perfil && perfil.id])
  const [envio, setEnvio] = useState(null) // null | 'enviando' | 'enviado' | 'error'
  const [borrando, setBorrando] = useState(false)
  const [yendo, setYendo] = useState(false)
  if (!NUBE) return null
  const PRIV = [['publico', tr('Público', 'Public')], ['seguidores', tr('Seguidores', 'Followers')], ['privado', tr('Solo yo', 'Only me')]]
  const BLOQUES = [['priv_progreso', tr('Lo que has visto', 'What you’ve watched')], ['priv_resenas', tr('Estrellas y reseñas', 'Stars and reviews')], ['priv_logros', tr('Logros', 'Achievements')]]
  return (
    <div className="ajuste cuenta-ajuste">
      <div className="ajuste-cab">
        <h3 className="ajuste-titulo">{tr('Cuenta', 'Account')}</h3>
        <p className="ajuste-pista">
          {cuenta
            ? (estado === 'error'
              ? tr('Dentro, pero ahora mismo sin conexión. Se reintenta al volver a la app.', 'Signed in, but offline right now. It retries when you come back.')
              : tr('Tu progreso, notas, listas, horario y páginas de lectura te siguen a cualquier dispositivo donde entres.', 'Your progress, notes, lists, schedule and reading pages follow you to any device you sign into.'))
            : tr('Entra y tu progreso te sigue a cualquier dispositivo, y podrás unirte a comunidades. Sin cuenta, todo se guarda igual en este navegador.', 'Sign in and your progress follows you to any device, and you can join communities. Without an account, everything still saves in this browser.')}
        </p>
        {aviso && <p className="aviso-sin-red" role="status">{aviso}</p>}
      </div>
      {!cuenta && (
        <div className="cuenta-entrar">
          <button className="accion-principal" disabled={yendo} onClick={async () => {
            setYendo(true)
            try { window.location.assign(await urlGoogle()) } catch { setYendo(false) }
          }}>{tr('Entrar con Google', 'Sign in with Google')}</button>
          <form className="cuenta-correo" onSubmit={async e => {
            e.preventDefault()
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) { setEnvio('error'); return }
            setEnvio('enviando')
            try { await onEnlace(correo.trim()); setEnvio('enviado') } catch { setEnvio('error') }
          }}>
            <label className="ajuste-pista" htmlFor="cuenta-correo">{tr('O con un enlace a tu correo', 'Or with a link to your email')}</label>
            <div className="cuenta-correo-fila">
              <input id="cuenta-correo" className="busca" type="email" inputMode="email" autoComplete="email" enterKeyHint="send"
                placeholder={tr('tu@correo.cl', 'you@email.com')} value={correo} onChange={e => { setCorreo(e.target.value); setEnvio(null) }} />
              <button className="chip-btn" type="submit" disabled={envio === 'enviando'}>{envio === 'enviando' ? tr('Enviando…', 'Sending…') : tr('Enviar enlace', 'Send link')}</button>
            </div>
            {envio === 'enviado' && <span className="ajuste-pista" role="status">{tr('Listo: abre el enlace del correo en este mismo navegador.', 'Done: open the email link in this same browser.')}</span>}
            {envio === 'error' && <span className="import-error" role="status">{tr('No se pudo enviar. Revisa la dirección e inténtalo otra vez.', 'Could not send. Check the address and try again.')}</span>}
          </form>
        </div>
      )}
      {cuenta && !perfil && (
        <div className="ajuste-ops cuenta-fila">
          <span className="cuenta-nombre">{cuenta.email || cuenta.nombre}</span>
          <button className="chip-btn destacado" onClick={onCrearPerfil}>{tr('Crear mi perfil', 'Create my profile')}</button>
          <button className="ghost" onClick={onSalir}>{tr('Salir', 'Sign out')}</button>
        </div>
      )}
      {cuenta && perfil && (
        <>
          <div className="cuenta-fila">
            {POSTERS[perfil.avatar] && <img className="cuenta-foto" src={POSTERS[perfil.avatar]} alt="" />}
            <span className="cuenta-textos">
              <span className="cuenta-nombre">@{perfil.nombre}</span>
              <span className="cuenta-correo-txt">{cuenta.email}</span>
            </span>
            <button className="ghost" onClick={onSalir}>{tr('Salir', 'Sign out')}</button>
          </div>
          <div className="ajuste-ops">
            <button className="chip-btn" onClick={() => onVerPerfil(perfil.nombre)}>{tr('Ver mi perfil', 'View my profile')}</button>
          </div>
          <form className="cuenta-buscar" onSubmit={e => {
            e.preventDefault()
            const n = busco.trim().replace(/^@/, '').toLowerCase()
            if (/^[a-z0-9_]{3,20}$/.test(n)) onVerPerfil(n)
          }}>
            <label className="ajuste-pista" htmlFor="cuenta-buscar">{tr('Buscar a alguien por su nombre de usuario', 'Find someone by username')}</label>
            <div className="cuenta-correo-fila">
              <input id="cuenta-buscar" className="busca" autoCapitalize="none" autoComplete="off" spellCheck={false} enterKeyHint="search"
                placeholder="@nombre" value={busco} onChange={e => setBusco(e.target.value)} />
              <button className="chip-btn" type="submit">{tr('Ver perfil', 'View profile')}</button>
            </div>
          </form>
          {sigo && sigo.length > 0 && (
            <div className="cuenta-sigo">
              <p className="ajuste-pista">{tr(`Sigues a ${sigo.length}`, `You follow ${sigo.length}`)}</p>
              <ul className="cuenta-sigo-lista">
                {sigo.map(p => (
                  <li key={p.nombre}>
                    <button className="cuenta-sigo-item" onClick={() => onVerPerfil(p.nombre)}>
                      {POSTERS[p.avatar] ? <img src={POSTERS[p.avatar]} alt="" loading="lazy" /> : <span className="perfil-avatar" aria-hidden="true" />}
                      <span>@{p.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="cuenta-privacidad">
            <p className="ajuste-pista">{tr('Quién ve cada parte de tu perfil', 'Who sees each part of your profile')}</p>
            {BLOQUES.map(([campo, rotulo]) => (
              <div className="cuenta-priv-fila" key={campo}>
                <span className="cuenta-priv-rotulo" id={`priv-${campo}`}>{rotulo}</span>
                <span className="ajuste-ops" role="radiogroup" aria-labelledby={`priv-${campo}`}>
                  {PRIV.map(([v, t]) => (
                    <button key={v} className="chip-btn" role="radio" aria-checked={perfil[campo] === v} onClick={() => onPrivacidad(campo, v)}>{t}</button>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="ajuste-ops">
            <button className="chip-btn" onClick={onDescargar}>{tr('Descargar mis datos', 'Download my data')}</button>
            {!borrando
              ? <button className="chip-btn peligro" onClick={() => setBorrando(true)}>{tr('Borrar mi cuenta', 'Delete my account')}</button>
              : (
                <span className="aviso peligro cuenta-borrar" role="alert">
                  <span className="aviso-texto">{tr('Se borran tu perfil, tu progreso en la nube, tus hilos y respuestas. Lo de este navegador se queda. No se puede deshacer.', 'Your profile, cloud progress, threads and replies are deleted. What’s in this browser stays. This can’t be undone.')}</span>
                  <span className="aviso-acciones">
                    <button className="chip-btn peligro" onClick={() => { setBorrando(false); onBorrar() }}>{tr('Sí, borrar', 'Yes, delete')}</button>
                    <button className="chip-btn" onClick={() => setBorrando(false)}>{tr('Cancelar', 'Cancel')}</button>
                  </span>
                </span>
              )}
          </div>
        </>
      )}
    </div>
  )
}

// El perfil de una persona en la comunidad (#u/nombre): cabecera, seguir, y
// sus cifras, mapa, logros y valoraciones SOLO en los bloques que su
// privacidad deja ver a quien mira (lo decide la base: rpc/perfil_publico).
// Se ve también sin cuenta (lo público); seguir pide entrar.
function PerfilPublico({ saliendo, nombre, cuenta, token, onCerrar, onEntrar }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [datos, setDatos] = useState(null) // null cargando · false no existe · 'error' · objeto
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const carga = async () => {
    try {
      const j = await rest(cuenta ? await token() : null, 'rpc/perfil_publico', { method: 'POST', body: { nombre_in: nombre } })
      const p = esObj(j) && saneaPerfil({ ...j, priv_progreso: 'publico', priv_resenas: 'publico', priv_logros: 'publico' })
      if (!p) { setDatos(false); return }
      const notas = j.notas == null ? null : (saneaNotas(j.notas) || {})
      setDatos({
        ...p,
        seguidores: Number(j.seguidores) || 0, siguiendo: Number(j.siguiendo) || 0, loSigo: j.lo_sigo === true,
        vistas: j.vistas == null ? null : (saneaMarcas(j.vistas) || {}),
        eps: j.eps == null ? null : (saneaMarcas(j.eps) || {}),
        notasP: notas && Object.fromEntries(Object.entries(notas).filter(([, n]) => n.p).map(([id, n]) => [id, n.p])),
        logros: j.logros_visibles === true,
      })
    } catch { setDatos('error') }
  }
  useEffect(() => { setDatos(null); carga() }, [nombre, cuenta && cuenta.uid])
  const ok = esObj(datos)
  const { est, pct, ctx } = usePerfilEst(ok && datos.vistas || {}, ok && datos.eps || {}, ok && datos.notasP || {})
  const propio = ok && cuenta && datos.id === cuenta.uid
  const sigue = async () => {
    if (!cuenta) { onEntrar(); return }
    const ya = datos.loSigo
    setOcupado(true)
    setDatos(d => ({ ...d, loSigo: !ya, seguidores: d.seguidores + (ya ? -1 : 1) }))
    try {
      const t = await token()
      if (ya) await rest(t, `seguimientos?seguidor=eq.${cuenta.uid}&seguido=eq.${datos.id}`, { method: 'DELETE', prefer: 'return=minimal' })
      else await rest(t, 'seguimientos', { method: 'POST', prefer: 'return=minimal', body: { seguidor: cuenta.uid, seguido: datos.id } })
      // lo que comparte «con seguidores» aparece (o se va) al momento
      await carga()
    } catch {
      setDatos(d => ({ ...d, loSigo: ya, seguidores: d.seguidores + (ya ? 1 : -1) }))
    } finally { setOcupado(false) }
  }
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-label={tr(`Perfil de @${nombre}`, `@${nombre}’s profile`)}>
      <div className="modal perfil-hoja" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          {datos === null && <p className="modal-res" role="status">{tr('Cargando perfil…', 'Loading profile…')}</p>}
          {datos === false && <p className="modal-res" role="status">{tr(`No hay nadie con el nombre @${nombre}.`, `There’s nobody called @${nombre}.`)}</p>}
          {datos === 'error' && <p className="aviso-sin-red" role="status">{tr('No se pudo cargar el perfil. Revisa la conexión.', 'Could not load the profile. Check your connection.')}</p>}
          {ok && (
            <>
              <header className="perfil-cab">
                {POSTERS[datos.avatar] ? <img className="perfil-avatar" src={POSTERS[datos.avatar]} alt="" /> : <span className="perfil-avatar" aria-hidden="true" />}
                <div className="perfil-textos">
                  <h2 className="modal-titulo">@{datos.nombre}</h2>
                  {datos.nombre_visible && <p className="perfil-visible">{datos.nombre_visible}</p>}
                  <p className="perfil-cuenta">
                    <b>{datos.seguidores}</b> {datos.seguidores === 1 ? tr('seguidor', 'follower') : tr('seguidores', 'followers')} · <b>{datos.siguiendo}</b> {tr('siguiendo', 'following')}
                  </p>
                </div>
              </header>
              {datos.bio && <p className="modal-res perfil-bio">{datos.bio}</p>}
              <div className="modal-acciones">
                {!propio && (
                  <button className={datos.loSigo ? 'chip-btn' : 'accion-principal'} aria-pressed={datos.loSigo} disabled={ocupado} onClick={sigue}>
                    {!cuenta ? tr('Entra para seguir', 'Sign in to follow') : datos.loSigo ? tr('Siguiendo', 'Following') : tr('Seguir', 'Follow')}
                  </button>
                )}
                <button className="chip-btn" onClick={() => {
                  const url = enlacePerfil(datos.nombre)
                  if (navigator.share) navigator.share({ url, title: `@${datos.nombre}` }).catch(() => {})
                  else navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500) })
                }}>{copiado ? tr('¡Enlace copiado!', 'Link copied!') : tr('Compartir perfil', 'Share profile')}</button>
              </div>
              {propio && <p className="ajuste-pista">{tr('Así ves tu perfil tú. Los demás ven cada parte según tu privacidad (Ajustes › Cuenta).', 'This is how you see your profile. Others see each part according to your privacy (Settings › Account).')}</p>}
              {datos.vistas ? (
                <div className="perfil-cuerpo">
                  <PerfilCifras est={est} pct={pct} />
                  <PerfilMapa est={est} vistasP={datos.vistas} />
                  {datos.logros && <Logros ctx={ctx} />}
                  {datos.notasP && <PerfilValoradas est={est} />}
                </div>
              ) : (
                <p className="aviso centrado perfil-privado">
                  <span className="aviso-texto">{datos.loSigo
                    ? tr('Su progreso es privado.', 'Their progress is private.')
                    : tr('No comparte su progreso contigo. Si lo comparte con sus seguidores, lo verás al seguirle.', 'They don’t share their progress with you. If they share it with followers, you’ll see it once you follow.')}</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Comunidades (fase 3, estilo Strava) ──
// Perfil › Comunidades: las tuyas, descubrir las públicas, crear una y entrar
// con código. Sin cuenta se ven las públicas y se invita a entrar.
function ComunidadTarjeta({ c, papel, onAbrir }) {
  const tipo = TIPOS_COMUNIDAD.find(t => t[0] === c.tipo)
  return (
    <li>
      <button className="comunidad-tarjeta" onClick={() => onAbrir(c.direccion)}>
        {c.portada && POSTERS[c.portada] ? <img src={POSTERS[c.portada]} alt="" loading="lazy" decoding="async" /> : <span className="comunidad-sin-portada" aria-hidden="true" />}
        <span className="comunidad-textos">
          <span className="comunidad-nombre">{c.nombre}</span>
          <span className="comunidad-meta">{c.miembros === 1 ? tr('1 miembro', '1 member') : tr(`${c.miembros} miembros`, `${c.miembros} members`)} · {tipo ? tr(tipo[1], tipo[2]) : ''}</span>
        </span>
        {papel && papel !== 'miembro' && <span className="tipo opc">{papel === 'dueno' ? tr('Dueño', 'Owner') : tr('Moderas', 'Moderator')}</span>}
      </button>
    </li>
  )
}

function Comunidades({ cuenta, token, recarga, onEntrar, onAbrir, onCrear, onCodigo, onAbrirHilo }) {
  const [avisos, setAvisos] = useState([])
  useEffect(() => {
    if (!cuenta) { setAvisos([]); return undefined }
    let vivo = true
    ;(async () => {
      try {
        const filas = await rest(await token(), 'avisos?leido=is.false&select=id,tipo,hilo,creado,de:perfiles!avisos_de_fkey(nombre),h:hilos(titulo)&order=creado.desc&limit=20')
        if (vivo) setAvisos((Array.isArray(filas) ? filas : []).filter(a => esObj(a) && typeof a.hilo === 'number'))
      } catch {}
    })()
    return () => { vivo = false }
  }, [cuenta && cuenta.uid, recarga])
  const [mias, setMias] = useState(null)
  const [publicas, setPublicas] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [errorCodigo, setErrorCodigo] = useState('')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const t = cuenta ? await token() : null
        const [m, p] = await Promise.all([
          cuenta ? rest(t, `membresias?usuario=eq.${cuenta.uid}&select=papel,comunidad:comunidades(${CAMPOS_COMUNIDAD})&order=desde.desc`) : Promise.resolve([]),
          rest(t, `comunidades?tipo=eq.publica&oculta=eq.false&select=${CAMPOS_COMUNIDAD}&order=miembros.desc,creado.desc&limit=30`),
        ])
        if (!vivo) return
        const lm = (Array.isArray(m) ? m : []).map(f => { const c = saneaComunidad(f && f.comunidad); return c && { c, papel: f.papel } }).filter(Boolean)
        setMias(lm)
        const ids = new Set(lm.map(x => x.c.id))
        setPublicas((Array.isArray(p) ? p : []).map(saneaComunidad).filter(c => c && !ids.has(c.id)))
      } catch { if (vivo) { setMias(m => m || []); setPublicas(p => p || []) } }
    })()
    return () => { vivo = false }
  }, [cuenta && cuenta.uid, recarga])
  return (
    <div className="comunidades">
      <header className="comunidades-cab">
        <p className="saga-desc">{tr('Grupos para ver el maratón juntos: ranking semanal de horas, retos y lo que va marcando cada uno.', 'Groups to watch the marathon together: weekly hours ranking, challenges and what everyone is marking.')}</p>
        {cuenta
          ? <button className="accion-principal" onClick={onCrear}>{tr('Crear comunidad', 'Create community')}</button>
          : <button className="accion-principal" onClick={onEntrar}>{tr('Entra para unirte o crear una', 'Sign in to join or create one')}</button>}
      </header>
      {cuenta && (
        <form className="cuenta-buscar comunidades-codigo" onSubmit={async e => {
          e.preventDefault()
          const m = codigo.trim().match(/([a-f0-9]{16,40})\s*$/i)
          if (!m) { setErrorCodigo(tr('Pega el enlace o el código de la invitación.', 'Paste the invite link or code.')); return }
          setErrorCodigo('')
          const r = await onCodigo(m[1].toLowerCase())
          if (r) setErrorCodigo(r)
          else setCodigo('')
        }}>
          <label className="ajuste-pista" htmlFor="comunidad-codigo">{tr('¿Te invitaron? Pega el enlace o el código', 'Invited? Paste the link or code')}</label>
          <div className="cuenta-correo-fila">
            <input id="comunidad-codigo" className="busca" autoCapitalize="none" autoComplete="off" spellCheck={false}
              placeholder={tr('Enlace o código', 'Link or code')} value={codigo} onChange={e => setCodigo(e.target.value)} />
            <button className="chip-btn" type="submit">{tr('Entrar', 'Join')}</button>
          </div>
          {errorCodigo && <span className="import-error" role="status">{errorCodigo}</span>}
        </form>
      )}
      {cuenta && avisos.length > 0 && (
        <section className="comunidades-bloque">
          <h3 className="grafica-titulo">{tr('Avisos', 'Notifications')} <span className="tab-insignia-texto">{avisos.length}</span></h3>
          <ul className="muro-lista">
            {avisos.map(a => (
              <li key={a.id}>
                <button className="aviso-fila" onClick={async () => {
                  setAvisos(l => l.filter(x => x.id !== a.id))
                  onAbrirHilo(a.hilo)
                  try { await rest(await token(), `avisos?id=eq.${a.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { leido: true } }) } catch {}
                }}>
                  <b>@{esObj(a.de) ? a.de.nombre : '?'}</b> {a.tipo === 'mencion' ? tr('te mencionó en', 'mentioned you in') : tr('te respondió en', 'replied to you in')} «{esObj(a.h) ? a.h.titulo : ''}»
                  <span className="muro-cuando">{haceCuanto(Date.parse(a.creado))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {cuenta && (
        <section className="comunidades-bloque">
          <h3 className="grafica-titulo">{tr('Tus comunidades', 'Your communities')}</h3>
          {mias === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
            : mias.length === 0 ? <p className="ajuste-pista">{tr('Aún no estás en ninguna. Crea una para tus amigos o entra en una pública.', 'You’re not in any yet. Create one for your friends or join a public one.')}</p>
            : <ul className="comunidades-lista">{mias.map(({ c, papel }) => <ComunidadTarjeta key={c.id} c={c} papel={papel} onAbrir={onAbrir} />)}</ul>}
        </section>
      )}
      <section className="comunidades-bloque">
        <h3 className="grafica-titulo">{tr('Descubrir', 'Discover')}</h3>
        {publicas === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
          : publicas.length === 0 ? <p className="ajuste-pista">{tr('No hay comunidades públicas todavía.', 'No public communities yet.')}</p>
          : <ul className="comunidades-lista">{publicas.map(c => <ComunidadTarjeta key={c.id} c={c} onAbrir={onAbrir} />)}</ul>}
      </section>
    </div>
  )
}

// Una comunidad (#c/direccion): cabecera, entrar o salir, invitar, el
// ranking de horas de la semana o del mes (calculado en la base con los
// minutos del catálogo) y tus preferencias de miembro.
function ComunidadHoja({ saliendo, direccion, cuenta, token, onCerrar, onVerPerfil, onCambio, onEntrar, onForo, onAbrirHilo, vistas, eps, recargaHilos }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [c, setC] = useState(null) // null cargando · false no existe o privada · 'error' · objeto
  const [yo, setYo] = useState(null) // membresía propia o null
  const [ventana, setVentana] = useState('semana')
  const [ranking, setRanking] = useState(null)
  const [invitacion, setInvitacion] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [grupo, indicador] = useIndicador(ventana)
  const [retos, setRetos] = useState(null)
  const [creaReto, setCreaReto] = useState(false)
  const [plantilla, setPlantilla] = useState('express')
  const [fechaReto, setFechaReto] = useState(() => (ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now()) || { fecha: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }).fecha)
  const [muro, setMuro] = useState(null)
  const [hayMas, setHayMas] = useState(false)
  const [hilos, setHilos] = useState(null)
  const carga = async () => {
    try {
      const t = cuenta ? await token() : null
      const filas = await rest(t, `comunidades?direccion=eq.${direccion}&select=${CAMPOS_COMUNIDAD}`)
      const k = Array.isArray(filas) && saneaComunidad(filas[0])
      if (!k) { setC(false); return }
      setC(k)
      if (cuenta) {
        const m = await rest(t, `membresias?comunidad=eq.${k.id}&usuario=eq.${cuenta.uid}&select=papel,muro_activo,en_ranking`)
        setYo(Array.isArray(m) && esObj(m[0]) ? m[0] : null)
      }
    } catch { setC('error') }
  }
  useEffect(() => { setC(null); setYo(null); carga() }, [direccion, cuenta && cuenta.uid])
  const ok = esObj(c)
  useEffect(() => {
    // ranking y retos son solo para miembros (la base lo exige desde la
    // revisión de seguridad); la ventana la fija el servidor
    if (!ok || !yo) { setRanking(null); return undefined }
    let vivo = true
    setRanking(null)
    ;(async () => {
      try {
        const filas = await rest(await token(), 'rpc/ranking', { method: 'POST', body: { comunidad_in: c.id, ventana_in: ventana === 'semana' ? '7d' : '30d' } })
        if (vivo) setRanking((Array.isArray(filas) ? filas : []).filter(f => esObj(f) && typeof f.nombre === 'string'))
      } catch { if (vivo) setRanking([]) }
    })()
    return () => { vivo = false }
  }, [ok && c.id, ventana, !!yo, yo && yo.en_ranking])
  const cargaRetos = async () => {
    try {
      const t = cuenta ? await token() : null
      const hoy = new Date().toISOString().slice(0, 10)
      const filas = await rest(t, `retos?comunidad=eq.${c.id}&hasta=gte.${hoy}&select=id,nombre,titulos,hasta&order=hasta.asc&limit=10`)
      const lista = (Array.isArray(filas) ? filas : []).filter(r => esObj(r) && typeof r.nombre === 'string' && Array.isArray(r.titulos))
      const conProgreso = await Promise.all(lista.map(async r => {
        const p = yo ? await rest(t, 'rpc/progreso_reto', { method: 'POST', body: { reto_in: r.id } }).catch(() => []) : []
        return { ...r, progreso: (Array.isArray(p) ? p : []).filter(x => esObj(x) && typeof x.nombre === 'string') }
      }))
      setRetos(conProgreso)
    } catch { setRetos([]) }
  }
  const cargaMuro = async (antes = null) => {
    try {
      const filas = await rest(await token(), 'rpc/muro', { method: 'POST', body: { comunidad_in: c.id, antes_in: antes } })
      const lista = (Array.isArray(filas) ? filas : []).filter(a => esObj(a) && typeof a.nombre === 'string' && typeof a.ref === 'string')
      setMuro(m => (antes ? [...(m || []), ...lista] : lista))
      setHayMas(lista.length === 40)
    } catch { setMuro(m => m || []) }
  }
  useEffect(() => { if (ok) cargaRetos() }, [ok && c.id, !!yo, yo && yo.en_ranking])
  useEffect(() => {
    if (!ok) return undefined
    let vivo = true
    ;(async () => {
      try {
        const filas = await rest(cuenta ? await token() : null, `hilos?comunidad=eq.${c.id}&select=${CAMPOS_HILO}&order=fijado.desc,creado.desc&limit=5`)
        if (vivo) setHilos((Array.isArray(filas) ? filas : []).map(saneaHilo).filter(Boolean))
      } catch { if (vivo) setHilos([]) }
    })()
    return () => { vivo = false }
  }, [ok && c.id, recargaHilos, !!yo])
  useEffect(() => { if (ok && yo) cargaMuro(); else setMuro(null) }, [ok && c.id, !!yo, yo && yo.muro_activo])
  const aplaude = async a => {
    const ya = a.aplaudido
    setMuro(m => m.map(x => (x.id === a.id ? { ...x, aplaudido: !ya, aplausos: x.aplausos + (ya ? -1 : 1) } : x)))
    try {
      const t = await token()
      if (ya) await rest(t, `aplausos?usuario=eq.${cuenta.uid}&actividad=eq.${a.id}`, { method: 'DELETE', prefer: 'return=minimal' })
      else await rest(t, 'aplausos', { method: 'POST', prefer: 'return=minimal', body: { usuario: cuenta.uid, actividad: a.id } })
    } catch {
      setMuro(m => m.map(x => (x.id === a.id ? { ...x, aplaudido: ya, aplausos: x.aplausos + (ya ? 1 : -1) } : x)))
    }
  }
  const accion = async fn => {
    setOcupado(true)
    try { await fn(await token()); await carga(); onCambio() } catch { /* el estado se queda como estaba */ } finally { setOcupado(false) }
  }
  const puedeInvitar = yo && (yo.papel === 'dueno' || yo.papel === 'moderador')
  const tipo = ok && TIPOS_COMUNIDAD.find(t => t[0] === c.tipo)
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-label={ok ? c.nombre : tr('Comunidad', 'Community')}>
      <div className="modal comunidad-hoja" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          {c === null && <p className="modal-res" role="status">{tr('Cargando comunidad…', 'Loading community…')}</p>}
          {c === false && <p className="modal-res" role="status">{tr('Esta comunidad no existe o es privada.', 'This community doesn’t exist or is private.')}</p>}
          {c === 'error' && <p className="aviso-sin-red" role="status">{tr('No se pudo cargar. Revisa la conexión.', 'Could not load. Check your connection.')}</p>}
          {ok && (
            <>
              <header className="perfil-cab">
                {c.portada && POSTERS[c.portada] ? <img className="comunidad-portada" src={POSTERS[c.portada]} alt="" /> : <span className="comunidad-portada comunidad-sin-portada" aria-hidden="true" />}
                <div className="perfil-textos">
                  <h2 className="modal-titulo">{c.nombre}</h2>
                  <p className="perfil-cuenta"><b>{c.miembros}</b> {c.miembros === 1 ? tr('miembro', 'member') : tr('miembros', 'members')} · {tipo ? tr(tipo[1], tipo[2]) : ''}</p>
                </div>
              </header>
              {c.descripcion && <p className="modal-res perfil-bio">{c.descripcion}</p>}
              <div className="modal-acciones">
                {!cuenta && <button className="accion-principal" onClick={onEntrar}>{tr('Entra para unirte', 'Sign in to join')}</button>}
                {cuenta && !yo && c.tipo === 'publica' && (
                  <button className="accion-principal" disabled={ocupado} onClick={() => accion(t => rest(t, 'membresias', { method: 'POST', prefer: 'return=minimal', body: { comunidad: c.id, usuario: cuenta.uid } }))}>
                    {tr('Unirme', 'Join')}
                  </button>
                )}
                {cuenta && !yo && c.tipo !== 'publica' && <p className="ajuste-pista">{tr('Para entrar hace falta una invitación de alguien de dentro.', 'You need an invite from someone inside to join.')}</p>}
                {puedeInvitar && (
                  <button className="chip-btn" disabled={ocupado} onClick={() => accion(async t => {
                    const filas = await rest(t, 'invitaciones?select=codigo', { method: 'POST', prefer: 'return=representation', body: { comunidad: c.id, creada_por: cuenta.uid } })
                    const cod = Array.isArray(filas) && filas[0] && filas[0].codigo
                    if (typeof cod === 'string') setInvitacion(enlaceInvitacion(cod))
                  })}>{tr('Invitar', 'Invite')}</button>
                )}
                <button className="chip-btn" onClick={() => {
                  const url = enlaceComunidad(c.direccion)
                  if (navigator.share) navigator.share({ url, title: c.nombre }).catch(() => {})
                  else navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500) })
                }}>{copiado ? tr('¡Enlace copiado!', 'Link copied!') : tr('Compartir', 'Share')}</button>
              </div>
              {invitacion && (
                <div className="sync-codigo comunidad-invitacion">
                  <span className="ajuste-pista">{tr('Enlace de invitación (vale 14 días y 25 usos):', 'Invite link (valid 14 days, 25 uses):')}</span>
                  <code>{invitacion}</code>
                  <button className="chip-btn" onClick={() => {
                    if (navigator.share) navigator.share({ url: invitacion, title: tr(`Únete a ${c.nombre}`, `Join ${c.nombre}`) }).catch(() => {})
                    else navigator.clipboard.writeText(invitacion)
                  }}>{tr('Enviar invitación', 'Send invite')}</button>
                </div>
              )}
              <section className="comunidad-ranking">
                <div className="grafica-cab">
                  <h3 className="grafica-titulo">{tr('Ranking', 'Leaderboard')}</h3>
                  <div className="tabs grafica-modos" ref={grupo} role="group" aria-label={tr('Periodo del ranking', 'Leaderboard period')}>
                    <span className="indicador" ref={indicador} aria-hidden="true" />
                    <button type="button" className="tab" aria-pressed={ventana === 'semana'} onClick={() => setVentana('semana')}>{tr('7 días', '7 days')}</button>
                    <button type="button" className="tab" aria-pressed={ventana === 'mes'} onClick={() => setVentana('mes')}>{tr('30 días', '30 days')}</button>
                  </div>
                </div>
                {yo && !yo.en_ranking && (
                  <div className="aviso info ranking-optin">
                    <span className="aviso-texto">{tr('No apareces en el ranking. Si te sumas, los miembros de esta comunidad verán tus horas, títulos y episodios de los últimos 7 y 30 días; nada más de tu progreso. Lo puedes quitar cuando quieras.', 'You’re not on the leaderboard. If you join it, this community’s members will see your hours, titles and episodes from the last 7 and 30 days; nothing else from your progress. You can leave it anytime.')}</span>
                    <span className="aviso-acciones">
                      <button className="chip-btn destacado" disabled={ocupado}
                        onClick={() => accion(t => rest(t, `membresias?comunidad=eq.${c.id}&usuario=eq.${cuenta.uid}`, { method: 'PATCH', prefer: 'return=minimal', body: { en_ranking: true } }))}>
                        {tr('Aparecer en el ranking', 'Join the leaderboard')}
                      </button>
                    </span>
                  </div>
                )}
                {!yo ? <p className="ajuste-pista">{tr('El ranking y los retos solo los ven sus miembros.', 'Only members can see the leaderboard and challenges.')}</p>
                  : ranking === null ? <p className="ajuste-pista" role="status">{tr('Calculando…', 'Calculating…')}</p>
                  : ranking.length === 0 ? <p className="ajuste-pista">{tr('Nadie aparece todavía.', 'Nobody shows up yet.')}</p>
                  : (
                    <ol className="ranking-lista">
                      {ranking.map((f, i) => (
                        <li key={f.usuario} className={cuenta && f.usuario === cuenta.uid ? 'yo' : undefined}>
                          <button className="ranking-fila" onClick={() => onVerPerfil(f.nombre)}>
                            <span className="ranking-pos">{i + 1}</span>
                            {POSTERS[f.avatar] ? <img className="ranking-avatar" src={POSTERS[f.avatar]} alt="" loading="lazy" /> : <span className="ranking-avatar" aria-hidden="true" />}
                            <span className="ranking-nombre">@{f.nombre}{cuenta && f.usuario === cuenta.uid ? tr(' · tú', ' · you') : ''}
                              <small>{tr(`${f.titulos} ${f.titulos === 1 ? 'título' : 'títulos'} · ${f.episodios} ${f.episodios === 1 ? 'episodio' : 'episodios'}`, `${f.titulos} ${f.titulos === 1 ? 'title' : 'titles'} · ${f.episodios} ${f.episodios === 1 ? 'episode' : 'episodes'}`)}</small>
                            </span>
                            <span className="ranking-horas">{f.minutos > 0 ? fmtDur(f.minutos) : '—'}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
              </section>
              <section className="comunidad-hilos">
                <div className="grafica-cab">
                  <h3 className="grafica-titulo">{tr('Conversación', 'Conversation')}</h3>
                  <button className="chip-btn" onClick={() => onForo({ tipo: 'comunidad', id: c.id, nombre: c.nombre })}>{yo ? tr('Ver todo y escribir', 'See all and post') : tr('Ver todo', 'See all')}</button>
                </div>
                {hilos === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
                  : hilos.length === 0 ? <p className="ajuste-pista">{tr('Aún no hay hilos.', 'No threads yet.')}</p>
                  : <HilosLista hilos={hilos} vistas={vistas} eps={eps} onAbrir={onAbrirHilo} />}
              </section>
              <section className="comunidad-retos">
                <div className="grafica-cab">
                  <h3 className="grafica-titulo">{tr('Retos', 'Challenges')}</h3>
                  {puedeInvitar && !creaReto && <button className="chip-btn" onClick={() => setCreaReto(true)}>{tr('Nuevo reto', 'New challenge')}</button>}
                </div>
                {creaReto && (
                  <form className="reto-nuevo" onSubmit={e => {
                    e.preventDefault()
                    const pl = PLANTILLAS_RETO.find(x => x.id === plantilla)
                    if (!pl || !/^\d{4}-\d{2}-\d{2}$/.test(fechaReto)) return
                    accion(t => rest(t, 'retos', { method: 'POST', prefer: 'return=minimal', body: { comunidad: c.id, nombre: tr(pl.es, pl.en), titulos: pl.ids(), hasta: fechaReto, creado_por: cuenta.uid } }))
                      .then(() => { setCreaReto(false); cargaRetos() })
                  }}>
                    <span className="ajuste-ops" role="radiogroup" aria-label={tr('Qué hay que ver', 'What to watch')}>
                      {PLANTILLAS_RETO.map(pl => (
                        <button type="button" key={pl.id} className="chip-btn" role="radio" aria-checked={plantilla === pl.id} onClick={() => setPlantilla(pl.id)}>
                          {tr(pl.es, pl.en)} <span className="reto-cuenta">{pl.ids().length}</span>
                        </button>
                      ))}
                    </span>
                    <label className="crea-edad reto-fecha">
                      <span>{tr('Hasta el', 'Until')}</span>
                      <input className="busca" type="date" value={fechaReto} min={new Date().toISOString().slice(0, 10)} onChange={e => setFechaReto(e.target.value)} />
                    </label>
                    <span className="ajuste-ops">
                      <button className="accion-principal" type="submit" disabled={ocupado}>{tr('Crear reto', 'Create challenge')}</button>
                      <button className="chip-btn" type="button" onClick={() => setCreaReto(false)}>{tr('Cancelar', 'Cancel')}</button>
                    </span>
                  </form>
                )}
                {retos === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
                  : retos.length === 0 ? <p className="ajuste-pista">{puedeInvitar ? tr('Sin retos activos. Propón uno con fecha: la Ruta express antes del próximo estreno, por ejemplo.', 'No active challenges. Set one with a deadline: the express route before the next premiere, for example.') : tr('Sin retos activos.', 'No active challenges.')}</p>
                  : (
                    <ul className="retos-lista">
                      {retos.map(r => {
                        const mio = cuenta && r.progreso.find(x => x.usuario === cuenta.uid)
                        const logrados = r.progreso.filter(x => x.hechos >= x.total).length
                        // contados como la cuenta atrás de la portada (hasta el comienzo de ese día), para que no digan cosas distintas
                        const dias = Math.max(0, Math.ceil((new Date(r.hasta + 'T00:00:00') - Date.now()) / 864e5))
                        return (
                          <li key={r.id} className="reto">
                            <div className="reto-cab">
                              <span className="reto-nombre">{r.nombre}</span>
                              <span className="reto-plazo">{dias === 0 ? tr('termina hoy', 'ends today') : dias === 1 ? tr('queda 1 día', '1 day left') : tr(`quedan ${dias} días`, `${dias} days left`)}</span>
                            </div>
                            <span className="reto-grupo">{tr(`${logrados} de ${r.progreso.length} lo completaron · ${r.titulos.length} títulos`, `${logrados} of ${r.progreso.length} completed · ${r.titulos.length} titles`)}</span>
                            {mio && (
                              <span className="reto-mio">
                                <span className="barra" aria-hidden="true"><i style={{ width: `${Math.round(100 * mio.hechos / (mio.total || 1))}%` }} /></span>
                                <span>{tr(`Tú: ${mio.hechos} de ${mio.total}`, `You: ${mio.hechos} of ${mio.total}`)}</span>
                              </span>
                            )}
                            {puedeInvitar && (
                              <button className="chip-btn peligro reto-quitar" disabled={ocupado}
                                onClick={() => accion(t => rest(t, `retos?id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' })).then(cargaRetos)}>{tr('Quitar reto', 'Remove challenge')}</button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
              </section>
              {yo && (
                <section className="comunidad-muro">
                  <h3 className="grafica-titulo">{tr('Actividad', 'Activity')}</h3>
                  {muro === null ? <p className="ajuste-pista" role="status">{tr('Cargando…', 'Loading…')}</p>
                    : muro.length === 0 ? <p className="ajuste-pista">{yo.muro_activo ? tr('Aún no hay nada. Lo que marques y valores aparecerá aquí.', 'Nothing yet. What you mark and rate will show up here.') : tr('Aún no hay nada. Activa «Compartir en el muro» para que aparezca lo que marques.', 'Nothing yet. Turn on «Share on the feed» so what you mark shows up.')}</p>
                    : (
                      <ul className="muro-lista">
                        {muro.map(a => {
                          const d = buscaItem(a.ref.split(':')[0])
                          const titulo = d ? d.item.t : a.ref
                          const ep = a.tipo === 'episodio' && a.ref.split(':').length === 3 ? ` · ${etiquetaEp(...a.ref.split(':'))}` : ''
                          const propio = cuenta && a.usuario === cuenta.uid
                          return (
                            <li key={a.id} className="muro-item">
                              {d && POSTERS[d.item.id] ? <img className="muro-cartel" src={POSTERS[d.item.id]} alt="" loading="lazy" /> : <span className="muro-cartel" aria-hidden="true" />}
                              <span className="muro-texto">
                                <span><button className="muro-quien" onClick={() => onVerPerfil(a.nombre)}>@{a.nombre}</button>{' '}
                                  {a.tipo === 'resena' ? tr('valoró', 'rated') : d && d.esComic ? tr('leyó', 'read') : tr('vio', 'watched')}{' '}
                                  <b>{titulo}{ep}</b>{a.estrellas ? <span className="muro-estrellas" aria-label={tr(`${a.estrellas} estrellas`, `${a.estrellas} stars`)}> {'★'.repeat(a.estrellas)}</span> : null}
                                </span>
                                <span className="muro-cuando">{haceCuanto(Date.parse(a.creado))}</span>
                              </span>
                              {propio
                                ? (a.aplausos > 0 && <span className="muro-aplausos-propio">{a.aplausos === 1 ? tr('1 aplauso', '1 clap') : tr(`${a.aplausos} aplausos`, `${a.aplausos} claps`)}</span>)
                                : (
                                  <button className={`chip-btn muro-aplaudir${a.aplaudido ? ' hecho' : ''}`} aria-pressed={a.aplaudido} onClick={() => aplaude(a)}
                                    aria-label={tr(`Aplaudir a @${a.nombre}`, `Clap for @${a.nombre}`)}>
                                    {tr('Aplaudir', 'Clap')}{a.aplausos > 0 ? ` · ${a.aplausos}` : ''}
                                  </button>
                                )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  {hayMas && muro && <button className="chip-btn" onClick={() => cargaMuro(muro[muro.length - 1].creado)}>{tr('Ver más', 'Show more')}</button>}
                </section>
              )}
              {yo && (
                <section className="comunidad-yo">
                  <h3 className="grafica-titulo">{tr('Tú en esta comunidad', 'You in this community')}</h3>
                  <label className="crea-edad">
                    <input type="checkbox" checked={yo.en_ranking} disabled={ocupado}
                      onChange={e => { const v = e.target.checked; accion(t => rest(t, `membresias?comunidad=eq.${c.id}&usuario=eq.${cuenta.uid}`, { method: 'PATCH', prefer: 'return=minimal', body: { en_ranking: v } })) }} />
                    <span>{tr('Aparecer en el ranking', 'Show me on the leaderboard')}</span>
                  </label>
                  <label className="crea-edad">
                    <input type="checkbox" checked={yo.muro_activo} disabled={ocupado}
                      onChange={e => { const v = e.target.checked; accion(t => rest(t, `membresias?comunidad=eq.${c.id}&usuario=eq.${cuenta.uid}`, { method: 'PATCH', prefer: 'return=minimal', body: { muro_activo: v } })) }} />
                    <span>{tr('Compartir en el muro lo que marco y valoro', 'Share what I mark and rate on the feed')}</span>
                  </label>
                  {yo.papel !== 'dueno' && (
                    <button className="chip-btn peligro" disabled={ocupado} onClick={() => accion(t => rest(t, `membresias?comunidad=eq.${c.id}&usuario=eq.${cuenta.uid}`, { method: 'DELETE', prefer: 'return=minimal' }))}>
                      {tr('Salir de la comunidad', 'Leave community')}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Crear una comunidad: nombre, dirección (#c/…) libre, descripción, tipo y
// portada del catálogo. Quien la crea es su dueño (lo pone la base).
function CreaComunidad({ saliendo, cuenta, token, onCreada, onCerrar }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tocada, setTocada] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState('invitacion')
  const [portada, setPortada] = useState(AVATARES[0])
  const [libre, setLibre] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const dir = tocada ? direccion : direccionDe(nombre)
  const valida = /^[a-z0-9-]{3,30}$/.test(dir) && nombre.trim().length >= 3
  useEffect(() => {
    if (!/^[a-z0-9-]{3,30}$/.test(dir)) { setLibre(null); return undefined }
    setLibre('mirando')
    let vivo = true
    const id = setTimeout(async () => {
      try {
        // ojo: una privada ajena no se ve; si la dirección está cogida, lo dirá la base al crear
        const filas = await rest(await token(), `comunidades?direccion=eq.${dir}&select=id`)
        if (vivo) setLibre(!(Array.isArray(filas) && filas.length))
      } catch { if (vivo) setLibre(null) }
    }, 400)
    return () => { vivo = false; clearTimeout(id) }
  }, [dir])
  const crea = async e => {
    e.preventDefault()
    if (!valida || libre === false) return
    setEnviando(true); setError('')
    try {
      const filas = await rest(await token(), `comunidades?select=${CAMPOS_COMUNIDAD}`, {
        method: 'POST', prefer: 'return=representation',
        body: { direccion: dir, nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo, portada, dueno: cuenta.uid },
      })
      const k = Array.isArray(filas) && saneaComunidad(filas[0])
      if (!k) throw new Error('respuesta')
      onCreada(k)
    } catch (er) {
      setEnviando(false)
      setError(er && er.codigo === '23505' ? tr('Esa dirección ya está en uso.', 'That address is already taken.')
        : er && /límite/.test(er.message) ? tr('Has llegado al máximo de comunidades por ahora.', 'You’ve reached the community limit for now.')
        : tr('No se pudo crear. Inténtalo otra vez.', 'Could not create it. Try again.'))
    }
  }
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-labelledby="crea-comunidad-titulo">
      <form className="modal modal-sync crea-perfil crea-comunidad" onClick={e => e.stopPropagation()} onSubmit={crea}>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <h2 className="modal-titulo" id="crea-comunidad-titulo">{tr('Nueva comunidad', 'New community')}</h2>
          <label className="valoracion-label" htmlFor="comunidad-nombre">{tr('Nombre', 'Name')}</label>
          <input id="comunidad-nombre" className="busca sync-input" maxLength={60} autoComplete="off" value={nombre}
            onChange={e => setNombre(e.target.value)} placeholder={tr('Los del Multiverso', 'The Multiverse crew')} />
          <label className="valoracion-label" htmlFor="comunidad-direccion">{tr('Dirección', 'Address')}</label>
          <div className="crea-nombre-fila">
            <span className="crea-arroba" aria-hidden="true">#c/</span>
            <input id="comunidad-direccion" className="busca sync-input" maxLength={30} autoCapitalize="none" spellCheck={false} value={dir}
              onChange={e => { setTocada(true); setDireccion(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} aria-describedby="comunidad-direccion-estado" />
          </div>
          <span id="comunidad-direccion-estado" className={`crea-estado${libre === false ? ' mal' : ''}`} role="status">
            {!dir ? tr('Se forma con el nombre: letras, números y guiones', 'Built from the name: letters, numbers and hyphens')
              : !/^[a-z0-9-]{3,30}$/.test(dir) ? tr('Entre 3 y 30: letras, números y guiones', '3 to 30: letters, numbers and hyphens')
              : libre === 'mirando' ? tr('Mirando si está libre…', 'Checking if it’s free…')
              : libre === false ? tr('Esa dirección ya está en uso', 'That address is taken') : libre === true ? tr('Libre', 'Available') : ''}
          </span>
          <label className="valoracion-label" htmlFor="comunidad-descripcion">{tr('De qué va (opcional)', 'What it’s about (optional)')}</label>
          <textarea id="comunidad-descripcion" className="busca sync-input comunidad-descripcion" maxLength={500} rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          <span className="valoracion-label" id="comunidad-tipo">{tr('Quién puede entrar', 'Who can join')}</span>
          <div className="comunidad-tipos" role="radiogroup" aria-labelledby="comunidad-tipo">
            {TIPOS_COMUNIDAD.map(([id, es, en, des, den]) => (
              <button type="button" key={id} className="comunidad-tipo" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)}>
                <b>{tr(es, en)}</b><span>{tr(des, den)}</span>
              </button>
            ))}
          </div>
          <span className="valoracion-label" id="comunidad-portada">{tr('Portada', 'Cover')}</span>
          <div className="crea-avatares" role="radiogroup" aria-labelledby="comunidad-portada">
            {AVATARES.filter(id => POSTERS[id]).map(id => {
              const it = buscaItem(id)
              return (
                <button type="button" key={id} className="crea-avatar" role="radio" aria-checked={portada === id} aria-label={it ? it.item.t : id} onClick={() => setPortada(id)}>
                  <img src={POSTERS[id]} alt="" loading="lazy" decoding="async" />
                </button>
              )
            })}
          </div>
          {error && <p className="import-error" role="alert">{error}</p>}
          <div className="modal-acciones">
            <button type="submit" className="accion-principal" disabled={!valida || libre === false || libre === 'mirando' || enviando}>
              {enviando ? tr('Creando…', 'Creating…') : tr('Crear comunidad', 'Create community')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// Crear el perfil la primera vez: @nombre único, avatar de la galería y la
// edad mínima (14, Ley 21.719). Sin perfil no se sincroniza (la base lo exige).
function CreaPerfil({ saliendo, cuenta, token, onCreado, onCerrar }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const sugerido = (cuenta.email || '').split('@')[0].toLowerCase().normalize('NFD').replace(/[^a-z0-9_]/g, '').slice(0, 20)
  const [nombre, setNombre] = useState(sugerido.length >= 3 ? sugerido : '')
  const [avatar, setAvatar] = useState(AVATARES[0])
  const [edad, setEdad] = useState(false)
  const [libre, setLibre] = useState(null) // null | 'mirando' | true | false
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = /^[a-z0-9_]{3,20}$/.test(nombre)
  useEffect(() => {
    if (!valido) { setLibre(null); return undefined }
    setLibre('mirando')
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const filas = await rest(await token(), `perfiles?nombre=eq.${nombre}&select=id`)
        if (vivo) setLibre(!(Array.isArray(filas) && filas.length))
      } catch { if (vivo) setLibre(null) }
    }, 400)
    return () => { vivo = false; clearTimeout(id) }
  }, [nombre])
  const crea = async e => {
    e.preventDefault()
    if (!valido || !edad || libre === false) return
    setEnviando(true); setError('')
    try {
      const filas = await rest(await token(), `perfiles?select=${CAMPOS_PERFIL}`, {
        method: 'POST', prefer: 'return=representation',
        body: { id: cuenta.uid, nombre, avatar, edad_confirmada_en: new Date().toISOString() },
      })
      const p = Array.isArray(filas) && saneaPerfil(filas[0])
      if (!p) throw new Error('respuesta')
      onCreado(p)
    } catch (er) {
      setEnviando(false)
      setError(er && er.codigo === '23505' ? tr('Ese nombre ya lo tiene alguien.', 'Someone already has that name.') : tr('No se pudo crear el perfil. Inténtalo otra vez.', 'Could not create the profile. Try again.'))
    }
  }
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar} role="dialog" aria-modal="true" aria-labelledby="crea-perfil-titulo">
      <form className="modal modal-sync crea-perfil" onClick={e => e.stopPropagation()} onSubmit={crea}>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <h2 className="modal-titulo" id="crea-perfil-titulo">{tr('Crea tu perfil', 'Create your profile')}</h2>
          <p className="modal-res">{tr('Así te verán en las comunidades. Tu progreso y tus reseñas empiezan privados: tú decides qué se ve.', 'This is how people see you in communities. Your progress and reviews start private: you decide what’s shown.')}</p>
          <label className="valoracion-label" htmlFor="crea-nombre">{tr('Tu nombre de usuario', 'Your username')}</label>
          <div className="crea-nombre-fila">
            <span className="crea-arroba" aria-hidden="true">@</span>
            <input id="crea-nombre" className="busca sync-input" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20}
              value={nombre} onChange={e => setNombre(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              aria-describedby="crea-nombre-estado" />
          </div>
          <span id="crea-nombre-estado" className={`crea-estado${libre === false || (nombre && !valido) ? ' mal' : ''}`} role="status">
            {!nombre ? tr('Entre 3 y 20: letras, números y _', '3 to 20: letters, numbers and _')
              : !valido ? tr('Mínimo 3 caracteres: letras, números y _', 'At least 3 characters: letters, numbers and _')
              : libre === 'mirando' ? tr('Mirando si está libre…', 'Checking if it’s free…')
              : libre === false ? tr('Ese nombre ya lo tiene alguien', 'Someone already has that name')
              : libre === true ? tr('Libre', 'Available') : ''}
          </span>
          <span className="valoracion-label" id="crea-avatar">{tr('Tu avatar', 'Your avatar')}</span>
          <div className="crea-avatares" role="radiogroup" aria-labelledby="crea-avatar">
            {AVATARES.filter(id => POSTERS[id]).map(id => {
              const it = buscaItem(id)
              return (
                <button type="button" key={id} className="crea-avatar" role="radio" aria-checked={avatar === id}
                  aria-label={it ? it.item.t : id} onClick={() => setAvatar(id)}>
                  <img src={POSTERS[id]} alt="" loading="lazy" decoding="async" />
                </button>
              )
            })}
          </div>
          <label className="crea-edad">
            <input type="checkbox" checked={edad} onChange={e => setEdad(e.target.checked)} />
            <span>{tr('Tengo 14 años o más y acepto las normas de la comunidad.', 'I am 14 or older and accept the community rules.')}</span>
          </label>
          {error && <p className="import-error" role="alert">{error}</p>}
          <div className="modal-acciones">
            <button type="submit" className="accion-principal" disabled={!valido || !edad || libre === false || libre === 'mirando' || enviando}>
              {enviando ? tr('Creando…', 'Creating…') : tr('Crear perfil', 'Create profile')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// Ajustes › Biblioteca: los cómics guardados en este navegador, lo que ocupan
// y si el navegador promete no borrarlos
function Biblioteca({ archivos, onQuitar }) {
  const ids = Object.keys(archivos)
  const [confirma, setConfirma] = useState(null) // id pendiente de confirmar
  const [persistente, setPersistente] = useState(null)
  const [uso, setUso] = useState(null)
  useEffect(() => { persistencia().then(setPersistente); espacio().then(setUso) }, [ids.length])
  if (!ids.length) return null
  const total = ids.reduce((s, id) => s + (archivos[id].tam || 0), 0)
  const pedir = async () => { await pidePersistencia(); setPersistente(await persistencia()) }
  return (
    <div className="ajuste">
      <div className="ajuste-cab">
        <h3 className="ajuste-titulo">{tr('Biblioteca', 'Library')}</h3>
        <p className="ajuste-pista">
          {ids.length === 1 ? tr('Un cómic guardado', 'One comic stored') : tr(`${ids.length} cómics guardados`, `${ids.length} comics stored`)}{tr(' en este navegador, ', ' in this browser, ')}{fmtTam(total)}
          {uso && uso.cuota ? tr(` (el navegador deja hasta ${fmtTam(uso.cuota)})`, ` (the browser allows up to ${fmtTam(uso.cuota)})`) : ''}.
          {persistente === true
            ? tr(' El navegador ha prometido no borrarlos.', ' The browser has promised not to delete them.')
            : ES_IOS && !YA_INSTALADA
              ? tr(' Ojo: Safari borra lo guardado por una web que no abres en 7 días; instalada como app (Compartir → Añadir a pantalla de inicio) no lo hace.', ' Heads up: Safari wipes what a site stores if you don’t open it for 7 days; installed as an app (Share → Add to Home Screen) it doesn’t.')
              : persistente === false
                ? tr(' El navegador podría borrarlos si se queda sin espacio.', ' The browser might delete them if it runs out of space.')
                : ''}
        </p>
      </div>
      <ul className="biblio">
        {ids.map(id => {
          const d = buscaItem(id)
          return (
            <li key={id} className="biblio-item">
              <span className="biblio-nombre">{d ? d.item.t : id}</span>
              <span className="biblio-meta">{archivos[id].nombre} · {fmtTam(archivos[id].tam)}</span>
              {confirma === id
                ? <span className="biblio-confirma">
                    <button className="chip-btn peligro" onClick={() => { setConfirma(null); onQuitar(id) }}>{tr('¿Seguro? Sí', 'Sure? Yes')}</button>
                    <button className="ghost" onClick={() => setConfirma(null)}>{tr('Cancelar', 'Cancel')}</button>
                  </span>
                : <button className="ghost" onClick={() => setConfirma(id)}>{tr('Quitar', 'Remove')}</button>}
            </li>
          )
        })}
      </ul>
      {persistente === false && !ES_IOS && (
        <div className="ajuste-ops"><button className="chip-btn" onClick={pedir}>{tr('Pedir al navegador que no los borre', 'Ask the browser not to delete them')}</button></div>
      )}
    </div>
  )
}

function Bienvenida({ onCerrar, onEmpezar, onExpress, pais, onPais, idioma, onIdioma, saliendo }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onCerrar}
      role="dialog" aria-modal="true" aria-label={tr('Bienvenida', 'Welcome')}>
      <div className="modal modal-sync bienvenida" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <span className="hero-eyebrow">{tr('Guía de maratón', 'Marathon guide')}</span>
          <h2 className="modal-titulo">{tr('Todo Marvel y X-Men, en orden', 'All of Marvel and X-Men, in order')}</h2>
          <ol className="bienvenida-pasos">
            <li>{tr(<><b>{N_TITULOS_TODOS} títulos en orden cronológico</b> de la historia: la saga X-Men a un lado, el UCM al otro, los cómics en su pestaña — y una bóveda de animación aparte.</>, <><b>{N_TITULOS_TODOS} titles in chronological story order</b>: the X-Men saga on one side, the MCU on the other, comics in their own tab — plus a separate animation vault.</>)}</li>
            <li>{tr(<><b>Marca lo visto</b> con la casilla redonda de cada tarjeta — o entra en la ficha para episodios, tráiler, sinopsis y escenas post-créditos.</>, <><b>Check off what you’ve watched</b> with the round box on each card — or open the title for episodes, trailer, synopsis and post-credit scenes.</>)}</li>
            <li>{tr(<><b>La cuenta atrás de Doomsday</b> te dice el ritmo que necesitas; el Plan de sesión te propone qué ver hoy.</>, <><b>The Doomsday countdown</b> tells you the pace you need; the Session plan suggests what to watch today.</>)}</li>
          </ol>
          <div className="bienvenida-pais">
            <label className="bienvenida-pais-label" htmlFor="bienvenida-pais">{tr('Tu país', 'Your country')}</label>
            <span className="sel-envuelto">
              <select id="bienvenida-pais" className="selector" value={pais} onChange={e => onPais(e.target.value)}>
                {PAISES.map(p => <option key={p.id} value={p.id}>{tr(p.nombre, PAIS_EN[p.id] || p.nombre)}</option>)}
              </select>
            </span>
            <span className="bienvenida-idioma" role="group" aria-label={tr('Idioma', 'Language')}>
              <button className="chip-btn" aria-pressed={idioma === 'es'} onClick={() => onIdioma('es')}>Español</button>
              <button className="chip-btn" aria-pressed={idioma === 'en'} onClick={() => onIdioma('en')}>English</button>
            </span>
            <p className="bienvenida-pais-pista">{tr('Decide en qué plataforma ves cada título y cómo se nombran las obras. Se cambia cuando quieras en Ajustes.', 'Sets which platform each title shows and how things are named. Change it any time in Settings.')}</p>
          </div>
          <div className="bienvenida-acciones">
            <button className="accion-principal" onClick={onEmpezar || onCerrar}>{tr('Empezar por el principio', 'Start from the beginning')}</button>
            <button className="chip-btn" onClick={onExpress}>{tr('Solo lo esencial para Doomsday', 'Just the essentials for Doomsday')}</button>
          </div>
          <p className="bienvenida-nota">{ui(pais, 'Consejo: desde el móvil puedes instalarla como app (menú del navegador → «Añadir a pantalla de inicio»).', 'Tip: on your phone you can install it as an app (browser menu → "Add to Home Screen").')}</p>
        </div>
      </div>
    </div>
  )
}

// ── Mapa del multiverso: conexiones canónicas título a título ──
// Cada nodo lleva el color de su Tierra (data.js): el mapa y el sistema solar
// pintan lo mismo con el mismo color.
const COLOR_TIERRA = Object.fromEntries(MULTIVERSO.map(u => [u.num, u.c]))
const MAPA_NODOS = [
  { id: 'dofp', x: 140, y: 200, c: COLOR_TIERRA['Tierra-10005'] },
  { id: 'logan', x: 140, y: 360, c: COLOR_TIERRA['Tierra-10005'] },
  { id: 'deadpool2', x: 140, y: 500, c: COLOR_TIERRA['Tierra-10005'] },
  { id: 'deadpool3', x: 320, y: 560, c: COLOR_TIERRA['Tierra-10005'] },
  { id: 'avengers1', x: 500, y: 70, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'endgame', x: 500, y: 170, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'wandavision', x: 300, y: 200, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'loki1', x: 500, y: 270, c: COLOR_TIERRA['El Vacío'] },
  { id: 'loki2', x: 620, y: 340, c: COLOR_TIERRA['El Vacío'] },
  { id: 'quantumania', x: 380, y: 340, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'mom', x: 300, y: 420, c: COLOR_TIERRA['Tierra-838'] },
  { id: 'nwh', x: 500, y: 470, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'sony', x: 500, y: 615, c: COLOR_TIERRA['Universo Sony'] },
  { id: 'marvels', x: 680, y: 200, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'whatif', x: 820, y: 340, c: COLOR_TIERRA['Universos What If'] },
  { id: 'zombies', x: 820, y: 470, c: COLOR_TIERRA['Marvel Zombies'] },
  { id: 'ff', x: 680, y: 470, c: COLOR_TIERRA['Tierra-828'] },
  { id: 'thunderbolts', x: 680, y: 580, c: COLOR_TIERRA['Tierra-616'] },
  { id: 'doomsday', x: 820, y: 615, c: COLOR_TIERRA['Tierra-828'] },
]
const MAPA_ARISTAS = [
  { a: 'avengers1', b: 'endgame', t: 'El atraco temporal vuelve a la batalla de Nueva York' },
  { a: 'endgame', b: 'loki1', t: 'El Loki de 2012 escapa con el Teseracto' },
  { a: 'loki1', b: 'loki2', t: 'La TVA y los telares del tiempo' },
  { a: 'loki1', b: 'whatif', t: 'El Que Permanece contenía las ramas del multiverso' },
  { a: 'loki2', b: 'deadpool3', t: 'La TVA saca a Wade de su línea temporal' },
  { a: 'deadpool2', b: 'deadpool3', t: 'El dispositivo temporal de Cable' },
  { a: 'deadpool3', b: 'logan', t: 'Una variante de Logan como compañero de viaje' },
  { a: 'dofp', b: 'logan', t: 'La línea mutante corregida tras 1973' },
  { a: 'marvels', b: 'dofp', t: 'Su escena post-créditos abre la puerta a la Tierra mutante' },
  { a: 'wandavision', b: 'mom', t: 'El Darkhold corrompe a Wanda' },
  { a: 'mom', b: 'nwh', t: 'Del hechizo roto a viajar entre universos' },
  { a: 'nwh', b: 'sony', t: 'Los Spider-Man y villanos de Raimi y Garfield cruzan' },
  { a: 'quantumania', b: 'loki2', t: 'Las variantes de Kang y su Concilio' },
  { a: 'whatif', b: 'zombies', t: 'La plaga nace en una rama del Vigilante' },
  { a: 'ff', b: 'thunderbolts', t: 'La nave de los 4 Fantásticos aparece en la 616' },
  { a: 'ff', b: 'doomsday', t: 'La primera familia, rumbo al choque con Doom' },
  { a: 'thunderbolts', b: 'doomsday', t: 'Los Nuevos Vengadores responden a la llamada' },
]
function buscaItem(id) {
  for (const sg of DATA) for (const era of sg.eras) for (const it of era.items) {
    if (it.id === id) return { item: it, c: era.c, esComic: sg.saga === 'comics' }
  }
  return null
}
function MapaMultiverso({ onAbrir }) {
  const [sel, setSel] = useState(null)
  const nodos = Object.fromEntries(MAPA_NODOS.map(n => [n.id, n]))
  const conectadas = sel ? MAPA_ARISTAS.filter(e => e.a === sel || e.b === sel) : []
  return (
    <div className="mapa-mv-wrap">
      <div className="mapa-mv">
        <svg viewBox="0 0 960 700" preserveAspectRatio="none" aria-hidden="true">
          {MAPA_ARISTAS.map((e, i) => {
            const A = nodos[e.a], B = nodos[e.b]
            const mx = (A.x + B.x) / 2 + (A.y - B.y) * 0.18
            const my = (A.y + B.y) / 2 + (B.x - A.x) * 0.18
            const activa = sel && (e.a === sel || e.b === sel)
            return <path key={i} d={`M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}`}
              className={`arista${activa ? ' on' : ''}${sel && !activa ? ' off' : ''}`} />
          })}
        </svg>
        {MAPA_NODOS.map(n => {
          const d = buscaItem(n.id)
          if (!d) return null
          const activo = sel === n.id
          const vecino = sel && MAPA_ARISTAS.some(e => (e.a === sel && e.b === n.id) || (e.b === sel && e.a === n.id))
          return (
            <button key={n.id}
              className={`nodo${activo ? ' on' : ''}${sel && !activo && !vecino ? ' off' : ''}`}
              style={{ left: `${n.x / 9.6}%`, top: `${n.y / 7}%`, '--nc': n.c }}
              onClick={() => setSel(activo ? null : n.id)} title={d.item.t}>
              {POSTERS[n.id]
                ? <img src={POSTERS[n.id]} alt="" loading="lazy" />
                : <span className="nodo-ini">{iniciales(d.item.t)}</span>}
              <span className="nodo-t">{d.item.t.split(' (')[0]}</span>
            </button>
          )
        })}
      </div>
      {sel ? (
        <div className="mapa-leyenda">
          <div className="mapa-leyenda-cab">
            <b>{buscaItem(sel).item.t}</b>
            <button className="chip-btn" onClick={() => onAbrir(buscaItem(sel))}>{tr('Ver ficha', 'Open title')}</button>
            <button className="chip-btn" onClick={() => setSel(null)}>✕</button>
          </div>
          {conectadas.map((e, i) => {
            const otro = e.a === sel ? e.b : e.a
            const d = buscaItem(otro)
            return (
              <button key={i} className="mapa-conexion" onClick={() => setSel(otro)}>
                <span className="mapa-conexion-t">↔ {d.item.t}</span>
                <span className="mapa-conexion-d">{e.t}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mapa-ayuda">{tr('Pulsa un título para iluminar sus conexiones con el resto del multiverso.', 'Tap a title to light up its connections with the rest of the multiverse.')}<span className="solo-movil"> {tr('Desliza para recorrer el mapa entero.', 'Swipe to travel the whole map.')}</span></p>
      )}
    </div>
  )
}

// ── Club de maratón: ranking de grupo y comentarios por título vía Firebase ──
function Club({ club, vistas, eps, onSalir, onInvitar }) {
  const [miembros, setMiembros] = useState(null)
  useEffect(() => {
    let vivo = true
    const carga = async () => {
      try {
        const r = await fetch(`${club.url}/club/${club.sala}/m.json`)
        const j = await r.json()
        if (vivo && j) setMiembros(j)
      } catch {}
    }
    carga()
    const iv = setInterval(carga, 60000)
    window.addEventListener('focus', carga)
    return () => { vivo = false; clearInterval(iv); window.removeEventListener('focus', carga) }
  }, [club])
  const filas = useMemo(() => {
    const out = [{ alias: club.alias, yo: true, ...resumenMaraton(vistas, eps) }]
    // los datos vienen de una base compartida: un miembro puede llegar a null
    // (borrado, escritura fallida) y no debe tumbar la app entera
    const entradas = miembros && typeof miembros === 'object' && !Array.isArray(miembros)
      ? Object.entries(miembros) : []
    for (const [alias, m] of entradas) {
      if (alias === club.alias || !alias || !m || typeof m !== 'object') continue
      const v = typeof m.v === 'string' ? m.v : ''
      const e = typeof m.e === 'string' ? m.e : ''
      out.push({ alias, yo: false, t: typeof m.t === 'number' ? m.t : null,
        ...resumenMaraton(migraMarcas(deBits(v, ORDEN_IDS)), deBits(e, ORDEN_EPS)) })
    }
    return out.sort((a, b) => b.n - a.n || b.min - a.min)
  }, [miembros, vistas, eps, club])
  const total = ID_MARATON.size
  const media = Math.round(filas.reduce((s, f) => s + f.n, 0) / filas.length)
  const medallas = ['🥇', '🥈', '🥉']
  return (
    <section className="duelo club">
      <div className="duelo-cab">
        <h2>{tr('Club de maratón', 'Marathon club')} <span className="club-sala">· {tr('sala', 'room')} {club.sala}</span></h2>
        <button className="chip-btn" onClick={onInvitar}>{tr('Invitar', 'Invite')}</button>
        <button className="chip-btn" onClick={onSalir}>{tr('Salir', 'Leave')}</button>
      </div>
      {filas.map((f, i) => (
        <div className={`duelo-fila${f.yo ? ' yo' : ''}`} key={f.alias}>
          <span className="duelo-nombre">{medallas[i] || `${i + 1}º`} {f.alias}{f.yo ? tr(' (tú)', ' (you)') : ''}</span>
          <div className="duelo-barra"><i style={{ width: `${Math.round(f.n / total * 100)}%` }} /></div>
          <span className="duelo-datos">{f.n}/{total} · {fmtDur(f.min)}</span>
        </div>
      ))}
      <p className="duelo-veredicto">
        {tr('Media del club: ', 'Club average: ')}<b>{media}/{total}</b>{tr(' títulos.', ' titles.')}
        {filas.length < 2 && tr(' Aún estás solo: pulsa Invitar y comparte el código.', ' You’re alone so far: hit Invite and share the code.')}
      </p>
      <p className="duelo-fecha">{tr('Cada miembro publica su avance al marcar; el ranking se refresca solo.', 'Each member publishes their progress as they check things off; the ranking refreshes itself.')}</p>
    </section>
  )
}

function ComentariosClub({ club, item, vista }) {
  const [lista, setLista] = useState(null)
  const [txt, setTxt] = useState('')
  const [desvelado, setDesvelado] = useState(false)
  const ruta = `${club.url}/club/${club.sala}/c/${item.id}.json`
  // Los comentarios los escribe cualquiera de la sala en una base compartida.
  // Pintar {c.n} sin mirar el tipo tumbaba la app entera —y a todos los de la
  // sala a la vez— con un solo comentario mal formado.
  const saneaComentarios = j => {
    if (!esObj(j)) return []
    return Object.values(j)
      .filter(c => esObj(c) && typeof c.n === 'string' && typeof c.t === 'string')
      .map(c => ({ n: c.n.slice(0, 40), t: c.t.slice(0, 280), f: typeof c.f === 'number' && isFinite(c.f) ? c.f : 0 }))
      .sort((a, b) => a.f - b.f)
  }
  const carga = () => fetch(ruta).then(r => r.json())
    .then(j => setLista(saneaComentarios(j))).catch(() => setLista([]))
  useEffect(() => { setDesvelado(false); setTxt(''); setLista(null); carga() }, [item.id])
  const envia = async () => {
    const t = txt.trim()
    if (!t) return
    setTxt('')
    try {
      await fetch(ruta, { method: 'POST', body: JSON.stringify({ n: club.alias, t, f: Date.now() }) })
      carga()
    } catch {}
  }
  if (lista === null) return null
  const oculto = !vista && !desvelado && lista.length > 0
  return (
    <div className="club-coments">
      <span className="valoracion-label">Club · {lista.length === 1 ? tr('1 comentario', '1 comment') : tr(`${lista.length} comentarios`, `${lista.length} comments`)}</span>
      {oculto ? (
        <button className="club-velo" onClick={() => setDesvelado(true)}>
          {tr('Aún no lo has visto: pulsa para leer los comentarios del club', 'You haven’t watched this yet: tap to read the club’s comments')}
        </button>
      ) : lista.map((c, i) => (
        <p className="club-coment" key={i}>
          <b>{c.n}</b> {c.t}
          {c.f > 0 && <span className="club-coment-f">{new Date(c.f).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' })}</span>}
        </p>
      ))}
      <div className="club-coment-envio">
        <input className="busca" placeholder={tr('Comenta para el club (sin spoilers gordos 😉)…', 'Comment for the club (no big spoilers 😉)…')} autoComplete="off"
          value={txt} maxLength={280} onChange={e => setTxt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') envia() }} />
        <button className="chip-btn" onClick={envia}>{tr('Enviar', 'Send')}</button>
      </div>
    </div>
  )
}

function Duelo({ amigo, vistas, eps, onQuitar }) {
  const esLive = amigo.tipo === 'live'
  const [remoto, setRemoto] = useState(null)
  useEffect(() => {
    if (!esLive) return
    let vivo = true
    const carga = async () => {
      try {
        const r = await fetch(`${amigo.url}/maraton/${amigo.room}.json`)
        const j = await r.json()
        if (vivo && j) setRemoto(j)
      } catch {}
    }
    carga()
    const iv = setInterval(carga, 60000)
    window.addEventListener('focus', carga)
    return () => { vivo = false; clearInterval(iv); window.removeEventListener('focus', carga) }
  }, [amigo, esLive])
  const datos = useMemo(() => {
    // en vivo el rival llega de una base compartida: mismo saneado que el resto
    // lo de otros (bits de un enlace viejo o de alguien con la versión vieja) también migra el lote de One-Shots
    const vA = migraMarcas(esLive ? (saneaMarcas(remoto && remoto.v) || {}) : deBits(amigo.v, ORDEN_IDS))
    const eA = esLive ? (saneaMarcas(remoto && remoto.e) || {}) : deBits(amigo.e, ORDEN_EPS)
    const yo = resumenMaraton(vistas, eps)
    const el = resumenMaraton(vA, eA)
    const comunes = ORDEN_IDS.filter(id => ID_MARATON.has(id) && vistas[id] && vA[id]).length
    const soloEl = ORDEN_IDS.filter(id => ID_MARATON.has(id) && !vistas[id] && vA[id])
    return { yo, el, comunes, soloYo: yo.n - comunes, soloEl }
  }, [amigo, vistas, eps, remoto, esLive])
  const total = ID_MARATON.size
  const dif = datos.yo.n - datos.el.n
  return (
    <section className="duelo">
      <div className="duelo-cab">
        <h2>{tr('Duelo de maratones', 'Marathon duel')}{esLive && <span className="duelo-live">{tr('EN VIVO', 'LIVE')}</span>}</h2>
        <button className="chip-btn" onClick={onQuitar}>{tr('Quitar rival', 'Remove rival')}</button>
      </div>
      {[[tr('Tú', 'You'), datos.yo], [amigo.n, datos.el]].map(([quien, r]) => (
        <div className="duelo-fila" key={quien}>
          <span className="duelo-nombre">{quien}</span>
          <div className="duelo-barra"><i style={{ width: `${Math.round(r.n / total * 100)}%` }} /></div>
          <span className="duelo-datos">{r.n}/{total} · {fmtDur(r.min)}</span>
        </div>
      ))}
      <p className="duelo-veredicto">
        {dif === 0
          ? tr('Empate técnico: vais exactamente igual.', 'Dead heat: you’re exactly level.')
          : dif > 0
            ? tr(<>Vas <b>{dif} título{dif > 1 ? 's' : ''}</b> por delante. 🏆</>, <>You’re <b>{dif} title{dif > 1 ? 's' : ''}</b> ahead. 🏆</>)
            : tr(<>{amigo.n} te saca <b>{-dif} título{dif < -1 ? 's' : ''}</b>: toca acelerar.</>, <>{amigo.n} is <b>{-dif} title{dif < -1 ? 's' : ''}</b> ahead of you: time to speed up.</>)}
        {' '}{tr('Habéis visto', 'You’ve both watched')} <b>{datos.comunes}</b>{tr(' en común.', ' in common.')}
      </p>
      {datos.soloEl.length > 0 && (
        <p className="duelo-pista">
          {amigo.n}{tr(' ya vio y tú no: ', ' has watched these and you haven’t: ')}{datos.soloEl.slice(0, 3).map(id => TITULOS[id]).join(' · ')}
          {datos.soloEl.length > 3 ? tr(` y ${datos.soloEl.length - 3} más`, ` and ${datos.soloEl.length - 3} more`) : ''}
        </p>
      )}
      {esLive
        ? <p className="duelo-fecha">{remoto
            ? tr(`Conectado a su sincronización — actualizado ${remoto.t ? 'el ' + new Date(remoto.t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ahora'}. Se refresca solo.`,
                 `Connected to their sync — updated ${remoto.t ? new Date(remoto.t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'just now'}. Refreshes itself.`)
            : tr('Conectando con su sincronización…', 'Connecting to their sync…')}</p>
        : amigo.t && <p className="duelo-fecha">{tr('Su maratón a fecha de ', 'Their marathon as of ')}{fmtFecha(new Date(amigo.t).toISOString().slice(0, 10))}{tr(' — pídele un enlace nuevo para actualizarlo.', ' — ask them for a fresh link to update it.')}</p>}
    </section>
  )
}

// Lo nuevo de la app no se anuncia solo: el idioma vive en Ajustes, el
// horario es un chip más en la barra y la bienvenida solo sale la primera
// visita. Quien ya usaba la app ve UNA vez este aviso, con el camino directo.
// Al cambiar AVISO_VERSION en una jornada futura, el aviso vuelve a salir.
const AVISO_VERSION = '2026-09-03'
function AvisoNuevo({ onProbar }) {
  const [visible, setVisible] = useState(() => {
    try {
      // solo veteranos: quien aún no cerró la bienvenida se entera por ella
      return !!localStorage.getItem('maraton-marvel-bienvenida-v1')
        && localStorage.getItem('maraton-marvel-aviso-v1') !== AVISO_VERSION
    } catch { return false }
  })
  const cierra = () => {
    setVisible(false)
    try { localStorage.setItem('maraton-marvel-aviso-v1', AVISO_VERSION) } catch {}
  }
  if (!visible) return null
  return (
    <div className="aviso info novedades" role="status">
      <span>
        <b>{tr('Nuevo en la app:', 'New in the app:')}</b>{' '}
        {ES_TACTIL
          ? tr('gestos de app. Desliza desde el borde izquierdo para volver, tira de cualquier ficha hacia abajo para cerrarla, y toca otra vez la pestaña en la que estás para subir. El icono avisa el día que tienes sesión.',
              'app gestures. Swipe from the left edge to go back, pull any title sheet down to close it, and tap the tab you’re on again to scroll to the top. The icon badge shows the day you have a session.')
          : tr('las capas entran y salen animadas, la app avisa cuando hay versión nueva, y en el iPhone instalada tiene gestos para volver y cerrar.',
              'layers animate in and out, the app tells you when a new version is out, and installed on iPhone it has gestures to go back and close.')}
      </span>
      {ES_TACTIL && onProbar && (
        <span className="aviso-acciones">
          <button className="chip-btn destacado" onClick={() => { cierra(); onProbar() }}>{tr('Probar con el siguiente', 'Try it on the next one')}</button>
        </span>
      )}
      <button className="cerrar" onClick={cierra} aria-label={tr('Cerrar aviso', 'Dismiss')}>✕</button>
    </div>
  )
}

// Aviso de versión nueva. La app instalada puede vivir días abierta (iOS la
// suspende y la recupera tal cual, sin recargar): al volver a primer plano se
// consulta version.json sin caché y, si el sello no es el de esta compilación,
// un botón ofrece recargar (la navegación va por red primero, así que la
// recarga trae la nueva). Como mucho una consulta cada 10 minutos, y la
// primera a los 8 s de arrancar para no competir con el arranque.
const SELLO = typeof __BUILD__ === 'string' ? __BUILD__ : ''
const FONDOS_WEBP = typeof __FONDOS_WEBP__ !== 'undefined' ? __FONDOS_WEBP__ : []
// Aviso breve con «Deshacer» (desmarcar, quitar temporada, serie completa,
// empezar de cero). Se va solo; uno nuevo sustituye al anterior.
// Revisión HIG (16 sep 2026): la región viva va SIEMPRE montada y el aviso
// visible aparte — VoiceOver no lee una región role=status que nace ya con
// texto, y cada aviso nuevo era un nodo nuevo (key). Y mientras el dedo, el
// ratón o el foco están sobre el aviso, no se va: 5 s no dan para llegar al
// botón con VoiceOver (WCAG 2.2.1); al salir quedan al menos 3 s.
// Logro desbloqueado EN EL MOMENTO (21 sep 2026): hasta ahora solo quedaba un
// punto en la pestaña Perfil y el momento más emocionante de la app pasaba en
// silencio. Aviso breve arriba, como las notificaciones de iOS: entra por el
// borde de arriba con el muelle con rebote (raro, así que puede) y se va por
// el mismo borde. Tocarlo lleva a los logros. La región viva va siempre
// montada (VoiceOver no lee una que nace con texto: ver Deshacer).
function LogroAviso({ aviso, onCerrar, onIr }) {
  // la salida es de UN aviso (su id): un booleano seguía en true al llegar el
  // siguiente y lo pintaba un fotograma en su sitio antes de entrar (code-review)
  const [saleId, setSaleId] = useState(null)
  const sale = !!aviso && saleId === aviso.id
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  useEffect(() => {
    if (!aviso) return undefined
    const t1 = setTimeout(() => setSaleId(aviso.id), 4200)
    const t2 = setTimeout(() => cerrar.current(), 4200 + 260)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [aviso])
  const l = aviso && LOGROS.find(x => x.id === aviso.ids[0])
  const mas = aviso ? aviso.ids.length - 1 : 0
  const texto = l ? `${tr('Logro desbloqueado', 'Achievement unlocked')}: ${l.t}${mas ? tr(` y ${mas} más`, ` and ${mas} more`) : ''}` : ''
  return (
    <>
      <span className="solo-lector" role="status">{texto}</span>
      {l && (
        <button type="button" className={`logro-aviso${sale ? ' sale' : ''}`} key={aviso.id} aria-hidden="true" tabIndex={-1}
          onClick={() => { setSaleId(aviso.id); setTimeout(() => cerrar.current(), 260); onIr() }}>
          <span className="logro-aviso-emoji">{l.e}</span>
          <span className="logro-aviso-texto">
            <span className="logro-aviso-rotulo">{tr('Logro desbloqueado', 'Achievement unlocked')}{mas ? tr(` · y ${mas} más`, ` · and ${mas} more`) : ''}</span>
            <span className="logro-aviso-nombre">{sinPartir(l.t)}</span>
          </span>
        </button>
      )}
    </>
  )
}

function Deshacer({ aviso, onCerrar }) {
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  const [quieto, setQuieto] = useState(false)
  const resto = useRef(0)
  const vez = useRef({ id: null, n: 0 })
  if (aviso && vez.current.id !== aviso.id) vez.current = { id: aviso.id, n: vez.current.n + 1 }
  // quieto mientras el puntero O el foco sigan dentro: con ratón, clicar
  // enfoca «Deshacer» y al apartar el ratón el aviso se iba con el foco aún en
  // el botón (code-review). relatedTarget puede ser null o la ventana.
  const dentro = useRef({ puntero: false, foco: false })
  useEffect(() => { resto.current = aviso ? aviso.ms : 0; dentro.current = { puntero: false, foco: false }; setQuieto(false) }, [aviso])
  useEffect(() => {
    if (!aviso || quieto) return undefined
    const desde = Date.now()
    const t = setTimeout(() => cerrar.current(), resto.current)
    return () => { clearTimeout(t); resto.current = Math.max(3000, resto.current - (Date.now() - desde)) }
  }, [aviso, quieto])
  const mira = () => setQuieto(dentro.current.puntero || dentro.current.foco)
  const entra = tipo => () => { dentro.current[tipo] = true; mira() }
  const sale = tipo => e => {
    const r = e.relatedTarget
    if (r instanceof Node && e.currentTarget.contains(r)) return
    dentro.current[tipo] = false; mira()
  }
  return (
    <>
      {/* dos avisos seguidos con el mismo texto no cambiaban la región y el
          segundo no se leía: un espacio duro alterno la cambia siempre */}
      <span className="solo-lector" role="status">{aviso ? `${aviso.texto}. ${tr('Deshacer disponible', 'Undo available')}${vez.current.n % 2 ? '\u00A0' : ''}` : ''}</span>
      {aviso && (
        <div className="deshacer" key={aviso.id} onPointerEnter={entra('puntero')} onPointerDown={entra('puntero')} onPointerLeave={sale('puntero')} onFocus={entra('foco')} onBlur={sale('foco')}>
          <span className="deshacer-texto">{aviso.texto}</span>
          <button type="button" onClick={() => { tic(); aviso.restaura(); cerrar.current() }}>{tr('Deshacer', 'Undo')}</button>
        </div>
      )}
    </>
  )
}

function VersionNueva() {
  const [hay, setHay] = useState(false)
  useEffect(() => {
    if (!SELLO) return undefined
    let ultimo = 0
    const mira = async () => {
      if (Date.now() - ultimo < 10 * 60 * 1000 || navigator.onLine === false) return
      ultimo = Date.now()
      try {
        const r = await fetch('version.json?' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (j && typeof j.v === 'string' && j.v !== SELLO) setHay(true)
      } catch {}
    }
    const t = setTimeout(mira, 8000)
    const onVisible = () => { if (document.visibilityState === 'visible') mira() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  if (!hay) return null
  return (
    <button className="version-nueva" onClick={() => window.location.reload()}>
      {tr('Hay una versión nueva · Actualizar', 'New version available · Update')}
    </button>
  )
}

function Novedades({ eps }) {
  const [lista, setLista] = useState([])
  const [cerrado, setCerrado] = useState(false)
  useEffect(() => {
    try {
      const KEY_V = 'maraton-marvel-visita-v1'
      const antes = localStorage.getItem(KEY_V)
      const hoy = new Date().toISOString().slice(0, 10)
      localStorage.setItem(KEY_V, hoy)
      if (!antes || antes >= hoy) return
      const seguidas = new Set(Object.keys(eps).map(k => k.split(':')[0]))
      const out = []
      for (const e of ESTRENOS) {
        if (e.fecha && e.fecha > antes && e.fecha <= hoy) out.push(tr(`${e.t} ya se estrenó`, `${e.t} is out now`))
      }
      for (const [id, caps] of Object.entries(EPISODES)) {
        if (!seguidas.has(id)) continue
        const nuevos = caps.filter(ep => ep.f && ep.f > antes && ep.f <= hoy).length
        if (nuevos) out.push(tr(`${TITULOS[id] || id}: ${nuevos} episodio${nuevos > 1 ? 's' : ''} nuevo${nuevos > 1 ? 's' : ''}`, `${TITULOS[id] || id}: ${nuevos} new episode${nuevos > 1 ? 's' : ''}`))
      }
      setLista(out.slice(0, 4))
    } catch {}
  }, [])
  if (!lista.length || cerrado) return null
  return (
    <div className="aviso info novedades" role="status">
      <span><b>{tr('Desde tu última visita:', 'Since your last visit:')}</b> {lista.join(' · ')}</span>
      <button className="cerrar" onClick={() => setCerrado(true)} aria-label={tr('Cerrar aviso', 'Dismiss')}>✕</button>
    </div>
  )
}

// Un .ics de un evento de día completo: el calendario del sistema lo abre tal
// cual, en iOS y Android igual, sin servidor de por medio.
// un salto de línea en una nota partiría el evento en dos propiedades
const icsEsc = s => String(s || '').replace(/\r?\n/g, ' ').replace(/([,;\\])/g, '\\$1')
// iCalendar parte las líneas a 75 octetos (no caracteres: las tildes pesan 2)
const icsPliega = linea => {
  const out = []; let actual = '', bytes = 0
  for (const ch of linea) {
    const b = new TextEncoder().encode(ch).length
    if (bytes + b > 74) { out.push(actual); actual = ' ' + ch; bytes = 1 + b } else { actual += ch; bytes += b }
  }
  out.push(actual)
  return out.join('\r\n')
}
// Envuelve un VEVENT y lo entrega: hoja de compartir con el dedo (en la app
// instalada de iOS una descarga por <a download> puede no hacer nada, y sin
// aviso), descarga normal con el ratón.
function bajaIcs(nombre, titulo, veventLineas) {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//maraton-marvel//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ...veventLineas,
    'END:VEVENT', 'END:VCALENDAR',
  ].map(icsPliega).join('\r\n')
  const archivo = new File([ics], nombre, { type: 'text/calendar' })
  if (ES_TACTIL && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    navigator.share({ files: [archivo], title: titulo }).catch(() => {})
    return
  }
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
function descargaIcs(e) {
  const dia = e.fecha.replace(/-/g, '')
  const fin = new Date(new Date(e.fecha + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10).replace(/-/g, '')
  bajaIcs(`estreno-${e.t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.ics`, tr('Estreno: ', 'Premiere: ') + e.t, [
    `UID:${dia}-${e.t.replace(/[^\w]/g, '').slice(0, 24)}@maraton-marvel`,
    `DTSTART;VALUE=DATE:${dia}`,
    `DTEND;VALUE=DATE:${fin}`,
    `SUMMARY:${icsEsc(tr('Estreno: ', 'Premiere: ') + e.t)}`,
    `DESCRIPTION:${icsEsc((e.tipo ? e.tipo + '. ' : '') + (e.n || ''))}`,
  ])
}
// El horario entero cabe en UN evento semanal: los días elegidos como BYDAY y
// la fecha fin como UNTIL. DTSTART va en hora local flotante y el RFC pide
// entonces que UNTIL también lo vaya.
function descargaIcsHorario(h, sim) {
  if (!sim.sesiones.length || !sim.fin) return
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  bajaIcs('horario-maraton.ics', tr('Horario del maratón', 'Marathon schedule'), [
    `UID:horario-${fmt(sim.sesiones[0].fecha)}@maraton-marvel`,
    `DTSTART:${fmt(sim.sesiones[0].fecha)}T${h.hora.replace(':', '')}00`,
    `DURATION:PT${h.min}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${h.dias.map(d => BYDAY[d]).join(',')};UNTIL=${fmt(sim.fin)}T235959`,
    `SUMMARY:${icsEsc(tr('Sesión de maratón Marvel', 'Marvel marathon session'))}`,
    `DESCRIPTION:${icsEsc(tr(`${fmtDur(h.min)} siguiendo el orden del maratón. La app dice qué toca cada día.`, `${fmtDur(h.min)} following the marathon order. The app says what’s up each day.`))}`,
  ])
}

// ── Horario de visionado: qué días ves, cuánto rato, y cuándo terminas ──
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0] // lunes primero; getDay() cuenta desde domingo
const DIA_LETRA = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' }
const DIA_LETRA_EN = { 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa', 0: 'Su' }
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIA_LARGO_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Recorre el calendario por los días elegidos y consume lo pendiente en el
// orden del maratón: las series por tandas de episodios que quepan en la
// sesión, las películas enteras (una más larga que la sesión se ve igual,
// pasándose). Devuelve las primeras sesiones con su contenido, cuántas hacen
// falta en total y la fecha en que se acaba.
function simulaHorario(h, vistas, eps, detalladas = 5) {
  const cola = []
  DATA.forEach(sg => {
    if (sg.saga === 'comics' || sg.saga === 'animacion') return
    sg.eras.forEach(era => era.items.forEach(it => {
      if (vistas[it.id] || !it.d) return
      if (h.exp && !it.exp) return
      if (it.tipo === 'serie' && EPISODES[it.id]) {
        const pend = EPISODES[it.id].filter(e => !eps[`${it.id}:${e.s}:${e.n}`])
        if (pend.length) cola.push({ item: it, eps: pend, porEp: it.d / EPISODES[it.id].length })
      } else cola.push({ item: it, min: it.d })
    }))
  })
  const totalMin = Math.round(cola.reduce((s, u) => s + (u.min || u.eps.length * u.porEp), 0))
  const sesiones = []
  let nSesiones = 0, fin = null
  const f = new Date(); f.setHours(0, 0, 0, 0)
  // dos años de tope: si ni así se acaba, con ese horario no se acaba
  for (let paso = 0; paso < 740 && cola.length; paso++, f.setDate(f.getDate() + 1)) {
    if (!h.dias.includes(f.getDay())) continue
    let resto = h.min
    const trozos = []
    while (cola.length && resto > 0) {
      const u = cola[0]
      if (u.eps) {
        const caben = Math.min(u.eps.length, Math.floor(resto / u.porEp))
        // en una sesión aún vacía siempre cae al menos un episodio
        const n = trozos.length ? caben : Math.max(1, caben)
        if (n < 1) break
        const desde = u.eps[0], hasta = u.eps[n - 1]
        trozos.push({ item: u.item, txt: n === 1 ? `T${desde.s}·E${desde.n}` : `T${desde.s}·E${desde.n}–T${hasta.s}·E${hasta.n}` })
        resto -= n * u.porEp
        u.eps = u.eps.slice(n)
        if (!u.eps.length) cola.shift()
      } else {
        if (u.min > resto && trozos.length) break
        trozos.push({ item: u.item })
        resto -= u.min
        cola.shift()
      }
    }
    nSesiones++
    fin = new Date(f)
    if (sesiones.length < detalladas) sesiones.push({ fecha: new Date(f), trozos, min: Math.round(h.min - resto) })
  }
  return { totalMin, sesiones, nSesiones, fin, seAcaba: !cola.length }
}

function HorarioModal({ horario, onGuardar, vistas, eps, onClose, saliendo }) {
  const ref = useRef(null)
  useDialogo(ref, onClose)
  const [borr, setBorr] = useState(() => horario || { dias: [5, 6], min: 90, hora: '21:00', exp: true })
  const toggleDia = d => setBorr(b => {
    const dias = b.dias.includes(d) ? b.dias.filter(x => x !== d) : [...b.dias, d]
    return dias.length ? { ...b, dias } : b // sin días no hay horario: el último no se suelta
  })
  const sim = useMemo(() => simulaHorario(borr, vistas, eps), [borr, vistas, eps])
  const estreno = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
  // cuántos minutos tendría que durar cada sesión para acabar antes del estreno
  const necesario = useMemo(() => {
    if (!estreno) return null
    const tope = new Date(estreno.fecha + 'T00:00:00')
    let n = 0
    const f = new Date(); f.setHours(0, 0, 0, 0)
    for (; f < tope; f.setDate(f.getDate() + 1)) if (borr.dias.includes(f.getDay())) n++
    return n ? Math.ceil(sim.totalMin / n) : null
  }, [borr, sim, estreno])
  const llega = estreno && sim.fin && sim.seAcaba && sim.fin <= new Date(estreno.fecha + 'T00:00:00')
  const fmtF = d => d.toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onClose} role="dialog" aria-modal="true" aria-label={tr('Horario de maratón', 'Marathon schedule')}>
      <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onClose} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <h2 className="modal-titulo">{tr('Horario de maratón', 'Marathon schedule')}</h2>
          <p className="modal-res">{tr('Elige qué días ves y cuánto rato: la app te dice qué toca cada sesión y cuándo terminas.', 'Pick which days you watch and for how long: the app tells you what each session covers and when you finish.')}</p>
          <div className="hor-campos">
            <div className="hor-dias" role="group" aria-label={tr('Días de la semana', 'Days of the week')}>
              {DIAS_ORDEN.map(d => (
                <button key={d} className="chip-btn hor-dia" aria-pressed={borr.dias.includes(d)}
                  aria-label={tr(DIA_LARGO[d], DIA_LARGO_EN[d])} onClick={() => toggleDia(d)}>{tr(DIA_LETRA[d], DIA_LETRA_EN[d])}</button>
              ))}
            </div>
            <div className="hor-fila">
              {[60, 90, 120, 180].map(m => (
                <button key={m} className="chip-btn" aria-pressed={borr.min === m}
                  onClick={() => setBorr(b => ({ ...b, min: m }))}>{fmtDur(m)}</button>
              ))}
              <label className="hor-hora-label">{tr('a las', 'at')}{' '}
                <input className="busca hor-hora" type="time" value={borr.hora}
                  onChange={e => { const v = e.target.value; if (v) setBorr(b => ({ ...b, hora: v })) }} />
              </label>
              <button className="chip-btn destacado" aria-pressed={borr.exp}
                onClick={() => setBorr(b => ({ ...b, exp: !b.exp }))}>{tr('Solo ruta express', 'Express route only')}</button>
            </div>
          </div>
          {sim.totalMin === 0 ? (
            <p className="modal-res">{tr('No queda nada pendiente', 'Nothing left to watch')}{borr.exp ? tr(' en la ruta express. Quita el filtro para planificar el maratón completo.', ' on the express route. Remove the filter to plan the full marathon.') : tr('. ¡Maratón terminado!', '. Marathon complete!')}</p>
          ) : (
            <>
              <p className="hor-resumen">
                {borr.dias.length === 1 ? tr('Una sesión', 'One session') : tr(`${borr.dias.length} sesiones`, `${borr.dias.length} sessions`)}{tr(' de ', ' of ')}{fmtDur(borr.min)}{tr(' a la semana · quedan ', ' a week · ')}<b>{fmtDur(sim.totalMin)}</b> {borr.exp ? tr('de la ruta express', 'left on the express route') : tr('del maratón (sin cómics ni bóveda)', 'left in the marathon (comics and vault aside)')}
              </p>
              {sim.seAcaba && sim.fin ? (
                <p className="hor-veredicto">
                  {tr('Terminarías el ', 'You’d finish on ')}<b>{sim.fin.toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' })}</b>{tr(`, en ${sim.nSesiones} sesiones`, `, over ${sim.nSesiones} sessions`)}
                  {estreno && (llega
                    ? tr(<> — <b>llegas</b> al estreno de {estreno.t} ({fmtFecha(estreno.fecha)})</>, <> — <b>in time</b> for the premiere of {estreno.t} ({fmtFecha(estreno.fecha)})</>)
                    : tr(<> — después del estreno de {estreno.t}{necesario ? <>; con sesiones de <b>~{fmtDur(necesario)}</b> llegarías</> : ''}</>, <> — after the premiere of {estreno.t}{necesario ? <>; sessions of <b>~{fmtDur(necesario)}</b> would get you there</> : ''}</>))}
                </p>
              ) : (
                <p className="hor-veredicto">{tr('Con ese horario no se acaba ni en dos años: añade días o alarga la sesión.', 'That schedule doesn’t finish even in two years: add days or stretch the session.')}</p>
              )}
              <ul className="hor-sesiones">
                {sim.sesiones.map((s, i) => (
                  <li className="hor-sesion" key={i}>
                    <span className="hor-fecha">{fmtF(s.fecha)}</span>
                    <span className="hor-que">
                      {s.trozos.map(t => t.txt ? `${t.item.t} (${t.txt})` : t.item.t).join(' + ')} · ~{fmtDur(s.min)}
                    </span>
                  </li>
                ))}
              </ul>
              {sim.nSesiones > sim.sesiones.length && (
                <p className="hor-cola">{tr(`…y ${sim.nSesiones - sim.sesiones.length} sesiones más, siempre con lo que toque entonces.`, `…and ${sim.nSesiones - sim.sesiones.length} more sessions, always with whatever is next.`)}</p>
              )}
            </>
          )}
          <div className="bienvenida-acciones">
            <button className="accion-principal" onClick={() => { onGuardar(borr); onClose() }}>{tr('Guardar horario', 'Save schedule')}</button>
            {sim.totalMin > 0 && sim.seAcaba && (
              <button className="chip-btn" onClick={() => descargaIcsHorario(borr, sim)}>{tr('Al calendario', 'Add to calendar')}</button>
            )}
            {horario && <button className="ghost" onClick={() => { onGuardar(null); onClose() }}>{tr('Quitar horario', 'Remove schedule')}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Carátula de un estreno: la del título si ya está en el maratón (id), la
// bajada de TMDB si aún no (poster), y si no hay ninguna, la portada dibujada
// con sus iniciales, para que ninguna tarjeta salga sin imagen.
function CaraEstreno({ e }) {
  const src = (e.id && POSTERS[e.id]) || e.poster
  const [err, setErr] = useState(false)
  if (!src || err) return <Cover item={{ id: 'estreno-' + e.t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), t: e.t, tipo: /serie/i.test(e.tipo) ? 'serie' : 'peli' }} c={['#C8102E', '#E8A93C']} />
  return <img className="cover foto" src={src} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />
}

function Proximos() {
  const primero = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
  // En móvil el carril avanza solo, una tarjeta cada pocos segundos, como un
  // carrusel; en cuanto lo tocas (dedo, ratón o teclado) se para y no vuelve
  // hasta pasado un rato. No se mueve con «reducir movimiento», ni cuando el
  // carril no se desliza (escritorio: rejilla), ni con la pestaña oculta.
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || movimientoReducido()) return
    // WCAG 2.2.2: lo que se mueve más de 5 s necesita una forma de PARARLO,
    // no solo de pausarlo un rato. La primera interacción lo para para siempre.
    let parado = false
    const para = () => { parado = true; clearInterval(t) }
    const eventos = ['pointerdown', 'touchstart', 'wheel', 'focusin', 'mouseenter']
    eventos.forEach(ev => el.addEventListener(ev, para, { passive: true }))
    const paso = () => {
      if (document.hidden || parado) return
      if (el.scrollWidth - el.clientWidth < 8) return
      const tarjeta = el.querySelector('.proximo')
      if (!tarjeta) return
      const ancho = tarjeta.getBoundingClientRect().width + (parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0)
      const fin = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8
      el.scrollTo({ left: fin ? 0 : el.scrollLeft + ancho, behavior: 'smooth' })
    }
    const t = setInterval(paso, 4500)
    return () => { clearInterval(t); eventos.forEach(ev => el.removeEventListener(ev, para)) }
  }, [])
  return (
    <div className="proximos" ref={ref}>
      {ESTRENOS.filter(e => !primero || e.t !== primero.t).map(e => (
        <div className="proximo" key={e.t}>
          <span className="proximo-cara" aria-hidden="true"><CaraEstreno e={e} /></span>
          <span className="proximo-texto">
          <span className="proximo-fecha">{fmtFecha(e.fecha) || e.aprox}</span>
          <span className="proximo-titulo">{sinPartir(e.t)}</span>
          <span className="proximo-tipo">{e.tipo}</span>
          <span className="proximo-nota">{e.n}</span>
          {e.fecha && <button className="proximo-cal" onClick={() => descargaIcs(e)}>{tr('Al calendario', 'Add to calendar')}</button>}
          </span>
        </div>
      ))}
    </div>
  )
}

const ORBITAS = {
  'Tierra-10005':       [118, 20,  48,  1, 60],
  'Tierra-828':         [148, 150, 63, -1, 52],
  'Tierra-838':         [176, 260, 55,  1, 50],
  'Tierra-96283':       [204, 60,  86, -1, 56],
  'Tierra-120703':      [228, 190, 74,  1, 50],
  'Universo Sony':      [252, 300, 105, -1, 54],
  'Universos What If':  [276, 100, 92,  1, 58],
  'Marvel Zombies':     [298, 230, 132, -1, 48],
  'Tierra-616 (cómics)':[318, 330, 118,  1, 54],
  'El Vacío':           [336, 40,  150, -1, 62],
}
// en el sistema solar las etiquetas giran con su planeta y, a escala de
// móvil, las largas se pisaban con las vecinas: nombre corto (el completo va
// en el title y en la ficha de la Tierra)
const CORTO_SISTEMA = { 'Universo Sony': 'Sony', 'Universos What If': 'What If', 'Tierra-616 (cómics)': '616 cómics', 'Marvel Zombies': 'Zombies' }

// Cabecera de Perfil y Multiverso (14 sep 2026): antes repetían la del
// maratón entera (titular, «Siguiente», progreso, panel y buscador: ~380 px
// antes de lo suyo). Ahora un título grande, como las apps de iOS, y en móvil
// una barra compacta con el título que aparece cuando el grande sale por
// arriba (IntersectionObserver → html.titulo-fuera). Ajustes va aquí en
// móvil, donde la barra de herramientas no se enseña fuera del maratón.
function CabeceraDestino({ titulo, sub, onAjustes, esMovil }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = ref.current, raiz = document.documentElement
    if (!h || !esMovil || !window.IntersectionObserver) return undefined
    const io = new IntersectionObserver(([e]) => raiz.classList.toggle('titulo-fuera', !e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: '-44px 0px 0px 0px' })
    io.observe(h)
    return () => { io.disconnect(); raiz.classList.remove('titulo-fuera') }
  }, [esMovil])
  return (
    <>
      <header className="cabecera-destino">
        <div className="cd-texto">
          <h1 className="cd-titulo" ref={ref}>{titulo}</h1>
          {sub && <p className="cd-sub">{sub}</p>}
        </div>
        <button className="chip-btn cd-ajustes" onClick={onAjustes}>{tr('Ajustes', 'Settings')}</button>
      </header>
      {esMovil && <div className="barra-destino" aria-hidden="true"><span>{titulo}</span></div>}
    </>
  )
}

// Las cifras de un perfil ajeno (enlace compartido o perfil de la comunidad)
function usePerfilEst(vistasP, epsP, notasP) {
  const est = useMemo(() => {
    let totMin = 0, vistoMin = 0, titulosVistos = 0, titulosTot = 0
    let comicsVistos = 0, comicsTot = 0, bovedaVistos = 0, bovedaTot = 0
    const sagas = []
    DATA.forEach(sg => {
      const esComic = sg.saga === 'comics'
      const esBoveda = sg.saga === 'animacion'
      const items = sg.eras.flatMap(era => era.items.map(item => ({ item, c: era.c })))
      let v = 0
      items.forEach(({ item }) => {
        // cada colección con su cuenta, igual que en la app: mezclarlas hacía
        // que este perfil dijera 108 donde la cabecera dice 91
        if (esComic) { comicsTot++; if (vistasP[item.id]) { comicsVistos++; v++ }; return }
        if (esBoveda) {
          // en episodios, como en las estadísticas de la app, y con su misma
          // regla: marcar la serie entera cuenta todos sus episodios
          const l = EPISODES[item.id] || []
          bovedaTot += l.length
          bovedaVistos += l.filter(e => epsP[`${item.id}:${e.s}:${e.n}`] || vistasP[item.id]).length
          if (vistasP[item.id]) v++
          return
        }
        titulosTot++
        totMin += item.d || 0
        if (vistasP[item.id]) { titulosVistos++; v++; vistoMin += item.d || 0 }
        else if (item.tipo === 'serie' && EPISODES[item.id] && item.d) {
          const hechos = EPISODES[item.id].filter(e => epsP[`${item.id}:${e.s}:${e.n}`]).length
          vistoMin += item.d * hechos / EPISODES[item.id].length
        }
      })
      sagas.push({ saga: sg.saga, titulo: sg.titulo, items, v })
    })
    const valoradas = Object.entries(notasP)
      .map(([id, punt]) => {
        for (const sg of DATA) for (const era of sg.eras) for (const item of era.items) {
          if (item.id === id) return { item, c: era.c, punt, esComic: sg.saga === 'comics' }
        }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => b.punt - a.punt)
      .slice(0, 8)
    return { totMin, vistoMin, titulosVistos, titulosTot, comicsVistos, comicsTot, bovedaVistos, bovedaTot, sagas, valoradas }
  }, [vistasP, epsP, notasP])

  const pct = est.totMin ? Math.round(100 * est.vistoMin / est.totMin) : 0
  const ctx = {
    vistas: vistasP,
    eps: epsP,
    notas: notasP,
    horasVistas: est.vistoMin / 60,
    titulosVistos: est.titulosVistos,
    titulosTot: est.titulosTot,
    xmenCompleto: DATA[0].eras.every(era => era.items.every(it => vistasP[it.id])),
    expressCompleta: DATA.slice(0, 2).every(sg => sg.eras.every(era => era.items.filter(it => it.exp).every(it => vistasP[it.id]))),
    todoCompleto: DATA.every(sg => sg.eras.every(era => era.items.every(it => vistasP[it.id]))),
  }
  return { est, pct, ctx }
}

function PerfilCifras({ est, pct }) {
  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-label">{tr('Horas vistas', 'Hours watched')}</span>
        <span className="stat-num"><Cifra n={Math.round(est.vistoMin / 60)} /><small> / {Math.round(est.totMin / 60)} h</small></span>
        <div className="barra"><i style={{ width: `${pct}%` }} /></div>
        <span className="stat-foot">{pct}{tr('% del maratón', '% of the marathon')}</span>
      </div>
      <div className="stat">
        <span className="stat-label">{tr('Títulos vistos', 'Titles watched')}</span>
        <span className="stat-num"><Cifra n={est.titulosVistos} /><small> / {est.titulosTot}</small></span>
        <span className="stat-foot">{tr('películas, series y especiales', 'movies, series and specials')}</span>
      </div>
      <div className="stat">
        <span className="stat-label">{tr('Cómics leídos', 'Comics read')}</span>
        <span className="stat-num"><Cifra n={est.comicsVistos} /><small> / {est.comicsTot}</small></span>
        <span className="stat-foot">{tr('lecturas esenciales', 'essential reads')}</span>
      </div>
      <div className="stat">
        <span className="stat-label">{tr('Bóveda de animación', 'Animation vault')}</span>
        <span className="stat-num"><Cifra n={est.bovedaVistos} /><small> / {est.bovedaTot}</small></span>
        <span className="stat-foot">{tr(`episodios de las ${N_SERIES_BOVEDA} series`, `episodes across the ${N_SERIES_BOVEDA} series`)}</span>
      </div>
    </div>
  )
}

function PerfilMapa({ est, vistasP }) {
  return (
    <div className="mapa" aria-label={tr('Mapa de progreso', 'Progress map')}>
      {est.sagas.map(sg => (
        <div className="mapa-fila" key={sg.saga}>
          <span className="mapa-label">
            {sg.saga === 'xmen' ? 'X-Men' : sg.saga === 'ucm' ? tr('UCM', 'MCU') : sg.saga === 'animacion' ? 'Anim.' : tr('Cómics', 'Comics')}
          </span>
          <div className="mapa-dots">
            {sg.items.map(({ item, c }) => (
              <span key={item.id} className={`dot${vistasP[item.id] ? ' on' : ''}`}
                style={{ '--dc': c[0] }} title={item.t} />
            ))}
          </div>
          <span className="mapa-count">{sg.v}/{sg.items.length}</span>
        </div>
      ))}
    </div>
  )
}

function PerfilValoradas({ est, titulo }) {
  if (!est.valoradas.length) return null
  return (
      <section className="grafica">
        <h3 className="grafica-titulo">{titulo || tr('Sus valoraciones', 'Their ratings')}</h3>
        <div className="galeria-grid perfil-valoradas">
          {est.valoradas.map(({ item, c, punt, esComic }) => (
            <div key={item.id} className="galeria-item perfil-item" title={item.t}>
              <Portada item={item} c={c} esComic={esComic} />
              <span className="perfil-estrellas">{'★'.repeat(punt)}</span>
            </div>
          ))}
        </div>
      </section>
  )
}

function PerfilView({ nombre, vistasP, epsP, notasP }) {
  const { est, pct, ctx } = usePerfilEst(vistasP, epsP, notasP)

  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-titulo">
          <p className="hero-eyebrow">{tr('Perfil compartido · solo lectura', 'Shared profile · read-only')}</p>
          <h1>{tr('El maratón de', 'The marathon of')} <span className="rojo">{nombre}</span></h1>
        </div>
        <PerfilCifras est={est} pct={pct} />
        <PerfilMapa est={est} vistasP={vistasP} />
      </section>
      <main className="stats-vista">
        <Logros ctx={ctx} />
        <PerfilValoradas est={est} />
      </main>
      <footer>
        <p className="nota-pie">{tr(`Esta página es una instantánea de solo lectura del progreso de ${nombre}.`, `This page is a read-only snapshot of ${nombre}’s progress.`)}</p>
        <div className="reset">
          <a className="accion-principal" href={window.location.pathname}>{tr('Crea tu propio maratón →', 'Start your own marathon →')}</a>
        </div>
      </footer>
    </div>
  )
}

function MiniTl({ item, c, vista, onAbrir }) {
  return (
    <button id={`tl-${item.id}`} className={`tl-card${vista ? ' vista' : ''}`} style={{ '--glow': c[0] }} onClick={onAbrir}>
      <span className="tl-poster"><Portada item={item} c={c} esComic={false} />{vista && <span className="galeria-check" aria-hidden="true"><CheckIcon /></span>}</span>
      <span className="tl-info">
        <span className="tl-titulo">{item.t}</span>
        <span className="tl-h">{item.h}{vista && <span className="solo-lector">{tr(' · vista', ' · watched')}</span>}</span>
      </span>
    </button>
  )
}

function CrearLista({ onCrear }) {
  const [nombre, setNombre] = useState('')
  const enviar = () => { const n = nombre.trim(); if (n) { onCrear(n); setNombre('') } }
  return (
    <div className="crear-lista">
      <input className="busca sync-input" placeholder={tr('Ej.: Con mi pareja', 'E.g. With my partner')} aria-label={tr('Nombre de la lista', 'List name')} autoComplete="off"
        value={nombre} maxLength={40} onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') enviar() }} aria-label={tr('Nombre de la lista', 'List name')} />
      <button className="accion-principal" onClick={enviar} disabled={!nombre.trim()}>{tr('Crear lista', 'Create list')}</button>
    </div>
  )
}

function AgregarALista({ indice, idOrden, enLista, onAgregar }) {
  const [q, setQ] = useState('')
  const resultados = q.trim().length < 2 ? [] :
    Object.values(indice)
      .filter(({ item }) => norm(item.t).includes(norm(q)))
      .sort((a, b) => (idOrden[a.item.id] ?? 999) - (idOrden[b.item.id] ?? 999))
      .slice(0, 6)
  return (
    <div className="agregar-lista">
      <input className="busca sync-input" placeholder={tr('Buscar título para añadir a la lista…', 'Search a title to add to the list…')} autoComplete="off" value={q}
        onChange={e => setQ(e.target.value)} aria-label={tr('Añadir título a la lista', 'Add a title to the list')}
        spellCheck={false} autoComplete="off" />
      {resultados.length > 0 && (
        <div className="sugerencias">
          {resultados.map(({ item }) => (
            <button key={item.id} className="chip-btn" aria-pressed={enLista.includes(item.id)}
              onClick={() => onAgregar(item.id)}>
              {item.t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BorrarLista({ onBorrar }) {
  const [conf, setConf] = useState(false)
  return (
    <div className="borrar-lista">
      <button className="chip-btn" onClick={() => setConf(c => !c)}>{conf ? tr('Cancelar', 'Cancel') : tr('Eliminar esta lista', 'Delete this list')}</button>
      {conf && <button className="chip-btn peligro" onClick={onBorrar}>{tr('¿Seguro? Sí, eliminar', 'Sure? Yes, delete')}</button>}
    </div>
  )
}

function Estrellas() {
  // Detrás del texto, una estrella grande y blanca se leía como el «·» que la
  // app usa de separador («com·pletados»): puntos de 2–3 px sin extensión,
  // más tenues, y la mitad en el móvil, donde el texto ocupa todo el ancho
  const capas = useMemo(() => [150, 90, 44].map((n, capa) => {
    const sombras = [], total = window.innerWidth < 720 ? Math.round(n / 2) : n
    for (let i = 0; i < total; i++) {
      const x = (Math.random() * 100).toFixed(1)
      const y = (Math.random() * 100).toFixed(1)
      const brillo = (0.22 + capa * 0.14 + Math.random() * 0.16).toFixed(2)
      sombras.push(`${x}vw ${y}vh 0 0 rgba(242,239,230,${brillo})`)
    }
    return sombras.join(',')
  }), [])
  return (
    <div className="cielo" aria-hidden="true">
      {capas.map((sombra, i) => (
        <span key={i} className={`estrella-capa capa${i}`} style={{ boxShadow: sombra }} />
      ))}
    </div>
  )
}

// Memoizada: sin esto, cada tecla en la búsqueda, cada marca y cada ficha
// abierta re-renderizaban las 134 tarjetas. Los dos callbacks se ignoran en la
// comparación porque solo capturan cosas estables (item, era, setters) o
// funciones con setState funcional; `pais` viaja como prop porque el país
// MUTA los textos de `item` sin cambiar su identidad.
const Card = React.memo(function Card({ item, num, c, esComic, vista, onToggle, onAbrir, delay, epHechos, miNota, lectura, sinSpoilers }) {
  // la entrada se decide al montar: nacida quieta (fuera de las 12 primeras o
  // durante una transición de vista) no se anima luego porque otro render le
  // pase un retraso; nacida animada conserva el suyo
  const entrada = useRef(delay)
  // el sello y el anillo celebran el momento de MARCAR, no el estado: antes se
  // volvían a estampar en cada tarjeta vista que se montaba (volver a la
  // lista, desplegar una saga, borrar la búsqueda). `marcada` dura lo que la
  // animación y solo si `vista` pasó de false a true con la tarjeta montada
  const vistaAntes = useRef(vista), marcadaEn = useRef(0)
  if (vista !== vistaAntes.current) { if (vista) marcadaEn.current = performance.now(); vistaAntes.current = vista }
  const marcada = vista && performance.now() - marcadaEn.current < 700
  let epProg = null
  if (esComic && lectura && lectura.t > 1 && !vista) epProg = tr(`pág. ${lectura.p + 1}/${lectura.t}`, `p. ${lectura.p + 1}/${lectura.t}`)
  if (item.tipo === 'serie' && EPISODES[item.id]) {
    const total = EPISODES[item.id].length
    const hechos = epHechos || 0
    if (hechos > 0 && !vista) epProg = `${hechos}/${total} ep`
  }
  return (
    <article className={`card${vista ? ' vista' : ''}${marcada ? ' marcada' : ''}${entrada.current == null ? ' quieta' : ''}`} id={`card-${item.id}`}
      style={{ animationDelay: entrada.current == null ? undefined : `${entrada.current}ms`, '--glow': c[0] }}>
      <button className="checkbox" aria-pressed={vista} onClick={onToggle} aria-label={tr(`Vista: ${item.t}`, `Seen: ${item.t}`)}
        title={vista ? tr('Vista — pulsa para marcar pendiente', 'Watched — tap to mark as pending') : tr('Pendiente — pulsa para marcar vista', 'Pending — tap to mark as watched')}>
        <CheckIcon />
        <span className="checkbox-label">{vista ? tr('Vista', 'Seen') : ''}</span>
      </button>
      <button className="abrir" onClick={onAbrir} title={tr('Ver ficha', 'Open title')}>
        <span className="cover-wrap">
          <Portada item={item} c={c} esComic={esComic} />
          {item.s != null && !esComic && <span className="rating-badge">★ {item.s.toFixed(1)}</span>}
          {vista && <span className={`sello sello-mini${marcada ? ' estampa' : ''}`} aria-hidden="true">{esComic ? tr('LEÍDO', 'READ') : tr('VISTA', 'SEEN')}</span>}
        </span>
        <span className="info">
          <span className="fila-titulo"><span className="num">{num}</span><span className="titulo">{sinPartir(item.t)}</span></span>
          <span className="meta">
            {esComic
              ? <><span className="hist">{item.a}</span> · {item.r}</>
              : <>{item.h !== '—' && <><span className="hist">{item.h}</span> · </>}{tr('estreno', 'released')} {item.r}{item.d ? <> · {fmtDur(item.d)}</> : null}</>}
            {epProg && <span className="ep-prog"> · {epProg}</span>}
            {miNota && <span className="mi-nota"> · {tr('Tú', 'You')}: ★{miNota}</span>}
          </span>
          {item.res && (sinSpoilers && !vista
            ? <span className="res oculta">{tr('Sinopsis oculta hasta que lo marques como visto.', 'Synopsis hidden until you mark it as seen.')}</span>
            : <span className="res">{item.res}</span>)}
          {(item.dir || item.cast) && (
            <span className="credits">
              {item.dir && <>Dir. {item.dir}</>}
              {item.cast && <> · {tr('Con', 'With')} {item.cast.map(limpiaNombre).join(', ')}</>}
            </span>
          )}
        </span>
      </button>
      <div className="lado">
        {(item.opt || item.tipo === 'esp' || item.tipo === 'serie') && (
          <div className="chips">
            {item.opt
              ? <span className="tipo opc">{tr('Opcional', 'Optional')}</span>
              : item.tipo === 'esp' ? <span className="tipo esp">{tr('Especial', 'Special')}</span>
              : <span className="tipo serie">{tr('Serie', 'Series')}</span>}
          </div>
        )}
      </div>
    </article>
  )
}, (a, b) => {
  for (const k in a) if (k !== 'onToggle' && k !== 'onAbrir' && k !== 'delay' && !Object.is(a[k], b[k])) return false
  return true
})

// En qué plataforma está un título en el país elegido. España manda desde el
// campo `plat` de data.js (curado a mano); el resto sale del mapa generado.
// Cómics y cine no dependen del país, y sin dato se enseña el de España.
const platDe = (pais, item) => {
  if (!item.plat || pais === 'ES' || /panini|unlimited|^cine/i.test(item.plat)) return item.plat
  return (PLATAFORMAS[pais] && PLATAFORMAS[pais][item.id]) || item.plat
}
// el mapa generado viene en español: «Solo alquiler», «ViX gratis», «No está en Chile».
// Con varias, la línea se parte solo entre plataformas, no dentro de «Movistar TV».
const platTexto = (pais, t) => (IDIOMA_ACTUAL !== 'en' ? t
  : /^no está en /i.test(t) ? `Not in ${nombrePaisTr(pais)}`
  : t.replace(/^Solo alquiler$/, 'Rent only').replace(/ gratis\b/g, ' free'))
  .split(' / ').map(x => (t.includes(' / ') ? x.replace(/ /g, '\u00a0') : x)).join(' / ')
const nombrePais = pais => (PAISES.find(p => p.id === pais) || PAISES[0]).nombre
// nombre inglés de cada país (el generado trae solo el español); «the» donde
// la gramática lo pide («Today in the United States»)
const PAIS_EN = { ES: 'Spain', AR: 'Argentina', BO: 'Bolivia', CL: 'Chile', CO: 'Colombia', CR: 'Costa Rica', EC: 'Ecuador', SV: 'El Salvador', US: 'United States', GT: 'Guatemala', HN: 'Honduras', MX: 'Mexico', NI: 'Nicaragua', PA: 'Panama', PY: 'Paraguay', PE: 'Peru', DO: 'Dominican Republic', UY: 'Uruguay', VE: 'Venezuela' }
const nombrePaisIdioma = pais => (IDIOMA_ACTUAL === 'en' ? PAIS_EN[pais] || nombrePais(pais) : nombrePais(pais))
const nombrePaisTr = pais => (IDIOMA_ACTUAL === 'en'
  ? ((pais === 'US' || pais === 'DO') ? 'the ' : '') + (PAIS_EN[pais] || nombrePais(pais))
  : nombrePais(pais))
// Dónde leer un cómic, de verdad y por país: Marvel Unlimited (todo el catálogo,
// en inglés, suscripción), la tienda de Panini del país (edición en español, en
// papel; Colombia y Perú no tienen tienda propia) y Kindle (Panini digital).
const TIENDA_PANINI = {
  ES: 'https://www.panini.es/shp_esp_es/catalogsearch/result/?q=',
  CL: 'https://tiendapanini.cl/catalogsearch/result/?q=',
  MX: 'https://tiendapanini.com.mx/catalogsearch/result/?q=',
  AR: 'https://tiendapanini.com.ar/catalogsearch/result/?q=',
}
const busquedaComic = t => encodeURIComponent(t.replace(/\s*\(.*?\)|#\d+|:/g, ' ').replace(/\s+/g, ' ').trim())
function DondeLeer({ item, pais }) {
  const q = busquedaComic(item.t)
  const panini = TIENDA_PANINI[pais]
  const amazon = pais === 'ES' ? 'https://www.amazon.es' : 'https://www.amazon.com'
  return (
    <div className="prov leer">
      <span className="prov-label">{tr('Dónde leerlo', 'Where to read it')}</span>
      <div className="prov-lista">
        <a className="prov-chip" href={`https://www.marvel.com/search?content_type=comics&query=${encodeURIComponent(item.en || item.t)}`}
          target="_blank" rel="noopener noreferrer">Marvel Unlimited</a>
        {panini && <a className="prov-chip" href={panini + q} target="_blank" rel="noopener noreferrer">Panini {nombrePaisIdioma(pais)}</a>}
        <a className="prov-chip" href={`${amazon}/s?k=${q}+panini&i=digital-text`} target="_blank" rel="noopener noreferrer">Kindle</a>
      </div>
      <p className="prov-nota">{tr('Marvel Unlimited tiene los 26 de esta lista (en inglés, por suscripción). Panini los edita en español, en papel y en Kindle; los enlaces abren la búsqueda del título.', 'Marvel Unlimited has all 26 on this list (subscription). Panini publishes them in Spanish, in print and on Kindle; the links open a search for the title.')}</p>
    </div>
  )
}

// Un cómic que el usuario tiene en archivo (CBZ, PDF o imágenes) se lee dentro
// de la app: el archivo se guarda en IndexedDB de este navegador y no sale de él.
function TuArchivo({ item, lectura, onLeer, onOlvida, onBiblioteca }) {
  const [meta, setMeta] = useState(undefined) // undefined: cargando · null: sin archivo
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmaQuitar, setConfirmaQuitar] = useState(false)
  const inputRef = useRef(null)
  // La lectura inicial del almacén puede tardar (la primera vez crea la base) y
  // resolver DESPUÉS de que el usuario haya elegido ya un archivo: cada acción
  // sube la generación y una lectura de una generación vieja se ignora.
  const gen = useRef(0)
  useEffect(() => {
    const g = ++gen.current
    setMeta(undefined); setError('')
    metaArchivo(item.id).then(m => { if (gen.current === g) setMeta(m) })
    return () => { gen.current++ }
  }, [item.id])
  const elegir = async e => {
    const el = clasifica(e.target.files)
    e.target.value = ''
    if (el.error) { setError(el.error); return }
    gen.current++
    setError(''); setOcupado(true)
    try {
      const m = await guardaArchivo(item.id, el)
      onOlvida(item.id); onBiblioteca()
      setMeta(m)
      const reg = await leeArchivo(item.id)
      if (reg) onLeer(item, reg)
      else setError(tr('Se guardó pero no se pudo volver a leer: prueba a elegirlo otra vez', 'Saved but could not be read back: try picking it again'))
    } catch (x) {
      setError(tr('No se pudo guardar el archivo', 'Could not save the file') + (x && x.message ? ': ' + x.message : ''))
    } finally { setOcupado(false) }
  }
  const abrir = async () => {
    gen.current++
    setOcupado(true)
    try {
      const reg = await leeArchivo(item.id)
      if (reg) onLeer(item, reg)
      else { setMeta(null); setError(tr('El archivo ya no está en este navegador: elígelo otra vez', 'The file is no longer in this browser: pick it again')) }
    } catch (x) { setError(tr('No se pudo abrir', 'Could not open') + (x && x.message ? ': ' + x.message : '')) }
    finally { setOcupado(false) }
  }
  const quitar = async () => { gen.current++; setConfirmaQuitar(false); try { await borraArchivo(item.id) } catch {} setMeta(null); onOlvida(item.id); onBiblioteca() }
  useEffect(() => { setConfirmaQuitar(false) }, [item.id, meta])
  return (
    <div className="prov leer-aqui">
      <span className="prov-label">{tr('Leer aquí', 'Read here')}</span>
      <input ref={inputRef} type="file" hidden accept=".cbz,.cbr,.zip,.rar,.pdf,image/*" multiple onChange={elegir} />
      <div className="modal-acciones">
        {meta
          ? <>
              <button className="ghost" onClick={abrir} disabled={ocupado}>
                {lectura && lectura.t > 1 ? tr(`Seguir leyendo · pág. ${lectura.p + 1} de ${lectura.t}`, `Keep reading · p. ${lectura.p + 1} of ${lectura.t}`) : tr('Abrir', 'Open')}
              </button>
              <button className="ghost" onClick={() => inputRef.current && inputRef.current.click()} disabled={ocupado}>{tr('Cambiar archivo', 'Change file')}</button>
              <button className="ghost" onClick={() => setConfirmaQuitar(v => !v)} disabled={ocupado} aria-expanded={confirmaQuitar}>{confirmaQuitar ? tr('Cancelar', 'Cancel') : tr('Quitar', 'Remove')}</button>
              {confirmaQuitar && <button className="chip-btn peligro" onClick={quitar} disabled={ocupado}>{tr('¿Seguro? Sí, quitar el archivo', 'Sure? Yes, remove the file')}</button>}
            </>
          : meta === null
            ? <button className="ghost" onClick={() => inputRef.current && inputRef.current.click()} disabled={ocupado}>{tr('Elegir mi archivo (CBZ, CBR, PDF o imágenes)', 'Pick my file (CBZ, CBR, PDF or images)')}</button>
            : null}
      </div>
      {meta && <p className="prov-nota">{meta.nombre} · {fmtTam(meta.tam)} · {tr('guardado en este navegador', 'stored in this browser')}</p>}
      {meta === null && <p className="prov-nota">{tr('Se lee dentro de la app y el archivo se queda en este navegador: no se sube a ningún sitio. Vale un CBZ o un CBR (pasan página a página; el CBR carga la primera vez un descompresor de 250 kB), las páginas como imágenes, o un PDF, que se abre con el visor del navegador (en iPhone solo enseña bien la primera página: allí mejor CBZ o CBR).', 'It opens inside the app and the file stays in this browser: nothing gets uploaded. A CBZ or CBR works (page by page; CBR loads a 250 kB decompressor the first time), pages as images, or a PDF, which opens in the browser viewer (on iPhone only the first page shows well: prefer CBZ or CBR there).')}</p>}
      {error && <div className="aviso peligro">{error}</div>}
    </div>
  )
}

// El lector a pantalla completa: una página, flechas, teclado, deslizar y
// pulsar la mitad izquierda/derecha de la página. Recuerda por dónde vas.
function Lector({ item, registro, pagInicial, onPagina, onCerrar, leido, onLeido, saliendo }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  const [comic, setComic] = useState(null)
  const [error, setError] = useState('')
  const [pag, setPag] = useState(pagInicial || 0)
  // ajuste: en pantalla estrecha, al ancho (entera sale diminuta con bandas);
  // lo que elijas se recuerda, igual que la doble página
  const [ancho, setAncho] = useState(() => {
    try { const g = localStorage.getItem('maraton-marvel-lector-ajuste-v1'); if (g === 'ancho' || g === 'entera') return g === 'ancho' } catch {}
    return window.innerWidth < 600
  })
  const ponAncho = v => { setAncho(v); try { localStorage.setItem('maraton-marvel-lector-ajuste-v1', v ? 'ancho' : 'entera') } catch {} }
  // doble página: la portada sola y luego pares (1-2, 3-4…), como un cómic abierto
  const [doble, setDoble] = useState(() => { try { return localStorage.getItem('maraton-marvel-lector-doble-v1') === '1' } catch { return false } })
  const ponDoble = v => { setDoble(v); try { localStorage.setItem('maraton-marvel-lector-doble-v1', v ? '1' : '0') } catch {} }
  const pagRef = useRef(null)
  // la primera vez, cómo se pasa página; desaparece al pasar la primera
  const [pista, setPista] = useState(() => { try { return localStorage.getItem('maraton-marvel-lector-pista-v1') !== '1' } catch { return true } })
  const quitaPista = () => { if (pista) { setPista(false); try { localStorage.setItem('maraton-marvel-lector-pista-v1', '1') } catch {} } }
  // toque en el centro: esconde o enseña los controles (el ✕ se queda)
  const [controles, setControles] = useState(true)
  const [apaisado, setApaisado] = useState(() => window.innerWidth > window.innerHeight)
  useEffect(() => {
    const f = () => setApaisado(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const tot = comic ? comic.tot : 0
  const enDoble = doble && apaisado && !ancho && tot > 1
  const primera = enDoble && pag > 0 && pag % 2 === 0 ? pag - 1 : pag
  const paginas = enDoble ? (primera === 0 ? [0] : [primera, primera + 1].filter(i => i < tot)) : [pag]
  // las páginas llegan como promesas (se cortan e inflan al pedirlas); la
  // anterior se queda en pantalla hasta que la nueva está lista
  const [srcs, setSrcs] = useState([])
  const clavePags = paginas.join(',')
  useEffect(() => {
    if (!comic || comic.tipo !== 'imagenes') return undefined
    let vivo = true
    setError('')
    Promise.all(paginas.map(i => comic.pagina(i)))
      .then(u => { if (vivo) { setSrcs(u); if (pagRef.current) pagRef.current.scrollTop = 0 } })
      .catch(e => { if (vivo) setError(e && e.message ? e.message : tr('No se pudo leer la página', 'Could not read the page')) })
    return () => { vivo = false }
  }, [clavePags, comic])
  useEffect(() => {
    let c = null, vivo = true
    abreComic(registro)
      .then(x => { if (!vivo) { x.cierra(); return } c = x; setComic(x); setPag(p => Math.max(0, Math.min(p, x.tot - 1))) })
      .catch(e => { if (vivo) setError(e && e.message ? e.message : tr('No se pudo abrir', 'Could not open')) })
    return () => { vivo = false; if (c) c.cierra() }
  }, [registro])
  useEffect(() => { if (comic && comic.tipo === 'imagenes') onPagina(pag, comic.tot) }, [pag, comic])
  // en doble, la pareja empieza en impar (1-2, 3-4…): se razona sobre su primera
  const primeraDe = p => (p > 0 && p % 2 === 0 ? p - 1 : p)
  const ant = () => { quitaPista(); setPag(p => (enDoble ? Math.max(0, primeraDe(p) <= 2 ? 0 : primeraDe(p) - 2) : Math.max(0, p - 1))) }
  const sig = () => { quitaPista(); setPag(p => Math.min(Math.max(0, tot - 1), enDoble ? (primeraDe(p) === 0 ? 1 : primeraDe(p) + 2) : p + 1)) }
  // La ficha, debajo, también escucha ←/→ (navega entre títulos) y Escape
  // (se cierra): el lector coge esas teclas en fase de captura y no las deja
  // pasar, o pasar página saltaría al cómic siguiente.
  useEffect(() => {
    // espacio y AvPág/RePág: si la página (al ancho) aún tiene scroll, se
    // avanza por pantallas; si no, se pasa página. Inicio/Fin: portada/última.
    const desplaza = signo => {
      const el = pagRef.current
      if (!el) return false
      const paso = Math.round(el.clientHeight * 0.9)
      if (signo > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) { el.scrollBy({ top: paso, behavior: 'smooth' }); return true }
      if (signo < 0 && el.scrollTop > 0) { el.scrollBy({ top: -paso, behavior: 'smooth' }); return true }
      return false
    }
    const k = e => {
      if (e.key === 'ArrowRight') sig()
      else if (e.key === 'ArrowLeft') ant()
      else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { if (!desplaza(1)) sig() }
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { if (!desplaza(-1)) ant() }
      else if (e.key === 'Home') setPag(0)
      else if (e.key === 'End') setPag(Math.max(0, tot - 1))
      else if (e.key === 'Escape') onCerrar()
      else return
      e.stopImmediatePropagation(); e.preventDefault()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [tot, onCerrar, enDoble])
  // la página siguiente se descomprime antes de que haga falta
  useEffect(() => {
    if (comic && comic.tipo === 'imagenes') for (const i of [pag + 1, pag + 2]) if (i < comic.tot) comic.pagina(i).then(u => { const im = new Image(); im.src = u }, () => {})
  }, [pag, comic])
  const t0 = useRef(null)
  const onTS = e => { t0.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null }
  const onTE = e => {
    const a = t0.current; t0.current = null
    if (!a) return
    const dx = e.changedTouches[0].clientX - a.x, dy = e.changedTouches[0].clientY - a.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? sig : ant)()
  }
  const onClickPag = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    if (x < 0.35) ant()
    else if (x > 0.65) sig()
    else { quitaPista(); setControles(v => !v) }
  }
  const ultima = comic && comic.tipo === 'imagenes' && paginas[paginas.length - 1] === tot - 1
  return (
    <div className={`lector${ancho ? ' ancho' : ''}${controles ? '' : ' sin-controles'}${saliendo || ''}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr(`Leyendo ${item.t}`, `Reading ${item.t}`)}>
      <button className="cerrar lector-cerrar" onClick={onCerrar} aria-label={tr('Cerrar el lector', 'Close the reader')}>✕</button>
      {error
        ? <div className="lector-centro"><div className="aviso peligro centrado">{error}</div></div>
        : !comic
          ? <div className="lector-centro"><p className="lector-estado">{tr(`Abriendo ${item.t}…`, `Opening ${item.t}…`)}</p></div>
          : comic.tipo === 'pdf'
            ? <iframe className="lector-pdf" src={comic.url} title={tr(`Leyendo ${item.t}`, `Reading ${item.t}`)} />
            : <div className={`lector-pag${enDoble ? ' doble' : ''}`} ref={pagRef} onTouchStart={onTS} onTouchEnd={onTE} onClick={onClickPag}>
                {paginas.map((i, k) => srcs[k] && <img key={k} src={srcs[k]} alt={tr(`Página ${i + 1} de ${tot}`, `Page ${i + 1} of ${tot}`)} draggable={false} />)}
              </div>}
      {comic && comic.tipo === 'imagenes' && pista && controles && (
        <p className="lector-pista" role="status">{tr('Toca los lados o desliza para pasar página · toca el centro para esconder los controles', 'Tap the sides or swipe to turn the page · tap the middle to hide the controls')}</p>
      )}
      {comic && comic.tipo === 'imagenes' && controles && (
        <div className="lector-progreso" aria-hidden="true"><span style={{ width: `${Math.round(100 * (paginas[paginas.length - 1] + 1) / tot)}%` }} /></div>
      )}
      {comic && comic.tipo === 'imagenes' && controles && (
        <div className="lector-barra">
          <button className="ghost lector-flecha" onClick={ant} disabled={pag === 0} aria-label={tr('Página anterior', 'Previous page')}>‹</button>
          <span className="lector-contador"><b>{paginas.length > 1 ? `${paginas[0] + 1}–${paginas[paginas.length - 1] + 1}` : pag + 1}</b> / {tot}<span className="lector-titulo"> · {item.t}</span></span>
          <button className="ghost lector-flecha" onClick={sig} disabled={pag >= tot - 1} aria-label={tr('Página siguiente', 'Next page')}>›</button>
          <button className="ghost" aria-pressed={ancho} onClick={() => ponAncho(!ancho)}>{ancho ? tr('Ver entera', 'Fit page') : tr('Ajustar al ancho', 'Fit width')}</button>
          {apaisado && !ancho && tot > 1 && <button className="ghost" aria-pressed={doble} onClick={() => ponDoble(!doble)}>{doble ? tr('Una página', 'Single page') : tr('Doble página', 'Two-page spread')}</button>}
          {ultima && !leido && <button className="accion-principal lector-fin" onClick={onLeido}>{tr('Marcar como leído', 'Mark as read')}</button>}
        </div>
      )}
    </div>
  )
}

function Detalle({ d, vista, onToggle, onClose, eps, toggleEp, marcaTemporada, nota, ponNota, listas, toggleEnLista, club, onNav, onIrA, personaPendiente, pais, idioma, onLeer, lectura, onOlvida, onBiblioteca, saliendo, sinSpoilers, onForo }) {
  const { item, c, esComic } = d
  // Sin spoilers: lo que no has visto se esconde, salvo que lo pidas para ESTA ficha
  const [revela, setRevela] = useState(false)
  useEffect(() => { setRevela(false) }, [item.id])
  const oculto = !!sinSpoilers && !vista && !revela
  // el sello grande se estampa al marcar con la ficha abierta, no cada vez
  // que se abre la ficha de algo ya visto (lo estampaba mientras la hoja subía)
  const selloRef = useRef({ id: item.id, vista, en: 0 })
  if (selloRef.current.id !== item.id) selloRef.current = { id: item.id, vista, en: 0 }
  else if (selloRef.current.vista !== vista) selloRef.current = { id: item.id, vista, en: vista ? performance.now() : 0 }
  const estampa = vista && performance.now() - selloRef.current.en < 700
  // «¿Qué te pareció?» se queda mientras la ficha siga abierta: antes se iba
  // al tocar la primera estrella y la valoración no se veía confirmada
  // (revisión HIG, 16 sep 2026)
  const valoraRef = useRef({ id: item.id, visto: false })
  if (valoraRef.current.id !== item.id) valoraRef.current = { id: item.id, visto: false }
  if (vista && selloRef.current.en > 0 && !nota.p) valoraRef.current.visto = true
  const [extra, falloTmdb] = useTmdb(item, idioma)
  // el fotograma que ya se conoce (src/fondos.js, precargado al tocar) sale sin
  // esperar a TMDB; cuando TMDB responde manda el suyo
  const fondo = (extra && extra.fondo) || FOTOGRAMAS[item.id] || null
  const [verTrailer, setVerTrailer] = useState(false)
  const [sinAbierta, setSinAbierta] = useState(null)
  const [desveladas, setDesveladas] = useState({})
  const [enlaceCopiado, setEnlaceCopiado] = useState(false)
  const [persona, setPersona] = useState(null)
  const refOverlay = useRef(null)
  const refModal = useRef(null)
  // La biografía es una capa dentro de la ficha: atrás vuelve a la ficha, como
  // hace Escape, y no cierra las dos de golpe
  useVolverCierra(!!persona, () => setPersona(null), () => refModal.current && refModal.current.querySelector('.persona-ficha'), true)
  // Cada pantalla de la hoja (un título, una biografía) recuerda su scroll
  // (17 sep 2026): la hoja es el mismo nodo para todas y la biografía abría a
  // 200 px, el título abierto desde ella a 150 (carátula y título cortados), y
  // al volver no se recuperaba nada. Lo nuevo empieza arriba; lo que vuelve
  // (atrás a la ficha, la pila de títulos) aparece donde lo dejaste.
  const claveHoja = `${item.id}|${persona ? persona.tmdbId || persona.nombre : ''}`
  const scrollHoja = useRef({ clave: claveHoja, previa: claveHoja, pos: {} })
  // al cambiar de pantalla se anota dónde quedaba la anterior, ANTES de pintar
  // la nueva: el evento de scroll llega al fotograma siguiente y, si el toque
  // venía justo después de desplazar, se apuntaba ya con la clave nueva
  if (scrollHoja.current.clave !== claveHoja && refModal.current) scrollHoja.current.pos[scrollHoja.current.clave] = refModal.current.scrollTop
  scrollHoja.current.clave = claveHoja
  React.useLayoutEffect(() => {
    const h = scrollHoja.current
    // cerrar una biografía la olvida: abrirla otra vez empieza arriba
    if (h.previa !== claveHoja && h.previa.startsWith(`${item.id}|`) && claveHoja === `${item.id}|`) delete h.pos[h.previa]
    h.previa = claveHoja
    const m = refModal.current
    if (!m) return
    const y = h.pos[claveHoja] || 0
    if (Math.abs(m.scrollTop - y) > 1) m.scrollTop = y
  }, [claveHoja])
  useEffect(() => {
    const m = refModal.current
    if (!m) return undefined
    const guarda = () => { scrollHoja.current.pos[scrollHoja.current.clave] = m.scrollTop }
    m.addEventListener('scroll', guarda, { passive: true })
    return () => m.removeEventListener('scroll', guarda)
  }, [])
  // El asa de la hoja móvil (arrastrar hacia abajo para cerrar) y el borde
  // (deslizar para volver) viven en gestosDeVolver, comunes a todas las capas.
  const refNav = useRef(onNav)
  refNav.current = onNav
  const refPersona = useRef(persona)
  refPersona.current = persona
  // Deslizar en horizontal pasa de título, como las flechas ‹ ›. El eje se
  // decide con el primer tramo del movimiento: si domina la vertical, el
  // scroll sigue siendo del navegador y aquí no se toca nada. Quedan fuera el
  // asa (que es del gesto de cerrar), el borde izquierdo (que es del gesto de
  // volver y no deja llegar aquí su touchstart), el carril del reparto (que ya
  // se desliza solo) y la ficha de persona (donde las flechas tampoco navegan).
  useEffect(() => {
    const el = refModal.current
    if (!el || !window.matchMedia('(max-width:720px)').matches) return undefined
    let x0 = null, y0 = null, dx = 0, modo = null, t0 = 0
    const onStart = e => {
      if (e.touches.length !== 1 || refPersona.current || !refNav.current) return
      const t = e.touches[0]
      if (t.clientY - el.getBoundingClientRect().top <= 44) return
      // el carril de temporadas también se desliza solo (14 sep 2026)
      if (e.target.closest('.carril-personas,.temporadas,input,textarea')) return
      x0 = t.clientX; y0 = t.clientY; dx = 0; modo = null; t0 = e.timeStamp
    }
    const onMove = e => {
      if (x0 == null) return
      const t = e.touches[0]
      dx = t.clientX - x0
      if (!modo) {
        const dy = t.clientY - y0
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return
        modo = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'no'
        if (modo === 'x') el.style.transition = 'none'
      }
      if (modo !== 'x') return
      e.preventDefault()
      el.style.transform = `translateX(${dx}px)`
    }
    const suelta = () => { x0 = null; modo = null; el.style.transition = ''; el.style.transform = '' }
    const onEnd = e => {
      if (x0 == null) return
      if (modo === 'x') {
        el.style.transition = 'transform var(--dur-media) var(--curva)'
        el.style.transform = ''
        // un latigazo corto también navega: cuenta la velocidad, no solo el recorrido
        const latigazo = Math.abs(dx) > 24 && Math.abs(dx) / Math.max(1, e.timeStamp - t0) > 0.11
        if ((Math.abs(dx) > 70 || latigazo) && refNav.current) refNav.current(dx < 0 ? 1 : -1)
      }
      x0 = null; modo = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', suelta)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', suelta)
    }
  }, [])
  // Al abrir desde la lista, la carátula vuela desde su tarjeta hasta la ficha:
  // la misma pieza en dos sitios, y el ojo sabe de dónde viene. Se mide el
  // destino con la entrada de la hoja apagada (a tiempo cero la desplaza), y
  // solo se hace si la tarjeta está en pantalla y el movimiento no está reducido.
  const refPortada = useRef(null)
  React.useLayoutEffect(() => {
    // se anima el contenedor, no la <img>: React la reemplaza nada más montar
    // (la portada se vuelve a renderizar) y la animación moriría con el nodo
    // reserva: con View Transitions la carátula ya vuela (abreConVuelo)
    if (vueloEnCurso) return
    const destino = refPortada.current
    const origen = document.querySelector(`#card-${CSS.escape(item.id)} .cover`)
    const modal = refModal.current
    if (!destino || !origen || !modal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ro = origen.getBoundingClientRect()
    if (!ro.width || ro.bottom < 0 || ro.top > window.innerHeight) return
    const anim = modal.style.animation
    modal.style.animation = 'none'
    const rd = destino.getBoundingClientRect()
    modal.style.animation = anim
    if (!rd.width) return
    const hoja = window.matchMedia('(max-width:720px)').matches
    destino.style.transformOrigin = '0 0'
    destino.animate(
      [{ transform: `translate(${ro.left - rd.left}px, ${ro.top - rd.top}px) scale(${ro.width / rd.width}, ${ro.height / rd.height})` }, { transform: 'none' }],
      { duration: hoja ? 380 : 260, easing: hoja ? 'cubic-bezier(.32, .72, 0, 1)' : 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' }
    )
  }, [])
  // cuántas veces se ha cambiado de título con la ficha abierta: al navegar el
  // contenido entra con un fundido corto; al abrir, no (la hoja ya entra sola)
  const [cambios, setCambios] = useState(0)
  // temporada que se ve en la lista de episodios (null = la primera con algo pendiente)
  const [tempVer, setTempVer] = useState(null)
  const montado = useRef(false)
  useEffect(() => {
    setVerTrailer(false); setSinAbierta(null); setEnlaceCopiado(false); setPersona(null); setTempVer(null)
    if (montado.current) setCambios(c => c + 1); else montado.current = true
  }, [item.id])
  // al volver por la pila de fichas se reabre la biografía de la que se salió
  // (después del efecto de arriba, que la apaga al cambiar de título)
  useEffect(() => { if (personaPendiente) setPersona(personaPendiente.p) }, [personaPendiente])
  // Escape, atrapa-foco, bloqueo del scroll y devolución del foco: lo mismo que
  // hacen los otros diálogos, así que se usa el mismo hook en vez de una segunda
  // copia con su propia lista de selectores que mantener a mano.
  // Con una persona abierta, Escape vuelve a la ficha en vez de cerrarlo todo.
  useDialogo(refOverlay, () => { persona ? setPersona(null) : onClose() })
  useEffect(() => {
    const onKey = e => {
      // las flechas no deben saltar de título mientras se lee una biografía
      if (persona || !onNav || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return
      if (e.key === 'ArrowLeft') onNav(-1)
      if (e.key === 'ArrowRight') onNav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNav, persona])
  // Episodios por temporadas (14 sep 2026): la ficha pintaba todas seguidas
  // (216 episodios en Spidey, 136 en Agentes de S.H.I.E.L.D.: hasta ~12.000 px
  // de hoja en el móvil). Se ve una temporada; por defecto, la primera con algo
  // pendiente, que es la que estás viendo. El selector lleva el indicador que viaja.
  const listaEps = item.tipo === 'serie' ? EPISODES[item.id] : null
  const temporadas = listaEps ? [...new Set(listaEps.map(e => e.s))] : []
  const tempActual = temporadas.includes(tempVer) ? tempVer
    : (temporadas.find(t => listaEps.some(e => e.s === t && !eps[`${item.id}:${e.s}:${e.n}`])) ?? temporadas[0])
  const [tempGrupo, tempIndicador] = useIndicador(`${item.id}|${tempActual}|${persona ? 1 : 0}`)
  // la temporada elegida, dentro del carril si hay más de las que caben
  useEffect(() => {
    const g = tempGrupo.current, a = g && g.querySelector('[aria-pressed="true"]')
    if (!a || g.scrollWidth <= g.clientWidth) return
    const r = a.getBoundingClientRect(), rg = g.getBoundingClientRect()
    if (r.left < rg.left + 24 || r.right > rg.right - 24) g.scrollTo({ left: a.offsetLeft - 24, behavior: 'instant' })
  }, [item.id, tempActual, persona])
  // la temporada por defecto se fija al abrir: recalculada en cada render, al
  // completar la que ves (marcar temporada o su último episodio) la lista
  // saltaba a la siguiente y «Quitar temporada» ya no deshacía (revisión)
  useEffect(() => { if (tempVer == null && temporadas.length > 1) setTempVer(tempActual) }, [item.id, tempVer])
  const dirLimpio = item.dir ? limpiaNombre(item.dir) : ''
  const directores = DUOS[dirLimpio]
    || dirLimpio.split(/, | y | & /).map(s => s.trim()).filter(s => s && s !== 'otros')
  return (
    <div className={'overlay' + (saliendo || '')} ref={refOverlay} tabIndex={-1} onClick={onClose}
      role="dialog" aria-modal="true" aria-label={item.t}>
      {/* fuera de .modal: dentro quedaban recortadas por su overflow y le añadían scroll */}
      {onNav && (
        <>
          <button className="nav-ficha izq" onClick={e => { e.stopPropagation(); onNav(-1) }} aria-label={tr('Título anterior', 'Previous title')} title={tr('Anterior (←)', 'Previous (←)')}>‹</button>
          <button className="nav-ficha der" onClick={e => { e.stopPropagation(); onNav(1) }} aria-label={tr('Título siguiente', 'Next title')} title={tr('Siguiente (→)', 'Next (→)')}>›</button>
        </>
      )}
      {/* el hueco sobre la carátula es para el fotograma: se reserva mientras
          TMDB carga (o el contenido saltaría al llegar) y no existe para los
          cómics ni cuando la respuesta viene sin fotograma */}
      <div className={'modal' + ((extra || falloTmdb ? !!fondo : !d.esComic) ? ' con-fondo' : '')} ref={refModal} onClick={e => e.stopPropagation()}>
        {fondo && (
          <div className="modal-fondo" aria-hidden="true">
            <img src={`${TMDB_IMG}w780${fondo}`} alt="" decoding="async"
              onLoad={e => e.currentTarget.classList.add('lista')} />
            <span className="mf-velo" />
          </div>
        )}
        <button className="cerrar" onClick={onClose} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-cover">
          <div className="modal-portada" ref={refPortada}>
            <Portada item={item} c={c} esComic={esComic} />
            {vista && <span className={`sello${estampa ? ' estampa' : ''}`} aria-hidden="true">{esComic ? tr('LEÍDO', 'READ') : tr('VISTA', 'SEEN')}</span>}
          </div>
          <button className={`accion-principal${vista ? ' hecha' : ''}`} onClick={onToggle}>
            {vista ? (esComic ? tr('✓ Leído — marcar pendiente', '✓ Read — mark pending') : tr('✓ Vista — marcar pendiente', '✓ Watched — mark pending')) : esComic ? tr('Marcar como leído', 'Mark as read') : tr('Marcar como vista', 'Mark as watched')}
          </button>
          {/* Recién marcada con la ficha abierta y aún sin estrellas: valorar ahí
              mismo. «Tu valoración» queda a ~860 px del borde de la hoja en el
              móvil (bajo reparto y dónde verla) y el calendario de la portada
              enseña estrellas y reseñas: el paso natural tras marcar es valorar. */}
          {vista && valoraRef.current.visto && (
            <div className="valora-rapido" role="group" aria-label={tr('Valorar', 'Rate')}>
              <span className="valora-rapido-pregunta">{nota.p ? tr('Tu valoración', 'Your rating') : tr('¿Qué te pareció?', 'What did you think?')}</span>
              <span className="estrellas" role="radiogroup" aria-label={tr('Tu valoración', 'Your rating')}>
                {[1, 2, 3, 4, 5].map(p => (
                  <button key={p} type="button" className={`estrella${nota.p >= p ? ' on' : ''}`} role="radio" aria-checked={nota.p === p}
                    aria-label={tr(`${p} estrella${p === 1 ? '' : 's'}`, `${p} star${p === 1 ? '' : 's'}`)}
                    onClick={() => ponNota('p', p)}>{nota.p >= p ? '★' : '☆'}</button>
                ))}
              </span>
              <button type="button" className="ghost valora-rapido-resena" onClick={() => {
                const campo = refModal.current && refModal.current.querySelector('.nota-input')
                if (!campo) return
                campo.scrollIntoView({ block: 'center', behavior: movimientoReducido() ? 'instant' : 'smooth' })
                campo.focus({ preventScroll: true })
              }}>{tr('Escribir reseña', 'Write a review')}</button>
            </div>
          )}
          {falloTmdb && !extra && !esComic && (
            <p className="aviso-sin-red" role="status">{tr('Sin conexión con TMDB: faltan el reparto, el tráiler y dónde verla. Vuelve a abrirla con conexión.', 'Can’t reach TMDB: cast, trailer and where to watch are missing. Reopen it when you’re online.')}</p>
          )}
        </div>
        {persona ? (
          <FichaPersona {...persona} idioma={idioma} itemActualId={item.id} tituloActual={item.t}
            onVolver={() => setPersona(null)}
            onAbrirTitulo={d => { onIrA && onIrA(d, persona); setPersona(null) }} />
        ) : (
        <div className={cambios ? 'modal-info modal-cambio' : 'modal-info'} key={cambios}>
          {/* chips, título y meta juntos: en el móvil van a la derecha de la
              carátula (ficha compacta, CSS); en escritorio la caja no existe */}
          <div className="modal-cabeza">
          <div className="modal-chips">
            {item.uni && <span className="tipo uni">{item.uni}</span>}
            {item.tipo === 'serie' && <span className="tipo serie">{tr('Serie', 'Series')}</span>}
            {item.tipo === 'esp' && <span className="tipo esp">{tr('Especial', 'Special')}</span>}
            {item.opt && <span className="tipo opc">{tr('Opcional', 'Optional')}</span>}
            {platDe(pais, item) && <span className="tipo plat">{platTexto(pais, platDe(pais, item))}</span>}
          </div>
          <h2 className="modal-titulo">{sinPartir(item.t)}</h2>
          <p className="modal-meta">
            {item.s != null && <span className="star">★ {item.s.toFixed(1)} {tr('en IMDb', 'on IMDb')} · </span>}
            {esComic
              ? <>{item.a} · {item.r}</>
              : <>{item.h !== '—' && <><span className="hist">{item.h}</span> · </>}{tr('estreno', 'released')} {item.r}{item.d ? <> · {fmtDur(item.d)}</> : null}</>}
          </p>
          </div>
          {oculto && (item.res || item.pc != null) && (
            <div className="aviso spoiler">
              <p className="aviso-texto">{tr('Sinopsis, escenas post-créditos y títulos de episodio ocultos hasta que lo marques como visto.', 'Synopsis, post-credit scenes and episode titles hidden until you mark it as seen.')}</p>
              <div className="aviso-acciones"><button className="chip-btn" onClick={() => setRevela(true)}>{tr('Mostrar de todos modos', 'Show anyway')}</button></div>
            </div>
          )}
          {!oculto && item.res && <p className="modal-res">{item.res}</p>}
          {item.n && <p className="modal-nota">{item.n}</p>}
          {!oculto && item.pc != null && (
            <p className={`modal-pc${item.pc === '0' ? ' sin' : ''}`}>
              {item.pc === '0'
                ? <>{tr('Sin escenas post-créditos', 'No post-credit scenes')}{item.pcn ? ` — ${item.pcn}` : tr(' — puedes saltarte los créditos', ' — you can skip the credits')}</>
                : <>{tr('Escenas en los créditos: ', 'Scenes in the credits: ')}<b>{item.pc}</b>{item.pcn ? ` · ${item.pcn}` : ''}</>}
            </p>
          )}
          {/* las acciones van tras la sinopsis: en una serie quedaban debajo de
              todos los episodios (en X-Men '97 a 1.800 px; en las de 60, mucho más) */}
          {verTrailer && extra && extra.trailer && (
            <div className="trailer-caja">
              <iframe src={`https://www.youtube-nocookie.com/embed/${extra.trailer}?autoplay=1`}
                title={tr(`Tráiler de ${item.t}`, `Trailer for ${item.t}`)} allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            </div>
          )}
          <div className="modal-acciones">
            {!esComic && (
              <>
                {extra && extra.trailer
                  ? <button className="ghost" aria-pressed={verTrailer} onClick={() => setVerTrailer(v => !v)}>
                      {verTrailer ? <><IcoCerrar />{tr('Cerrar tráiler', 'Close trailer')}</> : <><IcoPlay />{tr('Tráiler', 'Trailer')}</>}
                    </button>
                  : <a className="ghost" href={urlTrailer(item.t)} target="_blank" rel="noopener noreferrer"><IcoPlay />{tr('Tráiler', 'Trailer')}</a>}
                <a className="ghost" href={urlImdb(item.t)} target="_blank" rel="noopener noreferrer">IMDb<IcoFuera /></a>
                {!item.tipo && (
                  <a className="ghost" href={`https://letterboxd.com/search/films/${encodeURIComponent(item.t)}/`}
                    target="_blank" rel="noopener noreferrer">Letterboxd<IcoFuera /></a>
                )}
              </>
            )}
            <button className="ghost" onClick={() => {
              try {
                navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?t=${item.id}`)
                setEnlaceCopiado(true)
                setTimeout(() => setEnlaceCopiado(false), 2000)
              } catch {}
            }}>{enlaceCopiado ? tr('✓ Copiado', '✓ Copied') : <><IcoEnlace />{tr('Enlace', 'Link')}</>}</button>
            {!!navigator.share && (
              <button className="ghost" onClick={() => {
                navigator.share({ url: `${window.location.origin}${window.location.pathname}?t=${item.id}`, title: item.t }).catch(() => {})
              }}>{tr('Compartir…', 'Share…')}</button>
            )}
          </div>
          {(directores.length > 0 || item.cast) && (
            <section className="reparto">
              <h3 className="reparto-titulo">{tr('Dirección y reparto', 'Direction and cast')}</h3>
              <div className="carril-personas">
              {directores.map(p => (
                <button className="persona" key={p}
                  onClick={() => setPersona({ nombre: p, rol: tr('Dirección', 'Direction'),
                    tmdbId: extra && extra.reparto && extra.reparto[clave(p)] && extra.reparto[clave(p)].id })}
                  title={tr(`Ver a ${p} en tu maratón`, `See ${p} in your marathon`)}>
                  <Avatar nombre={p} />
                  <span className="persona-nombre">{p}</span>
                  <span className="persona-rol">{tr('Dirección', 'Direction')}</span>
                </button>
              ))}
              {(() => {
                const deTmdb = extra && Array.isArray(extra.elenco)
                  ? extra.elenco.filter(c => c && typeof c.n === 'string')
                  : []
                const lista = deTmdb.length
                  ? deTmdb
                  : (item.cast || []).map(p => {
                      const limpio = limpiaNombre(p)
                      const cr = extra && extra.reparto && extra.reparto[clave(limpio)]
                      return { n: limpio, p: cr && cr.papel, f: cr && cr.foto, id: cr && cr.id }
                    })
                return lista.map((c, i) => {
                  const papel = typeof c.p === 'string' && c.p ? c.p : null
                  return (
                    <button className="persona" key={c.n + i}
                      onClick={() => setPersona({ nombre: c.n, rol: tr('Reparto', 'Cast'), papel, tmdbId: c.id })}
                      title={papel ? `${c.n} — ${papel}` : tr(`Ver a ${c.n} en tu maratón`, `See ${c.n} in your marathon`)}>
                      <Avatar nombre={c.n} foto={c.f} />
                      <span className="persona-nombre">{c.n}</span>
                      <span className="persona-rol">{papel ? rolLocal(papel) : tr('Reparto', 'Cast')}</span>
                    </button>
                  )
                })
              })()}
              </div>
            </section>
          )}
          {esComic && <TuArchivo item={item} lectura={lectura} onLeer={onLeer} onOlvida={onOlvida} onBiblioteca={onBiblioteca} />}
          {esComic && <DondeLeer item={item} pais={pais} />}
          {extra && (() => {
            const provs = (extra.provPais && Array.isArray(extra.provPais[pais])) ? extra.provPais[pais] : (Array.isArray(extra.prov) ? extra.prov : [])
            const alquiler = provs.length > 0 && provs.every(pv => pv && pv.a)
            return provs.length > 0 && (
            <div className="prov">
              <span className="prov-label">{tr('Hoy en ', 'Today in ')}{nombrePaisTr(pais)}{alquiler && tr(', solo alquiler o compra', ', rent or buy only')}</span>
              <div className="prov-lista">
                {provs.map((pv, i) => {
                  // la caché vieja guardaba texto suelto: se acepta la forma antigua
                  const nombre = typeof pv === 'string' ? pv
                    : (pv && typeof pv.n === 'string' ? pv.n : null)
                  if (!nombre) return null
                  const logo = pv && typeof pv.l === 'string' ? pv.l : null
                  return (
                    <span className="prov-chip" key={nombre + i}>
                      {logo && <img className="prov-logo" src={`${TMDB_IMG}w92${logo}`}
                        alt="" width="26" height="26" loading="lazy" />}
                      {nombre}
                      {pv && pv.g ? <span className="prov-gratis">{tr('gratis', 'free')}</span> : null}
                    </span>
                  )
                })}
              </div>
            </div>
            )
          })()}
          <div className="valoracion">
            <span className="valoracion-label">{tr('Tu valoración', 'Your rating')}</span>
            <span className="estrellas" role="radiogroup" aria-label={tr('Tu valoración', 'Your rating')}>
              {[1, 2, 3, 4, 5].map(p => (
                <button key={p} className={`estrella${nota.p >= p ? ' on' : ''}`} role="radio" aria-checked={nota.p === p}
                  aria-label={tr(`${p} estrellas`, `${p} stars`)} onClick={() => ponNota('p', p)}>{nota.p >= p ? '★' : '☆'}</button>
              ))}
            </span>
            <input className="busca nota-input" placeholder={tr('Tus notas (solo tuyas)…', 'Your notes (yours only)…')} autoComplete="off"
              value={nota.txt || ''} maxLength={280} spellCheck={true}
              onChange={e => ponNota('txt', e.target.value)} aria-label={tr('Tus notas', 'Your notes')} />
          </div>
          {onForo && (
            <div className="valoracion">
              <span className="valoracion-label">{tr('Conversación', 'Conversation')}</span>
              <button className="chip-btn" onClick={onForo}>{tr('Hablar de este título', 'Talk about this title')}</button>
            </div>
          )}
          {listas && listas.length > 0 && (
            <div className="valoracion">
              <span className="valoracion-label">{tr('Listas', 'Lists')}</span>
              <span className="detalle-listas">
                {listas.map(l => (
                  <button key={l.id} className="chip-btn" aria-pressed={l.items.includes(item.id)}
                    onClick={() => toggleEnLista(l.id, item.id)}>
                    {l.nombre}
                  </button>
                ))}
              </span>
            </div>
          )}
          {item.tipo === 'serie' && EPISODES[item.id] && (() => {
            const lista = listaEps
            const hechos = lista.filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
            // el botón de tanda: marca lo que falte de la temporada, o la
            // vacía si ya está entera — 76 toques menos en X-Men TAS
            const tanda = t => {
              const de = lista.filter(e => e.s === t)
              const faltan = de.some(e => !eps[`${item.id}:${e.s}:${e.n}`])
              return (
                <button className="chip-btn" onClick={() => marcaTemporada(item.id, t, faltan)}>
                  {temporadas.length > 1
                    ? (faltan ? tr('Marcar temporada', 'Mark season') : tr('Quitar temporada', 'Clear season'))
                    : (faltan ? tr('Marcar todos', 'Mark all') : tr('Quitar todos', 'Clear all'))}
                </button>
              )
            }
            return (
              <div className="episodios">
                <div className="episodios-head">
                  <h3>{tr('Episodios', 'Episodes')}</h3>
                  <span className="episodios-count">{hechos}/{lista.length}</span>
                  {tanda(tempActual)}
                </div>
                {temporadas.length > 1 && (
                  <div className="tabs temporadas" ref={tempGrupo} role="group" aria-label={tr('Temporadas', 'Seasons')}>
                    <span className="indicador" ref={tempIndicador} aria-hidden="true" />
                    {temporadas.map(t => {
                      const de = lista.filter(e => e.s === t)
                      const h = de.filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
                      return (
                        <button key={t} type="button" className="tab" aria-pressed={t === tempActual} onClick={() => setTempVer(t)}
                          aria-label={tr(`T${t}: temporada ${t}, ${h} de ${de.length} vistos`, `T${t}: season ${t}, ${h} of ${de.length} watched`)}>
                          T{t}<span className="temp-cuenta" aria-hidden="true">{h === de.length ? ' ✓' : ` ${h}/${de.length}`}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {[tempActual].map(t => (
                  <div key={t} className={temporadas.length > 1 ? 'temporada-cuerpo' : undefined}>
                    <div className="ep-lista">
                      {lista.filter(e => e.s === t).map(e => {
                        const clave = `${item.id}:${e.s}:${e.n}`
                        const hecho = !!eps[clave]
                        const tm = extra && extra.eps[`${e.s}:${e.n}`]
                        const sinopsis = tm && tm.o && ui(pais, tm.o)
                        const abierta = sinAbierta === clave
                        return (
                          <div key={clave} className={`ep${hecho ? ' hecho' : ''}`}>
                            <button className="ep-toggle" aria-pressed={hecho}
                              onClick={() => toggleEp(clave)}
                              title={hecho ? tr('Marcar pendiente', 'Mark pending') : tr('Marcar visto', 'Mark watched')}>
                              <span className="ep-thumb" style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }}>
                                {tm && tm.im
                                  ? <img className="ep-img real" src={TMDB_IMG + 'w300' + tm.im} alt="" loading="lazy" />
                                  : POSTERS[item.id] && <img className="ep-img" src={POSTERS[item.id]} alt="" loading="lazy" />}
                                <span className={`ep-velo${hecho ? ' hecho' : ''}`} />
                                {hecho ? <CheckIcon /> : <span className="ep-num">{e.n}</span>}
                              </span>
                              <span className="ep-info">
                                {/* el título va recortado con puntos suspensivos cuando no cabe
                                    —una de cada diez filas—, así que el completo se deja a mano */}
                                <span className="ep-titulo" title={oculto && !hecho ? undefined : e.t}>{oculto && !hecho ? `${tr('Episodio', 'Episode')} ${e.n}` : e.t}</span>
                                {e.f && <span className="ep-fecha">{new Date(e.f + 'T00:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                              </span>
                            </button>
                            {sinopsis && (
                              <button className={`ep-sin-btn${abierta ? ' on' : ''}`} aria-label={tr(`Sinopsis del episodio ${e.n}`, `Episode ${e.n} synopsis`)} aria-expanded={abierta}
                                onClick={() => setSinAbierta(abierta ? null : clave)}>ⓘ</button>
                            )}
                            {abierta && sinopsis && (
                              (hecho || desveladas[clave])
                                ? <p className="ep-sinopsis">{sinopsis}</p>
                                : <p className="ep-sinopsis velada" role="button" tabIndex={0}
                                    onClick={() => setDesveladas(v => ({ ...v, [clave]: true }))}
                                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setDesveladas(v => ({ ...v, [clave]: true })) } }}>
                                    <span className="ep-sin-aviso">{tr('Aún no lo has visto: pulsa para desvelar la sinopsis', 'You haven’t watched it yet: tap to reveal the synopsis')}</span>
                                    <span className="ep-sin-borroso" aria-hidden="true">{sinopsis}</span>
                                  </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
          {club && <ComentariosClub club={club} item={item} vista={vista} />}
          {onNav && (
            <div className="nav-ficha-pie">
              <button className="ghost" onClick={() => onNav(-1)}>{tr('‹ Anterior', '‹ Previous')}</button>
              <button className="ghost" onClick={() => onNav(1)}>{tr('Siguiente ›', 'Next ›')}</button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

// una gráfica con su sección y su título, o solo el contenido cuando va
// dentro de otra (ActividadDelMaraton)
function Marco({ sinMarco, titulo, children }) {
  if (sinMarco) return <>{children}</>
  return (
    <section className="grafica">
      <h3 className="grafica-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

// Actividad y calendario en un solo bloque (14 sep 2026): uno debajo del otro
// contaban lo mismo (qué días marcaste) y, con poco progreso, eran dos cajas
// grandes casi vacías seguidas. Ahora un título y un selector: las 20
// semanas del mapa de calor o el calendario mes a mes con el detalle del día.
// «Dónde estoy» (15 sep 2026, Sebastián: «un scroll hacia abajo y uno se
// pierde»). La lista son ~27.000 px en el móvil sin ninguna referencia al bajar.
// Una píldora fija bajo la barra de herramientas (o bajo el notch si la barra se
// retiró) dice la saga, la era y su cuenta; al tocarla, un índice de sagas y eras
// con su progreso, y un toque salta a la era. Todo se lee del DOM de la lista, así
// que sigue a los filtros, a la búsqueda y a lo plegado sin duplicar lógica.
const SAGA_CORTA = { xmen: ['X-Men', 'X-Men'], ucm: ['UCM', 'MCU'], comics: ['Cómics', 'Comics'], animacion: ['Animación', 'Animation'] }
const cuentaDe = t => { const m = (t || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? [+m[1], +m[2]] : null }
function leeIndice() {
  return [...document.querySelectorAll('main .saga')].map(s => ({
    el: s,
    id: s.id,
    clave: s.dataset.saga,
    titulo: (s.querySelector('.saga-head h2') || {}).textContent || '',
    cuenta: cuentaDe((s.querySelector('.saga-count') || {}).textContent),
    eras: [...s.querySelectorAll('.era')].map(e => ({
      el: e,
      titulo: (e.querySelector('.era-head h3') || {}).textContent || '',
      rango: (e.querySelector('.era-rango') || {}).textContent || '',
      cuenta: cuentaDe((e.querySelector('.era-count') || {}).textContent),
      color: e.style.getPropertyValue('--era') || '',
    })),
  })).filter(s => s.titulo)
}
function DondeEstoy({ version, siguiente, onPrepara }) {
  const [donde, setDonde] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice] = useState([])
  const pildora = useRef(null)
  const refIndice = useRef(null)
  const [montado, sale] = useSaliente(abierto)
  useDialogo(refIndice, () => setAbierto(false), abierto)
  useVolverCierra(abierto, () => setAbierto(false))
  // borde de arriba libre: bajo la barra de herramientas si se ve, si no bajo
  // el notch (medido una vez con un elemento en env(safe-area-inset-top))
  const tope = useRef(null)
  useEffect(() => {
    let pend = false, ultimoY = null
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0;visibility:hidden'
    document.body.appendChild(sonda)
    tope.current = sonda.getBoundingClientRect().top
    const calcula = () => {
      pend = false
      const sagas = [...document.querySelectorAll('main .saga')]
      if (!sagas.length) { setDonde(null); return }
      // en escritorio las sagas van en dos columnas lado a lado: ahí «dónde
      // estoy» no tiene una respuesta (medido: la píldora decía siempre UCM
      // aunque se mirara X-Men) y las dos cabeceras ya se ven; solo con una columna
      if (sagas.length > 1 && Math.abs(sagas[0].getBoundingClientRect().left - sagas[1].getBoundingClientRect().left) > 40) { setDonde(null); return }
      const tb = document.querySelector('.toolbar')
      const rb = tb ? tb.getBoundingClientRect() : null
      const raiz = document.documentElement
      const oculta = raiz.classList.contains('barra-oculta')
      // pegada arriba, su borde se calcula con su `top` y su alto de layout, no
      // con su posición en pantalla: al volver entra animada y el rect de ese
      // instante dejaba la píldora encima de la barra (medido: 17 px con la
      // barra acabando en 61)
      let bajoBarra = 0
      if (tb && !oculta) {
        bajoBarra = raiz.classList.contains('barra-pegada') || rb.top <= (parseFloat(getComputedStyle(tb).top) || 0) + 1
          ? (parseFloat(getComputedStyle(tb).top) || 0) + tb.offsetHeight
          : Math.max(0, rb.bottom)
      }
      const y = Math.round(Math.max(tope.current || 0, bajoBarra) + 8)
      // mientras la barra va aún en su sitio (arriba de la página, sin pegar)
      // la píldora sobra: se veía flotando sobre la portada (medido a 465 px)
      if (tb && !oculta && rb.top > (parseFloat(getComputedStyle(tb).top) || 0) + 1) { setDonde(null); return }
      if (pildora.current && y !== ultimoY) { pildora.current.style.setProperty('--donde-y', y + 'px'); ultimoY = y }
      // la píldora mide 36: cuenta como «actual» la era cuya cabecera está hasta
      // 40 px bajo ella (cuadra con el salto del índice, que la deja a 56 px del
      // borde libre, con la barra visible o retirada)
      const umbral = y + 76
      // no sale hasta que la lista llega arriba (en la portada estorbaría)
      if (sagas[0].getBoundingClientRect().top > umbral) { setDonde(null); return }
      let saga = sagas[0]
      for (const s of sagas) if (s.getBoundingClientRect().top <= umbral) saga = s
      let era = null
      for (const e of saga.querySelectorAll('.era')) if (e.getBoundingClientRect().top <= umbral) era = e
      const h2 = saga.querySelector('.saga-head h2')
      const nuevo = {
        saga: saga.dataset.saga,
        sagaTitulo: h2 ? h2.textContent : '',
        era: era ? (era.querySelector('.era-head h3') || {}).textContent || '' : '',
        cuenta: era ? cuentaDe((era.querySelector('.era-count') || {}).textContent) : cuentaDe((saga.querySelector('.saga-count') || {}).textContent),
        color: era ? era.style.getPropertyValue('--era') : '',
      }
      setDonde(v => (v && v.saga === nuevo.saga && v.era === nuevo.era && v.cuenta?.[0] === nuevo.cuenta?.[0] && v.cuenta?.[1] === nuevo.cuenta?.[1]) ? v : nuevo)
    }
    const on = () => { if (!pend) { pend = true; requestAnimationFrame(calcula) } }
    on()
    window.addEventListener('scroll', on, { passive: true })
    // al girar el iPhone cambia el notch (59 px en vertical, 0 en horizontal):
    // se vuelve a medir, o la píldora quedaba desplazada (code-review)
    const alCambiarTamano = () => { tope.current = sonda.getBoundingClientRect().top; on() }
    window.addEventListener('resize', alCambiarTamano)
    // la barra se retira o vuelve sin scroll propio (clase en <html>)
    const obs = new MutationObserver(on)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    // plegar o desplegar una era, el modo compacto o el orden cambian la lista
    // sin scroll: sin esto la píldora se quedaba con la era vieja (code-review)
    const main = document.querySelector('main')
    const ro = typeof ResizeObserver !== 'undefined' && main ? new ResizeObserver(on) : null
    if (ro) ro.observe(main)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', alCambiarTamano); obs.disconnect(); if (ro) ro.disconnect(); sonda.remove() }
  }, [version])
  const abre = () => { setIndice(leeIndice()); setAbierto(true) }
  // el índice abre con «Estás aquí» a la vista (revisión HIG): abría arriba y
  // quien iba por las fases 5 y 6 —donde más se pierde uno— tenía que bajar a
  // buscarse. Desplaza la hoja, no la página, y después del foco de useDialogo
  useEffect(() => {
    if (!montado || !abierto) return undefined
    const t = setTimeout(() => {
      const aqui = refIndice.current && refIndice.current.querySelector('.indice-era.aqui')
      if (!aqui) return
      let caja = aqui.parentElement
      while (caja && caja !== refIndice.current.parentElement) {
        const o = getComputedStyle(caja).overflowY
        if ((o === 'auto' || o === 'scroll') && caja.scrollHeight > caja.clientHeight + 1) break
        caja = caja.parentElement
      }
      if (!caja || caja === refIndice.current.parentElement) return
      const rc = caja.getBoundingClientRect(), ra = aqui.getBoundingClientRect()
      const objetivo = caja.scrollTop + (ra.top - rc.top) - (rc.height - ra.height) / 2
      // si ya se ve entero (índice corto o primeras eras), no se mueve
      if (ra.top >= rc.top && ra.bottom <= rc.bottom) return
      caja.scrollTop = Math.max(0, Math.min(objetivo, caja.scrollHeight - caja.clientHeight))
    }, 30)
    return () => clearTimeout(t)
  }, [montado, abierto])
  const salta = (dame, espera = 60) => {
    setAbierto(false)
    // tras cerrar (el fondo se libera al instante), la era queda bajo la píldora
    // Salto directo y corregido: las tarjetas fuera de pantalla miden lo que
    // dice contain-intrinsic-size (230 px) y en el móvil miden ~194; al
    // pintarse durante un scroll suave todo se recolocaba y el salto acababa
    // 650 px más abajo. Se salta, se mide otra vez y se corrige (3 veces como
    // mucho), y la cabecera de la era da un destello para situarse.
    setTimeout(() => {
      const el = typeof dame === 'function' ? dame() : dame
      if (!el) return
      // el mismo borde libre que usa la píldora: bajo la barra si se ve, y si
      // no bajo el notch (sin él, con la barra retirada la cabecera quedaba
      // tapada por el notch y la píldora en un iPhone; code-review)
      const raya = () => {
        const tb = document.querySelector('.toolbar')
        const bajoBarra = tb && !document.documentElement.classList.contains('barra-oculta') ? (parseFloat(getComputedStyle(tb).top) || 0) + tb.offsetHeight : 0
        return Math.max(tope.current || 0, bajoBarra) + 56
      }
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - raya()), behavior: 'instant' })
      let intentos = 0
      const corrige = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        const delta = el.getBoundingClientRect().top - raya()
        if (Math.abs(delta) > 4 && intentos++ < 3) { window.scrollBy({ top: delta, behavior: 'instant' }); corrige(); return }
        const cab = el.querySelector('.era-head, .saga-head') || el
        cab.classList.add('destello')
        setTimeout(() => cab.classList.remove('destello'), 1600)
        // en una tarjeta, el foco va con ella (teclado)
        const abrir = el.querySelector(':scope > .abrir')
        if (abrir) abrir.focus({ preventScroll: true })
      }))
      corrige()
    }, espera)
  }
  const corta = donde && SAGA_CORTA[donde.saga]
  return (
    <>
      <button ref={pildora} type="button" className={`donde${donde ? ' visible' : ''}`} onClick={abre}
        aria-hidden={donde ? undefined : 'true'} tabIndex={donde ? 0 : -1} aria-haspopup="dialog"
        aria-label={donde ? tr(`Estás en ${donde.sagaTitulo}${donde.era ? ` · ${donde.era}` : ''}. Abrir el índice de sagas y eras`, `You're in ${donde.sagaTitulo}${donde.era ? ` · ${donde.era}` : ''}. Open the saga and era index`) : undefined}>
        {donde && <>
          <span className="donde-punto" style={donde.color ? { background: donde.color } : undefined} aria-hidden="true" />
          <span className="donde-saga">{corta ? tr(corta[0], corta[1]) : donde.sagaTitulo}</span>
          {donde.era && <span className="donde-era">{donde.era}</span>}
          {donde.cuenta && <span className="donde-cuenta">{donde.cuenta[0]}/{donde.cuenta[1]}</span>}
          <svg className="donde-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </>}
      </button>
      {montado && (
        <div className={'overlay' + sale} ref={refIndice} tabIndex={-1} onClick={() => setAbierto(false)}
          role="dialog" aria-modal="true" aria-label={tr('Índice de sagas y eras', 'Saga and era index')}>
          <div className="modal indice" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setAbierto(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="indice-cuerpo">
              <h2 className="modal-titulo">{tr('Índice', 'Index')}</h2>
              {/* los dos saltos que más se buscan cuando uno se pierde */}
              <div className="indice-atajos">
                {siguiente && (
                  <button type="button" className="indice-atajo" onClick={() => {
                    // la era del siguiente puede estar plegada (o la vista ser
                    // otra): se prepara y se espera a que la tarjeta exista
                    const esperar = onPrepara ? onPrepara(siguiente.id) : false
                    salta(() => document.getElementById('card-' + siguiente.id), esperar ? 240 : 60)
                  }}>
                    <span className="indice-atajo-titulo">{tr('Ir a lo siguiente', 'Go to up next')}</span>
                    <span className="indice-atajo-sub">{siguiente.t}</span>
                  </button>
                )}
                <button type="button" className="indice-atajo" onClick={() => {
                  setAbierto(false)
                  setTimeout(() => window.scrollTo({ top: 0, behavior: movimientoReducido() ? 'instant' : 'smooth' }), 60)
                }}>
                  <span className="indice-atajo-titulo">{tr('Volver arriba', 'Back to top')}</span>
                  <span className="indice-atajo-sub">{tr('Portada y «Siguiente»', 'Home and «Up next»')}</span>
                </button>
              </div>
              {indice.map(s => (
                <section key={s.id || s.titulo} className="indice-saga">
                  <button type="button" className="indice-saga-cab" onClick={() => salta(s.el)}>
                    <span className="indice-saga-titulo">{s.titulo}</span>
                    {/* la cabecera también salta (al principio de la saga): sin
                        flecha parecía un rótulo y nadie la tocaba (revisión HIG) */}
                    <span className="indice-saga-fin">
                      {s.cuenta && <span className="indice-cuenta">{s.cuenta[0]}/{s.cuenta[1]}</span>}
                      <svg className="indice-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                    </span>
                  </button>
                  <ul className="indice-eras">
                    {s.eras.map(e => {
                      const aqui = donde && donde.saga === s.clave && donde.era === e.titulo
                      const pct = e.cuenta && e.cuenta[1] ? Math.round(100 * e.cuenta[0] / e.cuenta[1]) : 0
                      return (
                        <li key={e.titulo}>
                          <button type="button" className={`indice-era${aqui ? ' aqui' : ''}`} aria-current={aqui ? 'location' : undefined}
                            style={e.color ? { '--era': e.color } : undefined} onClick={() => salta(e.el)}>
                            <span className="indice-era-texto">
                              <span className="indice-era-titulo">{e.titulo}</span>
                              <span className="indice-era-sub">{e.rango}{aqui ? tr(' · Estás aquí', ' · You are here') : ''}</span>
                            </span>
                            {e.cuenta && <span className="indice-cuenta">{e.cuenta[0]}/{e.cuenta[1]}</span>}
                            <span className="indice-barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Tu calendario en la portada (15 sep 2026, pedido por Sebastián: «ver qué día
// y qué fechas vi X películas y las reseñas que les puse»). Es el mismo
// Calendario de Perfil, plegable y recordado; solo sale con marcas con fecha.
const KEY_CAL_INICIO = 'maraton-marvel-cal-inicio-v1'
function CalendarioInicio({ vistas, eps, notas, indice, onAbrir, idioma }) {
  // Plegado por defecto (medido: abierto ocupaba 525 px en el móvil y el primer
  // título bajaba a 1.170 px); la cabecera enseña igual la última semana. Abierto
  // solo si el usuario lo abrió a mano alguna vez.
  const [abierto, setAbierto] = useState(() => { try { return localStorage.getItem(KEY_CAL_INICIO) === '1' } catch { return false } })
  const [diaElegido, setDiaElegido] = useState(null)
  const resumen = useMemo(() => {
    const ahora = new Date()
    const esteMes = ts => { const d = new Date(ts); return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth() }
    // los últimos 7 días, hoy a la derecha: cuántas marcas y si alguna tiene valoración
    const semana = []
    for (let i = 6; i >= 0; i--) {
      const f = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - i)
      semana.push({ k: diaClave(f.getTime()), f, n: 0, valorada: false })
    }
    const deSemana = new Map(semana.map(d => [d.k, d]))
    let hay = false, mes = 0, resenas = 0
    for (const [id, ts] of Object.entries(vistas)) {
      if (typeof ts !== 'number' || ts < 1e12 || !indice[id]) continue
      hay = true
      const nt = notas[id]
      const valorada = !!(nt && (nt.p || (nt.txt && nt.txt.trim())))
      if (esteMes(ts)) { mes++; if (valorada) resenas++ }
      const d = deSemana.get(diaClave(ts))
      if (d) { d.n++; if (valorada) d.valorada = true }
    }
    for (const [clave, ts] of Object.entries(eps)) {
      if (typeof ts !== 'number' || ts < 1e12) continue
      hay = true
      if (esteMes(ts)) mes++
      const d = deSemana.get(diaClave(ts))
      if (d) d.n++
    }
    const maxSemana = Math.max(1, ...semana.map(d => d.n))
    return { hay, mes, resenas, semana, maxSemana }
  }, [vistas, eps, notas, indice])
  if (!resumen.hay) return null
  return (
    <details className="cal-inicio" open={abierto}
      onToggle={e => {
        const v = e.currentTarget.open
        setAbierto(v)
        // plegado, se olvida el día tocado en la semana: abrir luego por la
        // cabecera debe llevar a hoy, no a aquel día (lo cazó code-review)
        if (!v) setDiaElegido(null)
        try { localStorage.setItem(KEY_CAL_INICIO, v ? '1' : '0') } catch {}
      }}>
      <summary>
        <span className="cal-inicio-titulo">{tr('Tu calendario', 'Your calendar')}</span>
        <span className="cal-inicio-sub">
          {resumen.mes
            ? tr(`${resumen.mes} marca${resumen.mes === 1 ? '' : 's'} este mes`, `${resumen.mes} check-off${resumen.mes === 1 ? '' : 's'} this month`)
            : tr('nada este mes', 'nothing this month')}
          {resumen.resenas ? tr(` · ${resumen.resenas} valorada${resumen.resenas === 1 ? '' : 's'}`, ` · ${resumen.resenas} rated`) : ''}
        </span>
        {/* la última semana, siempre a la vista: qué días hubo maratón */}
        <span className="cal-semana" aria-hidden="true">
          {resumen.semana.map(d => (
            <span key={d.k} className={`cal-semana-dia${d.n ? ' con' : ''}${d.valorada ? ' con-resena' : ''}`}
              // un día con marcas abre el calendario ya en ese día, con su detalle
              // (un toque, en vez de abrir, buscar el día y tocarlo). El teclado y
              // el lector usan la cabecera, que abre el mes entero
              onClick={d.n ? e => {
                e.preventDefault()
                setDiaElegido(d.f.getTime())
                setAbierto(true)
                try { localStorage.setItem(KEY_CAL_INICIO, '1') } catch {}
              } : undefined}
              style={d.n ? { background: `color-mix(in srgb, var(--red) ${20 + 60 * d.n / resumen.maxSemana}%, var(--panel2))` } : undefined}>
              <span className="cal-semana-letra">{tr(DIA_LETRA[d.f.getDay()], DIA_LETRA_EN[d.f.getDay()])}</span>
            </span>
          ))}
        </span>
      </summary>
      {abierto && (
        <div className="cal-inicio-cuerpo">
          <p className="grafica-sub">{tr('Toca un día para ver qué viste, a qué hora y lo que le pusiste. Los días con punto tienen una valoración.', 'Tap a day to see what you watched, when, and what you rated it. Days with a dot have a rating.')}</p>
          <Calendario key={diaElegido || 'mes'} vistas={vistas} eps={eps} notas={notas} indice={indice} onAbrir={onAbrir} idioma={idioma} diaInicial={diaElegido} sinMarco />
        </div>
      )}
    </details>
  )
}

function ActividadDelMaraton({ vistas, eps, notas, indice, onAbrir, idioma }) {
  const [modo, setModo] = useState('semanas')
  const [grupo, indicador] = useIndicador(modo)
  return (
    <section className="grafica">
      <div className="grafica-cab">
        <h3 className="grafica-titulo">{tr('Actividad del maratón', 'Marathon activity')}</h3>
        <div className="tabs grafica-modos" ref={grupo} role="group" aria-label={tr('Ver la actividad', 'View activity')}>
          <span className="indicador" ref={indicador} aria-hidden="true" />
          <button type="button" className="tab" aria-pressed={modo === 'semanas'} onClick={() => setModo('semanas')}>{tr('20 semanas', '20 weeks')}</button>
          <button type="button" className="tab" aria-pressed={modo === 'mes'} onClick={() => setModo('mes')}>{tr('Por mes', 'By month')}</button>
        </div>
      </div>
      <div className="grafica-cuerpo" key={modo}>
        {modo === 'semanas'
          ? <Actividad vistas={vistas} eps={eps} sinMarco />
          : <Calendario vistas={vistas} eps={eps} notas={notas} indice={indice} onAbrir={onAbrir} idioma={idioma} sinMarco />}
      </div>
    </section>
  )
}

function Actividad({ vistas, eps, sinMarco = false }) {
  const dias = new Map()
  const suma = t => {
    if (typeof t === 'number' && t > 1e12) {
      const d = new Date(t); d.setHours(0, 0, 0, 0)
      dias.set(d.getTime(), (dias.get(d.getTime()) || 0) + 1)
    }
  }
  Object.values(vistas).forEach(suma)
  Object.values(eps).forEach(suma)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const celdas = []
  for (let i = 139; i >= 0; i--) {
    const d = new Date(hoy); d.setDate(d.getDate() - i)
    celdas.push({ t: d.getTime(), n: dias.get(d.getTime()) || 0, f: d })
  }
  const max = Math.max(1, ...celdas.map(c => c.n))
  let racha = 0
  for (let i = celdas.length - 1; i >= 0 && celdas[i].n > 0; i--) racha++
  // solo las marcas de la ventana: con todas, quien llevaba meses leía
  // «13 marcas en 0 días de los últimos 140» (14 sep 2026)
  const total = celdas.reduce((a, c) => a + c.n, 0)
  const diasActivos = celdas.filter(c => c.n > 0).length
  const tono = n => `color-mix(in srgb, var(--red) ${25 + 75 * n / max}%, var(--panel2))`
  // un formateador para las 140 celdas: toLocaleDateString crea uno por
  // llamada y eran 31 ms al abrir Perfil con la CPU a ×4 (16 sep 2026)
  const fecha = new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short' })
  // El title de cada celda no existe con el dedo: los valores viven también en
  // texto (resumen y escala), y el diario de abajo es la tabla gemela.
  const resumen = total === 0
    ? tr('sin marcas en los últimos 140 días', 'no check-offs in the last 140 days')
    : tr(`${total} marca${total === 1 ? '' : 's'} en ${diasActivos} día${diasActivos === 1 ? '' : 's'} de los últimos 140`, `${total} check-off${total === 1 ? '' : 's'} on ${diasActivos} day${diasActivos === 1 ? '' : 's'} of the last 140`) + (max > 1 ? tr(` · máximo ${max} en un día`, ` · at most ${max} in one day`) : '')
  return (
    <Marco sinMarco={sinMarco} titulo={tr('Actividad del maratón', 'Marathon activity')}>
      <p className="grafica-sub">
        {tr('Últimas 20 semanas', 'Last 20 weeks')} · {resumen}{racha > 0 ? tr(` · 🔥 racha de ${racha} día${racha > 1 ? 's' : ''}`, ` · 🔥 ${racha}-day streak`) : ''}
      </p>
      <div className="heatmap" role="img" aria-label={tr(`Calendario de actividad: ${resumen}`, `Activity calendar: ${resumen}`)}>
        {celdas.map(c => (
          <span key={c.t} className="hm-celda"
            title={`${fecha.format(c.f)}: ${tr(`${c.n} marca${c.n === 1 ? '' : 's'}`, `${c.n} check-off${c.n === 1 ? '' : 's'}`)}`}
            style={c.n ? { background: tono(c.n) } : undefined} />
        ))}
      </div>
      <div className="hm-escala" aria-hidden="true">
        <span>0</span>
        <i />
        {[1, 2, 3].filter(n => n <= max).map(n => <i key={n} style={{ background: tono(n) }} />)}
        {max > 3 && <i style={{ background: tono(max) }} />}
        <span>{max > 1 ? tr(`${max} marcas`, `${max} check-offs`) : tr('1 marca', '1 check-off')}</span>
      </div>
    </Marco>
  )
}

// Logros por grupos (15 sep 2026, Sebastián: «agrega los de X-Men y más cosas»).
// Los de una lista de títulos llevan `p` (progreso «2/3» mientras están
// bloqueados). Los ids salen de las eras de data.js, así que un título nuevo en
// una era entra solo. `v.eps` y `v.notas` pueden faltar (perfil compartido).
const idsEra = (saga, i) => ((DATA.find(s => s.saga === saga) || { eras: [] }).eras[i] || { items: [] }).items.map(it => it.id)
const idsSaga = saga => (DATA.find(s => s.saga === saga) || { eras: [] }).eras.flatMap(e => e.items.map(it => it.id))
const deIds = ids => ({ f: v => ids.every(id => v.vistas[id]), p: v => [ids.filter(id => v.vistas[id]).length, ids.length] })
// días con alguna marca con fecha (títulos o episodios)
const marcasPorDia = v => {
  const m = new Map()
  for (const t of [...Object.values(v.vistas || {}), ...Object.values(v.eps || {})]) {
    if (typeof t !== 'number' || t < 1e12) continue
    const k = diaClave(t)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}
const rachaMax = v => {
  const dias = [...marcasPorDia(v).keys()].map(k => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m, d).getTime() }).sort((a, b) => a - b)
  let mejor = 0, actual = 0, prev = null
  for (const t of dias) { actual = prev != null && Math.round((t - prev) / 864e5) === 1 ? actual + 1 : 1; mejor = Math.max(mejor, actual); prev = t }
  return mejor
}
const GRUPOS_LOGROS = [['maraton', 'El maratón', 'The marathon'], ['xmen', 'X-Men', 'X-Men'], ['ucm', 'UCM', 'MCU'], ['papel', 'Cómics y animación', 'Comics and animation'], ['habitos', 'Tus hábitos', 'Your habits']]
const LOGROS = [
  { id: 'primero', g: 'maraton', e: '🎬', t: 'Primer paso', d: 'Marca tu primer título', f: (v) => Object.keys(v.vistas).some(id => !id.startsWith('c-')) },
  { id: 'express', g: 'maraton', e: '⚡', t: 'Ruta express', d: 'Todo lo imprescindible para Doomsday', f: v => v.expressCompleta },
  { id: 'cien', g: 'maraton', e: '💯', t: 'Cien horas', d: '100 horas de maratón vistas', f: v => v.horasVistas >= 100, p: v => [Math.min(100, Math.floor(v.horasVistas || 0)), 100] },
  { id: 'mitad', g: 'maraton', e: '🌗', t: 'Media maratón', d: 'La mitad de los títulos', f: v => v.titulosVistos >= Math.ceil(v.titulosTot / 2), p: v => [Math.min(v.titulosVistos, Math.ceil(v.titulosTot / 2)), Math.ceil(v.titulosTot / 2)] },
  { id: 'completista', g: 'maraton', e: '🏆', t: 'Completista', d: 'Absolutamente todo visto y leído', f: v => v.todoCompleto },

  { id: 'xmen-original', g: 'xmen', e: '🎓', t: 'Alumno de Xavier', d: 'Toda la línea original de X-Men', ...deIds(idsEra('xmen', 0)) },
  { id: 'xmen-nueva', g: 'xmen', e: '🌀', t: 'Línea temporal nueva', d: 'Toda la línea nueva de X-Men', ...deIds(idsEra('xmen', 1)) },
  { id: 'logan', g: 'xmen', e: '🗡️', t: 'Garras de adamantium', d: 'Las tres películas en solitario de Logan', ...deIds(['origins-wolverine', 'the-wolverine', 'logan']) },
  { id: 'deadpool', g: 'xmen', e: '💬', t: 'Rompe la cuarta pared', d: 'Las tres películas de Deadpool', ...deIds(['deadpool1', 'deadpool2', 'deadpool3']) },
  { id: 'xmen-series', g: 'xmen', e: '📺', t: 'Mutantes en la tele', d: 'Las cuatro series de la saga X-Men', ...deIds(idsEra('xmen', 2)) },
  { id: 'fenix', g: 'xmen', e: '🔥', t: 'La Fénix, dos veces', d: 'Fénix Oscura en película y en cómic', ...deIds(['dark-phoenix', 'c-darkphoenix']) },
  { id: 'futuro-pasado', g: 'xmen', e: '⏳', t: 'Futuro pasado', d: 'Días del futuro pasado en película y en cómic', ...deIds(['dofp', 'c-dofp']) },
  { id: 'xmen-papel', g: 'xmen', e: '📖', t: 'X-Men de papel', d: 'Los cómics esenciales de X-Men', ...deIds(idsEra('comics', 0)) },
  { id: 'mutante', g: 'xmen', e: '🧬', t: 'Mutante y orgulloso', d: 'Toda la saga X-Men', f: v => v.xmenCompleto, p: v => { const ids = idsSaga('xmen'); return [ids.filter(id => v.vistas[id]).length, ids.length] } },

  { id: 'capi', g: 'ucm', e: '🛡️', t: 'Trilogía del Capi', d: 'El primer vengador, Soldado de Invierno y Civil War', ...deIds(['cap1', 'cap2', 'civilwar']) },
  { id: 'thanos', g: 'ucm', e: '🧤', t: 'El chasquido', d: 'Infinity War y Endgame', ...deIds(['infinitywar', 'endgame']) },
  { id: 'arana', g: 'ucm', e: '🕷️', t: 'Tu amigo y vecino', d: 'Homecoming, Lejos de casa y No Way Home', ...deIds(['homecoming', 'ffh', 'nwh']) },
  { id: 'groot', g: 'ucm', e: '🌱', t: 'Yo soy Groot', d: 'Las tres de Guardianes de la Galaxia', ...deIds(['gotg1', 'gotg2', 'gotg3']) },
  { id: 'variantes', g: 'ucm', e: '🕰️', t: 'Variante', d: 'Las dos temporadas de Loki y What If...?', ...deIds(['loki1', 'loki2', 'whatif']) },
  { id: 'defensores', g: 'ucm', e: '🥊', t: 'Los Defensores', d: 'Las 6 series de Netflix', ...deIds(['daredevil', 'jessicajones', 'lukecage', 'ironfist', 'defenders', 'punisher']) },
  { id: 'infinito', g: 'ucm', e: '💎', t: 'Saga del Infinito', d: 'Todas las eras hasta Endgame', ...deIds([0, 1, 2, 3].flatMap(i => idsEra('ucm', i))) },

  { id: 'lector', g: 'papel', e: '📚', t: 'Ratón de biblioteca', d: 'Lee 5 cómics esenciales', f: v => Object.keys(v.vistas).filter(id => id.startsWith('c-')).length >= 5, p: v => [Math.min(5, Object.keys(v.vistas).filter(id => id.startsWith('c-')).length), 5] },
  { id: 'coleccionista', g: 'papel', e: '🗃️', t: 'Coleccionista', d: 'Todos los cómics esenciales', ...deIds(idsSaga('comics')) },
  { id: 'boveda', g: 'papel', e: '🎞️', t: 'Sábado por la mañana', d: '5 series de la bóveda de animación', f: v => idsSaga('animacion').filter(id => v.vistas[id]).length >= 5, p: v => [Math.min(5, idsSaga('animacion').filter(id => v.vistas[id]).length), 5] },

  { id: 'racha', g: 'habitos', e: '📅', t: 'Una semana sin parar', d: 'Marca algo 7 días seguidos', f: v => rachaMax(v) >= 7, p: v => [Math.min(7, rachaMax(v)), 7] },
  { id: 'maraton-dia', g: 'habitos', e: '🍿', t: 'Maratón de verdad', d: '5 títulos o episodios el mismo día', f: v => Math.max(0, ...marcasPorDia(v).values()) >= 5, p: v => [Math.min(5, Math.max(0, ...marcasPorDia(v).values())), 5] },
  { id: 'enganchado', g: 'habitos', e: '📼', t: 'Enganchado', d: '100 episodios vistos', f: v => Object.keys(v.eps || {}).length >= 100, p: v => [Math.min(100, Object.keys(v.eps || {}).length), 100] },
  { id: 'critico', g: 'habitos', e: '⭐', t: 'Crítico', d: 'Valora 10 títulos con estrellas', f: v => Object.values(v.notas || {}).filter(n => n && n.p).length >= 10, p: v => [Math.min(10, Object.values(v.notas || {}).filter(n => n && n.p).length), 10] },
  { id: 'resenas', g: 'habitos', e: '✍️', t: 'Pluma afilada', d: 'Escribe 3 reseñas', f: v => Object.values(v.notas || {}).filter(n => n && n.txt && n.txt.trim()).length >= 3, p: v => [Math.min(3, Object.values(v.notas || {}).filter(n => n && n.txt && n.txt.trim()).length), 3] },
]

const KEY_LOGROS_VISTOS = 'maraton-marvel-logros-vistos-v1'
function Logros({ ctx, nuevos }) {
  // se evalúa cada logro una vez por render (antes dos: contar y pintar)
  const estado = LOGROS.map(l => ({ l, ok: !!l.f(ctx), p: l.p ? l.p(ctx) : null }))
  const desbloqueados = estado.filter(x => x.ok).length
  return (
    <section className="grafica">
      <h3 className="grafica-titulo">{tr('Logros', 'Achievements')}</h3>
      <p className="grafica-sub">{desbloqueados} {tr('de', 'of')} {LOGROS.length} {tr('desbloqueados', 'unlocked')}</p>
      {GRUPOS_LOGROS.map(([g, es, en]) => {
        const del = estado.filter(x => x.l.g === g)
        if (!del.length) return null
        return (
          <div key={g} className="logros-grupo">
            <h4 className="logros-grupo-titulo">{tr(es, en)} <span>{del.filter(x => x.ok).length}/{del.length}</span></h4>
            <div className="logros">
              {del.map(({ l, ok, p }) => (
                <div key={l.id} className={`logro${ok ? ' ok' : ''}${ok && nuevos && nuevos.includes(l.id) ? ' nuevo' : ''}`} title={l.d}>
                  {ok && nuevos && nuevos.includes(l.id) && <span className="logro-nuevo">{tr('Nuevo', 'New')}</span>}
                  <span className="logro-emoji" aria-hidden="true">{l.e}</span>
                  <span className="logro-nombre">{sinPartir(l.t)}</span>
                  <span className="logro-desc">{sinPartir(l.d)}</span>
                  {/* bloqueado con progreso: cuánto falta */}
                  {!ok && p && p[1] > 0 && p[0] > 0 && (
                    <span className="logro-prog" aria-label={tr(`${p[0]} de ${p[1]}`, `${p[0]} of ${p[1]}`)}>
                      <i style={{ width: `${Math.round(100 * p[0] / p[1])}%` }} /><em>{p[0]}/{p[1]}</em>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

// La tarjeta para compartir es siempre oscura, se vea desde el tema que se
// vea: estos son los valores del tema oscuro de styles.css (un canvas no lee
// tokens) y scripts/gama.mjs comprueba que sigan siendo los mismos.
const OSCURO = { bg: '#0A0C14', panel2: '#1C2133', ink: '#F2EFE6', ink2: '#A39F92', ink3: '#8D8A7E', red: '#F84A54', gold: '#E8A93C', violet: '#A98BE0', doom: '#64B05C' }
async function compartirImagen(est, comicsVistos, comicsTot) {
  try { await document.fonts.ready } catch {}
  const W = 1080, H = 1350
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const x = cv.getContext('2d')

  // Fondo de tinta nocturna con semitono
  x.fillStyle = OSCURO.bg; x.fillRect(0, 0, W, H)
  x.fillStyle = 'rgba(242,239,230,0.045)'
  for (let i = 20; i < W; i += 26) for (let j = 20; j < H; j += 26) {
    x.beginPath(); x.arc(i, j, 1.3, 0, 7); x.fill()
  }

  // Rótulo rojo inclinado
  x.save(); x.translate(80, 84); x.transform(1, 0, -0.14, 1, 0, 0)
  x.fillStyle = OSCURO.red; x.fillRect(0, 0, 470, 46); x.restore()
  x.fillStyle = '#fff'; x.font = '700 21px Archivo, sans-serif'
  x.fillText(tr('GUÍA DE MARATÓN · MI PROGRESO', 'MARATHON GUIDE · MY PROGRESS'), 100, 115)

  // Título
  const g1 = x.createLinearGradient(80, 0, 980, 0)
  g1.addColorStop(0, OSCURO.ink); g1.addColorStop(.45, OSCURO.red); g1.addColorStop(1, OSCURO.gold)
  x.fillStyle = g1
  x.font = '400 88px "Archivo Black", Archivo, sans-serif'
  x.fillText(tr('MARATÓN', 'MARVEL & X-MEN'), 80, 246)
  x.fillText(tr('MARVEL & X-MEN', 'MARATHON'), 80, 340)

  // Porcentaje gigante
  const pct = est.totMin ? Math.round(100 * est.vistoMin / est.totMin) : 0
  const g2 = x.createLinearGradient(80, 420, 80, 660)
  g2.addColorStop(0, OSCURO.red); g2.addColorStop(1, OSCURO.gold)
  x.fillStyle = g2
  x.font = '400 230px "Archivo Black", Archivo, sans-serif'
  x.fillText(pct + '%', 74, 650)
  x.fillStyle = OSCURO.ink2; x.font = '500 34px Archivo, sans-serif'
  x.fillText(tr(`${est.titulosVistos} de ${est.titulosTot} títulos · ${Math.round(est.vistoMin / 60)} de ${Math.round(est.totMin / 60)} horas vistas`, `${est.titulosVistos} of ${est.titulosTot} titles · ${Math.round(est.vistoMin / 60)} of ${Math.round(est.totMin / 60)} hours watched`), 80, 716)

  // Barras por saga
  const filas = []
  const fx = est.fases.filter(f => f.saga === 'xmen')
  const fu = est.fases.filter(f => f.saga === 'ucm')
  const suma = fs => fs.reduce((a, f) => [a[0] + f.visto, a[1] + f.tot, a[2] + f.vistos, a[3] + f.items], [0, 0, 0, 0])
  const [xv, xt, xvi, xit] = suma(fx)
  const [uv, ut, uvi, uit] = suma(fu)
  filas.push([tr('SAGA X-MEN', 'X-MEN SAGA'), xvi, xit, xt ? xv / xt : 0, OSCURO.gold])
  filas.push([tr('UCM', 'MCU'), uvi, uit, ut ? uv / ut : 0, OSCURO.red])
  filas.push([tr('CÓMICS', 'COMICS'), comicsVistos, comicsTot, comicsTot ? comicsVistos / comicsTot : 0, OSCURO.violet])
  let y = 800
  filas.forEach(([nombre, v, n, frac, color]) => {
    x.fillStyle = OSCURO.ink; x.font = '700 26px Archivo, sans-serif'
    x.fillText(nombre, 80, y + 26)
    x.fillStyle = OSCURO.ink2; x.font = '500 26px Archivo, sans-serif'
    x.textAlign = 'right'; x.fillText(`${v} / ${n}`, 1000, y + 26); x.textAlign = 'left'
    x.fillStyle = OSCURO.panel2
    x.beginPath(); x.roundRect(80, y + 44, 920, 22, 6); x.fill()
    if (frac > 0) {
      x.fillStyle = color
      x.beginPath(); x.roundRect(80, y + 44, Math.max(14, 920 * frac), 22, 6); x.fill()
    }
    y += 116
  })

  // Cuenta atrás para el próximo estreno
  const objetivo = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
  if (objetivo) {
    const dias = Math.ceil((new Date(objetivo.fecha + 'T00:00:00') - Date.now()) / 86400000)
    x.strokeStyle = OSCURO.doom; x.lineWidth = 3
    x.beginPath(); x.roundRect(80, y + 10, 920, 110, 14); x.stroke()
    x.fillStyle = OSCURO.doom; x.font = '700 24px Archivo, sans-serif'
    x.fillText(tr('PRÓXIMO GRAN ESTRENO', 'NEXT BIG PREMIERE'), 116, y + 56)
    x.fillStyle = OSCURO.ink; x.font = '400 34px "Archivo Black", Archivo, sans-serif'
    x.fillText(tr(`${objetivo.t.toUpperCase()} · FALTAN ${dias} DÍAS`, `${objetivo.t.toUpperCase()} · ${dias} DAYS TO GO`), 116, y + 100)
  }

  // Pie
  x.fillStyle = OSCURO.ink3; x.font = '600 24px Archivo, sans-serif'
  x.fillText('ssebv.github.io/maraton-marvel', 80, H - 60)

  const blob = await new Promise(res => cv.toBlob(res, 'image/png'))
  const archivo = new File([blob], 'maraton-marvel.png', { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: tr('Mi maratón Marvel', 'My Marvel marathon') }); return } catch {}
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'maraton-marvel.png'
  a.click(); URL.revokeObjectURL(a.href)
}

export default function App() {
  const [vistas, setVistas] = useState(() => leeGuardado(KEY, saneaMarcas, {}))
  const [perfilModal, setPerfilModal] = useState(false)
  const [perfilNombre, setPerfilNombre] = useState('')
  const [perfilUrl, setPerfilUrl] = useState('')
  const [perfilCopiado, setPerfilCopiado] = useState(false)
  const perfil = useMemo(() => {
    const cod = new URLSearchParams(window.location.search).get('perfil')
    if (!cod) return null
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(cod.replace(/-/g, '+').replace(/_/g, '/')))))
      // mismo criterio que parsePerfilCod: el código lo escribe quien quiera
      if (!j || typeof j !== 'object') return null
      const notas = Array.isArray(j.r) ? j.r : []
      return {
        nombre: typeof j.n === 'string' && j.n.trim() ? j.n.trim().slice(0, 40) : tr('Alguien', 'Someone'),
        vistasP: migraMarcas(deBits(typeof j.v === 'string' ? j.v : '', ORDEN_IDS)),
        epsP: deBits(typeof j.e === 'string' ? j.e : '', ORDEN_EPS),
        notasP: Object.fromEntries(notas
          .filter(x => Array.isArray(x) && ORDEN_IDS[x[0]] && typeof x[1] === 'number')
          .map(([i, p]) => [ORDEN_IDS[i], p])),
      }
    } catch { return null }
  }, [])
  const generarPerfil = nombre => {
    const r = []
    ORDEN_IDS.forEach((id, i) => { const p = notas[id] && notas[id].p; if (p) r.push([i, p]) })
    const j = { n: nombre, v: aBits(vistas, ORDEN_IDS), e: aBits(eps, ORDEN_EPS), r, t: Date.now() }
    const cod = btoa(unescape(encodeURIComponent(JSON.stringify(j)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${window.location.origin}${window.location.pathname}?perfil=${cod}`
  }
  const [filtros, setFiltros] = useState(() => leeVistaUrl().filtros)
  const [vista, setVista] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return VISTAS_VALIDAS.includes(h) ? h : 'crono'
  })
  // la última subvista de cada destino, en un ref que se actualiza al pintar:
  // como estado en un efecto provocaba un SEGUNDO render de toda la app justo
  // en mitad de la animación de cambio de sección (19 ms con la CPU a ×4,
  // perfilado el 16 sep 2026). Solo se lee al pintar las pestañas y al volver.
  const ultimaVista = useRef({}).current
  ultimaVista[destinoDe(vista)] = vista
  const vistaHash = useRef(vista)
  vistaHash.current = vista
  useEffect(() => {
    if (perfil) return
    const onHash = () => {
      const h = window.location.hash.replace('#', '')
      // #u/nombre no es una vista: abre ese perfil encima y deja la URL como estaba
      const u = h.match(/^u\/([a-z0-9_]{3,20})$/)
      const k = h.match(/^c\/([a-z0-9-]{3,30})$/)
      const inv = h.match(/^i\/([a-f0-9]{16,40})$/)
      const hi = h.match(/^h\/(\d{1,12})$/)
      if (hi && NUBE) { setHiloAbierto(Number(hi[1])); if (urlEstado) history.replaceState(history.state, '', urlEstado); return }
      if (u || k || inv) {
        if (NUBE && u) setPerfilPublico(u[1])
        if (NUBE && k) setComunidadAbierta(k[1])
        if (NUBE && inv) setInvitacionPendiente(inv[1])
        if (urlEstado) history.replaceState(history.state, '', urlEstado)
        return
      }
      // Al cerrar la última capa la app consume su entrada de historial
      // (history.back) y vuelve a escribir la URL buena: ese hashchange llega
      // con la vista ya puesta. Pedir otra transición a la misma vista cortaba
      // la del dock (dos seguidas a 30 ms, y la segunda sin desliz).
      const nueva = VISTAS_VALIDAS.includes(h) ? h : 'crono'
      if (nueva === vistaHash.current) return
      conTransicion('atras', () => setVista(nueva))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [perfil])
  // Atrás entre destinos: desde Mío o Multiverso, atrás (borde en iPhone,
  // botón en Android) vuelve a Maratón en vez de salir de la app, como en
  // las apps con pestañas; solo desde Maratón se sale. La subvista en la que
  // estabas se conserva (ultimaVista). El contenido sigue al dedo en el gesto.
  useVolverCierra(!perfil && destinoDe(vista) !== 'maraton', () => conTransicion('atras', () => setVista(ultimaVista.maraton || 'crono')), () => document.querySelector('main'))
  const [detalle, setDetalleEstado] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const t = p.get('t')
      if (t) return buscaItem(t)
      // ?ir=siguiente: el atajo del icono abre el siguiente pendiente del
      // maratón (mismo criterio que la cabecera: ni cómics ni bóveda). Se lee
      // aquí y no en un efecto — el efecto de la URL lo borraría al montar.
      if (p.get('ir') === 'siguiente') {
        const id = ORDEN_VISTA.find(id => ID_MARATON.has(id) && !vistas[id])
        return id ? buscaItem(id) : null
      }
      return null
    } catch { return null }
  })
  // Pila de fichas: abrir un título desde la biografía de un actor apila el
  // anterior (con su biografía) para que atrás vuelva a él, y a la biografía,
  // en vez de a la lista. El aspa cierra todo; atrás deshace de una en una.
  // Cinco como mucho. Las flechas ‹ › no apilan: son vecinos, no un salto.
  const [pilaFichas, setPilaFichas] = useState([])
  // la biografía que se reabre al volver, como estado aparte (objeto nuevo
  // cada vez: aunque el título sea el mismo —tras ‹ › de vuelta— se reabre)
  const [personaPendiente, setPersonaPendiente] = useState(null)
  // abrir la ficha desde cerrada hace volar la carátula (abreConVuelo); con
  // la ficha abierta (flechas, pila) o con función, cambio directo. Por ref:
  // las tarjetas memoizadas guardan un onAbrir de un render viejo
  const detalleAbierto = useRef(detalle)
  detalleAbierto.current = detalle
  const setDetalle = v => {
    if (typeof v === 'function' || !v || !v.item || detalleAbierto.current) { setDetalleEstado(v); return }
    abreConVuelo(v.item.id, () => setDetalleEstado(v))
  }
  const abreDesdeFicha = (d, persona) => { setPilaFichas(p => [...p.slice(-4), { d: detalle, persona }]); setDetalle(d) }
  const cierraFicha = () => cierraConVuelo(detalle && detalle.item.id, () => { setDetalleEstado(null); setPilaFichas([]); setPersonaPendiente(null) })
  const vuelveFicha = () => {
    const ult = pilaFichas[pilaFichas.length - 1]
    if (!ult) return
    setDetalle(ult.d)
    setPersonaPendiente(ult.persona ? { p: ult.persona } : null)
    setPilaFichas(p => p.slice(0, -1))
  }
  // Al cerrar la ficha tras pasar de título (‹ ›, deslizar, biografías), la
  // lista va a la última tarjeta vista: el foco volvía a la de origen, que
  // podía quedar dos pantallas más arriba de lo que acababas de mirar.
  const fichaIds = useRef({ origen: null, ultimo: null })
  useEffect(() => {
    const f = fichaIds.current
    if (detalle) { if (!f.origen) f.origen = detalle.item.id; f.ultimo = detalle.item.id; return }
    const { origen, ultimo } = f
    f.origen = f.ultimo = null
    if (!origen || origen === ultimo) return
    const busca = () => document.getElementById('card-' + ultimo) || document.getElementById('tl-' + ultimo) || document.getElementById('gal-' + ultimo)
    const aterriza = el => {
      const b = el.querySelector('.abrir') || el
      try { b.focus({ preventScroll: true }) } catch {}
      el.scrollIntoView({ behavior: movimientoReducido() ? 'instant' : 'smooth', block: 'center' })
      el.classList.add('destello')
      setTimeout(() => el.classList.remove('destello'), 1600)
    }
    const el = busca()
    if (el) { aterriza(el); return }
    // la tarjeta puede vivir en una saga o era plegada (no está en el DOM):
    // se despliega y se busca en el siguiente pintado
    if (!despliegaPara(ultimo)) return
    const t = setTimeout(() => { const e = busca(); if (e) aterriza(e) }, 60)
    return () => clearTimeout(t)
  }, [detalle])
  const navegaDetalle = dir => setDetalle(d => {
    if (!d) return d
    // por la pantalla, no por los bits: aquí «siguiente» es el de al lado
    const i = ORDEN_VISTA.indexOf(d.item.id)
    const nid = ORDEN_VISTA[i + dir]
    return nid ? buscaItem(nid) : d
  })
  const [tierra, setTierra] = useState(null)
  const [mvModo, setMvModo] = useState('sistema')
  // planeta bajo el puntero o con foco: el botón y su nombre viven en capas
  // distintas del Sistema y :hover solo llega al botón (code-review)
  const [mvSobre, setMvSobre] = useState(null)
  const [planModal, setPlanModal] = useState(false)
  const [planHoras, setPlanHoras] = useState(2)
  const [planExpress, setPlanExpress] = useState(true)
  const [horario, setHorario] = useState(() => leeGuardado(KEY_HORARIO, saneaHorario, null))
  // ?ir=horario: el atajo del icono de la app abre el horario directamente
  // (leído en el inicializador, como ?ir=siguiente; el efecto de la URL limpia)
  const [horarioModal, setHorarioModal] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('ir') === 'horario' } catch { return false }
  })
  const guardaHorario = h => {
    setHorario(h)
    try { h ? localStorage.setItem(KEY_HORARIO, JSON.stringify(h)) : localStorage.removeItem(KEY_HORARIO) } catch {}
  }
  const [orden, setOrden] = useState('crono')
  const [listas, setListas] = useState(() => leeGuardado(KEY_LISTAS, saneaListas, []))
  const [listaActiva, setListaActiva] = useState(null)
  const [abreTierra, cierraTierra] = useCarpeta(tierra, setTierra, !perfil && vista === 'multiverso')
  const [abreLista, cierraLista] = useCarpeta(listaActiva, setListaActiva, !perfil && vista === 'listas')
  const [cine, setCine] = useState(false)
  // el cómic abierto en el lector y por qué página va cada uno
  const [lector, setLector] = useState(null)
  const [lecturas, setLecturas] = useState(() => leeGuardado(KEY_LECTOR, saneaLector, {}))
  // qué cómics tienen archivo en este navegador (solo datos, no los bytes)
  const [archivos, setArchivos] = useState({})
  const recargaBiblioteca = () => { listaArchivos().then(setArchivos) }
  useEffect(recargaBiblioteca, [])
  const abreLector = async id => {
    const d = buscaItem(id)
    if (!d) return
    const registro = await leeArchivo(id).catch(() => null)
    if (registro) setLector({ item: d.item, registro })
    else { recargaBiblioteca(); setDetalle(d) }
  }
  // lo que estabas leyendo, lo último primero
  const enCurso = useMemo(() => Object.keys(archivos)
    .map(id => ({ id, d: buscaItem(id), l: lecturas[id] }))
    .filter(x => x.d && x.d.esComic && !vistas[x.id])
    .sort((a, b) => ((b.l && b.l.f) || 0) - ((a.l && a.l.f) || 0)), [archivos, lecturas, vistas])
  useEffect(() => { try { localStorage.setItem(KEY_LECTOR, JSON.stringify(lecturas)) } catch {} }, [lecturas])
  const refCine = useRef(null)
  useDialogo(refCine, () => setCine(false), cine)
  const [cineIdx, setCineIdx] = useState(0)
  // deslizar en Modo cine: en el móvil las flechas van abajo y el pulgar pasa
  // de título deslizando, como en el lector (más de 50 px, más lateral que vertical)
  const cineToque = useRef(null)
  // acepta valor o función: los cierres de las tarjetas memoizadas no deben
  // leer `listas` de un render viejo
  const guardaListas = next => setListas(prev => {
    const v = typeof next === 'function' ? next(prev) : next
    try { localStorage.setItem(KEY_LISTAS, JSON.stringify(v)) } catch {}
    return v
  })
  const crearLista = nombre => guardaListas([...listas, { id: Math.random().toString(36).slice(2, 9), nombre, items: [], prog: {} }])
  const borrarLista = id => { guardaListas(listas.filter(l => l.id !== id)); if (listaActiva === id) setListaActiva(null) }
  const toggleEnLista = (lid, itemId) => guardaListas(listas.map(l => {
    if (l.id !== lid) return l
    const dentro = l.items.includes(itemId)
    const prog = { ...l.prog }
    if (dentro) delete prog[itemId]
    return { ...l, items: dentro ? l.items.filter(x => x !== itemId) : [...l.items, itemId], prog }
  }))
  const toggleProgLista = (lid, itemId) => guardaListas(listas => listas.map(l => {
    if (l.id !== lid) return l
    const prog = { ...l.prog }
    if (prog[itemId]) delete prog[itemId]; else prog[itemId] = Date.now()
    return { ...l, prog }
  }))
  const [busca, setBusca] = useState(() => leeVistaUrl().busca)
  // la caja responde a cada tecla; la lista de 134 tarjetas se filtra un instante después
  const buscaLenta = useDeferredValue(busca)
  // La URL refleja dónde estás: la vista en el hash, la ficha abierta en ?t= y
  // lo que estás mirando en ?q= y ?f=. Antes esto borraba los parámetros nada
  // más montar, así que un enlace directo abría la ficha pero se perdía al
  // recargar y no se podía copiar de la barra.
  useEffect(() => {
    if (perfil) return
    const p = new URLSearchParams()
    if (detalle) p.set('t', detalle.item.id)
    if (busca.trim()) p.set('q', busca.trim())
    const activos = FILTROS_URL.filter(k => filtros[k])
    if (activos.length) p.set('f', activos.join(','))
    // la coma es legal en un valor de consulta y URLSearchParams la escapa igual:
    // esta URL está para mirarla y compartirla, así que se deja legible
    const cad = p.toString().replace(/%2C/g, ',')
    const h = vista === 'crono' ? '' : '#' + vista
    urlEstado = window.location.pathname + (cad ? '?' + cad : '') + h
    // se conserva history.state: ahí vive la marca {capa:1} del gesto atrás
    history.replaceState(history.state, '', urlEstado)
  }, [vista, detalle, busca, filtros, perfil])
  const [compacto, setCompacto] = useState(() => localStorage.getItem(KEY_COMPACTO) === '1')
  const [sinSpoilers, setSinSpoilers] = useState(() => { try { return localStorage.getItem(KEY_SPOILERS) === '1' } catch { return false } })
  const ponSinSpoilers = v => { setSinSpoilers(v); try { localStorage.setItem(KEY_SPOILERS, v ? '1' : '0') } catch {} }
  // Migración del lote de One-Shots: en marcas locales y en lo que llegue de
  // fuera (sincronización, cuenta, sala), porque todas pasan por setVistas
  useEffect(() => {
    if (!vistas.oneshots) return
    const n = migraMarcas(vistas)
    setVistas(n)
    try { localStorage.setItem(KEY, JSON.stringify(n)) } catch {}
  }, [vistas])
  useEffect(() => {
    const tiene = l => l.items.includes('oneshots') || (l.prog && l.prog.oneshots)
    if (!listas.some(tiene)) return
    guardaListas(prev => prev.map(l => {
      if (!tiene(l)) return l
      const items = l.items.flatMap(id => id === 'oneshots' ? ONESHOTS_PARTIDOS.filter(x => !l.items.includes(x)) : [id])
      return { ...l, items, prog: migraMarcas(l.prog) || {} }
    }))
  }, [listas])
  // En móvil la barra de pestañas se dibuja directamente en <body> (portal):
  // dentro de .toolbar, cualquier transform de la barra al retirarse la
  // convertía en su contenedor y el dock se iba con ella (11 sep 2026).
  const [esMovil, setEsMovil] = useState(() => !!(window.matchMedia && window.matchMedia('(max-width:720px)').matches))
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(max-width:720px)')
    const on = e => setEsMovil(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const [panelAbierto, setPanelAbierto] = useState(() => {
    try {
      const guardado = localStorage.getItem(KEY_PANEL)
      if (guardado !== null) return guardado === '1'
    } catch {}
    return window.innerWidth > 640
  })
  const [fondo, setFondo] = useState(() => {
    try { return localStorage.getItem(KEY_FONDO) || 'banner' } catch { return 'banner' }
  })
  const [ajustes, setAjustes] = useState(false)
  // Chrome/Edge avisan de que la app se puede instalar; iOS no avisa nunca,
  // así que allí Ajustes enseña el camino a mano (Compartir → Añadir a inicio)
  // País para las plataformas: el guardado, o el del idioma del navegador
  // (es-CL → Chile) si está entre los que la app conoce; si no, España.
  const [pais, setPais] = useState(() => {
    let p = 'ES'
    try {
      // ?pais=CL en el enlace: mismo trato que ?lang — manda y se persiste,
      // salvo en un enlace de perfil (ver leeIdiomaGuardado)
      const params = new URLSearchParams(window.location.search)
      const url = (params.get('perfil') ? '' : params.get('pais') || '').toUpperCase()
      const g = localStorage.getItem('maraton-marvel-pais-v1')
      const region = (navigator.language || '').split('-')[1]
      if (url && PAISES.some(x => x.id === url)) {
        p = url
        try { localStorage.setItem('maraton-marvel-pais-v1', p) } catch {}
      } else if (g && PAISES.some(x => x.id === g)) p = g
      else if (region && PAISES.some(x => x.id === region.toUpperCase())) p = region.toUpperCase()
    } catch {}
    aplicaTitulos(p, leeIdiomaGuardado())
    return p
  })
  const [idioma, setIdioma] = useState(leeIdiomaGuardado)
  const ponPais = id => {
    aplicaTitulos(id, idioma)
    setPais(id)
    try { localStorage.setItem('maraton-marvel-pais-v1', id) } catch {}
  }
  const ponIdioma = id => {
    aplicaTitulos(pais, id)
    setIdioma(id)
    try { localStorage.setItem(KEY_IDIOMA, id) } catch {}
  }
  const [instalable, setInstalable] = useState(null)
  useEffect(() => {
    const onBip = e => { e.preventDefault(); setInstalable(e) }
    const onHecha = () => setInstalable(null)
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onHecha)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onHecha)
    }
  }, [])
  const instalar = async () => {
    if (!instalable) return
    // el evento solo admite un prompt(): se gasta acepte o no, y si el usuario
    // lo descarta Chrome vuelve a avisar más tarde y el botón reaparece
    const ev = instalable
    setInstalable(null)
    try { await ev.prompt(); await ev.userChoice } catch {}
  }
  const ponFondo = id => {
    setFondo(id)
    try { localStorage.setItem(KEY_FONDO, id) } catch {}
  }
  const alternaPanel = () => setPanelAbierto(v => {
    const n = !v
    try { localStorage.setItem(KEY_PANEL, n ? '1' : '0') } catch {}
    return n
  })
  const [notas, setNotas] = useState(() => leeGuardado(KEY_NOTAS, saneaNotas, {}))
  const ponNota = (id, campo, valor) => {
    // poner estrellas (no quitarlas) se publica en el muro si está activo
    if (campo === 'p' && typeof valor === 'number' && (!notas[id] || notas[id].p !== valor)) publicaRef.current && publicaRef.current({ tipo: 'resena', ref: id, estrellas: valor })
    guardaNota(id, campo, valor)
  }
  const guardaNota = (id, campo, valor) => setNotas(prev => {
    const item = { ...(prev[id] || {}) }
    if (valor === undefined || valor === '' || (campo === 'p' && item.p === valor)) delete item[campo]
    else item[campo] = valor
    const next = { ...prev }
    if (Object.keys(item).length) next[id] = item; else delete next[id]
    try { localStorage.setItem(KEY_NOTAS, JSON.stringify(next)) } catch {}
    return next
  })
  const alternaCompacto = () => setCompacto(c => {
    localStorage.setItem(KEY_COMPACTO, c ? '0' : '1'); return !c
  })
  const [eps, setEps] = useState(() => leeGuardado(KEY_EPS, saneaMarcas, {}))
  const [sync, setSync] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_SYNC)) } catch { return null }
  })
  const [syncEstado, setSyncEstado] = useState('off')
  const [syncModal, setSyncModal] = useState(false)
  const [amigo, setAmigo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('maraton-marvel-amigo-v1')) } catch { return null }
  })
  const [dueloModal, setDueloModal] = useState(false)
  const [dueloInput, setDueloInput] = useState('')
  const [dueloNombre, setDueloNombre] = useState('')
  const [dueloError, setDueloError] = useState('')
  const guardaAmigo = a => {
    setAmigo(a)
    try { a ? localStorage.setItem('maraton-marvel-amigo-v1', JSON.stringify(a)) : localStorage.removeItem('maraton-marvel-amigo-v1') } catch {}
  }
  const [club, setClub] = useState(() => {
    try { return JSON.parse(localStorage.getItem('maraton-marvel-club-v1')) } catch { return null }
  })
  const [clubModal, setClubModal] = useState(false)
  const [clubCod, setClubCod] = useState('')
  const [clubAlias, setClubAlias] = useState('')
  const [clubError, setClubError] = useState('')
  const [clubInvitar, setClubInvitar] = useState(false)
  // Cada capa que tapa la pantalla se apunta al gesto de volver atrás. La ficha
  // navega entre títulos sin crear entradas nuevas: la capa es «hay ficha», no
  // «esta ficha».
  useVolverCierra(!!detalle, cierraFicha)
  useVolverCierra(pilaFichas.length, vuelveFicha, null, true)
  useVolverCierra(cine, () => setCine(false))
  useVolverCierra(!!lector, () => setLector(null))
  useVolverCierra(ajustes, () => setAjustes(false))
  // Ajustes es un diálogo como la ficha: foco dentro y de vuelta al botón,
  // Escape, Tab atrapado y el fondo (y el dock) bloqueados mientras está abierto
  const refAjustes = useRef(null)
  useDialogo(refAjustes, () => setAjustes(false), ajustes)
  // y lo mismo el resto de ventanas del maratón
  const refPlan = useRef(null), refPerfilM = useRef(null), refDuelo = useRef(null), refClub = useRef(null), refInvitar = useRef(null)
  useDialogo(refPlan, () => setPlanModal(false), planModal)
  useDialogo(refPerfilM, () => setPerfilModal(false), perfilModal)
  useDialogo(refDuelo, () => setDueloModal(false), dueloModal)
  useDialogo(refClub, () => setClubModal(false), clubModal)
  useDialogo(refInvitar, () => setClubInvitar(false), !!(clubInvitar && club))
  useVolverCierra(planModal, () => setPlanModal(false))
  useVolverCierra(horarioModal, () => setHorarioModal(false))
  useVolverCierra(perfilModal, () => setPerfilModal(false))
  useVolverCierra(syncModal, () => setSyncModal(false))
  useVolverCierra(dueloModal, () => setDueloModal(false))
  useVolverCierra(clubModal, () => setClubModal(false))
  useVolverCierra(clubInvitar, () => setClubInvitar(false))
  const guardaClub = c => {
    setClub(c)
    try { c ? localStorage.setItem('maraton-marvel-club-v1', JSON.stringify(c)) : localStorage.removeItem('maraton-marvel-club-v1') } catch {}
  }
  // publica tu avance en el club (con retardo para agrupar marcas)
  useEffect(() => {
    if (!club || perfil) return
    const t = setTimeout(() => {
      fetch(`${club.url}/club/${club.sala}/m/${encodeURIComponent(club.alias)}.json`, {
        method: 'PUT',
        body: JSON.stringify({ v: aBits(vistas, ORDEN_IDS), e: aBits(eps, ORDEN_EPS), t: Date.now() }),
      }).catch(() => {})
    }, 2500)
    return () => clearTimeout(t)
  }, [club, vistas, eps, perfil])
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setPlanModal(false); setHorarioModal(false); setPerfilModal(false); setSyncModal(false); setDueloModal(false); setClubModal(false); setClubInvitar(false) }
      const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)
      if (e.key === '/' && !enCampo) {
        const campo = document.querySelector('input[name="busqueda"]')
        if (campo) { e.preventDefault(); campo.focus() }
      }
      // 1, 2 y 3 cambian de sección, como tocar la pestaña (en la que ya
      // estás, sube al principio). Fuera de campos y de capas.
      if (/^[1-3]$/.test(e.key) && !enCampo && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
          && !document.querySelector('.overlay, .lector, .cine')) {
        const pestana = document.querySelectorAll('nav.tabs .tab')[Number(e.key) - 1]
        if (pestana) { e.preventDefault(); pestana.click() }
        return
      }
      // Atajos de lista en escritorio: j/k pasan de tarjeta, v marca vista,
      // Enter (nativo del botón) abre la ficha. Fuera de campos y de capas.
      if ((e.key === 'j' || e.key === 'k' || e.key === 'v') && !enCampo && !e.metaKey && !e.ctrlKey && !e.altKey
          && !document.querySelector('.overlay, .lector, .cine')) {
        const actual = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.card') : null
        if (e.key === 'v') {
          const caja = actual && actual.querySelector('.checkbox')
          if (caja) { e.preventDefault(); caja.click() }
          return
        }
        const tarjetas = [...document.querySelectorAll('.card')]
        if (!tarjetas.length) return
        let i = tarjetas.indexOf(actual)
        if (i < 0) {
          // sin tarjeta enfocada, la primera que se ve entera bajo la barra
          i = tarjetas.findIndex(t => t.getBoundingClientRect().top >= 80)
          if (i < 0) i = 0
          if (e.key === 'k') i = Math.max(0, i - 1)
        } else i = e.key === 'j' ? Math.min(tarjetas.length - 1, i + 1) : Math.max(0, i - 1)
        const destino = tarjetas[i]
        const b = destino.querySelector('.abrir') || destino
        e.preventDefault()
        try { b.focus({ preventScroll: true }) } catch {}
        destino.scrollIntoView({ behavior: movimientoReducido() ? 'instant' : 'smooth', block: 'center' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const aplicandoRemoto = React.useRef(false)
  // cuándo llegó lo último remoto: el aviso de logro lo mira (aplicandoRemoto
  // ya lo ha consumido el efecto de empujar, que va antes; code-review 21 sep)
  const remotoEn = React.useRef(0)
  const ultimoAplicado = React.useRef(0)

  // ── La cuenta de la comunidad (si el proyecto NUBE de Supabase está configurado) ──
  // El progreso de cada cuenta vive en la tabla progreso y reutiliza la misma
  // maquinaria de empujar/tirar que la base propia. Si hay cuenta, manda la
  // cuenta; la base propia queda como alternativa sin cuenta. La base exige
  // un perfil antes del progreso: sin perfil creado no se sincroniza.
  const [cuenta, setCuenta] = useState(() => (NUBE ? leeGuardado(KEY_CUENTA, saneaCuenta, null) : null))
  // null = sin cargar · false = aún no lo ha creado · objeto = listo
  const [perfilCuenta, setPerfilCuenta] = useState(null)
  const [creaPerfil, setCreaPerfil] = useState(false)
  const [cuentaAviso, setCuentaAviso] = useState(null)
  // el perfil de la comunidad abierto (#u/nombre)
  const [perfilPublico, setPerfilPublico] = useState(() => (NUBE ? PERFIL_EN_URL : null))
  const [comunidadAbierta, setComunidadAbierta] = useState(() => (NUBE ? COMUNIDAD_EN_URL : null))
  const [creaComunidad, setCreaComunidad] = useState(false)
  const [recargaComunidades, setRecargaComunidades] = useState(0)
  const [foroAbierto, setForoAbierto] = useState(null) // { tipo: 'titulo' | 'comunidad', id, nombre? }
  const [hiloAbierto, setHiloAbierto] = useState(() => {
    if (!NUBE) return null
    try { const m = window.location.hash.match(/^#h\/(\d{1,12})$/); return m ? Number(m[1]) : null } catch { return null }
  })
  // una invitación (#i/código) se canjea en cuanto hay cuenta con perfil
  // se guarda en localStorage: entrar con Google o por correo vuelve a la app
  // sin el #i/… y la invitación se perdía (code-review)
  const [invitacionPendiente, setInvitacionPendienteEstado] = useState(() => {
    if (!NUBE) return null
    if (INVITACION_EN_URL) return INVITACION_EN_URL
    try { const g = localStorage.getItem('maraton-marvel-invitacion-v1'); return g && /^[a-f0-9]{16,40}$/.test(g) ? g : null } catch { return null }
  })
  const setInvitacionPendiente = v => {
    setInvitacionPendienteEstado(v)
    try { v ? localStorage.setItem('maraton-marvel-invitacion-v1', v) : localStorage.removeItem('maraton-marvel-invitacion-v1') } catch {}
  }
  // ¿comparte su muro en alguna comunidad? Solo entonces se publica actividad
  const [muroActivo, setMuroActivo] = useState(false)
  const publicaRef = useRef(null)
  // recién entrado: primero se funde lo local con lo remoto, y hasta que
  // termina no arranca la sincronización normal (su primer tirón pisaría lo
  // local con lo remoto viejo)
  // Se guarda en la sesión (cta.fusion) hasta que la fusión termina bien: si
  // falla la red o se recarga a mitad, se reintenta en vez de soltar la
  // sincronización, cuyo primer tirón pisaría lo local con lo remoto viejo
  // (code-review)
  const [fusionando, setFusionandoEstado] = useState(() => !!(NUBE && leeGuardado(KEY_CUENTA, saneaCuenta, null)?.fusion))
  const setFusionando = v => {
    setFusionandoEstado(v)
    try {
      const g = JSON.parse(localStorage.getItem(KEY_CUENTA))
      if (g && typeof g === 'object') localStorage.setItem(KEY_CUENTA, JSON.stringify({ ...g, fusion: v || undefined }))
    } catch {}
  }
  const [reintento, setReintento] = useState(0)
  const cuentaLista = cuenta && perfilCuenta && !fusionando ? cuenta : null
  // el token de sesión dura una hora y no se persiste: se renueva del rt
  const tokenNube = useRef({ t: null, hasta: 0 })
  const salirCuenta = () => {
    if (tokenNube.current.t) salirNube(tokenNube.current.t)
    setCuenta(null)
    setPerfilCuenta(null)
    setFusionandoEstado(false)
    tokenNube.current = { t: null, hasta: 0 }
    setSyncEstado(sync ? 'ok' : 'off')
    try { localStorage.removeItem(KEY_CUENTA) } catch {}
  }
  const tokenCuenta = async () => {
    if (tokenNube.current.t && tokenNube.current.hasta > Date.now() + 60000) return tokenNube.current.t
    // otra pestaña pudo rotar el token de refresco: usar el guardado, no el
    // de la memoria de esta (reusar uno viejo hace que Supabase cierre la
    // sesión en todas partes; code-review)
    let rt = cuenta.rt
    try { const g = JSON.parse(localStorage.getItem(KEY_CUENTA)); if (g && g.uid === cuenta.uid && typeof g.rt === 'string') rt = g.rt } catch {}
    const r = await refrescaToken(rt)
    tokenNube.current = { t: r.token, hasta: Date.now() + r.dura * 1000 }
    // Supabase rota el token de refresco en cada uso: quedarse con el viejo
    // dejaría la sesión muerta en el siguiente arranque
    if (r.rt && r.rt !== rt) {
      try {
        const g = JSON.parse(localStorage.getItem(KEY_CUENTA)) || cuenta
        localStorage.setItem(KEY_CUENTA, JSON.stringify({ ...g, rt: r.rt }))
      } catch {}
      // la cuenta en memoria solo se actualiza por el rt: las dependencias de
      // la sincronización van por uid, así no se relanza nada (code-review)
      setCuenta(c => (c ? { ...c, rt: r.rt } : c))
    }
    return r.token
  }

  const endpoint = async s => `${s.url}/maraton/${s.room}.json`
  // la fila de progreso de la cuenta, con la forma de siempre ({v, e, n, …, t})
  const leeProgresoCuenta = async c => {
    const filas = await rest(await tokenCuenta(), `progreso?usuario=eq.${c.uid}&select=vistas,eps,notas,listas,lecturas,horario,actualizado`)
    const f = Array.isArray(filas) && filas[0]
    return f ? { v: f.vistas, e: f.eps, n: f.notas, l: f.listas, lec: f.lecturas, h: f.horario, t: Date.parse(f.actualizado) } : null
  }
  const escribeProgresoCuenta = async (c, x) => rest(await tokenCuenta(), 'progreso?on_conflict=usuario', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { usuario: c.uid, vistas: x.v, eps: x.e, notas: x.n, listas: x.l, lecturas: x.lec || {}, horario: x.h || null, actualizado: new Date(x.t).toISOString() },
  })
  // una sesión de cuenta que ya no vale (revocada, caducada) cierra la sesión
  // en vez de reintentar para siempre contra un muro
  const trataFallo = (conf, er) => {
    if (conf && conf.cuenta && er && er.auth) salirCuenta()
    setSyncEstado('error')
  }

  const empujar = async (conf, v, e, n, l) => {
    try {
      setSyncEstado('syncing')
      const t = Date.now()
      // el horario y las lecturas de cómics también viajan con la cuenta; la
      // base propia conserva su forma de siempre, que otros dispositivos ya
      // saben leer
      const cuerpo = { v, e, n: n || notas, l: l || listas, t }
      if (conf.cuenta) {
        cuerpo.h = horario; cuerpo.lec = lecturas
        await escribeProgresoCuenta(conf.cuenta, cuerpo)
      } else {
        const r = await fetch(await endpoint(conf), {
          method: 'PUT',
          body: JSON.stringify(cuerpo),
        })
        if (!r.ok) throw new Error(r.status)
      }
      ultimoAplicado.current = t
      setSyncEstado('ok')
    } catch (er) { trataFallo(conf, er) }
  }

  const tirar = async conf => {
    try {
      let datos
      if (conf.cuenta) datos = await leeProgresoCuenta(conf.cuenta)
      else {
        const r = await fetch(await endpoint(conf))
        if (!r.ok) throw new Error(r.status)
        datos = await r.json()
      }
      if (esObj(datos) && typeof datos.t === 'number' && datos.t > ultimoAplicado.current) {
        // El remoto puede llegar con la forma equivocada (escritura a medias,
        // base manipulada, código de sincronización de un desconocido). Se sanea
        // ANTES de tocar el estado: lo que no encaja se descarta como si no
        // hubiera venido, en vez de guardarse y romper la app en cada arranque.
        // Y un campo CORRUPTO tampoco es un campo vacío: si venía con entradas y
        // no sobrevivió ninguna, se descarta entero en vez de borrar lo local.
        const aplicable = (crudo, limpio) => {
          if (limpio == null) return null
          const cuenta = x => Array.isArray(x) ? x.length : (esObj(x) ? Object.keys(x).length : 0)
          return cuenta(crudo) > 0 && cuenta(limpio) === 0 ? null : limpio
        }
        const v = aplicable(datos.v, saneaMarcas(datos.v))
        const e = aplicable(datos.e, saneaMarcas(datos.e))
        const n = aplicable(datos.n, saneaNotas(datos.n))
        const l = aplicable(datos.l, saneaListas(datos.l))
        // Un campo AUSENTE no es lo mismo que uno vacío: si el remoto llega
        // incompleto no debe borrar lo local.
        const tengo = Object.keys(vistas).length
        if (tengo > 0 && v && Object.keys(v).length === 0) {
          // red de seguridad: el remoto vacía el progreso; se guarda el anterior
          try {
            localStorage.setItem(KEY_RESCATE, JSON.stringify({ t: Date.now(), v: vistas, e: eps, n: notas, l: listas }))
          } catch {}
        }
        ultimoAplicado.current = datos.t
        aplicandoRemoto.current = true; remotoEn.current = Date.now()
        if (v) { setVistas(v); try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
        if (e) { setEps(e); try { localStorage.setItem(KEY_EPS, JSON.stringify(e)) } catch {} }
        if (n) { setNotas(n); try { localStorage.setItem(KEY_NOTAS, JSON.stringify(n)) } catch {} }
        if (l) { setListas(l); try { localStorage.setItem(KEY_LISTAS, JSON.stringify(l)) } catch {} }
        // El horario y las lecturas solo viajan con la cuenta, y AQUÍ el que
        // escribe manda siempre el nodo entero: un horario que ya no viene es
        // un horario BORRADO en otro dispositivo (RTDB quita los null), no un
        // campo perdido — sin esto, quitar el horario en el móvil hacía que
        // el portátil lo resucitara en su siguiente empujón. Solo lo corrupto
        // se ignora, como en el resto.
        if (conf.cuenta) {
          if (datos.h == null) guardaHorario(null)
          else { const h = saneaHorario(datos.h); if (h) guardaHorario(h) }
          if (datos.lec == null) setLecturas({})
          else { const lec = aplicable(datos.lec, saneaLector(datos.lec)); if (lec) setLecturas(lec) }
        }
      }
      setSyncEstado('ok')
    } catch (er) { trataFallo(conf, er) }
  }

  // la fuente de sincronización: la cuenta si la hay (con perfil), si no la base propia
  // con cuenta aún sin perfil o fusionando, NADA (antes caía a la sala propia)
  const fuenteSync = cuenta ? (cuentaLista ? { cuenta: cuentaLista } : null) : sync
  const uidSync = cuentaLista ? cuentaLista.uid : null

  // El intervalo vive fijado a [sync, cuenta], así que sin esto llamaría a un
  // tirar() de un render VIEJO: su red de rescate compararía contra el estado
  // del montaje y guardaría esa foto antigua como «progreso a salvar».
  const tirarRef = useRef(tirar)
  tirarRef.current = tirar

  useEffect(() => {
    if (perfil) return
    const conf = cuenta ? (cuentaLista ? { cuenta: cuentaLista } : null) : sync
    if (!conf) { if (!cuenta) setSyncEstado('off'); return }
    // Entre TUS dispositivos (base propia) cada 25 s está bien; contra el
    // proyecto central de la comunidad sería un derroche del cupo gratuito
    // de descarga (10 GB/mes en Spark): con cuenta se refresca cada 2 min y,
    // sobre todo, al volver a la app — que es cuando de verdad hace falta.
    // Con la pestaña escondida no se pide nada, y al volver, focus y
    // visibilitychange llegan JUNTOS: el sello de tiempo deja pasar uno.
    let ultimoTiron = 0
    const tira = () => { ultimoTiron = Date.now(); tirarRef.current(conf) }
    tira()
    const id = setInterval(() => { if (!document.hidden) tira() }, conf.cuenta ? 120000 : 25000)
    const alFoco = () => { if (!document.hidden && Date.now() - ultimoTiron > 5000) tira() }
    window.addEventListener('focus', alFoco)
    document.addEventListener('visibilitychange', alFoco)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', alFoco)
      document.removeEventListener('visibilitychange', alFoco)
    }
  }, [sync, uidSync, !!cuenta])

  // El muro: lo que se acaba de marcar AQUÍ (fecha de hace menos de 2 min y no
  // traído por la sincronización) se publica si hay muro activo. Va antes del
  // efecto de empujar, que es quien consume aplicandoRemoto.
  const vistasPrevias = useRef(null)
  useEffect(() => {
    const antes = vistasPrevias.current
    vistasPrevias.current = vistas
    if (!antes || aplicandoRemoto.current || !muroActivo || !cuentaLista) return
    const nuevas = Object.entries(vistas).filter(([id, ts]) => !antes[id] && typeof ts === 'number' && Date.now() - ts < 120000).slice(0, 5)
    for (const [id] of nuevas) publicaRef.current && publicaRef.current({ tipo: 'titulo', ref: id })
  }, [vistas])
  useEffect(() => {
    if (perfil || !fuenteSync) return
    if (aplicandoRemoto.current) { aplicandoRemoto.current = false; return }
    const id = setTimeout(() => empujar(fuenteSync, vistas, eps, notas, listas), 1200)
    return () => clearTimeout(id)
    // cuenta y sync también: al salir de la cuenta (o entrar) el temporizador
    // pendiente se cancela en vez de escribir en el destino ANTERIOR
  }, [vistas, eps, notas, listas, horario, lecturas, uidSync, sync])

  // Entrar (Google o enlace por correo): el ?code= de la URL por una sesión.
  // Después se carga el perfil; con perfil, se FUNDE lo remoto con lo local
  // (lo local manda por clave, como al unirse a una sala) y se sube la unión.
  const entrarCuenta = async codigo => {
    try {
      setSyncEstado('syncing')
      const c = await canjeaCodigo(codigo)
      tokenNube.current = { t: c.token, hasta: Date.now() + c.dura * 1000 }
      const cta = { uid: c.uid, rt: c.rt, nombre: c.nombre, email: c.email, foto: c.foto, fusion: true }
      // el rt es una llave de larga duración: se guarda aquí y A PROPÓSITO
      // queda fuera de la copia de seguridad descargable y de la restaurable
      try { localStorage.setItem(KEY_CUENTA, JSON.stringify(cta)) } catch {}
      setFusionandoEstado(true)
      setCuenta(cta)
      setCuentaAviso(null)
    } catch (er) {
      setSyncEstado('error')
      setCuentaAviso(er && er.otroNavegador
        ? tr('Abre el enlace en el mismo navegador donde lo pediste.', 'Open the link in the same browser where you requested it.')
        : tr('No se pudo entrar. Vuelve a intentarlo.', 'Could not sign in. Try again.'))
      setAjustes(true)
    }
  }
  // al volver del acceso (una sola vez por carga)
  useEffect(() => {
    if (!NUBE || !RETORNO_CUENTA || perfil) return
    if (RETORNO_CUENTA.code) entrarCuenta(RETORNO_CUENTA.code)
    else { setCuentaAviso(tr(`No se pudo entrar: ${RETORNO_CUENTA.error}`, `Could not sign in: ${RETORNO_CUENTA.error}`)); setAjustes(true) }
  }, [])
  // el perfil de la cuenta: sin él la base no deja guardar el progreso
  useEffect(() => {
    if (!NUBE || !cuenta || perfil) { setPerfilCuenta(null); return undefined }
    let vivo = true
    ;(async () => {
      try {
        const filas = await rest(await tokenCuenta(), `perfiles?id=eq.${cuenta.uid}&select=${CAMPOS_PERFIL}`)
        if (!vivo) return
        const p = Array.isArray(filas) && filas[0] ? saneaPerfil(filas[0]) : false
        setPerfilCuenta(p || false)
        if (!p) setCreaPerfil(true)
      } catch (er) { if (vivo) trataFallo({ cuenta }, er) }
    })()
    return () => { vivo = false }
  }, [cuenta && cuenta.uid, perfilCuenta === null ? reintento : 0])
  // la fusión de después de entrar, en cuanto hay perfil
  useEffect(() => {
    if (!cuenta || !perfilCuenta || !fusionando) return undefined
    let vivo = true
    ;(async () => {
      try {
        // La lectura inicial DEBE distinguir «sin progreso» (lista vacía) de
        // «no se pudo leer» (excepción): tratarlas igual estrenaba la cuenta
        // con solo lo local y PISABA el progreso remoto.
        const datos = await leeProgresoCuenta(cuenta)
        const v = { ...(esObj(datos) && saneaMarcas(datos.v) || {}), ...vistas }
        const e = { ...(esObj(datos) && saneaMarcas(datos.e) || {}), ...eps }
        const n = { ...(esObj(datos) && saneaNotas(datos.n) || {}), ...notas }
        const lRemoto = (esObj(datos) && saneaListas(datos.l)) || []
        const l = [...lRemoto, ...listas.filter(x => !lRemoto.some(r2 => r2.id === x.id))]
        const h = horario || (esObj(datos) ? saneaHorario(datos.h) : null)
        const lec = { ...(esObj(datos) && saneaLector(datos.lec) || {}), ...lecturas }
        const t = Date.now()
        await escribeProgresoCuenta(cuenta, { v, e, n, l, h, lec, t })
        if (!vivo) return
        // el marcador ANTES de soltar la sincronización: su primer tirón no
        // debe re-aplicar un remoto más viejo que la unión recién subida
        ultimoAplicado.current = t
        aplicandoRemoto.current = true; remotoEn.current = Date.now()
        setVistas(v); setEps(e); setNotas(n); setListas(l); setLecturas(lec)
        if (h) guardaHorario(h)
        try {
          localStorage.setItem(KEY, JSON.stringify(v))
          localStorage.setItem(KEY_EPS, JSON.stringify(e))
          localStorage.setItem(KEY_NOTAS, JSON.stringify(n))
          localStorage.setItem(KEY_LISTAS, JSON.stringify(l))
        } catch {}
        setFusionando(false)
        setSyncEstado('ok')
      } catch (er) { if (vivo) trataFallo({ cuenta }, er) } // sigue fusionando: se reintenta al volver
    })()
    return () => { vivo = false }
  }, [cuenta && cuenta.uid, perfilCuenta, fusionando, reintento])
  // perfil o fusión pendientes por un fallo de red: se reintenta al volver a
  // la app o al recuperar la conexión (la app instalada no se recarga)
  useEffect(() => {
    if (!NUBE || !cuenta || (perfilCuenta !== null && !fusionando)) return undefined
    const otra = () => { if (!document.hidden) setReintento(n => n + 1) }
    window.addEventListener('online', otra)
    document.addEventListener('visibilitychange', otra)
    window.addEventListener('focus', otra)
    return () => { window.removeEventListener('online', otra); document.removeEventListener('visibilitychange', otra); window.removeEventListener('focus', otra) }
  }, [cuenta && cuenta.uid, perfilCuenta, fusionando])
  useEffect(() => {
    if (!cuentaLista) { setMuroActivo(false); return undefined }
    let vivo = true
    ;(async () => {
      try {
        const filas = await rest(await tokenCuenta(), `membresias?usuario=eq.${cuentaLista.uid}&muro_activo=is.true&select=comunidad&limit=1`)
        if (vivo) setMuroActivo(Array.isArray(filas) && filas.length > 0)
      } catch {}
    })()
    return () => { vivo = false }
  }, [cuentaLista && cuentaLista.uid, recargaComunidades])
  publicaRef.current = async ({ tipo, ref, estrellas }) => {
    if (!cuentaLista || !muroActivo) return
    try {
      await rest(await tokenCuenta(), 'actividad', { method: 'POST', prefer: 'return=minimal', body: { usuario: cuentaLista.uid, tipo, ref, estrellas: estrellas || null } })
    } catch {}
  }
  // entrar con una invitación: devuelve un mensaje de error o null
  const usaInvitacion = async codigo => {
    try {
      const id = await rest(await tokenCuenta(), 'rpc/unirse_con_codigo', { method: 'POST', body: { codigo_in: codigo } })
      if (typeof id !== 'string') throw new Error('respuesta')
      const filas = await rest(await tokenCuenta(), `comunidades?id=eq.${id}&select=direccion`)
      setRecargaComunidades(n => n + 1)
      if (Array.isArray(filas) && filas[0]) setComunidadAbierta(filas[0].direccion)
      return null
    } catch (er) {
      return er && /expulsaron/.test(er.message) ? tr('Te expulsaron de esa comunidad.', 'You were removed from that community.')
        : er && /no válida/.test(er.message) ? tr('La invitación no vale: caducó, se agotó o no existe.', 'That invite isn’t valid: expired, used up or doesn’t exist.')
        : tr('No se pudo entrar. Inténtalo otra vez.', 'Could not join. Try again.')
    }
  }
  useEffect(() => {
    if (!invitacionPendiente || !NUBE) return
    if (!cuenta) {
      try { localStorage.setItem('maraton-marvel-invitacion-v1', invitacionPendiente) } catch {}
      setCuentaAviso(tr('Entra (y crea tu perfil) para aceptar la invitación.', 'Sign in (and create your profile) to accept the invite.')); setAjustes(true); return
    }
    if (!cuentaLista) return
    const cod = invitacionPendiente
    setInvitacionPendiente(null)
    usaInvitacion(cod).then(err => { if (err) { setCuentaAviso(err); setAjustes(true) } })
  }, [invitacionPendiente, cuentaLista])
  const cambiaPrivacidad = async (campo, valor) => {
    if (!perfilCuenta || !PRIVACIDADES.includes(valor)) return
    const antes = perfilCuenta[campo]
    setPerfilCuenta(p => ({ ...p, [campo]: valor }))
    try {
      await rest(await tokenCuenta(), `perfiles?id=eq.${cuenta.uid}`, { method: 'PATCH', prefer: 'return=minimal', body: { [campo]: valor } })
    } catch (er) {
      setPerfilCuenta(p => ({ ...p, [campo]: antes }))
      trataFallo({ cuenta }, er)
    }
  }
  // Ley 21.719: acceso (todo en un JSON) y supresión
  const descargaMisDatos = async () => {
    try {
      const datos = await rest(await tokenCuenta(), 'rpc/mis_datos', { method: 'POST', body: {} })
      const blob = new Blob([JSON.stringify({ app: 'maraton-marvel', cuenta: cuenta.email, fecha: new Date().toISOString(), datos }, null, 1)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `maraton-marvel-mis-datos-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch (er) { trataFallo({ cuenta }, er) }
  }
  const borraMiCuenta = async () => {
    try {
      await rest(await tokenCuenta(), 'rpc/borrar_mi_cuenta', { method: 'POST', body: {} })
      salirCuenta()
      setCuentaAviso(tr('Cuenta borrada. Lo de este navegador sigue aquí.', 'Account deleted. What’s in this browser is still here.'))
    } catch (er) { trataFallo({ cuenta }, er) }
  }

  const activarSync = async (url, roomExistente) => {
    const room = roomExistente || Math.random().toString(36).slice(2, 10)
    const conf = { url, room }
    if (roomExistente) {
      // unirse: fusionar lo remoto con lo local y subir la unión
      try {
        // endpoint() es async desde la cuenta de Google: sin el await interior
        // fetch recibía una promesa, pedía «[object Promise]» (404) y el
        // empujar de abajo PISABA la sala a la que te unías con lo local
        const r = await fetch(await endpoint(conf))
        const datos = r.ok ? await r.json() : null
        // lo remoto se sanea igual que en tirar(): al unirse a una sala ajena
        // es cuando más fácil es tragarse la forma equivocada
        const v = { ...(esObj(datos) && saneaMarcas(datos.v) || {}), ...vistas }
        const e = { ...(esObj(datos) && saneaMarcas(datos.e) || {}), ...eps }
        const n = { ...(esObj(datos) && saneaNotas(datos.n) || {}), ...notas }
        const lRemoto = (esObj(datos) && saneaListas(datos.l)) || []
        const l = [...lRemoto, ...listas.filter(x => !lRemoto.some(r => r.id === x.id))]
        aplicandoRemoto.current = true; remotoEn.current = Date.now()
        setVistas(v); setEps(e); setNotas(n); setListas(l)
        localStorage.setItem(KEY, JSON.stringify(v))
        localStorage.setItem(KEY_EPS, JSON.stringify(e))
        localStorage.setItem(KEY_NOTAS, JSON.stringify(n))
        localStorage.setItem(KEY_LISTAS, JSON.stringify(l))
        await empujar(conf, v, e, n, l)
      } catch { setSyncEstado('error'); return false }
    } else {
      await empujar(conf, vistas, eps)
    }
    setSync(conf)
    localStorage.setItem(KEY_SYNC, JSON.stringify(conf))
    return true
  }
  const desactivarSync = () => {
    setSync(null); setSyncEstado('off')
    localStorage.removeItem(KEY_SYNC)
  }

  // Deshacer (revisión ux-heuristics, 15 sep 2026): desmarcar un título o quitar
  // una temporada era un toque sin vuelta atrás, y volver a marcar ponía la fecha
  // de hoy (reescribía calendario, mapa y racha). Un aviso de 5 s lo devuelve con
  // sus fechas. Por ref: las tarjetas memoizadas guardan un toggle de otro render.
  const [deshacer, setDeshacer] = useState(null)
  // el aviso vigente: «Serie completa» encadena su Deshacer al del episodio que
  // la completó (antes lo pisaba y ese episodio ya no se podía deshacer)
  const deshacerRef = useRef(null); deshacerRef.current = deshacer
  const ofreceDeshacer = (texto, restaura, ms = 5000) => setDeshacer({ id: Date.now(), texto, restaura, ms })
  const vistasRef = useRef(vistas); vistasRef.current = vistas
  const epsRef = useRef(eps); epsRef.current = eps
  const restauraEps = guardadas => setEps(prev => {
    const next = { ...prev, ...guardadas }
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    return next
  })
  const marcaTemporada = (id, s, marcar) => {
    if (!marcar) {
      const guardadas = {}
      ;(EPISODES[id] || []).filter(e => e.s === s).forEach(e => {
        const k = `${id}:${e.s}:${e.n}`
        if (epsRef.current[k]) guardadas[k] = epsRef.current[k]
      })
      const n = Object.keys(guardadas).length
      if (n) ofreceDeshacer(tr(`${n} episodio${n === 1 ? '' : 's'} quitado${n === 1 ? '' : 's'}`, `${n} episode${n === 1 ? '' : 's'} removed`), () => restauraEps(guardadas))
    }
    marcaTemporadaEps(id, s, marcar)
  }
  // Una serie con todos sus episodios marcados cuenta como vista: antes el
  // progreso y «Siguiente» la seguían dando por pendiente. Solo al COMPLETARLA
  // (el cambio que la deja entera), así desmarcarla a mano no la vuelve a marcar.
  const epsAntes = useRef(eps)
  // Solo cuando la marca la pone el usuario aquí (un episodio, una temporada):
  // no al sincronizar (en otro dispositivo pudo desmarcar la serie a mano, y
  // re-marcarla la subía de vuelta) ni al deshacer o restaurar (volvían a
  // marcar con fecha de hoy series desmarcadas a mano). Lo cazó code-review.
  const completarAlMarcar = useRef(false)
  useEffect(() => {
    const antes = epsAntes.current
    epsAntes.current = eps
    if (antes === eps) return
    if (!completarAlMarcar.current) return
    completarAlMarcar.current = false
    const completas = Object.keys(EPISODES).filter(id => {
      const lista = EPISODES[id]
      const entera = m => lista.length > 0 && lista.every(e => m[`${id}:${e.s}:${e.n}`])
      return entera(eps) && !entera(antes) && !vistasRef.current[id]
    })
    if (!completas.length) return
    const ahora = Date.now()
    setVistas(prev => {
      const next = { ...prev }
      completas.forEach(id => { if (!next[id]) next[id] = ahora })
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
    const d = completas.length === 1 && buscaItem(completas[0])
    // si la misma acción ya dejó un aviso (el episodio marcado desde «Siguiente»),
    // deshacer la serie completa deshace también ese episodio
    const previo = deshacerRef.current && Date.now() - deshacerRef.current.id < 1500 ? deshacerRef.current.restaura : null
    ofreceDeshacer(d ? tr(`Serie completa: ${d.item.t}`, `Series complete: ${d.item.t}`) : tr('Serie completa', 'Series complete'), () => {
      setVistas(prev => {
        const next = { ...prev }
        completas.forEach(id => { if (next[id] === ahora) delete next[id] })
        try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
        return next
      })
      if (previo) previo()
    })
  }, [eps])
  // toda una temporada de un golpe: marca lo pendiente o la vacía entera
  const marcaTemporadaEps = (id, s, marcar) => setEps(prev => {
    const next = { ...prev }
    ;(EPISODES[id] || []).filter(e => e.s === s).forEach(e => {
      const k = `${id}:${e.s}:${e.n}`
      if (marcar) { if (!next[k]) { next[k] = Date.now(); completarAlMarcar.current = true } } else delete next[k]
    })
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    tic()
    if (marcar) suenaPop()
    return next
  })

  const toggleEp = clave => setEps(prev => {
    const next = { ...prev }
    if (next[clave]) delete next[clave]; else { next[clave] = Date.now(); completarAlMarcar.current = true; suenaPop() }
    tic()
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    return next
  })

  // Marcar lo siguiente desde la portada (15 sep 2026): es lo que más se hace
  // en un maratón y pedía abrir la ficha. Una película se marca vista; una
  // serie, su siguiente episodio sin ver (la tarjeta pasa sola a lo que toca).
  // Siempre con Deshacer: el botón está lejos del contenido que cambia.
  const marcaSiguiente = s => {
    if (!s) return
    const lista = s.tipo === 'serie' ? EPISODES[s.id] : null
    if (lista && lista.length) {
      const e = lista.find(x => !epsRef.current[`${s.id}:${x.s}:${x.n}`])
      if (e) {
        const clave = `${s.id}:${e.s}:${e.n}`
        toggleEp(clave)
        ofreceDeshacer(tr(`Visto: ${s.t} · T${e.s}·E${e.n}`, `Watched: ${s.t} · S${e.s}·E${e.n}`), () => setEps(prev => {
          if (!prev[clave]) return prev
          const next = { ...prev }; delete next[clave]
          try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
          return next
        }))
        return
      }
    }
    if (vistasRef.current[s.id]) return
    toggleVista(s.id)
    ofreceDeshacer(tr(`Vista: ${s.t}`, `Watched: ${s.t}`), () => setVistas(prev => {
      if (!prev[s.id]) return prev
      const next = { ...prev }; delete next[s.id]
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    }))
  }
  const toggle = id => {
    const antes = vistasRef.current[id]
    if (antes) {
      const d = buscaItem(id)
      const t = d ? d.item.t : ''
      ofreceDeshacer(tr(`Pendiente: ${t}`, `Pending: ${t}`), () => setVistas(prev => {
        if (prev[id]) return prev
        const next = { ...prev, [id]: antes }
        try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
        return next
      }))
    }
    toggleVista(id)
  }
  const toggleVista = id => setVistas(prev => {
    const next = { ...prev }
    if (next[id]) delete next[id]; else { next[id] = Date.now(); suenaPop() }
    tic()
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    return next
  })
  const setF = k => setFiltros(f => ({ ...f, [k]: !f[k] }))
  const [tema, setTema] = useState(() => {
    try { const t = localStorage.getItem(KEY_TEMA); return TEMAS.some(x => x.id === t) ? t : 'sistema' } catch { return 'sistema' }
  })
  useEffect(() => {
    const raiz = document.documentElement
    if ((raiz.getAttribute('data-theme') || 'sistema') !== tema) sinTransiciones(() => {
      if (tema === 'sistema') raiz.removeAttribute('data-theme')
      else raiz.setAttribute('data-theme', tema)
    })
    // La barra del navegador: los dos <meta theme-color> de index.html van por
    // media query; con un tema fijo los dos toman el color de ese tema.
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      const propio = (m.getAttribute('media') || '').includes('dark') ? 'dark' : 'light'
      m.setAttribute('content', COLOR_BARRA[tema === 'sistema' ? propio : tema])
    }
    try { if (tema === 'sistema') localStorage.removeItem(KEY_TEMA); else localStorage.setItem(KEY_TEMA, tema) } catch {}
  }, [tema])
  const [acento, setAcento] = useState(() => {
    try { return localStorage.getItem('maraton-marvel-acento-v1') || '616' } catch { return '616' }
  })
  useEffect(() => {
    const raiz = document.documentElement
    if ((raiz.getAttribute('data-acento') || '616') !== acento) sinTransiciones(() => {
      if (acento === '616') raiz.removeAttribute('data-acento')
      else raiz.setAttribute('data-acento', acento)
    })
    try { localStorage.setItem('maraton-marvel-acento-v1', acento) } catch {}
  }, [acento])
  const [bienvenida, setBienvenida] = useState(() => {
    try {
      if (localStorage.getItem('maraton-marvel-bienvenida-v1')) return false
      return Object.keys(JSON.parse(localStorage.getItem(KEY) || '{}')).length === 0
    } catch { return false }
  })
  const cierraBienvenida = () => {
    setBienvenida(false)
    try { localStorage.setItem('maraton-marvel-bienvenida-v1', '1') } catch {}
  }
  // también es una capa: en la primera visita, atrás la cierra en vez de salir
  useVolverCierra(bienvenida && !perfil, cierraBienvenida)

  // Cada vista recuerda dónde la dejaste: a media lista en Maratón, pasar a
  // Mío y volver te devolvía a la cabecera (706 px en vez de 2.400). Se guarda
  // al desplazar (barato: un número y, cada 200 ms, el id del elemento que hay
  // bajo la barra) y se restaura por elemento —no por píxel— porque las
  // tarjetas fuera de pantalla (content-visibility) aún no tienen su alto real.
  // sembrado con la posición guardada: el efecto de abajo la restaura al montar
  const [posiciones] = useState(() => ({ current: leePosicion(vista) }))
  const vistaRef = useRef(vista); vistaRef.current = vista
  useEffect(() => {
    let ultimo = 0, cola = 0
    const guarda = (final = false) => {
      const v = vistaRef.current, ahora = Date.now()
      const p = posiciones.current[v] || (posiciones.current[v] = {})
      p.y = window.scrollY
      // acelerado mientras se desplaza y, además, una muestra de cola al parar:
      // sin ella el último tramo (el que cuenta) se quedaba sin ancla. La de
      // cola no se rearma (se rearmaba a sí misma y giraba cada 150 ms para
      // siempre) y es la única que escribe en el almacenamiento
      clearTimeout(cola)
      if (!final) cola = setTimeout(() => { ultimo = 0; guarda(true) }, 150)
      if (final || ahora - ultimo > 200) {
        ultimo = ahora
        // solo tarjetas con id: el ancestro con id más cercano de una cabecera
        // de era es la saga entera, y eso devolvía a su principio. Se muestrea
        // justo bajo la barra pegajosa (mide 60 px en el móvil pero 150 en
        // escritorio y 110 en la app instalada: a 100 px fijos caía dentro de
        // ella y nunca había ancla) y, si ahí no hay tarjeta, más abajo.
        const barra = document.querySelector('.toolbar')
        const y0 = barra ? barra.getBoundingClientRect().bottom + 8 : 100
        let con = null
        for (const dy of [0, 120, 240]) {
          const el = document.elementFromPoint(window.innerWidth / 2, y0 + dy)
          con = el && el.closest && el.closest('.card, .galeria-item, .tl-card')
          if (con && con.id) break
          con = null
        }
        p.id = con ? con.id : null
        p.dy = con ? con.getBoundingClientRect().top : 0
        if (final) try { localStorage.setItem(KEY_POSICION, JSON.stringify({ v, id: p.id, dy: p.dy, y: p.y, t: Date.now() })) } catch {}
      }
    }
    const onScroll = () => guarda(false)
    // al pasar a segundo plano (iOS puede descargar la app ahí mismo) se guarda ya
    const onOculta = () => { if (document.visibilityState === 'hidden') guarda(true) }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onOculta)
    return () => { clearTimeout(cola); window.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onOculta) }
  }, [])
  // En móvil la barra de herramientas (búsqueda y filtros) se retira al bajar
  // por la lista y vuelve en cuanto subes, como la barra de Safari: son 55 px
  // de pantalla que mientras lees tarjetas no hacen nada. Umbrales asimétricos
  // (15 sep 2026: «la barra de abajo se esconde muy rápido»): para irse hace
  // falta bajar de seguido 96 px (media tarjeta; con 24 px se iba con
  // cualquier ajuste del dedo) y haber pasado la portada (320 px); para volver
  // basta subir 16 px, como en Safari. Nunca se esconde mientras se escribe
  // en la búsqueda, ni al llegar al final de la página.
  useEffect(() => {
    if (!esMovil) return
    const raiz = document.documentElement
    let ultimo = window.scrollY, acumulado = 0, pendiente = false
    // la barra y su `top` pegado se leen una vez (y al cambiar de tamaño),
    // no en cada evento de scroll; el trabajo va en un solo rAF por fotograma
    const tb = document.querySelector('.toolbar')
    let tope = tb ? parseFloat(getComputedStyle(tb).top) || 0 : 0
    const alRedimensionar = () => { tope = tb ? parseFloat(getComputedStyle(tb).top) || 0 : 0 }
    const calcula = () => {
      pendiente = false
      const y = window.scrollY
      const d = y - ultimo
      ultimo = y
      // pegada arriba: en el iPhone la barra se queda bajo el reloj y por
      // encima quedaba una franja (la zona segura del notch) donde se veía
      // pasar el contenido; con esta clase el CSS la tapa
      if (tb) raiz.classList.toggle('barra-pegada', y > 0 && tb.getBoundingClientRect().top <= tope + 1)
      const enBarra = document.activeElement && document.activeElement.closest && document.activeElement.closest('.toolbar')
      const alFinal = y + window.innerHeight >= document.documentElement.scrollHeight - 80
      if (y < 320 || enBarra || alFinal) { raiz.classList.remove('barra-oculta'); acumulado = 0; return }
      acumulado = Math.sign(d) === Math.sign(acumulado) ? acumulado + d : d
      if (acumulado > 96) raiz.classList.add('barra-oculta')
      else if (acumulado < -16) raiz.classList.remove('barra-oculta')
    }
    const on = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(calcula) } }
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', alRedimensionar)
    return () => {
      window.removeEventListener('scroll', on); window.removeEventListener('resize', alRedimensionar)
      raiz.classList.remove('barra-oculta', 'barra-pegada')
    }
  }, [esMovil])
  // En móvil la tira de subvistas se desliza: al cambiar de vista (atrás,
  // enlace, pestaña) la activa se trae a la vista dentro de la tira, sin
  // mover la página (scrollIntoView con block:nearest también la movería)
  useEffect(() => {
    const el = document.querySelector('.subvista[aria-current="page"]')
    const tira = el && el.parentElement
    if (!tira || tira.scrollWidth <= tira.clientWidth) return
    const r = el.getBoundingClientRect(), rt = tira.getBoundingClientRect()
    const margen = 24
    if (r.left < rt.left + margen) tira.scrollBy({ left: r.left - rt.left - margen, behavior: 'instant' })
    else if (r.right > rt.right - margen) tira.scrollBy({ left: r.right - rt.right + margen, behavior: 'instant' })
  }, [vista])
  // Al cambiar de destino (Maratón → Mío → Multiverso) sin posición guardada,
  // el contenido nuevo tiene que verse: en el móvil la portada (título,
  // estadísticas, avisos) ocupa la primera pantalla entera y, tocando el dock
  // desde arriba, solo cambiaba la píldora. Se lleva la barra al borde
  // superior, donde se queda pegada, con el contenido justo debajo.
  const destinoPrevio = useRef(destinoDe(vista))
  React.useLayoutEffect(() => {
    const p = posiciones.current[vista]
    const cambiaDestino = destinoDe(vista) !== destinoPrevio.current
    destinoPrevio.current = destinoDe(vista)
    // Sin posición guardada la vista empieza en su principio, vengas de arriba
    // o de abajo (17 sep 2026): antes solo se bajaba, y desde mitad de la lista
    // Perfil abría en y=3.838 (en Logros) y «Por estreno» en una tarjeta
    // cualquiera. El principio es la barra pegada en Maratón (el contenido
    // justo debajo) y el título grande en Perfil y Multiverso, sin barra.
    if (!p) {
      const barra = document.querySelector('.toolbar')
      const conBarra = barra && barra.getClientRects().length > 0
      // pegada, el rect de la barra da su sitio pegado, no el del flujo: se
      // mide desde lo que la sigue (que no se pega), restando su alto y el
      // hueco entre las dos (márgenes que colapsan: cuenta el mayor)
      const sig = conBarra && barra.nextElementSibling
      let y = 0
      if (sig) {
        const cb = getComputedStyle(barra), cs = getComputedStyle(sig)
        const hueco = Math.max(parseFloat(cb.marginBottom) || 0, parseFloat(cs.marginTop) || 0)
        y = Math.max(0, sig.getBoundingClientRect().top + window.scrollY - hueco - barra.offsetHeight - (Number.isFinite(parseFloat(cb.top)) ? parseFloat(cb.top) : 10))
      }
      if (window.scrollY > y + 1 || (cambiaDestino && window.scrollY < y - 1)) window.scrollTo({ top: y, behavior: 'instant' })
      return
    }
    const el = p.id && document.getElementById(p.id)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'instant' })
      window.scrollBy({ top: el.getBoundingClientRect().top - p.dy, behavior: 'instant' })
    } else window.scrollTo({ top: p.y, behavior: 'instant' })
  }, [vista])

  // episodios vistos de una serie, como NÚMERO: pasar el mapa `eps` entero a
  // cada tarjeta rompía el memo de las 134 al marcar un solo episodio
  const epHechosDe = item => (item.tipo === 'serie' && EPISODES[item.id])
    ? EPISODES[item.id].reduce((n, e) => n + (eps[`${item.id}:${e.s}:${e.n}`] ? 1 : 0), 0) : 0
  // El pajar de cada tarjeta, UNA vez por idioma/país en vez de reconstruido
  // por tarjeta en cada filtrado: los tres nombres del título («Lobezno»,
  // «Wolverine»…), reparto, dirección, año — y TODOS sus títulos de episodio,
  // así «Propósito glorioso» (o «Glorious Purpose») encuentra a Loki.
  const pajares = useMemo(() => {
    const m = {}
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
      m[it.id] = {
        base: norm([it.t, T_ES[it.id] || '', TITULOS_LATAM[it.id] || '', TITULOS_EN[it.id] || '', it.en || '', it.dir || '', ...(it.cast || []), String(it.r)].join(' ')),
        // los episodios también en sus tres idiomas, como los títulos; van
        // aparte porque en modo sin spoilers los de un título no visto no
        // cuentan (la lista los enseña como «Episodio N» y la búsqueda no
        // debe delatarlos)
        eps: norm([...(EP_ES[it.id] || []),
          ...Object.values(EPISODIOS_LATAM[it.id] || {}),
          ...Object.values(EPISODIOS_EN[it.id] || {})].join(' ')),
      }
    })))
    return m
  }, [pais, idioma])
  const qBusca = buscaLenta ? norm(buscaLenta) : ''
  const pasaFiltro = (item, esComic) => {
    if (buscaLenta) {
      const p = pajares[item.id], q = qBusca
      if (!p) return false
      const conEps = !(sinSpoilers && !vistas[item.id])
      if (!p.base.includes(q) && !(conEps && p.eps.includes(q))) return false
    }
    if (filtros.series && item.tipo === 'serie') return false
    if (filtros.opc && item.opt) return false
    if (filtros.joyas && !esComic && (item.s == null || item.s < JOYA_MIN)) return false
    if (filtros.express && !item.exp) return false
    // «esta noche sin alquilar»: 102 de los 108 del maratón están en Disney+,
    // así que el filtro es un solo interruptor y no un selector de plataforma.
    // Los cómics van por Panini y quedan fuera del criterio.
    if (filtros.disney && !esComic && !/Disney\+/.test(platDe(pais, item) || '')) return false
    return true
  }

  const stats = useMemo(() => {
    let totV = 0, totN = 0, mins = 0, siguiente = null
    const porSaga = {}
    DATA.forEach(saga => {
      const esComic = saga.saga === 'comics'
      const extra = esComic || saga.saga === 'animacion'
      let v = 0, n = 0, m = 0
      saga.eras.forEach(era => era.items.forEach(item => {
        if (!pasaFiltro(item, esComic)) return
        n++
        if (vistas[item.id]) v++
        else {
          if (item.d) m += item.d
          if (!extra && !siguiente) siguiente = item
        }
      }))
      porSaga[saga.saga] = { v, n, m: extra ? 0 : m }
      // El contador de la cabecera cuenta lo mismo que las horas que tiene al
      // lado: lo que se VE. Los cómics y la bóveda llevan su cuenta en su
      // propia pestaña; mezclarlos aquí hacía que ver las 91 películas y series
      // se quedara en un 68 % sin tener nada pendiente que ver.
      if (!extra) { totV += v; totN += n; mins += m }
    })
    // si lo siguiente es una serie empezada, el primer episodio sin ver: la
    // tarjeta «Siguiente» dice por dónde vas, no solo qué serie (15 sep 2026)
    let siguienteEp = null
    if (siguiente && siguiente.tipo === 'serie' && EPISODES[siguiente.id]) {
      const lista = EPISODES[siguiente.id]
      const visto = e => !!eps[`${siguiente.id}:${e.s}:${e.n}`]
      const e = lista.some(visto) && lista.find(x => !visto(x))
      if (e) siguienteEp = { s: e.s, n: e.n, t: e.t }
    }
    return { totV, totN, mins, siguiente, siguienteEp, porSaga }
  }, [vistas, eps, filtros, pais, idioma])
  // Una saga que ya has visto entera no aporta nada abierta: arranca plegada
  // (solo la cabecera y su barra). Se decide al cargar, no al marcar el último
  // título, para que la lista no se cierre bajo el dedo. El usuario puede
  // plegar y desplegar cualquiera, y eso sí se recuerda. Con una búsqueda en
  // marcha nada se pliega: escondería los resultados.
  const [plegadas, setPlegadas] = useState(() => leeGuardado(KEY_PLEGADAS, saneaPlegadas, {}))
  // Las eras van con la misma lógica, con clave «era:<id del primer título>».
  // `clave` fija la de las eras que ganaron un primer título después (así no se
  // pierde lo plegado a mano): «Tras Nueva York» con Artículo 47, la de Disney XD con Lobezno y los X-Men
  const claveEra = era => 'era:' + (era.clave || (era.items[0] ? era.items[0].id : era.rango))
  // Instantánea de lo COMPLETO al cargar, SIN filtros (con ?f=series una saga
  // cuyos únicos pendientes eran series contaba como completa). Se vuelve a
  // tomar cuando lo visto cambia de golpe (sincronización, cuenta de Google,
  // sala): un toque mueve el recuento en uno; más que eso es otra fuente.
  const completasAlCargar = useRef(null)
  const nVistasSnap = useRef(-1)
  const nVistas = Object.keys(vistas).length
  if (completasAlCargar.current === null || Math.abs(nVistas - nVistasSnap.current) > 1) {
    const c = new Set()
    DATA.forEach(sg => {
      const todos = sg.eras.flatMap(era => era.items)
      if (todos.length && todos.every(it => vistas[it.id])) c.add(sg.saga)
      sg.eras.forEach(era => { if (era.items.length && era.items.every(it => vistas[it.id])) c.add(claveEra(era)) })
    })
    completasAlCargar.current = c
  }
  nVistasSnap.current = nVistas
  // Con una búsqueda en marcha nada está plegado (escondería resultados):
  // los botones de plegar no se pintan y nadie guarda un estado que no se ve.
  const buscando = !!buscaLenta.trim()
  // plegado = lo elegido a mano; si no hay elección, plegado solo si estaba
  // completo al cargar Y lo sigue estando
  const estaPlegado = (clave, completoAhora) => {
    if (buscando) return false
    if (plegadas[clave] != null) return plegadas[clave] === 1
    return completasAlCargar.current.has(clave) && completoAhora
  }
  const sagaPlegada = id => { const s = stats.porSaga[id]; return !!s && estaPlegado(id, s.n > 0 && s.v === s.n) }
  const eraCompleta = (sg, era) => {
    const items = era.items.filter(it => pasaFiltro(it, sg.saga === 'comics'))
    return items.length > 0 && items.every(it => vistas[it.id])
  }
  // el último bloque que el usuario plegó o desplegó: solo ese entra con el
  // fundido (al cargar, las 26 sagas y eras aparecían todas animándose a la vez)
  const [recien, setRecien] = useState(null)
  const ponPlegado = (clave, v) => { setRecien(clave); setPlegadas(p => {
    const n = { ...p, [clave]: v ? 1 : 0 }
    try { localStorage.setItem(KEY_PLEGADAS, JSON.stringify(n)) } catch {}
    return n
  }) }
  // Plegar se anima (14 sep 2026): antes el cuerpo desaparecía de golpe. Sale
  // con un fundido corto hacia arriba (180 ms, WAAPI sobre el contenedor, que
  // gana a su animación CSS de entrada) y después se pliega; la tira de
  // carátulas entra con su fundido de siempre. Si la cabecera del bloque había
  // quedado por encima de la pantalla (plegar desde la mitad de una saga larga),
  // se trae a la vista: sin eso la página saltaba a otra saga. Un segundo toque
  // durante la salida no hace nada; con «reducir movimiento», directo.
  const plegando = useRef(new Set())
  const pliega = (clave, cuerpoId) => {
    if (plegando.current.has(clave)) return
    const cuerpo = document.getElementById(cuerpoId)
    const bloque = cuerpo && cuerpo.closest('.era, .saga')
    const trae = () => {
      if (!bloque || !bloque.isConnected) return
      const barra = document.querySelector('.toolbar')
      const tope = Math.max(0, barra ? barra.getBoundingClientRect().bottom : 0) + 12
      const top = bloque.getBoundingClientRect().top
      // fuera por arriba o por abajo: en escritorio (rejilla de dos columnas)
      // el navegador ancla el scroll en la otra columna y el bloque plegado
      // podía quedar miles de píxeles por debajo
      if (top < tope || top > window.innerHeight - 80) window.scrollTo({ top: top + window.scrollY - tope, behavior: 'instant' })
    }
    // dos fotogramas: el primero puede llegar antes de que React pinte el plegado
    const traeLuego = () => requestAnimationFrame(() => requestAnimationFrame(trae))
    if (!cuerpo || !cuerpo.animate || movimientoReducido()) { ponPlegado(clave, true); traeLuego(); return }
    plegando.current.add(clave)
    // --dur-corta y --curva: con ease-in arrancaba lento justo cuando se mira
    const a = cuerpo.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }],
      { duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' })
    let hecho = false
    const fin = () => { if (hecho) return; hecho = true; plegando.current.delete(clave); ponPlegado(clave, true); traeLuego() }
    a.onfinish = fin; a.oncancel = fin
  }
  // Despliega la saga y la era donde vive un título, solo si están plegadas
  // tal como se ven ahora (no lo que dice el almacén): devuelve si hizo algo,
  // para que quien salte a la tarjeta espere al siguiente pintado.
  const despliegaPara = itemId => {
    for (const sg of DATA) for (const era of sg.eras) if (era.items.some(it => it.id === itemId)) {
      let hecho = false
      if (sagaPlegada(sg.saga)) { ponPlegado(sg.saga, false); hecho = true }
      const k = claveEra(era)
      if (estaPlegado(k, eraCompleta(sg, era))) { ponPlegado(k, false); hecho = true }
      return hecho
    }
    return false
  }

  const estadisticas = useMemo(() => {
    const minutosVistos = item => {
      if (vistas[item.id]) return item.d || 0
      if (item.tipo === 'serie' && EPISODES[item.id] && item.d) {
        const lista = EPISODES[item.id]
        const hechos = lista.filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
        return Math.round(item.d * hechos / lista.length)
      }
      return 0
    }
    const fases = []
    let totMin = 0, vistoMin = 0, titulosVistos = 0, titulosTot = 0
    const tipos = { peli: { t: tr('Películas', 'Movies'), tot: 0, visto: 0 }, serie: { t: tr('Series', 'Series'), tot: 0, visto: 0 }, esp: { t: tr('Especiales', 'Specials'), tot: 0, visto: 0 } }
    DATA.forEach(saga => {
      if (saga.saga === 'comics' || saga.saga === 'animacion') return
      saga.eras.forEach(era => {
        const f = { era: era.era, rango: era.rango, saga: saga.saga, c: era.c, tot: 0, visto: 0, items: era.items.length, vistos: 0 }
        era.items.forEach(item => {
          const v = minutosVistos(item)
          f.tot += item.d || 0; f.visto += v
          titulosTot++
          if (vistas[item.id]) { f.vistos++; titulosVistos++ }
          const clave = item.tipo === 'serie' ? 'serie' : item.tipo === 'esp' ? 'esp' : 'peli'
          tipos[clave].tot += item.d || 0; tipos[clave].visto += v
        })
        totMin += f.tot; vistoMin += f.visto
        fases.push(f)
      })
    })
    // Los episodios se cuentan por población, como los títulos y los cómics:
    // mezclar los 941 de la bóveda con los del maratón haría que el contador
    // de al lado y este hablaran de conjuntos distintos.
    const deLaBoveda = new Set(DATA.find(sg => sg.saga === 'animacion')
      .eras.flatMap(era => era.items.map(it => it.id)))
    let epVistos = 0, epTot = 0, bovedaEpVistos = 0, bovedaEpTot = 0
    Object.entries(EPISODES).forEach(([sid, lista]) => {
      const hechos = lista.filter(e => eps[`${sid}:${e.s}:${e.n}`] || vistas[sid]).length
      if (deLaBoveda.has(sid)) { bovedaEpTot += lista.length; bovedaEpVistos += hechos }
      else { epTot += lista.length; epVistos += hechos }
    })
    const comics = DATA.find(sg => sg.saga === 'comics')
    const comicsTot = comics.eras.reduce((a, e) => a + e.items.length, 0)
    const comicsVistos = comics.eras.reduce((a, e) => a + e.items.filter(i => vistas[i.id]).length, 0)
    return { fases, totMin, vistoMin, titulosVistos, titulosTot, tipos: Object.values(tipos), epVistos, epTot, bovedaEpVistos, bovedaEpTot, comicsTot, comicsVistos }
  }, [vistas, eps, pais, idioma])

  const indice = useMemo(() => {
    const m = {}
    DATA.forEach(saga => saga.eras.forEach(era => era.items.forEach(item => {
      m[item.id] = { item, c: era.c, esComic: saga.saga === 'comics' }
    })))
    return m
  }, [])

  const cineLista = useMemo(() => {
    const pendientes = []
    DATA.forEach(sg => { if (sg.saga === 'comics' || sg.saga === 'animacion') return
      sg.eras.forEach(era => era.items.forEach(item => {
        if (!vistas[item.id]) pendientes.push({ item, c: era.c })
      })) })
    return pendientes
  }, [vistas])

  useEffect(() => {
    if (!cine) return
    const onKey = e => {
      if (e.key === 'Escape') setCine(false)
      if (e.key === 'ArrowRight') setCineIdx(i => Math.min(cineLista.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setCineIdx(i => Math.max(0, i - 1))
      if (e.key === 'Enter' && cineLista[cineIdx]) toggle(cineLista[cineIdx].item.id)
    }
    window.addEventListener('keydown', onKey)
    bloqueaFondo()
    return () => { window.removeEventListener('keydown', onKey); liberaFondo() }
  }, [cine, cineLista, cineIdx])

  const idOrden = useMemo(() => {
    const m = {}; let i = 0
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => { m[it.id] = i++ })))
    return m
  }, [])

  const proxEstreno = useMemo(
    () => ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now()),
    [])

  const objetivo = useMemo(() => {
    const meta = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
    if (!meta) return null
    const dias = Math.max(1, Math.ceil((new Date(meta.fecha + 'T00:00:00') - Date.now()) / 86400000))
    let restante = 0
    DATA.forEach(sg => { if (sg.saga === 'comics' || sg.saga === 'animacion') return
      sg.eras.forEach(era => era.items.forEach(it => {
        if (it.exp && !vistas[it.id] && it.d) restante += it.d
      })) })
    const hace14 = Date.now() - 14 * 86400000
    let visto14 = 0
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
      const t = vistas[it.id]
      if (typeof t === 'number' && t > hace14 && it.d) visto14 += it.d
    })))
    Object.entries(eps).forEach(([clave, t]) => {
      if (typeof t === 'number' && t > hace14) {
        const sid = clave.split(':')[0]
        const info = indice[sid]
        if (info && info.item.d && EPISODES[sid]) visto14 += info.item.d / EPISODES[sid].length
      }
    })
    const necesario = Math.ceil(restante / dias)
    const ritmo = Math.round(visto14 / 14)
    return { dias, restante, necesario, ritmo, alDia: restante === 0 || ritmo >= necesario }
  }, [vistas, eps, indice])

  // El service worker no ve localStorage: el horario se espeja en Cache
  // Storage (con el idioma, para el texto del aviso) y el periodicsync de
  // los estrenos avisa también el día que hay sesión.
  useEffect(() => {
    if (!('caches' in window)) return
    caches.open('maraton-marvel-horario').then(c => (horario
      ? c.put('config', new Response(JSON.stringify({ ...horario, idioma })))
      : c.delete('config'))).catch(() => {})
  }, [horario, idioma])

  // La simulación del horario con el progreso real: da la sesión de HOY para
  // el chip y la fecha de fin para la proyección del panel. Vive aquí abajo y
  // no junto a su estado porque usa `vistas` y `eps`, que en el orden de App
  // se declaran después (zona muerta temporal).
  // diaHoy solo cambia al cruzar la medianoche: sin él, una app abierta de
  // madrugada seguía enseñando como «hoy» la sesión de ayer
  const [diaHoy, setDiaHoy] = useState(() => new Date().getDate())
  useEffect(() => {
    const id = setInterval(() => setDiaHoy(d => { const n = new Date().getDate(); return n === d ? d : n }), 60000)
    return () => clearInterval(id)
  }, [])
  const simHorario = useMemo(() => (horario ? simulaHorario(horario, vistas, eps, 1) : null), [horario, vistas, eps, diaHoy])
  const sesionHoy = useMemo(() => {
    if (!simHorario) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    if (!horario.dias.includes(hoy.getDay())) return null
    const s = simHorario.sesiones[0]
    return s && s.trozos.length && s.fecha.getTime() === hoy.getTime() ? s : null
  }, [simHorario, horario])

  // Globo en el icono de la app instalada: hay sesión de horario hoy, o
  // estreno hoy. iOS (16.4+) solo lo pinta si diste permiso de avisos (el
  // mismo botón «Avisarme…»); en Android y escritorio no hace falta. Se
  // recalcula al volver a primer plano (la app instalada vive días abierta)
  // y se quita cuando no toca nada, para que el icono no mienta.
  useEffect(() => {
    if (!navigator.setAppBadge) return undefined
    const pon = () => {
      const d = new Date()
      const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const estrenos = ESTRENOS.filter(e => e.fecha === hoy).length
      const n = (sesionHoy ? 1 : 0) + estrenos
      try { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}) } catch {}
    }
    pon()
    const onVisible = () => { if (document.visibilityState === 'visible') pon() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sesionHoy])

  const [planMontado, planSale] = useSaliente(planModal)
  const plan = useMemo(() => {
    if (!planMontado) return null
    let restante = planHoras * 60
    const items = []
    let corta = false
    for (const sg of DATA) {
      if (sg.saga === 'comics' || sg.saga === 'animacion' || corta) continue
      for (const era of sg.eras) {
        if (corta) break
        for (const it of era.items) {
          if (vistas[it.id] || !it.d) continue
          if (planExpress && !it.exp) continue
          if (it.tipo === 'serie' && EPISODES[it.id]) {
            const lista = EPISODES[it.id]
            const pendientes = lista.filter(e => !eps[`${it.id}:${e.s}:${e.n}`])
            if (!pendientes.length) continue
            const porEp = it.d / lista.length
            const n = Math.min(pendientes.length, Math.floor(restante / porEp))
            if (n < 1) continue
            items.push({ item: it, c: era.c, nEps: n, min: Math.round(n * porEp), desde: pendientes[0] })
            restante -= n * porEp
          } else {
            if (it.d > restante) continue
            items.push({ item: it, c: era.c, min: it.d })
            restante -= it.d
          }
          if (restante < 20 || items.length >= 8) { corta = true; break }
        }
      }
    }
    return { items, total: Math.round(planHoras * 60 - restante) }
  }, [planMontado, planHoras, planExpress, vistas, eps])

  const porAnio = useMemo(() => {
    const items = []
    DATA.forEach(saga => {
      if (saga.saga === 'comics' || saga.saga === 'animacion') return
      saga.eras.forEach(era => era.items.forEach(item => {
        if (pasaFiltro(item, false)) items.push({ ...item, uni: item.uni || saga.uni, c: era.c })
      }))
    })
    items.sort((a, b) => a.r - b.r || a.t.localeCompare(b.t))
    const grupos = new Map()
    items.forEach(it => {
      if (!grupos.has(it.r)) grupos.set(it.r, [])
      grupos.get(it.r).push(it)
    })
    return [...grupos.entries()]
  }, [filtros, pais, idioma])

  const oculto = (item, esComic) => filtros.vistas && vistas[item.id] && pasaFiltro(item, esComic)

  // Cuántos títulos deja ver lo que hay puesto. Ojo: "Solo pendientes" no
  // vive en pasaFiltro, se aplica aparte, así que hay que mirar los dos.
  const resumenFiltros = useMemo(() => {
    const activos = Object.values(filtros).filter(Boolean).length + (buscaLenta.trim() ? 1 : 0)
    if (!activos) return null
    let tot = 0, vis = 0
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
      const esComic = sg.saga === 'comics' || sg.saga === 'animacion'
      tot++
      if (pasaFiltro(it, esComic) && !(filtros.vistas && vistas[it.id])) vis++
    })))
    return { activos, tot, vis }
  }, [filtros, buscaLenta, vistas, pais, idioma])
  const limpiaFiltros = () => {
    setFiltros(sinFiltros())
    setBusca('')
  }

  let delayIdx = 0
  // solo las 12 primeras tarjetas entran escalonadas (lo que se ve); el
  // resto aparece sin animar: eran cien animaciones vivas por cambio de vista
  const nextDelay = () => {
    // ni mientras se busca: cada tecla montaba tarjetas nuevas escalonadas
    if (enTransicion || buscaLenta || delayIdx >= 12) { delayIdx++; return null }
    return (delayIdx++) * 30
  }
  const pct = stats.totN ? Math.round(100 * stats.totV / stats.totN) : 0

  // ¿queda algo tras filtrar y buscar? (134 títulos: barato de calcular en cada render)
  const hayResultados = DATA.some(sg => {
    const fuera = vista === 'comics' ? sg.saga !== 'comics'
      : vista === 'animacion' ? sg.saga !== 'animacion'
      : (sg.saga === 'comics' || sg.saga === 'animacion')
    if (fuera) return false
    return sg.eras.some(era => era.items.some(it => pasaFiltro(it, sg.saga === 'comics')))
  })
  const filtrosActivos = Object.values(filtros).filter(Boolean).length
  const limpiaTodo = () => {
    setBusca('')
    setFiltros(sinFiltros())
  }

  // el título de la pestaña sigue a lo que estás mirando: historial y
  // enlaces compartidos dejan de llamarse todos igual
  useEffect(() => {
    const base = tr('Maratón Marvel & X-Men', 'Marvel & X-Men Marathon')
    if (detalle) { document.title = `${detalle.item.t} · ${base}`; return }
    const p = PESTANAS.find(x => x.id === vista)
    document.title = (!p || vista === 'crono') ? base : `${tr(p.label, p.en || p.label)} · ${base}`
  }, [vista, detalle, idioma])

  // Cada capa sigue montada 240 ms tras cerrarse para salir animada
  const [lectorMontado, lectorSale] = useSaliente(lector)
  const ultimoLector = useRef(null); if (lector) ultimoLector.current = lector
  const [cineMontado, cineSale] = useSaliente(cine)
  const [dueloMontado, dueloSale] = useSaliente(dueloModal)
  const [bienvenidaMontada, bienvenidaSale] = useSaliente(bienvenida && !perfil)
  const [clubMontado, clubSale] = useSaliente(clubModal)
  const [invitarMontado, invitarSale] = useSaliente(clubInvitar && club)
  const [perfilMMontado, perfilMSale] = useSaliente(perfilModal)
  const [creaPerfilMontado, creaPerfilSale] = useSaliente(creaPerfil && !!cuenta && perfilCuenta === false)
  const [perfilPubMontado, perfilPubSale] = useSaliente(!!perfilPublico)
  const [comunidadMontada, comunidadSale] = useSaliente(!!comunidadAbierta)
  const [foroMontado, foroSale] = useSaliente(!!foroAbierto)
  const foroUltimo = useRef(foroAbierto)
  if (foroAbierto) foroUltimo.current = foroAbierto
  useVolverCierra(foroAbierto && `${foroAbierto.tipo}:${foroAbierto.id}`, () => setForoAbierto(null))
  const [hiloMontado, hiloSale] = useSaliente(!!hiloAbierto)
  const hiloUltimo = useRef(hiloAbierto)
  if (hiloAbierto) hiloUltimo.current = hiloAbierto
  useVolverCierra(hiloAbierto, () => setHiloAbierto(null))
  const comunidadUltima = useRef(comunidadAbierta)
  if (comunidadAbierta) comunidadUltima.current = comunidadAbierta
  useVolverCierra(comunidadAbierta, () => setComunidadAbierta(null))
  const [creaComunidadMontada, creaComunidadSale] = useSaliente(creaComunidad && !!cuentaLista)
  useVolverCierra(creaComunidad && !!cuentaLista, () => setCreaComunidad(false))
  const perfilPubUltimo = useRef(perfilPublico)
  if (perfilPublico) perfilPubUltimo.current = perfilPublico
  useVolverCierra(perfilPublico, () => setPerfilPublico(null))
  useVolverCierra(creaPerfil && !!cuenta && perfilCuenta === false, () => setCreaPerfil(false))
  const [ajustesMontado, ajustesSale] = useSaliente(ajustes)
  const [horarioMontado, horarioSale] = useSaliente(horarioModal)
  const [syncMontado, syncSale] = useSaliente(syncModal)
  const [detalleMontado, detalleSale] = useSaliente(detalle)
  const ultimoDetalle = useRef(null); if (detalle) ultimoDetalle.current = detalle
  // la opción activa se señala con una pieza que viaja (movimiento.js); antes
  // del return temprano del perfil por las reglas de los hooks
  const [navGrupo, navIndicador] = useIndicador(`${destinoDe(vista)}|${esMovil}`)
  const [subGrupo, subIndicador] = useIndicador(vista)
  const [mvGrupo, mvIndicador] = useIndicador(`${vista}|${mvModo}`)
  // Logro nuevo (15 sep 2026): la pestaña Perfil lleva un punto cuando se ha
  // desbloqueado algo que aún no has visto, y tocarla lleva a Estadísticas.
  // Los vistos se guardan al SALIR de Estadísticas (o al cerrar la app en
  // ella), para que dentro se puedan señalar con «Nuevo». La primera vez se
  // dan por vistos los que ya había: nadie estrena la función con 12 avisos.
  const ctxLogros = useMemo(() => ({
    vistas,
    eps,
    notas,
    horasVistas: estadisticas.vistoMin / 60,
    titulosVistos: estadisticas.titulosVistos,
    titulosTot: estadisticas.titulosTot,
    xmenCompleto: DATA[0].eras.every(era => era.items.every(it => vistas[it.id])),
    expressCompleta: DATA.slice(0, 2).every(sg => sg.eras.every(era => era.items.filter(it => it.exp).every(it => vistas[it.id]))),
    todoCompleto: DATA.every(sg => sg.eras.every(era => era.items.every(it => vistas[it.id]))),
  }), [vistas, eps, notas, estadisticas])
  const logrosOk = useMemo(() => LOGROS.filter(l => l.f(ctxLogros)).map(l => l.id), [ctxLogros])
  // Aviso en el momento de desbloquear: solo lo que cambia con la app ya en
  // marcha (no al arrancar, ni lo que trae la sincronización), y no si llegan
  // más de 3 de golpe: eso es restaurar una copia, no un logro ganado.
  const [logroAviso, setLogroAviso] = useState(null)
  const logrosAntes = useRef(null), arranque = useRef(Date.now())
  useEffect(() => {
    const antes = logrosAntes.current
    logrosAntes.current = logrosOk
    if (!antes || Date.now() - remotoEn.current < 2000 || Date.now() - arranque.current < 2000) return
    const nuevos = logrosOk.filter(id => !antes.includes(id))
    if (nuevos.length && nuevos.length <= 3) setLogroAviso({ id: Date.now(), ids: nuevos })
  }, [logrosOk])
  const [logrosVistos, setLogrosVistos] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem(KEY_LOGROS_VISTOS)); return Array.isArray(g) ? g : null } catch { return null }
  })
  const ultimosOk = useRef(logrosOk); ultimosOk.current = logrosOk
  const marcaLogrosVistos = () => setLogrosVistos(v => {
    const union = [...new Set([...(v || []), ...ultimosOk.current])]
    try { localStorage.setItem(KEY_LOGROS_VISTOS, JSON.stringify(union)) } catch {}
    return union
  })
  useEffect(() => { if (logrosVistos === null) marcaLogrosVistos() }, [logrosVistos])
  const enStats = vista === 'stats'
  useEffect(() => {
    if (!enStats) return undefined
    const alOcultar = () => { if (document.visibilityState === 'hidden') marcaLogrosVistos() }
    window.addEventListener('pagehide', marcaLogrosVistos)
    document.addEventListener('visibilitychange', alOcultar)
    return () => {
      window.removeEventListener('pagehide', marcaLogrosVistos)
      document.removeEventListener('visibilitychange', alOcultar)
      marcaLogrosVistos()
    }
  }, [enStats])
  const nuevosLogros = logrosVistos ? logrosOk.filter(id => !logrosVistos.includes(id)) : []
  // Subvistas en el móvil: el carril mide 513 px en 390 y «Línea temporal»
  // quedaba fuera sin ninguna pista. El borde se funde solo por el lado donde
  // queda más, y la activa se centra al llegar (antes podía estar fuera).
  useEffect(() => {
    const g = subGrupo.current
    if (!g) return undefined
    const act = g.querySelector('[aria-current="page"]')
    if (act && g.scrollWidth > g.clientWidth + 1) g.scrollLeft = Math.max(0, act.offsetLeft - (g.clientWidth - act.offsetWidth) / 2)
    const marca = () => {
      const max = g.scrollWidth - g.clientWidth
      g.classList.toggle('mas-izq', g.scrollLeft > 2)
      g.classList.toggle('mas-der', max > 2 && g.scrollLeft < max - 2)
    }
    marca()
    g.addEventListener('scroll', marca, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(marca) : null
    if (ro) ro.observe(g)
    return () => { g.removeEventListener('scroll', marca); if (ro) ro.disconnect() }
  }, [vista, idioma])
  if (perfil) return <PerfilView {...perfil} />

  // ir a un destino como lo hace su pestaña (la marca de la barra de
  // escritorio lleva a Maratón igual)
  const irADestino = (d, destino, e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    // la pestaña en la que ya estás sube al principio, como en iOS; dentro de
    // una carpeta (una Tierra, una lista) vuelve primero a la raíz
    if (destino === vista) {
      if (vista === 'multiverso' && tierra) cierraTierra()
      else if (vista === 'listas' && listaActiva) cierraLista()
      else subeArriba()
      return
    }
    conTransicion(DESTINOS.findIndex(x => x.id === d.id) > DESTINOS.findIndex(x => x.id === destinoDe(vista)) ? 'adelante' : 'atras', () => setVista(destino))
  }
  const navTabs = (
    <nav className="tabs" ref={navGrupo} aria-label={tr('Secciones', 'Sections')}>
      <span className="indicador" ref={navIndicador} aria-hidden="true" />
      {DESTINOS.map((d, i) => {
        // un logro sin ver: punto en Perfil (salvo si ya estás en Estadísticas)
        const insignia = d.id === 'mio' && !enStats && nuevosLogros.length > 0
        // volver a un destino te devuelve donde lo dejaste; con logro nuevo, a
        // Estadísticas, que es donde está
        const destino = insignia ? 'stats' : (ultimaVista[d.id] || d.vistas[0])
        return (
          <a className="tab" key={d.id} href={'#' + destino}
            aria-current={destinoDe(vista) === d.id ? 'page' : undefined}
            aria-keyshortcuts={String(i + 1)}
            title={esMovil ? undefined : tr(`${d.label} (tecla ${i + 1})`, `${d.en || d.label} (key ${i + 1})`)}
            onClick={e => irADestino(d, destino, e)}>
            {ICONOS_DESTINO[d.id]}
            <span className="tab-rotulo">{tr(d.label, d.en || d.label)}</span>
            {insignia && <>
              <span className="tab-insignia" aria-hidden="true" />
              <span className="solo-lector">{nuevosLogros.length === 1 ? tr(', 1 logro nuevo', ', 1 new achievement') : tr(`, ${nuevosLogros.length} logros nuevos`, `, ${nuevosLogros.length} new achievements`)}</span>
            </>}
          </a>
        )
      })}
    </nav>
  )
  // la cabecera del maratón (titular, siguiente, progreso, panel) y sus
  // herramientas solo en Maratón; Perfil y Multiverso llevan la suya
  const enMaraton = destinoDe(vista) === 'maraton'
  const botonAjustes = <button className="chip-btn chip-ajustes" aria-pressed={ajustes} onClick={() => setAjustes(true)}>{tr('Ajustes', 'Settings')}</button>
  // El estado de sincronización es estado, no un botón: solo se muestra
  // cuando hay algo que mirar.
  const botonSync = syncEstado === 'error' && (
    <button className="chip-btn sync-btn error" aria-live="polite" onClick={() => setSyncModal(true)}>
      {tr('Sin conexión', 'Offline')}
    </button>
  )
  return (
    <div className="wrap">
      <a className="saltar" href="#contenido">{tr('Saltar al contenido', 'Skip to content')}</a>
      {/* Escritorio (16 sep 2026): las secciones viven en una barra propia,
          fija arriba y separada de los filtros, como en una app. Antes
          compartían bloque con filtros y herramientas, y fuera del maratón
          ese bloque era solo pestañas + Ajustes. En el móvil siguen en la
          barra de abajo. */}
      {!esMovil && (
        <header className={'barra-app' + (enMaraton ? ' en-maraton' : '')}>
          <a className="barra-app-marca" href={'#' + (ultimaVista.maraton || 'crono')}
            onClick={e => irADestino(DESTINOS[0], ultimaVista.maraton || 'crono', e)}>
            {tr(<>Maratón <span className="rojo">Marvel</span> &amp; <span className="sinparto">X-Men</span></>, <><span className="rojo">Marvel</span> &amp; <span className="sinparto">X-Men</span> Marathon</>)}
          </a>
          {navTabs}
          <div className="barra-app-fin">{botonSync}{botonAjustes}</div>
        </header>
      )}
      {fondo === 'banner' && proxEstreno?.img && (
        <div className="fondo-hero fh-banner" aria-hidden="true">
          {/* el elemento más grande de la primera pantalla: en WebP pesa la
              cuarta parte (móvil 70 → 16 kB). Solo si el .webp existía al
              compilar; si no, el JPEG de siempre. Probado y descartado:
              precargarlo desde el <head> (competía con el HTML con red lenta) */}
          <picture>
            {FONDOS_WEBP.includes(proxEstreno.img.replace(/^.*\//, '').replace(/\.jpg$/, '.webp'))
              && FONDOS_WEBP.includes(proxEstreno.img.replace(/^.*\//, '').replace(/\.jpg$/, '-780.webp')) && (
              <source type="image/webp" sizes="100vw"
                srcSet={`${proxEstreno.img.replace(/\.jpg$/, '-780.webp')} 780w, ${proxEstreno.img.replace(/\.jpg$/, '.webp')} 1280w`} />
            )}
            <img src={proxEstreno.img} alt="" decoding="async"
              srcSet={`${proxEstreno.img.replace(/\.jpg$/, '-780.jpg')} 780w, ${proxEstreno.img} 1280w`}
              sizes="100vw" />
          </picture>
          <span className="fh-velo" />
        </div>
      )}
      {fondo === 'muro' && (
        <div className="fondo-hero fh-muro" aria-hidden="true">
          <div className="fh-tira">
            {MURO.map(id => <img key={id} src={`mini/${id}.webp`} alt="" loading="lazy" decoding="async" />)}
          </div>
          <span className="fh-velo" />
        </div>
      )}
      {enMaraton ? (
      <section className="hero">
        <div className="hero-titulo">
          <p className="hero-eyebrow">{tr('Guía de maratón · cronología completa', 'Marathon guide · the full chronology')}</p>
          <h1>{tr(<>Maratón <span className="rojo">Marvel</span> &amp; X-Men</>, <><span className="rojo">Marvel</span> &amp; <span className="sinparto">X-Men</span> Marathon</>)}</h1>
        </div>
        <div className="stats stats-inicio">
          <div className="stat">
            <span className="stat-label">{tr('Completados', 'Completed')}</span>
            <span className="stat-num"><Cifra n={stats.totV} /><small> / {stats.totN}</small></span>
            <div className="barra"><i style={{ width: `${pct}%` }} /></div>
            <span className="stat-foot">{pct}{tr('% del maratón', '% of the marathon')}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{tr('Te quedan', 'Left to watch')}</span>
            <span className="stat-num">{Math.round(stats.mins / 60)}<small> h</small></span>
            <span className="stat-foot">{tr('de películas y series', 'of movies and series')}</span>
          </div>
          {stats.siguiente && (
            <>
            <button className="stat siguiente-stat" title={tr('Ir a la tarjeta', 'Go to the card')} onClick={() => {
              // en móvil la tarjeta se lee como una fila con flecha: abre la
              // ficha (ver, marcar), que es lo que promete; en escritorio
              // sigue llevando a la tarjeta dentro de la lista
              if (window.matchMedia('(max-width:640px)').matches) {
                const d = buscaItem(stats.siguiente.id)
                if (d) { setDetalle(d); return }
              }
              if (vista !== 'crono') setVista('crono')
              const desplegado = despliegaPara(stats.siguiente.id)
              setTimeout(() => {
                const el = document.getElementById('card-' + stats.siguiente.id)
                if (el) {
                  el.scrollIntoView({ behavior: movimientoReducido() ? 'instant' : 'smooth', block: 'center' })
                  // el foco va con la vista: con teclado, la tarjeta es donde sigue
                  el.querySelector('.abrir')?.focus({ preventScroll: true })
                  el.classList.add('destello')
                  setTimeout(() => el.classList.remove('destello'), 1600)
                }
              }, vista !== 'crono' || desplegado ? 120 : 0)
            }}>
              {/* carátula: «Siguiente» es la acción de la primera pantalla y
                  debe leerse como una tarjeta (en escritorio desde el 21 sep) */}
              {POSTERS[stats.siguiente.id] && <img className="stat-sig-img" src={POSTERS[stats.siguiente.id]} alt="" loading="lazy" decoding="async" />}
              <span className="stat-sig-texto">
              <span className="stat-label">{tr('Siguiente', 'Up next')}</span>
              <span className="stat-sig">{stats.siguiente.t}</span>
              {stats.siguienteEp
                ? <span className="stat-foot stat-sig-ep" title={sinSpoilers ? undefined : stats.siguienteEp.t}>
                    {tr('Sigue con', 'Continue with')} T{stats.siguienteEp.s} · E{stats.siguienteEp.n}{sinSpoilers ? '' : `: ${stats.siguienteEp.t}`}
                  </span>
                : <span className="stat-foot">{stats.siguiente.h} · {fmtDur(stats.siguiente.d)}</span>}
              </span>
              {/* solo en móvil (CSS): la flecha dice que la tarjeta se pulsa, como una fila de iOS */}
              <svg className="stat-sig-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
            {/* marcar sin abrir la ficha: va FUERA del botón
                de la tarjeta —un botón no puede llevar otro dentro— y el CSS lo
                pone encima, a la derecha (en escritorio, abajo en la misma celda) */}
            {(() => {
              const s = stats.siguiente
              const lista = s.tipo === 'serie' ? EPISODES[s.id] : null
              const e = lista && lista.find(x => !eps[`${s.id}:${x.s}:${x.n}`])
              return (
                <button type="button" className="siguiente-marcar" onClick={() => marcaSiguiente(s)}
                  aria-label={e ? tr(`Marcar visto T${e.s}·E${e.n} de ${s.t}`, `Mark S${e.s}·E${e.n} of ${s.t} watched`) : tr(`Marcar vista: ${s.t}`, `Mark watched: ${s.t}`)}>
                  <CheckIcon />
                  {/* verbo, no estado: en la ficha «✓ Vista» significa «ya vista» */}
                  <span>{e ? `T${e.s}·E${e.n}` : tr('Marcar', 'Mark')}</span>
                </button>
              )
            })()}
            </>
          )}
        </div>
        {/* En móvil las dos cajas de cifras se resumen en esta línea (CSS las
            esconde y enseña esto): la primera pantalla es para el siguiente
            título y la lista, no para el cuadro de mandos. */}
        <p className="progreso-movil">
          <span className="barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <span className="pm-texto">
            <b>{stats.totV}</b> / {stats.totN} {tr('completados', 'completed')} · {pct} % · {tr('te quedan', 'left:')} <b>{Math.round(stats.mins / 60)} h</b>
          </span>
        </p>
        {/* en el móvil los filtros viven en un carril que se desliza: con uno
            puesto (la bienvenida pone la Ruta express) faltaban títulos y
            cambiaba «Siguiente» sin nada a la vista que lo explicara */}
        {filtrosActivos > 0 && (
          <p className="filtros-movil" role="status">
            <span>{filtros.express && filtrosActivos === 1
              ? tr('Ruta express activa', 'Express route on')
              : tr(`${filtrosActivos} filtro${filtrosActivos === 1 ? '' : 's'} activo${filtrosActivos === 1 ? '' : 's'}`, `${filtrosActivos} filter${filtrosActivos === 1 ? '' : 's'} on`)}</span>
            <button className="filtros-quitar" onClick={() => setFiltros(sinFiltros())}>{tr('Quitar', 'Clear')}</button>
          </p>
        )}
        <CalendarioInicio vistas={vistas} eps={eps} notas={notas} indice={indice} idioma={idioma} onAbrir={d => setDetalle(d)} />
      </section>
      ) : (
        <CabeceraDestino esMovil={esMovil} onAjustes={() => setAjustes(true)}
          titulo={destinoDe(vista) === 'mio' ? tr('Perfil', 'Profile') : tr('Multiverso', 'Multiverse')}
          sub={destinoDe(vista) === 'mio' ? tr(`${stats.totV} de ${stats.totN} títulos del maratón · ${pct} %`, `${stats.totV} of ${stats.totN} marathon titles · ${pct}%`) : null} />
      )}

      <AvisoNuevo onProbar={stats.siguiente ? () => { const d = buscaItem(stats.siguiente.id); if (d) setDetalle(d) } : null} />
      <Novedades eps={eps} />
      {enMaraton && (<>
      {!panelAbierto && (
        <button className="panel-resumen" aria-expanded="false" onClick={alternaPanel}>
          <span className="pr-datos">
            {proxEstreno && objetivo
              ? <>
                  <b>{proxEstreno.t.replace(/^(Vengadores|Avengers): /, '')}</b>{tr(' en ', ' in ')}<b className="pr-dias">{objetivo.dias} {tr('días', 'days')}</b>
                  {objetivo.restante > 0 && <span className="pr-extra"> · {tr('ruta express: ', 'express route: ')}{objetivo.necesario} {tr('min/día', 'min/day')}</span>}
                </>
              : <>{tr('Mapa de progreso, próximos estrenos y cuenta atrás', 'Progress map, upcoming premieres and countdown')}</>}
            {/* el horario vive dentro del panel, que en móvil arranca plegado:
                si hoy toca sesión, se dice aquí, que es lo que se ve */}
            {sesionHoy && horario && (
              <span className="pr-sesion"><span className="pr-sep">{' · '}</span>{tr(`hoy sesión a las ${horario.hora}`, `session today at ${horario.hora}`)}</span>
            )}
          </span>
          <span className="pr-abrir">{tr('Panel completo', 'Full panel')}</span>
        </button>
      )}
      <div className="panel-superior" hidden={!panelAbierto}>
        <div className="panel-izq">
        <div className="mapa" aria-label={tr('Mapa de progreso', 'Progress map')}>
          {DATA.map(saga => {
            const items = saga.eras.flatMap(era => era.items.map(item => ({ item, c: era.c })))
            const v = items.filter(({ item }) => vistas[item.id]).length
            return (
              <div className="mapa-fila" key={saga.saga}>
                <span className="mapa-label">
                  {saga.saga === 'xmen' ? 'X-Men' : saga.saga === 'ucm' ? tr('UCM', 'MCU') : saga.saga === 'animacion' ? 'Anim.' : tr('Cómics', 'Comics')}
                </span>
                <div className="mapa-dots">
                  {items.map(({ item, c }) => (
                    <button key={item.id} className={`dot${vistas[item.id] ? ' on' : ''}`}
                      style={{ '--dc': c[0] }} title={item.t}
                      onClick={() => setDetalle({ item, c, esComic: saga.saga === 'comics' })} />
                  ))}
                </div>
                <span className="mapa-count">{v}/{items.length}</span>
              </div>
            )
          })}
        </div>
        <Proximos />
        </div>
        <CuentaAtras meta={objetivo} horario={horario} sesionHoy={sesionHoy} sim={simHorario} onHorario={() => setHorarioModal(true)} />
      </div>
      {panelAbierto && (
        <button className="panel-plegar" aria-expanded="true" onClick={alternaPanel}>{tr('Ocultar panel', 'Hide panel')}</button>
      )}
      </>)}

      <header className={'toolbar' + (enMaraton ? '' : ' fuera-maraton')}>
        {/* pegada arriba en móvil, cubre la zona segura del notch con el mismo cristal (CSS) */}
        <span className="toolbar-tope" aria-hidden="true" />
        <div className="controles" role="group" aria-label={tr('Vista y filtros', 'View and filters')}>
          {esMovil && createPortal(navTabs, document.body)}
          {/* los filtros solo actúan sobre las listas del maratón (crono,
              estreno, cómics, animación, galería, cine): en Mío y Multiverso
              no cambian nada y solo estorbaban en el carril */}
          {destinoDe(vista) === 'maraton' && (
            <>
          <span className="ctrl-sep" aria-hidden="true" />
          <div className="ctrl-grupo">
          <button className="chip-btn destacado" aria-pressed={filtros.express} onClick={() => setF('express')}>{tr('Ruta express', 'Express route')}</button>
          <button className="chip-btn" aria-pressed={filtros.series} onClick={() => setF('series')}>{tr('Sin series', 'No series')}</button>
          <button className="chip-btn" aria-pressed={filtros.opc} onClick={() => setF('opc')}>{tr('Sin opcionales', 'No optionals')}</button>
          <button className="chip-btn" aria-pressed={filtros.vistas} onClick={() => setF('vistas')}>{tr('Solo pendientes', 'Pending only')}</button>
          <button className="chip-btn" aria-pressed={filtros.joyas} onClick={() => setF('joyas')}>{tr('Joyas ★7,5+', 'Gems ★7.5+')}</button>
          <button className="chip-btn" aria-pressed={filtros.disney} onClick={() => setF('disney')}>{tr('En Disney+', 'On Disney+')}</button>
          </div>
            </>
          )}
          <span className="ctrl-sep" aria-hidden="true" />
          <div className="ctrl-grupo">
          {enMaraton && (<>
          <button className="chip-btn destacado" aria-pressed={planModal} onClick={() => setPlanModal(true)}>{tr('Plan de sesión', 'Session plan')}</button>
          <button className="chip-btn" aria-pressed={horarioModal} onClick={() => setHorarioModal(true)}>{tr('Horario', 'Schedule')}</button>
          <button className="chip-btn" onClick={() => { setCineIdx(0); setCine(true) }}>{tr('Modo cine', 'Cinema mode')}</button>
          <button className="chip-btn" onClick={() => {
            const pendientes = []
            DATA.forEach(saga => { if (saga.saga === 'comics' || saga.saga === 'animacion') return
              saga.eras.forEach(era => era.items.forEach(item => {
                if (pasaFiltro(item, false) && !vistas[item.id]) pendientes.push({ item, c: era.c })
              })) })
            if (pendientes.length) {
              const e = pendientes[Math.floor(Math.random() * pendientes.length)]
              setDetalle({ item: e.item, c: e.c, esComic: false })
            }
          }}>{tr('Sorpréndeme', 'Surprise me')}</button>
          <input className="busca" type="search" name="busqueda" placeholder={ES_TACTIL ? tr('Título, episodio o actor', 'Title, episode or actor') : tr('Buscar… ( / )', 'Search… ( / )')} title={tr('Busca por título, episodio, actor, director o año — atajos: / buscar · j/k pasar de título · v marcar vista', 'Search by title, episode, actor, director or year — shortcuts: / search · j/k move between titles · v mark watched')} value={busca} spellCheck={false}
            autoComplete="off" onChange={e => setBusca(e.target.value)} aria-label={tr('Buscar título', 'Search titles')}
            // en el móvil la tecla dice «Buscar» y al pulsarla se esconde el
            // teclado, que tapaba media pantalla de resultados
            enterKeyHint="search" onKeyDown={e => { if (e.key === 'Enter' && ES_TACTIL) e.currentTarget.blur() }} />
          </>)}
          {esMovil && botonAjustes}
          {esMovil && botonSync}
          </div>
          {vista === 'crono' && (
            <nav className="atajos">
              <a href="#saga-xmen">X-Men</a>
              <a href="#saga-ucm">UCM</a>
            </nav>
          )}
        </div>
      </header>

      {(() => {
        const d = DESTINOS.find(x => x.id === destinoDe(vista))
        if (!d || d.vistas.length < 2) return null
        return (
          <nav className="subvistas" ref={subGrupo} aria-label={tr(`Cómo ver ${d.label}`, `How to view ${d.en || d.label}`)}>
            <span className="indicador" ref={subIndicador} aria-hidden="true" />
            {d.vistas.map(v => {
              const p = PESTANAS.find(x => x.id === v)
              return (
                <a className="subvista" key={v} href={'#' + v}
                  aria-current={vista === v ? 'page' : undefined}
                  onClick={e => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                    e.preventDefault()
                    if (v === vista) { if (v === 'listas' && listaActiva) cierraLista(); else subeArriba(); return }
                    conTransicion(d.vistas.indexOf(v) > d.vistas.indexOf(vista) ? 'adelante' : 'atras', () => setVista(v))
                  }}>{p ? tr(p.label, p.en || p.label) : v}</a>
              )
            })}
          </nav>
        )
      })()}

      <span id="contenido" tabIndex={-1} />

      {resumenFiltros && (
        <p className="filtros-resumen" role="status">
          {tr('Ves ', 'Showing ')}<b>{resumenFiltros.vis}</b>{tr(' de ', ' of ')}{resumenFiltros.tot}
          {' · '}{resumenFiltros.activos === 1 ? tr('1 filtro activo', '1 active filter') : tr(`${resumenFiltros.activos} filtros activos`, `${resumenFiltros.activos} active filters`)}
          <button className="filtros-quitar" onClick={limpiaFiltros}>{tr('Quitar', 'Clear')}</button>
        </p>
      )}

      <Estrellas />
      {vista === 'tiempo' ? (
        <main className="tiempo">
          <p className="saga-desc mv-intro">
            {tr(<>Cada título colocado en el año en que <b>ocurre su historia</b>, no en el que se estrenó:
            X-Men a la izquierda en dorado, UCM a la derecha en rojo. Pulsa cualquier tarjeta para abrir su ficha.</>,
            <>Every title placed in the year <b>its story happens</b>, not when it was released:
            X-Men on the left in gold, MCU on the right in red. Tap any card to open it.</>)}
          </p>
          {(() => {
            const años = new Map()
            const fuera = []
            DATA.forEach(sg => { if (sg.saga === 'comics' || sg.saga === 'animacion') return
              sg.eras.forEach(era => era.items.forEach(item => {
                const m = (item.h || '').match(/\d{4}/g)
                let inicio = m ? parseInt(m[0]) : null
                if (!inicio && /años 60/i.test(item.h || '')) inicio = 1965
                const entrada = { item, c: era.c, saga: sg.saga }
                if (!inicio) { fuera.push(entrada); return }
                if (!años.has(inicio)) años.set(inicio, [])
                años.get(inicio).push(entrada)
              })) })
            const orden = [...años.keys()].sort((a, b) => a - b)
            let previo = null
            const abrir = g => setDetalle({ item: g.item, c: g.c, esComic: false })
            return (
              <div className="tl">
                {orden.map(año => {
                  const salto = previo !== null && año - previo > 1 ? año - previo : 0
                  previo = año
                  const grupo = años.get(año)
                  return (
                    <div key={año}>
                      {salto > 0 && <div className="tl-salto">⋯ {tr(`${salto} años después`, `${salto} years later`)} ⋯</div>}
                      <section className="tl-fila">
                        <div className="tl-lado izq">
                          {grupo.filter(g => g.saga === 'xmen').map(g => (
                            <MiniTl key={g.item.id} item={g.item} c={g.c}
                              vista={!!vistas[g.item.id]} onAbrir={() => abrir(g)} />
                          ))}
                        </div>
                        <div className="tl-nodo"><span>{año}</span></div>
                        <div className="tl-lado der">
                          {grupo.filter(g => g.saga === 'ucm').map(g => (
                            <MiniTl key={g.item.id} item={g.item} c={g.c}
                              vista={!!vistas[g.item.id]} onAbrir={() => abrir(g)} />
                          ))}
                        </div>
                      </section>
                    </div>
                  )
                })}
                {fuera.length > 0 && (
                  <div>
                    <div className="tl-salto">∞ {tr('fuera del tiempo', 'outside of time')} ∞</div>
                    <section className="tl-fila">
                      <div className="tl-lado izq">
                        {fuera.filter(g => g.saga === 'xmen').map(g => (
                          <MiniTl key={g.item.id} item={g.item} c={g.c}
                            vista={!!vistas[g.item.id]} onAbrir={() => abrir(g)} />
                        ))}
                      </div>
                      <div className="tl-nodo"><span>∞</span></div>
                      <div className="tl-lado der">
                        {fuera.filter(g => g.saga === 'ucm').map(g => (
                          <MiniTl key={g.item.id} item={g.item} c={g.c}
                            vista={!!vistas[g.item.id]} onAbrir={() => abrir(g)} />
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )
          })()}
        </main>
      ) : vista === 'comunidades' ? (
        <main className="comunidades-vista">
          <Comunidades cuenta={cuentaLista ? cuenta : null} token={tokenCuenta} recarga={recargaComunidades}
            onEntrar={() => setAjustes(true)} onAbrir={d => setComunidadAbierta(d)}
            onCrear={() => setCreaComunidad(true)} onCodigo={usaInvitacion} onAbrirHilo={id => setHiloAbierto(id)} />
        </main>
      ) : vista === 'listas' ? (
        <main className="listas-vista">
          {(() => {
            const l = listas.find(x => x.id === listaActiva)
            if (l) {
              const itemsOrdenados = [...l.items]
                .sort((a, b) => (idOrden[a] ?? 999) - (idOrden[b] ?? 999))
                .map(id => indice[id]).filter(Boolean)
              const v = itemsOrdenados.filter(({ item }) => l.prog[item.id]).length
              return (
                <div>
                  <button className="chip-btn" onClick={cierraLista}>{tr('← Mis listas', '← My lists')}</button>
                  <header className="lista-hero">
                    <h2 className="lista-nombre">{l.nombre}</h2>
                    <span className="stat-foot">{v} / {itemsOrdenados.length} {tr('vistos en esta lista · progreso independiente del maratón', 'watched on this list · progress independent from the marathon')}</span>
                    <div className="barra"><i style={{ width: `${itemsOrdenados.length ? 100 * v / itemsOrdenados.length : 0}%` }} /></div>
                    <AgregarALista indice={indice} idOrden={idOrden} enLista={l.items}
                      onAgregar={id => toggleEnLista(l.id, id)} />
                  </header>
                  {itemsOrdenados.length === 0 && (
                    <p className="saga-desc">{tr('La lista está vacía: busca títulos arriba o añádelos desde cualquier ficha.', 'The list is empty: search for titles above or add them from any title page.')}</p>
                  )}
                  <div className="grid tierra-grid">
                    {itemsOrdenados.map(({ item, c, esComic }, i) => (
                      <Card key={item.id} sinSpoilers={sinSpoilers} pais={pais} idioma={idioma} item={item} num={i + 1} c={c} esComic={esComic} lectura={esComic ? lecturas[item.id] : null}
                        vista={!!l.prog[item.id]}
                        onToggle={() => toggleProgLista(l.id, item.id)}
                        onAbrir={() => setDetalle({ item, c, esComic })}
                        delay={i < 12 ? i * 30 : null} epHechos={epHechosDe(item)}
                        miNota={notas[item.id] && notas[item.id].p} />
                    ))}
                  </div>
                  <BorrarLista onBorrar={() => borrarLista(l.id)} />
                </div>
              )
            }
            return (
              <>
                {/* la explicación de qué es una lista solo hace falta la primera
                    vez: va dentro del estado vacío, no encima de las listas */}
                <CrearLista onCrear={crearLista} />
                {listas.length === 0 ? (
                  <div className="aviso centrado">
                    <p className="sr-titulo">{tr('Todavía no tienes listas', 'No lists yet')}</p>
                    <p className="sr-detalle">
                      {tr('Rutas personalizadas con su propio progreso, aparte del maratón: para re-ver con alguien o armar sesiones temáticas. Ponle nombre arriba y créala; podrás añadirle títulos desde su ficha.', 'Custom routes with their own progress, apart from the marathon: for rewatching with someone or building themed sessions. Name it above and create it; you can add titles from their pages.')}
                    </p>
                  </div>
                ) : (
                  <div className="mv-grid">
                    {listas.map(l => {
                      const total = l.items.length
                      const v = l.items.filter(id => l.prog[id]).length
                      return (
                        <article key={l.id} className="mv-card lista-card" role="button" tabIndex={0}
                          onClick={() => abreLista(l.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abreLista(l.id) } }}>
                          <h2 className="mv-nombre">{l.nombre}</h2>
                          <div className="barra"><i style={{ width: `${total ? 100 * v / total : 0}%` }} /></div>
                          <span className="stat-foot">{v} / {total} {tr('títulos vistos', 'titles watched')}</span>
                          <span className="mv-entrar">{tr('Abrir lista →', 'Open list →')}</span>
                        </article>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}
        </main>
      ) : vista === 'multiverso' ? (
        <main className="multiverso">
          {tierra ? (() => {
            const u = MULTIVERSO.find(x => x.num === tierra)
            if (!u) { setTierra(null); return null }
            const items = u.grupo
              ? DATA.find(sg => sg.saga === u.grupo).eras.flatMap(era => era.items
                  .filter(it => u.grupo !== 'ucm' || !it.uni)
                  .map(item => ({ item, c: era.c })))
              : u.ids.map(id => indice[id]).filter(Boolean)
            const v = items.filter(({ item }) => vistas[item.id]).length
            return (
              <div className="tierra" style={{ '--tc': u.c }}>
                <button className="chip-btn" onClick={cierraTierra}>{tr('← Volver al multiverso', '← Back to the multiverse')}</button>
                <header className="tierra-hero">
                  <span className="planeta planeta-grande" aria-hidden="true"><span className="planeta-textura" /></span>
                  <span className="mv-num tierra-num">{u.num}</span>
                  <h2 className="tierra-nombre">{u.nombre}</h2>
                  <span className="tierra-estado">{u.estado}</span>
                  <p className="tierra-desc">{u.desc}</p>
                  <div className="barra tierra-barra">
                    <i style={{ width: `${items.length ? 100 * v / items.length : 0}%` }} />
                  </div>
                  <span className="tierra-count">{v} / {items.length} {tr('completados en este universo', 'completed in this universe')}</span>
                </header>
                <div className="grid tierra-grid">
                  {items.map(({ item, c }, i) => (
                    <Card key={item.id} sinSpoilers={sinSpoilers} pais={pais} idioma={idioma} item={item} num={i + 1} c={c} lectura={item.id.startsWith('c-') ? lecturas[item.id] : null}
                      esComic={item.id.startsWith('c-')}
                      vista={!!vistas[item.id]}
                      onToggle={() => toggle(item.id)}
                      onAbrir={() => setDetalle({ item, c, esComic: item.id.startsWith('c-') })}
                      delay={i < 12 ? i * 30 : null} epHechos={epHechosDe(item)}
                      miNota={notas[item.id] && notas[item.id].p} />
                  ))}
                </div>
              </div>
            )
          })() : (
            <>
              <div className="mv-cabecera">
                <p className="saga-desc mv-intro">
                  {tr(`Los universos que hay que conocer antes de ${TITULOS.doomsday}. Entra en cada Tierra para ver y marcar todo lo que ocurre en ella.`, `The universes you should know before ${TITULOS.doomsday}. Enter each Earth to see and check off everything that happens there.`)}
                </p>
                <div className="tabs mv-modos" ref={mvGrupo}>
                  <span className="indicador" ref={mvIndicador} aria-hidden="true" />
                  <button className="tab" aria-pressed={mvModo === 'sistema'} onClick={() => setMvModo('sistema')}>{tr('Sistema', 'System')}</button>
                  <button className="tab" aria-pressed={mvModo === 'mapa'} onClick={() => setMvModo('mapa')}>{tr('Mapa', 'Map')}</button>
                  <button className="tab" aria-pressed={mvModo === 'tarjetas'} onClick={() => setMvModo('tarjetas')}>{tr('Tarjetas', 'Cards')}</button>
                </div>
              </div>
              {mvModo === 'mapa' && <MapaMultiverso onAbrir={d => setDetalle(d)} />}
              {mvModo === 'mapa' ? null : mvModo === 'sistema' ? (
                <div className="sistema-wrap">
                  <div className="sistema">
                    {Object.values(ORBITAS).map(([r]) => (
                      <span key={r} className="anillo"
                        style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }} />
                    ))}
                    {/* Dos pasadas con las mismas órbitas: planetas y, encima de
                        todos, sus nombres. Cada órbita gira en su propio contexto
                        de apilado, así que en una sola pasada el planeta de una
                        órbita posterior (y el sol) tapaba el nombre de otra
                        («T-10005» bajo Tierra-616). Las animaciones nacen en el
                        mismo fotograma y van sincronizadas. */}
                    {[false, true].map(nombres => {
                      const u616 = MULTIVERSO.find(u => u.num === 'Tierra-616')
                      const Pieza = nombres ? 'span' : 'button'
                      const pieza = (u, clase, orbe, nombre) => (
                        <Pieza className={mvSobre === u.num ? `${clase} sobre` : clase} style={{ '--tc': u.c, '--fase': MULTIVERSO.indexOf(u) }}
                          {...(nombres ? {} : {
                            onClick: () => { setMvSobre(null); abreTierra(u.num) }, title: u.nombre, 'aria-label': nombre,
                            onPointerEnter: () => setMvSobre(u.num), onPointerLeave: () => setMvSobre(null),
                            onFocus: () => setMvSobre(u.num), onBlur: () => setMvSobre(null),
                          })}>
                          {orbe}
                          <span className="nav-nombre">{nombre}</span>
                        </Pieza>
                      )
                      return (
                        <div className={nombres ? 'sistema-capa sistema-nombres' : 'sistema-capa'} key={String(nombres)} aria-hidden={nombres || undefined}>
                          {pieza(u616, 'sol', nombres ? <span className="planeta-orbe planeta-hueco" style={{ width: 92, height: 92 }} />
                            : <span className="planeta planeta-orbe planeta-sol"><span className="planeta-textura" /></span>, 'Tierra-616')}
                          {MULTIVERSO.filter(u => ORBITAS[u.num]).map(u => {
                            const [r, fase, dur, dir, tam] = ORBITAS[u.num]
                            return (
                              <div className={`orbita${dir < 0 ? ' inversa' : ''}`} key={u.num}
                                style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, transform: `rotate(${fase}deg)` }}>
                                <div className="giro" style={{ animationDuration: dur + 's' }}>
                                  <div className="nav-pos" style={{ transform: `translateX(-50%) rotate(${-fase}deg)` }}>
                                    <div className="contra" style={{ animationDuration: dur + 's' }}>
                                      {pieza(u, 'planeta-nav', nombres ? <span className="planeta-orbe planeta-hueco" style={{ width: tam, height: tam }} />
                                        : <span className="planeta planeta-orbe" style={{ width: tam, height: tam, '--p': tam + 'px' }}><span className="planeta-textura" /></span>,
                                        CORTO_SISTEMA[u.num] || u.num.replace('Tierra-', 'T-'))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
              <div className="mv-grid">
                {MULTIVERSO.map(u => (
                  <article className="mv-card" key={u.num} style={{ '--tc': u.c, '--fase': MULTIVERSO.indexOf(u) }}
                    role="button" tabIndex={0}
                    onClick={() => abreTierra(u.num)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abreTierra(u.num) } }}>
                    <span className="planeta planeta-mini" aria-hidden="true"><span className="planeta-textura" /></span>
                    <span className="mv-num">{u.num}</span>
                    <h2 className="mv-nombre">{u.nombre}</h2>
                    <p className="mv-desc">{u.desc}</p>
                    <span className="mv-estado">{u.estado}</span>
                    <span className="mv-entrar">{tr('Entrar en esta Tierra →', 'Enter this Earth →')}</span>
                  </article>
                ))}
              </div>
              )}
            </>
          )}
        </main>
      ) : vista === 'galeria' ? (
        <main className="galeria">
          {DATA.map(saga => {
            const esComic = saga.saga === 'comics'
            const items = saga.eras.flatMap(era => era.items
              .filter(it => pasaFiltro(it, esComic) && !oculto(it, esComic))
              .map(item => ({ item, c: era.c })))
            if (!items.length) return null
            return (
              <section key={saga.saga} className="galeria-saga">
                <h2 className={`galeria-titulo ${saga.saga}`}>{saga.titulo}</h2>
                <div className="galeria-grid">
                  {items.map(({ item, c }) => (
                    <button key={item.id} id={`gal-${item.id}`} className={`galeria-item${vistas[item.id] ? ' vista' : ''}`}
                      title={item.t} onClick={() => setDetalle({ item, c, esComic })}>
                      <Portada item={item} c={c} esComic={esComic} />
                      {vistas[item.id] && <span className="galeria-check"><CheckIcon /></span>}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </main>
      ) : vista === 'stats' ? (
        <main className="stats-vista">
          <div className="stats-tiles">
            <div className="stat">
              <span className="stat-label">{tr('Horas vistas', 'Hours watched')}</span>
              <span className="stat-num">{Math.round(estadisticas.vistoMin / 60)}<small> / {Math.round(estadisticas.totMin / 60)} h</small></span>
              <div className="barra"><i style={{ width: `${estadisticas.totMin ? 100 * estadisticas.vistoMin / estadisticas.totMin : 0}%` }} /></div>
              <span className="stat-foot">{estadisticas.totMin ? Math.round(100 * estadisticas.vistoMin / estadisticas.totMin) : 0}{tr('% del tiempo total', '% of the total time')}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{tr('Títulos vistos', 'Titles watched')}</span>
              <span className="stat-num">{estadisticas.titulosVistos}<small> / {estadisticas.titulosTot}</small></span>
              <span className="stat-foot">{tr('películas, series y especiales', 'movies, series and specials')}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{tr('Episodios vistos', 'Episodes watched')}</span>
              <span className="stat-num">{estadisticas.epVistos}<small> / {estadisticas.epTot}</small></span>
              <span className="stat-foot">{tr('de las series con lista', 'from series with episode lists')}</span>
            </div>
            {/* cómics y bóveda son opcionales: en cero no ocupan una caja cada uno */}
            {estadisticas.comicsVistos > 0 && (
            <div className="stat">
              <span className="stat-label">{tr('Cómics leídos', 'Comics read')}</span>
              <span className="stat-num">{estadisticas.comicsVistos}<small> / {estadisticas.comicsTot}</small></span>
              <span className="stat-foot">{tr('lecturas esenciales', 'essential reads')}</span>
            </div>
            )}
            {estadisticas.bovedaEpVistos > 0 && (
            <div className="stat">
              <span className="stat-label">{tr('Bóveda de animación', 'Animation vault')}</span>
              <span className="stat-num">{estadisticas.bovedaEpVistos}<small> / {estadisticas.bovedaEpTot}</small></span>
              <span className="stat-foot">{tr(`episodios de las ${N_SERIES_BOVEDA} series`, `episodes across the ${N_SERIES_BOVEDA} series`)}</span>
            </div>
            )}
          </div>
          {(estadisticas.comicsVistos === 0 || estadisticas.bovedaEpVistos === 0) && (
            <p className="stats-pendientes">
              {tr('Sin empezar: ', 'Not started: ')}
              {[
                estadisticas.comicsVistos === 0 && tr(`los ${estadisticas.comicsTot} cómics`, `the ${estadisticas.comicsTot} comics`),
                estadisticas.bovedaEpVistos === 0 && tr(`los ${estadisticas.bovedaEpTot} episodios de la bóveda de animación`, `the ${estadisticas.bovedaEpTot} animation vault episodes`),
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          {estadisticas.titulosVistos === 0 && (
            <p className="aviso info stats-vacio">
              {tr('Aún está todo por estrenar: en cuanto marques tu primera película, aquí aparecerán tus horas, tu racha, tus logros y el mapa de calor. 🍿', 'It’s all still ahead of you: as soon as you check off your first movie, your hours, streak, achievements and heatmap will show up here. 🍿')}
            </p>
          )}
          <div className="stats-acciones">
            <button className="accion-principal compartir"
              onClick={() => compartirImagen(estadisticas, estadisticas.comicsVistos, estadisticas.comicsTot)}>
              {tr('Compartir como imagen', 'Share as an image')}
            </button>
            <button className="chip-btn" onClick={() => { setPerfilUrl(''); setPerfilCopiado(false); setPerfilModal(true) }}>
              {tr('Perfil compartible', 'Shareable profile')}
            </button>
            {!amigo && (
              <button className="chip-btn" onClick={() => { setDueloInput(''); setDueloNombre(''); setDueloError(''); setDueloModal(true) }}>
                {tr('Modo duelo', 'Duel mode')}
              </button>
            )}
            {!club && (
              <button className="chip-btn" onClick={() => { setClubCod(''); setClubAlias(''); setClubError(''); setClubModal(true) }}>
                {tr('Club de maratón', 'Marathon club')}
              </button>
            )}
          </div>

          {amigo && <Duelo amigo={amigo} vistas={vistas} eps={eps} onQuitar={() => guardaAmigo(null)} />}
          {club && <Club club={club} vistas={vistas} eps={eps}
            onSalir={() => guardaClub(null)} onInvitar={() => setClubInvitar(true)} />}

          <TuMes vistas={vistas} eps={eps} notas={notas} idioma={idioma}
            onAbrir={id => { const d = buscaItem(id); if (d) setDetalle(d) }} />

          <ActividadDelMaraton vistas={vistas} eps={eps} notas={notas} indice={indice} idioma={idioma}
            onAbrir={d => setDetalle(d)} />

          <Diario vistas={vistas} notas={notas} pais={pais} idioma={idioma} indice={indice} onAbrir={d => setDetalle(d)} />

          <Logros ctx={ctxLogros} nuevos={nuevosLogros} />

          <section className="grafica">
            <h3 className="grafica-titulo">{tr('Horas por fase y era', 'Hours by phase and era')}</h3>
            <p className="grafica-sub">{tr('La barra tenue es la duración total de cada era; el relleno, lo que ya has visto.', 'The faint bar is each era’s total runtime; the fill, what you’ve already watched.')}</p>
            {['xmen', 'ucm'].map(sg => (
              <div key={sg} className="grafica-grupo">
                <div className="grafica-grupo-nombre">{sg === 'xmen' ? tr('Saga X-Men', 'X-Men saga') : tr('UCM', 'MCU')}</div>
                {estadisticas.fases.filter(f => f.saga === sg).map((f, i) => {
                  const pct = f.tot ? 100 * f.visto / f.tot : 0
                  return (
                    <div className="gbar" key={i}
                      title={tr(`${f.era}: ${Math.round(f.visto / 60)} h de ${Math.round(f.tot / 60)} h · ${f.vistos}/${f.items} títulos`, `${f.era}: ${Math.round(f.visto / 60)} h of ${Math.round(f.tot / 60)} h · ${f.vistos}/${f.items} titles`)}>
                      <span className="gbar-label">{f.era} <em>{f.rango}</em></span>
                      <span className="gbar-pista">
                        <i style={{ width: `${pct}%`, background: f.c[0] }} />
                      </span>
                      <span className="gbar-valor">{Math.round(f.visto / 60)} / {Math.round(f.tot / 60)} h</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </section>

          <section className="grafica">
            <h3 className="grafica-titulo">{tr('Avance por tipo', 'Progress by type')}</h3>
            {estadisticas.tipos.map(t => {
              const pct = t.tot ? 100 * t.visto / t.tot : 0
              return (
                <div className="gbar" key={t.t} title={tr(`${t.t}: ${Math.round(t.visto / 60)} h de ${Math.round(t.tot / 60)} h`, `${t.t}: ${Math.round(t.visto / 60)} h of ${Math.round(t.tot / 60)} h`)}>
                  <span className="gbar-label">{t.t}</span>
                  <span className="gbar-pista"><i style={{ width: `${pct}%`, background: 'var(--red)' }} /></span>
                  <span className="gbar-valor">{Math.round(t.visto / 60)} / {Math.round(t.tot / 60)} h</span>
                </div>
              )
            })}
          </section>
        </main>
      ) : vista !== 'estreno' ? (
        <main className={((vista === 'comics' || vista === 'animacion') ? 'comics' : 'crono') + (compacto ? ' compacto' : '')}>
          {!hayResultados && (
            <div className="aviso centrado">
              <p className="sr-titulo">{tr('Nada coincide con lo que buscas', 'Nothing matches your search')}</p>
              <p className="sr-detalle">
                {buscaLenta.trim()
                  ? tr(<>No hay ningún título con «<b>{buscaLenta.trim()}</b>»{filtrosActivos > 0 ? ' entre los filtros que tienes puestos' : ''}.</>, <>No title matches "<b>{buscaLenta.trim()}</b>"{filtrosActivos > 0 ? ' within your active filters' : ''}.</>)
                  : tr('Los filtros que tienes puestos no dejan ningún título.', 'Your active filters leave no titles to show.')}
              </p>
              <button className="chip-btn destacado" aria-pressed="false" onClick={limpiaTodo}>
                {tr('Quitar filtros y búsqueda', 'Clear filters and search')}
              </button>
            </div>
          )}
          {vista === 'comics' && enCurso.length > 0 && (
            <section className="seguir" aria-label={tr('Seguir leyendo', 'Keep reading')}>
              <h2 className="seguir-titulo">{tr('Seguir leyendo', 'Keep reading')}</h2>
              <div className="seguir-lista">
                {enCurso.map(({ id, d, l }) => (
                  <button key={id} className="seguir-item" onClick={() => abreLector(id)}>
                    <span className="seguir-cara"><Portada item={d.item} c={d.c} esComic /></span>
                    <span className="seguir-info">
                      <span className="seguir-nombre">{d.item.t}</span>
                      <span className="seguir-pag">{l && l.t > 1 ? tr(`pág. ${l.p + 1} de ${l.t}`, `p. ${l.p + 1} of ${l.t}`) : tr('Sin empezar', 'Not started')}</span>
                      {l && l.t > 1 && <span className="seguir-barra" aria-hidden="true"><span style={{ width: `${Math.round(100 * (l.p + 1) / l.t)}%` }} /></span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {DATA.filter(saga => vista === 'comics' ? saga.saga === 'comics' : vista === 'animacion' ? saga.saga === 'animacion' : (saga.saga !== 'comics' && saga.saga !== 'animacion')).map(saga => {
            const esComic = saga.saga === 'comics'
            const s = stats.porSaga[saga.saga]
            // s.n es el total de la saga; hay que contar los que pasan el filtro
            const visibles = saga.eras.reduce((acc, era) => acc + era.items.filter(it => pasaFiltro(it, esComic)).length, 0)
            if (!s.n || !visibles) return null
            let num = 0
            const plegada = sagaPlegada(saga.saga)
            const completa = s.n > 0 && s.v === s.n
            return (
              <section className={`saga${plegada ? ' plegada' : ''}`} data-saga={saga.saga} id={`saga-${saga.saga}`} key={saga.saga}>
                <div className="saga-head">
                  {FRANJA.includes(saga.saga) && (
                    <div className="saga-franja" aria-hidden="true">
                      <img src={`fondo/${saga.saga}.webp`} alt="" loading="lazy" decoding="async"
                        srcSet={`fondo/${saga.saga}-560.webp 560w, fondo/${saga.saga}.webp 900w`}
                        sizes="(max-width: 640px) 100vw, 50vw" />
                      <span className="sf-velo" />
                    </div>
                  )}
                  <h2>{saga.titulo}</h2>
                  <span className="uni-chip">{saga.uni}</span>
                  <span className="saga-count">
                    {s.v} / {s.n}{s.m ? tr(` · quedan ${fmtDur(s.m)}`, ` · ${fmtDur(s.m)} left`) : completa ? tr(' · completa', ' · complete') : ''}
                  </span>
                  {!buscando && (
                  <button type="button" className="saga-plegar" aria-expanded={!plegada} aria-controls={plegada ? undefined : `saga-cuerpo-${saga.saga}`}
                    aria-label={plegada ? tr(`Desplegar ${saga.titulo}`, `Expand ${saga.titulo}`) : tr(`Plegar ${saga.titulo}`, `Collapse ${saga.titulo}`)}
                    onClick={() => plegada ? ponPlegado(saga.saga, false) : pliega(saga.saga, `saga-cuerpo-${saga.saga}`)}>
                    {plegada ? tr('Desplegar', 'Expand') : tr('Plegar', 'Collapse')}
                  </button>
                  )}
                </div>
                {plegada ? (
                  <>
                    {/* mismos filtros que la rejilla desplegada: con «Solo pendientes» no desfila lo visto */}
                    <TiraPlegada esComic={esComic} desc={saga.desc} anima={recien === saga.saga}
                      entradas={saga.eras.flatMap(era => era.items.filter(it => pasaFiltro(it, esComic) && !oculto(it, esComic)).map(item => ({ item, c: era.c })))}
                      detalle={resumenBloque(saga.eras.flatMap(era => era.items.filter(it => pasaFiltro(it, esComic) && !oculto(it, esComic))), esComic) + (completa ? tr(' · vista entera', ' · all watched') : '')}
                      onAbrir={(item, c) => setDetalle({ item, c, esComic })} />
                    <div className="barra" aria-hidden="true"><i style={{ width: `${s.n ? 100 * s.v / s.n : 0}%` }} /></div>
                  </>
                ) : (
                <div className={`saga-cuerpo${recien === saga.saga ? ' abre' : ''}`} id={`saga-cuerpo-${saga.saga}`}>
                <DescPlegable texto={saga.desc} />
                {/* En móvil la descripción entra aquí, plegada con la guía en
                    un solo desplegable «Sobre esta saga»: desplegados, los dos
                    bloques empujaban el primer título fuera de la pantalla.
                    En escritorio el desplegable sigue siendo solo la guía. */}
                {(saga.guia || saga.desc) && (
                  <details className={`saga-guia${saga.guia ? '' : ' sin-guia'}`}>
                    <summary>
                      <span className="sg-escritorio">{tr('Cómo entender la saga', 'How to make sense of the saga')}</span>
                      <span className="sg-movil">{tr('Sobre esta saga', 'About this saga')}</span>
                    </summary>
                    <p className="saga-guia-desc">{saga.desc}</p>
                    {saga.guia && saga.guia.map((g, i) => <p key={i}><b>{g.t}.</b> {g.p}</p>)}
                  </details>
                )}
                <div className="barra"><i style={{ width: `${s.n ? 100 * s.v / s.n : 0}%` }} /></div>
                {saga.eras.map(era => {
                  const filtrados = era.items.filter(it => pasaFiltro(it, esComic))
                  const numerados = orden === 'crono' ? filtrados : [...filtrados].sort((a, b) => {
                    const va = orden === 'imdb' ? (a.s ?? -1) : ((notas[a.id] && notas[a.id].p) ?? -1)
                    const vb = orden === 'imdb' ? (b.s ?? -1) : ((notas[b.id] && notas[b.id].p) ?? -1)
                    return vb - va
                  })
                  const visibles = numerados.filter(it => !oculto(it, esComic))
                  if (!numerados.length) return null
                  const base = num
                  num += numerados.length
                  const vEra = numerados.filter(it => vistas[it.id]).length
                  const kEra = claveEra(era)
                  const eraPlegada = estaPlegado(kEra, vEra === numerados.length)
                  return (
                    <div className={`era${eraPlegada ? ' plegada' : ''}`} key={era.items[0] ? era.items[0].id : era.rango} style={{ '--era': era.c[0] }}>
                      <div className="era-head">
                        <h3>{era.era}</h3>
                        <span className="era-rango">{era.rango}</span>
                        <span className="era-prog">
                          <i style={{ width: `${100 * vEra / numerados.length}%` }} />
                        </span>
                        <span className="era-count">{vEra}/{numerados.length}</span>
                        {!buscando && (
                        <button type="button" className="era-plegar" aria-expanded={!eraPlegada} aria-label={eraPlegada ? tr(`Desplegar ${era.era}`, `Expand ${era.era}`) : tr(`Plegar ${era.era}`, `Collapse ${era.era}`)}
                          aria-controls={eraPlegada ? undefined : `era-cuerpo-${kEra.slice(4)}`}
                          onClick={() => eraPlegada ? ponPlegado(kEra, false) : pliega(kEra, `era-cuerpo-${kEra.slice(4)}`)}>
                          {eraPlegada ? tr('Desplegar', 'Expand') : tr('Plegar', 'Collapse')}
                        </button>
                        )}
                      </div>
                      {eraPlegada && (
                        <TiraPlegada esComic={esComic} anima={recien === kEra} entradas={visibles.map(item => ({ item, c: era.c }))}
                          detalle={resumenBloque(visibles, esComic) + (vEra === numerados.length ? tr(' · vista entera', ' · all watched') : '')}
                          onAbrir={item => setDetalle({ item, c: era.c, esComic })} />
                      )}
                      {!eraPlegada && (
                      <div className={`era-borde${recien === kEra ? ' abre' : ''}`} id={`era-cuerpo-${kEra.slice(4)}`}>
                        <div className="grid">
                          {numerados.map((item, i) =>
                            visibles.includes(item) && (
                              <Card key={item.id} sinSpoilers={sinSpoilers} pais={pais} idioma={idioma} item={item} num={base + i + 1} c={era.c}
                                esComic={esComic} vista={!!vistas[item.id]}
                                onToggle={() => toggle(item.id)}
                                onAbrir={() => setDetalle({ item, c: era.c, esComic })}
                                delay={nextDelay()} epHechos={epHechosDe(item)} miNota={notas[item.id] && notas[item.id].p} lectura={esComic ? lecturas[item.id] : null} />
                            )
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  )
                })}
                </div>
                )}
              </section>
            )
          })}
        </main>
      ) : (
        <main className={'estreno' + (compacto ? ' compacto' : '')}>
          {porAnio.map(([anio, items]) => {
            const visibles = items.filter(it => !(filtros.vistas && vistas[it.id]))
            if (!visibles.length) return null
            const v = items.filter(it => vistas[it.id]).length
            return (
              <section className="anio" key={anio}>
                <div className="anio-head">
                  <span className="anio-num">{anio}</span>
                  <span className="linea" />
                  <span className="anio-count">{v} / {items.length}</span>
                </div>
                <div className="grid">
                  {visibles.map((item, i) => (
                    <Card key={item.id} pais={pais} idioma={idioma} item={item} num={i + 1} c={item.c}
                      esComic={false} vista={!!vistas[item.id]}
                      onToggle={() => toggle(item.id)}
                      onAbrir={() => setDetalle({ item, c: item.c, esComic: false })}
                      delay={nextDelay()} epHechos={epHechosDe(item)} miNota={notas[item.id] && notas[item.id].p} />
                  ))}
                </div>
              </section>
            )
          })}
          <p className="saga-desc" style={{ marginTop: 24 }}>
            {tr('La vista por estreno ordena películas y series por su año de salida (los cómics solo aparecen en su pestaña).', 'The release view orders movies and series by the year they came out (comics only appear in their own tab).')}
          </p>
        </main>
      )}

      {lectorMontado && (
        <Lector key={ultimoLector.current.item.id} item={ultimoLector.current.item} registro={ultimoLector.current.registro} pagInicial={(lecturas[ultimoLector.current.item.id] || {}).p || 0}
          onPagina={(p, t) => setLecturas(l => (l[ultimoLector.current.item.id] && l[ultimoLector.current.item.id].p === p && l[ultimoLector.current.item.id].t === t) ? l : { ...l, [ultimoLector.current.item.id]: { p, t, f: Date.now() } })}
          onCerrar={() => setLector(null)} leido={!!vistas[ultimoLector.current.item.id]} onLeido={() => { const id = ultimoLector.current.item.id; toggle(id); setLector(null); setLecturas(l => { if (!(id in l)) return l; const c = { ...l }; delete c[id]; return c }) }} saliendo={lectorSale} />
      )}
      {cineMontado && cineLista.length > 0 && (() => {
        const idx = Math.min(cineIdx, cineLista.length - 1)
        const { item, c } = cineLista[idx]
        return (
          <div className={'cine' + cineSale} ref={refCine} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr('Modo cine', 'Cinema mode')}>
            <button className="cerrar cine-cerrar" onClick={() => setCine(false)} aria-label={tr('Salir', 'Exit')}>✕</button>
            <div className="cine-centro">
              <button className="cine-flecha" onClick={() => setCineIdx(i => Math.max(0, i - 1))}
                disabled={idx === 0} aria-label={tr('Anterior', 'Previous')}>‹</button>
              <div className="cine-panel" key={item.id}
                onTouchStart={e => { const t = e.touches[0]; cineToque.current = { x: t.clientX, y: t.clientY } }}
                onTouchEnd={e => {
                  const ini = cineToque.current, t = e.changedTouches[0]
                  cineToque.current = null
                  if (!ini) return
                  const dx = t.clientX - ini.x, dy = t.clientY - ini.y
                  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
                  setCineIdx(i => dx < 0 ? Math.min(cineLista.length - 1, i + 1) : Math.max(0, i - 1))
                }}>
                <div className="cine-poster"><Portada item={item} c={c} esComic={false} /></div>
                <div className="cine-info">
                  <span className="cine-contador">{idx + 1} {tr('de', 'of')} {cineLista.length} {tr('pendientes', 'pending')}<span className="cine-contador-extra">{tr(' · orden del maratón', ' · marathon order')}</span></span>
                  <h2 className="cine-titulo">{sinPartir(item.t)}</h2>
                  <p className="cine-meta">
                    {item.s != null && <span className="star">★ {item.s.toFixed(1)} · </span>}
                    <span className="hist">{item.h}</span>{item.d ? <> · {fmtDur(item.d)}</> : null}
                  </p>
                  {item.res && !(sinSpoilers && !vistas[item.id]) && <p className="cine-res">{item.res}</p>}
                  <div className="modal-acciones">
                    <button className="accion-principal" onClick={() => toggle(item.id)}>{tr('✓ La veo — marcar vista', '✓ Watching it — mark as seen')}</button>
                    <button className="ghost" onClick={() => setDetalle({ item, c, esComic: false })}>{tr('Ver ficha', 'Open title')}</button>
                  </div>
                </div>
              </div>
              <button className="cine-flecha" onClick={() => setCineIdx(i => Math.min(cineLista.length - 1, i + 1))}
                disabled={idx === cineLista.length - 1} aria-label={tr('Siguiente', 'Next')}>›</button>
            </div>
            <p className="cine-ayuda">{tr('← → navegar · Enter marcar vista · Esc salir', '← → navigate · Enter mark seen · Esc exit')}</p>
          </div>
        )
      })()}

      {dueloMontado && (
        <div className={'overlay' + dueloSale} ref={refDuelo} tabIndex={-1} onClick={() => setDueloModal(false)} role="dialog" aria-modal="true" aria-label={tr('Modo duelo', 'Duel mode')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setDueloModal(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Modo duelo', 'Duel mode')}</h2>
              <p className="modal-res">
                {tr(<>Pega el enlace de <b>Perfil compartible</b> de la otra persona (botón «Perfil compartible» en sus Estadísticas)
                para una foto fija, o su <b>código de sincronización</b> (botón «Sincronizar») para un duelo
                <b> en vivo</b> que se actualiza solo. Todo queda en este navegador.</>,
                <>Paste the other person’s <b>shareable profile</b> link (the "Shareable profile" button in their Stats)
                for a fixed snapshot, or their <b>sync code</b> (the "Sync" button) for a <b>live</b> duel
                that updates itself. Everything stays in this browser.</>)}
              </p>
              <input className="busca duelo-input" placeholder={tr('Enlace de perfil o código de sincronización', 'Profile link or sync code')} autoComplete="off" spellCheck={false}
                value={dueloInput} onChange={e => { setDueloInput(e.target.value); setDueloError('') }} />
              <input className="busca duelo-input" placeholder={tr('Nombre de tu rival (opcional)', 'Your rival’s name (optional)')}
                value={dueloNombre} onChange={e => setDueloNombre(e.target.value)} maxLength={24} />
              {dueloError && <p className="duelo-error">{dueloError}</p>}
              <button className="accion-principal" onClick={() => {
                const p = parsePerfilCod(dueloInput)
                if (p) { guardaAmigo(dueloNombre.trim() ? { ...p, n: dueloNombre.trim() } : p); setDueloModal(false); return }
                const sc = decodificaSync(dueloInput)
                if (sc) { guardaAmigo({ tipo: 'live', n: dueloNombre.trim() || tr('Tu rival', 'Your rival'), url: sc.url, room: sc.room }); setDueloModal(false); return }
                setDueloError(tr('Eso no parece ni un enlace de perfil ni un código de sincronización: revisa que esté completo.', 'That doesn’t look like a profile link or a sync code: check that it’s complete.'))
              }}>
                {tr('Empezar el duelo', 'Start the duel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {bienvenidaMontada && (
        <Bienvenida saliendo={bienvenidaSale} pais={pais} onPais={ponPais} idioma={idioma} onIdioma={ponIdioma} onCerrar={cierraBienvenida}
          onEmpezar={() => {
            // «Empezar por el principio» abre la ficha del primer título (qué es,
            // dónde verlo, «Marcar como vista»): antes solo cerraba y dejaba al
            // recién llegado delante de la lista sin un primer paso
            const primero = stats.siguiente && buscaItem(stats.siguiente.id)
            cierraBienvenida()
            if (primero) setTimeout(() => setDetalle(primero), DUR_SALIDA)
          }}
          onExpress={() => { if (!filtros.express) setF('express'); cierraBienvenida() }} />
      )}
      {clubMontado && (
        <div className={'overlay' + clubSale} ref={refClub} tabIndex={-1} onClick={() => setClubModal(false)} role="dialog" aria-modal="true" aria-label={tr('Club de maratón', 'Marathon club')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setClubModal(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Club de maratón', 'Marathon club')}</h2>
              <p className="modal-res">
                {tr('Un ranking en vivo para 2 o más personas, con comentarios por título.', 'A live ranking for 2 or more people, with comments per title.')}
                {sync ? tr(' Puedes crear un club con tu Firebase o unirte con un código.', ' You can create a club with your Firebase or join with a code.') : tr(' Para crear un club necesitas configurar antes Sincronizar; para unirte basta un código.', ' To create a club, set up Sync first; to join, a code is enough.')}
              </p>
              <input className="busca duelo-input" placeholder={tr('Código del club (déjalo vacío para crear uno)', 'Club code (leave empty to create one)')}
                value={clubCod} onChange={e => { setClubCod(e.target.value); setClubError('') }} />
              <input className="busca duelo-input" placeholder={tr('Tu nombre en el club', 'Your name in the club')}
                value={clubAlias} onChange={e => { setClubAlias(e.target.value); setClubError('') }} maxLength={20} />
              {clubError && <p className="duelo-error">{clubError}</p>}
              <button className="accion-principal" onClick={() => {
                const alias = clubAlias.trim()
                if (!alias) { setClubError(tr('Ponte un nombre para el ranking.', 'Pick a name for the ranking.')); return }
                if (clubCod.trim()) {
                  const sc = decodificaSync(clubCod)
                  if (!sc) { setClubError(tr('Ese código no parece válido: revisa que esté completo.', 'That code doesn’t look valid: check that it’s complete.')); return }
                  guardaClub({ url: sc.url, sala: sc.room, alias }); setClubModal(false); setClubInvitar(true); return
                }
                if (!sync) { setClubError(tr('Para crear un club, configura primero Sincronizar (arriba) o pide un código.', 'To create a club, set up Sync first (above) or ask for a code.')); return }
                const sala = 'club-' + Math.random().toString(36).slice(2, 8)
                guardaClub({ url: sync.url, sala, alias }); setClubModal(false); setClubInvitar(true)
              }}>
                {clubCod.trim() ? tr('Unirme al club', 'Join the club') : tr('Crear club', 'Create club')}
              </button>
            </div>
          </div>
        </div>
      )}
      {invitarMontado && (
        <div className={'overlay' + invitarSale} ref={refInvitar} tabIndex={-1} onClick={() => setClubInvitar(false)} role="dialog" aria-modal="true" aria-label={tr('Invitar al club', 'Invite to the club')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setClubInvitar(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Invita a tu club', 'Invite to your club')}</h2>
              <p className="modal-res">{tr('Comparte este código: quien lo pegue en Club de maratón entrará en tu sala.', 'Share this code: whoever pastes it in Marathon club joins your room.')}</p>
              <code className="club-codigo">{codigoSync(club.url, club.sala)}</code>
              <button className="accion-principal" onClick={() => {
                try { navigator.clipboard.writeText(codigoSync(club.url, club.sala)) } catch {}
              }}>{tr('Copiar código', 'Copy code')}</button>
            </div>
          </div>
        </div>
      )}
      {comunidadMontada && NUBE && (
        <ComunidadHoja key={comunidadUltima.current} saliendo={comunidadSale} direccion={comunidadUltima.current}
          vistas={vistas} eps={eps} recargaHilos={recargaComunidades}
          onForo={f => setForoAbierto(f)} onAbrirHilo={id => setHiloAbierto(id)}
          cuenta={cuentaLista ? cuenta : null} token={tokenCuenta} onCerrar={() => setComunidadAbierta(null)}
          onVerPerfil={n => setPerfilPublico(n)} onCambio={() => setRecargaComunidades(n => n + 1)}
          onEntrar={() => { setComunidadAbierta(null); setAjustes(true) }} />
      )}
      {creaComunidadMontada && cuenta && (
        <CreaComunidad saliendo={creaComunidadSale} cuenta={cuenta} token={tokenCuenta} onCerrar={() => setCreaComunidad(false)}
          onCreada={k => { setCreaComunidad(false); setRecargaComunidades(n => n + 1); setComunidadAbierta(k.direccion) }} />
      )}
      {creaPerfilMontado && cuenta && (
        <CreaPerfil saliendo={creaPerfilSale} cuenta={cuenta} token={tokenCuenta}
          onCerrar={() => setCreaPerfil(false)}
          onCreado={p => { setCreaPerfil(false); setPerfilCuenta(p) }} />
      )}
      {perfilMMontado && (
        <div className={'overlay' + perfilMSale} ref={refPerfilM} tabIndex={-1} onClick={() => setPerfilModal(false)} role="dialog" aria-modal="true" aria-label={tr('Perfil compartible', 'Shareable profile')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPerfilModal(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Perfil compartible', 'Shareable profile')}</h2>
              <p className="modal-res">
                {tr(<>Genera una página de <b>solo lectura</b> con tu progreso, logros y valoraciones.
                Todo va dentro del propio enlace: quien lo reciba no puede tocar tu maratón (tus notas de texto no se incluyen).</>,
                <>Generates a <b>read-only</b> page with your progress, achievements and ratings.
                Everything lives inside the link itself: whoever gets it can’t touch your marathon (your text notes are not included).</>)}
              </p>
              <input className="busca sync-input" placeholder={tr('Tu nombre para el perfil', 'Your name for the profile')} autoComplete="off" value={perfilNombre}
                maxLength={30} onChange={e => setPerfilNombre(e.target.value)} aria-label={tr('Tu nombre', 'Your name')} />
              <div className="modal-acciones">
                <button className="accion-principal" onClick={() => {
                  const n = perfilNombre.trim() || tr('Alguien', 'Someone')
                  setPerfilUrl(generarPerfil(n))
                  setPerfilCopiado(false)
                }}>{tr('Generar enlace', 'Generate link')}</button>
                {perfilUrl && (
                  <button className="chip-btn" onClick={() => {
                    navigator.clipboard.writeText(perfilUrl).then(() => {
                      setPerfilCopiado(true); setTimeout(() => setPerfilCopiado(false), 2500)
                    })
                  }}>{perfilCopiado ? tr('¡Copiado!', 'Copied!') : tr('Copiar enlace', 'Copy link')}</button>
                )}
                {perfilUrl && !!navigator.share && (
                  <button className="chip-btn" onClick={() => {
                    navigator.share({ url: perfilUrl, title: tr('Mi maratón Marvel', 'My Marvel marathon') }).catch(() => {})
                  }}>{tr('Compartir…', 'Share…')}</button>
                )}
              </div>
              {perfilUrl && (
                <div className="sync-codigo">
                  <code>{perfilUrl}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {ajustesMontado && (
        <div className={'overlay' + ajustesSale} ref={refAjustes} tabIndex={-1} onClick={() => setAjustes(false)} role="dialog" aria-modal="true" aria-label={tr('Ajustes', 'Settings')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setAjustes(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Ajustes', 'Settings')}</h2>
              <p className="modal-res">{tr('Se guardan en este navegador. Salvo «Tu progreso» y «Empezar de cero», nada de aquí toca lo que llevas visto.', 'Saved in this browser. Apart from “Your progress” and “Start over”, nothing here touches what you’ve watched.')}</p>

              <CuentaAjuste cuenta={cuenta} perfil={perfilCuenta} estado={syncEstado} aviso={cuentaAviso} token={tokenCuenta}
                onVerPerfil={n => { setAjustes(false); setPerfilPublico(n) }}
                onEnlace={enviaEnlace} onCrearPerfil={() => setCreaPerfil(true)} onPrivacidad={cambiaPrivacidad}
                onDescargar={descargaMisDatos} onBorrar={borraMiCuenta} onSalir={salirCuenta} />

              {/* idioma y país arriba: la bienvenida dice «se cambia en Ajustes» y
                  estaban al final, tras las herramientas de datos */}
              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-idioma">{tr('Idioma', 'Language')}</h3>
                  <p className="ajuste-pista">{tr('La interfaz, los títulos y los textos. En español, el país decide además el matiz («Lobezno» o «Wolverine»).', 'Interface, titles and texts. In Spanish, your country also picks the regional flavor ("Lobezno" vs "Wolverine").')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-idioma">
                  <button className="chip-btn" role="radio" aria-checked={idioma === 'es'} onClick={() => ponIdioma('es')}>Español</button>
                  <button className="chip-btn" role="radio" aria-checked={idioma === 'en'} onClick={() => ponIdioma('en')}>English</button>
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">{tr('País', 'Country')}</h3>
                  <p className="ajuste-pista">{tr('Decide en qué plataforma aparece cada título, el filtro «En Disney+» y cómo se nombran las obras y sus personajes: como en España o como en Latinoamérica («Lobezno inmortal» o «Wolverine: Inmortal», «el Lapso» o «el Blip»). Los catálogos cambian cada mes y se revisan con la app.', 'Sets which platform each title shows, the “On Disney+” filter and, in Spanish, how works and characters are named. Catalogs change monthly and refresh with the app.')}</p>
                </div>
                <div className="ajuste-ops">
                  <span className="sel-envuelto">
                    <select className="selector" value={pais} aria-label={tr('País', 'Country')} onChange={e => ponPais(e.target.value)}>
                      {PAISES.map(p => <option key={p.id} value={p.id}>{tr(p.nombre, PAIS_EN[p.id] || p.nombre)}</option>)}
                    </select>
                  </span>
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-densidad">{tr('Densidad', 'Density')}</h3>
                  <p className="ajuste-pista">{tr('El modo compacto esconde carátulas y sinopsis: cabe el triple de títulos en pantalla.', 'Compact mode hides covers and synopses: three times as many titles fit on screen.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-densidad">
                  <button className="chip-btn" role="radio" aria-checked={!compacto} onClick={() => { if (compacto) alternaCompacto() }}>{tr('Completa', 'Full')}</button>
                  <button className="chip-btn" role="radio" aria-checked={compacto} onClick={() => { if (!compacto) alternaCompacto() }}>{tr('Compacta', 'Compact')}</button>
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-spoilers">{tr('Spoilers', 'Spoilers')}</h3>
                  <p className="ajuste-pista">{tr('Sin spoilers esconde la sinopsis, las escenas post-créditos y los títulos de episodio de lo que aún no has visto. En cada ficha puedes mostrarlos a mano.', 'No spoilers hides the synopsis, post-credit scenes and episode titles of what you haven’t watched yet. Each title lets you show them by hand.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-spoilers">
                  <button className="chip-btn" role="radio" aria-checked={!sinSpoilers} onClick={() => ponSinSpoilers(false)}>{tr('Todo visible', 'Show everything')}</button>
                  <button className="chip-btn" role="radio" aria-checked={sinSpoilers} onClick={() => ponSinSpoilers(true)}>{tr('Sin spoilers', 'No spoilers')}</button>
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-orden">{tr('Orden', 'Order')}</h3>
                  <p className="ajuste-pista">{tr('Dentro de cada era. El cronológico es el orden del maratón; los otros dos reordenan por nota.', 'Within each era. Chronological is the marathon order; the other two sort by rating.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-orden">
                  {[['crono', tr('Cronológico', 'Chronological')], ['imdb', tr('Nota IMDb', 'IMDb rating')], ['nota', tr('Tu nota', 'Your rating')]].map(([id, nombre]) => (
                    <button key={id} className="chip-btn" role="radio" aria-checked={orden === id} onClick={() => setOrden(id)}>{nombre}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-fondo">{tr('Fondo del encabezado', 'Header background')}</h3>
                  <p className="ajuste-pista">{tr('El banner usa el fotograma del próximo estreno, así que se renueva solo. El muro son tus carátulas.', 'The banner uses the next premiere’s still, so it refreshes itself. The wall is your covers.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-fondo">
                  {FONDOS.map(f => (
                    <button key={f.id} className="chip-btn" role="radio" aria-checked={fondo === f.id} onClick={() => ponFondo(f.id)}>{tr(f.nombre, f.en || f.nombre)}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-tema">{tr('Tema', 'Theme')}</h3>
                  <p className="ajuste-pista">{tr('Pergamino y tinta, o azul noche. Por defecto sigue al sistema y cambia con él; la pantalla de arranque de la app instalada siempre sigue al sistema.', 'Parchment and ink, or midnight blue. By default it follows your system and switches with it; the installed app’s launch screen always follows the system.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-tema">
                  {TEMAS.map(t => (
                    <button key={t.id} className="chip-btn" role="radio" aria-checked={tema === t.id} onClick={() => setTema(t.id)}>{tr(t.nombre, t.en || t.nombre)}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo" id="aj-acento">{tr('Color de acento', 'Accent color')}</h3>
                  <p className="ajuste-pista">{tr('Cambia el color que la app usa para destacar. No cambia el tema claro u oscuro, que se elige arriba.', 'Changes the color the app uses for highlights. It doesn’t change the light or dark theme, which you pick above.')}</p>
                </div>
                <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-acento">
                  {ACENTOS.map(a => (
                    <button key={a.id} className="chip-btn acento-chip" role="radio" aria-checked={acento === a.id} onClick={() => setAcento(a.id)}>
                      {/* el color que se elige, a la vista: antes eran solo nombres */}
                      <span className="acento-muestra" style={{ '--am': a.c }} aria-hidden="true" />{tr(a.nombre, a.en || a.nombre)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">{tr('Sincronización entre dispositivos', 'Sync between devices')}</h3>
                  <p className="ajuste-pista">
                    {cuenta ? tr('Tu cuenta de Google ya se encarga de esto. Esta opción queda como alternativa sin cuenta, con tu propia base de datos.', 'Your Google account already handles this. This option remains as the no-account alternative, with your own database.')
                      : syncEstado === 'ok' ? ui(pais, 'Activa y al día. Tu progreso viaja entre el móvil y el ordenador.', 'On and up to date. Your progress travels between your phone and your computer.')
                      : syncEstado === 'syncing' ? tr('Guardando cambios…', 'Saving changes…')
                      : syncEstado === 'error' ? tr('Activa, pero ahora mismo sin conexión. Se reintenta al volver a la app.', 'On, but offline right now. It retries when you come back.')
                      : tr('Apagada. Tu progreso vive solo en este navegador.', 'Off. Your progress lives only in this browser.')}
                  </p>
                </div>
                <div className="ajuste-ops">
                  <button className={`chip-btn sync-btn ${syncEstado}`} onClick={() => { setAjustes(false); setSyncModal(true) }}>
                    {sync ? tr('Configurar', 'Configure') : tr('Activar', 'Turn on')}
                  </button>
                </div>
              </div>

              <Datos onReset={() => {
                // borra también los episodios (la pista decía «lo visto» y las
                // series seguían con «5/26 ep») y se puede deshacer 10 s
                const copia = { v: vistas, e: eps, l: lecturas }
                setVistas({}); setEps({}); setLecturas({}); setPlegadas({})
                try { localStorage.setItem(KEY, '{}'); localStorage.setItem(KEY_EPS, '{}'); localStorage.removeItem(KEY_PLEGADAS) } catch {}
                ofreceDeshacer(tr('Progreso borrado', 'Progress erased'), () => {
                  setVistas(copia.v); setEps(copia.e); setLecturas(copia.l)
                  try { localStorage.setItem(KEY, JSON.stringify(copia.v)); localStorage.setItem(KEY_EPS, JSON.stringify(copia.e)) } catch {}
                }, 10000)
              }} />

              <Biblioteca archivos={archivos} onQuitar={async id => { try { await borraArchivo(id) } catch {} recargaBiblioteca(); setLecturas(l => { if (!(id in l)) return l; const c = { ...l }; delete c[id]; return c }) }} />
              {!YA_INSTALADA && (ES_IOS || instalable) && (
                <div className="ajuste">
                  <div className="ajuste-cab">
                    <h3 className="ajuste-titulo">{tr('Como app', 'As an app')}</h3>
                    <p className="ajuste-pista">
                      {ES_IOS
                        ? tr('En Safari: botón Compartir y «Añadir a pantalla de inicio». La guía queda a pantalla completa, con su icono.', 'In Safari: Share button, then “Add to Home Screen”. The guide goes full screen, with its own icon.')
                        : tr('Instálala y la guía tendrá su propia ventana y su icono, sin el navegador alrededor.', 'Install it and the guide gets its own window and icon, without the browser around it.')}
                    </p>
                  </div>
                  {!ES_IOS && (
                    <div className="ajuste-ops">
                      <button className="chip-btn" onClick={instalar}>{tr('Instalar', 'Install')}</button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      {planMontado && plan && (
        <div className={'overlay' + planSale} ref={refPlan} tabIndex={-1} onClick={() => setPlanModal(false)} role="dialog" aria-modal="true" aria-label={tr('Plan de sesión', 'Session plan')}>
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPlanModal(false)} aria-label={tr('Cerrar', 'Close')}>✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">{tr('Plan de sesión', 'Session plan')}</h2>
              <p className="modal-res">{tr('¿Cuánto tiempo tienes hoy? Te propongo qué ver siguiendo el orden del maratón.', 'How much time do you have today? I’ll suggest what to watch following the marathon order.')}</p>
              <div className="plan-controles">
                {[1, 2, 3, 4].map(h => (
                  <button key={h} className="chip-btn" aria-pressed={planHoras === h}
                    onClick={() => setPlanHoras(h)}>{h} h</button>
                ))}
                <button className="chip-btn destacado" aria-pressed={planExpress}
                  onClick={() => setPlanExpress(x => !x)}>{tr('Solo ruta express', 'Express route only')}</button>
              </div>
              {plan.items.length === 0 ? (
                <p className="modal-res">{tr('Nada pendiente encaja en ese tiempo', 'Nothing pending fits in that time')}{planExpress ? tr(' dentro de la ruta express', ' within the express route') : ''}{tr('. Prueba con más horas o quita el filtro.', '. Try more hours or remove the filter.')}</p>
              ) : (
                <div className="plan-lista">
                  {plan.items.map(({ item, c, nEps, min, desde }) => (
                    <button key={item.id} className="ep plan-fila"
                      onClick={() => { setPlanModal(false); setDetalle({ item, c, esComic: false }) }}>
                      <span className="plan-cover"><Portada item={item} c={c} esComic={false} /></span>
                      <span className="ep-info">
                        <span className="ep-titulo">{item.t}</span>
                        <span className="ep-fecha">
                          {nEps
                            ? tr(`${nEps} capítulo${nEps > 1 ? 's' : ''} desde T${desde.s}·E${desde.n} · ~${fmtDur(min)}`, `${nEps} episode${nEps > 1 ? 's' : ''} from S${desde.s}·E${desde.n} · ~${fmtDur(min)}`)
                            : tr(`Completa · ${fmtDur(min)}`, `In full · ${fmtDur(min)}`)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {plan.items.length > 0 && (
                <p className="plan-total">{tr('Total del plan: ', 'Plan total: ')}<b>{fmtDur(plan.total)}</b>{tr(` de ${planHoras} h disponibles`, ` of ${planHoras} h available`)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {horarioMontado && (
        <HorarioModal saliendo={horarioSale} horario={horario} onGuardar={guardaHorario}
          vistas={vistas} eps={eps} onClose={() => setHorarioModal(false)} />
      )}

      {syncMontado && (
        <SyncModal saliendo={syncSale} pais={pais} sync={sync} estado={syncEstado}
          onActivar={activarSync} onDesactivar={desactivarSync}
          onClose={() => setSyncModal(false)} />
      )}

      {detalleMontado && (
        <Detalle d={ultimoDetalle.current} vista={!!vistas[ultimoDetalle.current.item.id]} pais={pais} idioma={idioma} sinSpoilers={sinSpoilers}
          onLeer={(item, registro) => setLector({ item, registro })} lectura={lecturas[ultimoDetalle.current.item.id]}
          onOlvida={id => setLecturas(l => { if (!(id in l)) return l; const c = { ...l }; delete c[id]; return c })}
          onBiblioteca={recargaBiblioteca}
          onToggle={() => toggle(ultimoDetalle.current.item.id)}
          onClose={cierraFicha}
          eps={eps} toggleEp={toggleEp} marcaTemporada={marcaTemporada}
          nota={notas[ultimoDetalle.current.item.id] || {}}
          ponNota={(campo, valor) => ponNota(ultimoDetalle.current.item.id, campo, valor)}
          listas={listas} toggleEnLista={toggleEnLista} club={club} onNav={navegaDetalle}
          onIrA={abreDesdeFicha} personaPendiente={personaPendiente} saliendo={detalleSale}
          onForo={NUBE ? () => setForoAbierto({ tipo: 'titulo', id: ultimoDetalle.current.item.id }) : null} />
      )}
      {/* la conversación se abre encima de la ficha y de la comunidad, y un
          perfil encima de todo: por eso van después en el DOM */}
      {foroMontado && NUBE && (
        <ForoHoja key={`${foroUltimo.current.tipo}:${foroUltimo.current.id}`} saliendo={foroSale} foro={foroUltimo.current}
          cuenta={cuentaLista ? cuenta : null} token={tokenCuenta} vistas={vistas} eps={eps} recarga={recargaComunidades}
          onCerrar={() => setForoAbierto(null)} onAbrirHilo={id => setHiloAbierto(id)} onCreado={() => setRecargaComunidades(n => n + 1)}
          onEntrar={() => { setForoAbierto(null); setAjustes(true) }} />
      )}
      {hiloMontado && NUBE && (
        <HiloHoja key={hiloUltimo.current} saliendo={hiloSale} id={hiloUltimo.current}
          cuenta={cuentaLista ? cuenta : null} token={tokenCuenta} vistas={vistas} eps={eps}
          onCerrar={() => setHiloAbierto(null)} onVerPerfil={n => setPerfilPublico(n)} onCambio={() => setRecargaComunidades(n => n + 1)}
          onEntrar={() => { setHiloAbierto(null); setAjustes(true) }} />
      )}
      {perfilPubMontado && NUBE && (
        <PerfilPublico key={perfilPubUltimo.current} saliendo={perfilPubSale} nombre={perfilPubUltimo.current} cuenta={cuentaLista ? cuenta : null}
          token={tokenCuenta} onCerrar={() => setPerfilPublico(null)}
          onEntrar={() => { setPerfilPublico(null); setAjustes(true) }} />
      )}

      <Footer onAjustes={() => setAjustes(true)} nota={enMaraton} />
      <VersionNueva />
      <Deshacer aviso={deshacer} onCerrar={() => setDeshacer(null)} />
      <LogroAviso aviso={logroAviso} onCerrar={() => setLogroAviso(null)}
        onIr={() => { if (detalle) setDetalle(null); if (vista !== 'stats') conTransicion('adelante', () => setVista('stats')) }} />
      {(vista === 'crono' || vista === 'comics' || vista === 'animacion') && createPortal(
        <DondeEstoy version={`${vista}|${Object.keys(vistas).length}|${Object.keys(eps).length}|${JSON.stringify(filtros)}|${buscaLenta}|${idioma}|${pais}`}
          siguiente={stats.siguiente ? { id: stats.siguiente.id, t: stats.siguiente.t } : null}
          onPrepara={id => {
            const cambia = vista !== 'crono'
            if (cambia) setVista('crono')
            return despliegaPara(id) || cambia
          }} />,
        document.body
      )}
    </div>
  )
}

function SyncModal({ sync, estado, onActivar, onDesactivar, onClose, pais, saliendo }) {
  const [modo, setModo] = useState(sync ? 'activo' : 'menu')
  const [url, setUrl] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const ref = useRef(null)
  useDialogo(ref, onClose)
  const crear = async () => {
    const u = normalizaDbUrl(url)
    if (!u) { setError(tr('Esa URL no parece de Firebase (debe terminar en firebaseio.com o firebasedatabase.app).', 'That URL doesn’t look like Firebase (it must end in firebaseio.com or firebasedatabase.app).')); return }
    setError('')
    const ok = await onActivar(u, null)
    if (ok) setModo('activo')
    else setError(tr('No se pudo escribir en la base de datos. Revisa que las reglas permitan lectura y escritura.', 'Could not write to the database. Check that the rules allow read and write.'))
  }
  const unirse = async () => {
    const conf = decodificaSync(codigo)
    if (!conf) { setError(tr('Código no válido.', 'Invalid code.')); return }
    setError('')
    const ok = await onActivar(conf.url, conf.room)
    if (ok) setModo('activo')
    else setError(tr('No se pudo conectar con ese código.', 'Could not connect with that code.'))
  }
  const copiarCodigo = () => {
    if (!sync) return
    navigator.clipboard.writeText(codigoSync(sync.url, sync.room)).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    })
  }
  return (
    <div className={'overlay' + (saliendo || '')} ref={ref} tabIndex={-1} onClick={onClose} role="dialog" aria-modal="true" aria-label={tr('Sincronización', 'Sync')}>
      <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onClose} aria-label={tr('Cerrar', 'Close')}>✕</button>
        <div className="modal-info">
          <h2 className="modal-titulo">{tr('Sincronización entre dispositivos', 'Sync between devices')}</h2>
          {modo === 'activo' && sync ? (
            <>
              <p className="modal-res">
                {tr('Tu progreso se guarda en tu base de datos de Firebase y se actualiza solo (al momento en este dispositivo; cada pocos segundos en los demás). Estado: ', 'Your progress is saved in your Firebase database and updates itself (instantly on this device; every few seconds on the others). Status: ')}
                <b>{estado === 'ok' ? tr('conectado', 'connected') : estado === 'error' ? tr('sin conexión', 'offline') : tr('guardando…', 'saving…')}</b>
              </p>
              <p className="modal-res">{ui(pais, 'Para conectar otro dispositivo (el móvil, por ejemplo), abre allí la web, pulsa Sincronizar → «Conectar con un código» y pega este código:', 'To connect another device (your phone, say), open the site there, hit Sync → “Connect with a code” and paste this code:')}</p>
              <div className="sync-codigo">
                <code>{codigoSync(sync.url, sync.room)}</code>
                <button className="chip-btn" onClick={copiarCodigo}>{copiado ? tr('¡Copiado!', 'Copied!') : tr('Copiar', 'Copy')}</button>
              </div>
              <div className="modal-acciones">
                <button className="chip-btn peligro" onClick={() => { onDesactivar(); setModo('menu') }}>
                  {tr('Desconectar este dispositivo', 'Disconnect this device')}
                </button>
              </div>
            </>
          ) : modo === 'crear' ? (
            <>
              <p className="modal-res">{tr('Necesitas una base de datos gratuita de Firebase (2 minutos, una sola vez):', 'You need a free Firebase database (2 minutes, once):')}</p>
              <ol className="sync-pasos">
                <li>{tr(<>Entra en <b>console.firebase.google.com</b> con tu cuenta de Google y crea un proyecto (el nombre da igual).</>, <>Go to <b>console.firebase.google.com</b> with your Google account and create a project (the name doesn’t matter).</>)}</li>
                <li>{tr(<>En el menú: <b>Compilación → Realtime Database → Crear base de datos</b>, elige la zona y el <b>modo de prueba</b>.</>, <>In the menu: <b>Build → Realtime Database → Create database</b>, pick a region and <b>test mode</b>.</>)}</li>
                <li>{tr(<>En la pestaña <b>Reglas</b>, deja lectura y escritura en <code>true</code> y publica.</>, <>In the <b>Rules</b> tab, leave read and write as <code>true</code> and publish.</>)}</li>
                <li>{tr(<>Copia la <b>URL</b> que aparece arriba de la pestaña Datos (algo como <code>https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app</code>) y pégala aquí:</>, <>Copy the <b>URL</b> shown above the Data tab (something like <code>https://your-project-default-rtdb.europe-west1.firebasedatabase.app</code>) and paste it here:</>)}</li>
              </ol>
              <input className="busca sync-input" type="url" name="dburl" placeholder="https://…firebasedatabase.app" spellCheck={false}
                autoComplete="off" aria-label={tr('URL de la base de datos', 'Database URL')} value={url} onChange={e => setUrl(e.target.value)} />
              {error && <p className="import-error">{error}</p>}
              <div className="modal-acciones">
                <button className="accion-principal" onClick={crear}>{tr('Activar sincronización', 'Turn on sync')}</button>
                <button className="chip-btn" onClick={() => { setModo('menu'); setError('') }}>{tr('Volver', 'Back')}</button>
              </div>
            </>
          ) : modo === 'unir' ? (
            <>
              <p className="modal-res">{tr('Pega el código que te dio tu otro dispositivo:', 'Paste the code your other device gave you:')}</p>
              <input className="busca sync-input" name="codigo" placeholder={tr('Código de sincronización', 'Sync code')} spellCheck={false}
                autoComplete="off" aria-label={tr('Código de sincronización', 'Sync code')} value={codigo} onChange={e => setCodigo(e.target.value)} />
              {error && <p className="import-error">{error}</p>}
              <div className="modal-acciones">
                <button className="accion-principal" onClick={unirse}>{tr('Conectar', 'Connect')}</button>
                <button className="chip-btn" onClick={() => { setModo('menu'); setError('') }}>{tr('Volver', 'Back')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-res">{tr('Conecta tus dispositivos para que el progreso se comparta solo, usando tu propia base de datos gratuita de Firebase (tus datos son solo tuyos).', 'Connect your devices so progress shares itself, using your own free Firebase database (your data stays yours).')}</p>
              <div className="modal-acciones">
                <button className="accion-principal" onClick={() => setModo('crear')}>{tr('Soy el primer dispositivo', 'This is my first device')}</button>
                <button className="chip-btn" onClick={() => setModo('unir')}>{tr('Conectar con un código', 'Connect with a code')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// La descripción de la saga, plegada a dos líneas en móvil (CSS) con un
// «Leer más» que solo aparece si de verdad se ha cortado algo.
// Lo que enseña una saga o una era plegada: sus carátulas desfilando solas
// (carrusel continuo: la pista lleva la lista dos veces y se desplaza la
// mitad, así el bucle no se nota), cada una abre su ficha, y debajo una
// línea que dice qué es y cuánto hay. Se para al pasar el ratón o al
// enfocar; con «reducir movimiento» es un carril normal que se desliza.
const MEDIDAS_TIRA = new Map()
function TiraPlegada({ entradas, esComic, onAbrir, desc, detalle, anima }) {
  // Copias suficientes para que el bucle no deje un hueco: la pista se
  // desplaza el ancho de UN lote (--lote), así que hace falta que los demás
  // cubran el carril entero. Una era de 4 títulos a 1.300 px necesita siete.
  const ref = useRef(null)
  // la medida se recuerda por tira y ancho de ventana: al volver a Maratón
  // cada tira se medía otra vez con getBoundingClientRect y forzaba la
  // maquetación de toda la página dentro del cambio de sección (15 ms con la
  // CPU a ×4, 16 sep 2026). El ResizeObserver sigue midiendo, ya sin forzar.
  const claveMedida = `${entradas.map(e => e.item.id).join(',')}|${typeof window !== 'undefined' ? window.innerWidth : 0}`
  const [copias, setCopias] = useState(() => (MEDIDAS_TIRA.get(claveMedida) || { copias: 2 }).copias)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mide = () => {
      const lote = el.querySelector('.tira-lote')
      if (!lote) return
      const w = lote.getBoundingClientRect().width
      if (!w) return
      const n = Math.max(2, Math.ceil(el.clientWidth / w) + 1)
      MEDIDAS_TIRA.set(claveMedida, { w, copias: n })
      el.style.setProperty('--lote', w + 'px')
      setCopias(n)
    }
    const sabida = MEDIDAS_TIRA.get(claveMedida)
    if (sabida) el.style.setProperty('--lote', sabida.w + 'px')
    else mide()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mide)
    ro.observe(el)
    return () => ro.disconnect()
  }, [claveMedida])
  // Varias tiras a la vez cansan y gastan batería: solo se mueve la que está
  // en pantalla, y un toque la para del todo (con el dedo no hay hover).
  const [parada, setParada] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // un data-atributo que React no gestiona: cambiarlo no re-renderiza las
    // copias de la tira ni se pierde cuando React reescribe className
    const io = new IntersectionObserver(([e]) => { el.dataset.fuera = e.isIntersecting ? '' : '1' }, { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  if (!entradas.length) return null
  return (
    <div className={`tira-plegada${anima ? ' anima' : ''}`}>
      <div className={`tira${parada ? ' parada' : ''}`} ref={ref} style={{ '--n': entradas.length }}
        role="group" aria-roledescription={tr('carrusel', 'carousel')} aria-label={tr('Carátulas del bloque', 'Covers in this block')}
        onPointerDown={() => setParada(true)}>
        <div className="tira-pista">
          {Array.from({ length: copias }, (_, copia) => (
            <div className={`tira-lote${copia ? ' tira-copia' : ''}`} key={copia} aria-hidden={copia ? 'true' : undefined}>
              {entradas.map(({ item, c }) => (
                <button key={item.id} type="button" className="tira-item" title={item.t}
                  aria-label={tr(`Abrir ${item.t}`, `Open ${item.t}`)} tabIndex={copia ? -1 : 0}
                  onClick={() => onAbrir(item, c)}>
                  <Portada item={item} c={c} esComic={esComic} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {desc && <p className="tira-desc">{desc}</p>}
      {/* cada dato entero en su línea: se partía «vista» / «entera» */}
      {detalle && <p className="tira-detalle">{detalle.split(' · ').map((d, i) => <React.Fragment key={i}>{i > 0 && ' · '}<span className="sinparto">{d}</span></React.Fragment>)}</p>}
    </div>
  )
}

// «17 títulos · 12 películas · 5 series · 41 h» — el resumen de un bloque plegado
function resumenBloque(items, esComic) {
  const n = items.length
  const min = items.reduce((a, it) => a + (it.d || 0), 0)
  if (esComic) return tr(`${n} cómic${n === 1 ? '' : 's'}`, `${n} comic${n === 1 ? '' : 's'}`)
  const pel = items.filter(it => it.tipo !== 'serie' && it.tipo !== 'esp').length
  const ser = items.filter(it => it.tipo === 'serie').length
  const esp = items.filter(it => it.tipo === 'esp').length
  const partes = [tr(`${n} título${n === 1 ? '' : 's'}`, `${n} title${n === 1 ? '' : 's'}`)]
  if (pel) partes.push(tr(`${pel} película${pel === 1 ? '' : 's'}`, `${pel} movie${pel === 1 ? '' : 's'}`))
  if (ser) partes.push(tr(`${ser} serie${ser === 1 ? '' : 's'}`, `${ser} series`))
  if (esp) partes.push(tr(`${esp} especial${esp === 1 ? '' : 'es'}`, `${esp} special${esp === 1 ? '' : 's'}`))
  if (min) partes.push(fmtDur(min))
  return partes.join(' · ')
}

// «¿es larga?» se recuerda por texto y ancho: medirla al montar forzaba la
// maquetación de toda la página dentro del cambio de sección (10 ms con la CPU
// a ×4, 16 sep 2026); el ResizeObserver mide igual, tras maquetar, sin forzar
const LARGAS_DESC = new Map()
function DescPlegable({ texto }) {
  const [abierta, setAbierta] = useState(false)
  const claveLarga = `${texto}|${typeof window !== 'undefined' ? window.innerWidth : 0}`
  const [larga, setLarga] = useState(() => !!LARGAS_DESC.get(claveLarga))
  const ref = useRef(null)
  React.useLayoutEffect(() => {
    const p = ref.current
    if (!p) return
    const mide = () => {
      const l = p.scrollHeight > p.clientHeight + 1
      if (!abierta) LARGAS_DESC.set(claveLarga, l)
      setLarga(l)
    }
    // sabida, se copia al estado aquí mismo (antes de pintar): saltarse la
    // medida sin copiarla dejaba «Leer menos» un fotograma sin clase .larga al
    // cerrar, el botón desaparecía y el foco caía al body (code-review)
    if (LARGAS_DESC.has(claveLarga) && !abierta) setLarga(LARGAS_DESC.get(claveLarga))
    else if (!LARGAS_DESC.has(claveLarga)) mide()
    // la caja plegada mide dos líneas con cualquier fuente: hay que volver a
    // medir cuando entra la de verdad, que puede partir el texto distinto
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mide)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mide)
    ro.observe(p)
    return () => ro.disconnect()
  }, [claveLarga, abierta])
  return (
    <div className={`saga-desc-wrap${abierta ? ' abierta' : ''}${larga || abierta ? ' larga' : ''}`}>
      <p className="saga-desc" ref={ref}>{texto}</p>
      <button type="button" className="leer-mas" aria-expanded={abierta} onClick={() => setAbierta(a => !a)}>
        {abierta ? tr('Leer menos', 'Read less') : tr('Leer más', 'Read more')}
      </button>
    </div>
  )
}

function Datos({ onReset }) {
  const [confirmando, setConfirmando] = useState(false)
  const [sonido, setSonido] = useState(() => {
    try { return localStorage.getItem('maraton-marvel-sonido-v1') === '1' } catch { return false }
  })
  const [copiado, setCopiado] = useState(false)
  const [importando, setImportando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [msgImport, setMsgImport] = useState('')
  const [confirmaImport, setConfirmaImport] = useState(null)
  const [confirmaCopia, setConfirmaCopia] = useState(null)
  const [msgCopia, setMsgCopia] = useState('')
  const exportar = () => {
    try {
      const datos = {
        v: JSON.parse(localStorage.getItem(KEY) || '{}'),
        e: JSON.parse(localStorage.getItem(KEY_EPS) || '{}'),
        n: JSON.parse(localStorage.getItem(KEY_NOTAS) || '{}'),
        l: JSON.parse(localStorage.getItem(KEY_LISTAS) || '[]'),
      }
      const cod = btoa(unescape(encodeURIComponent(JSON.stringify(datos))))
      navigator.clipboard.writeText(cod).then(() => {
        setCopiado(true); setTimeout(() => setCopiado(false), 2500)
      })
    } catch {}
  }
  const aplicaImport = datos => {
    if (datos.v) localStorage.setItem(KEY, JSON.stringify(datos.v))
    if (datos.e) localStorage.setItem(KEY_EPS, JSON.stringify(datos.e))
    if (datos.n) localStorage.setItem(KEY_NOTAS, JSON.stringify(datos.n))
    if (datos.l) localStorage.setItem(KEY_LISTAS, JSON.stringify(datos.l))
    window.location.reload()
  }
  const importar = () => {
    let datos
    try {
      datos = JSON.parse(decodeURIComponent(escape(atob(codigo.trim()))))
    } catch { setMsgImport(tr('Código no válido', 'Invalid code')); return }
    if (!datos || typeof datos !== 'object' || (!datos.v && !datos.e && !datos.n && !datos.l)) {
      setMsgImport(tr('Código no válido', 'Invalid code')); return
    }
    // cargar un código REEMPLAZA el progreso: si hay algo que perder, se avisa
    let tengo = 0
    try { tengo = Object.keys(JSON.parse(localStorage.getItem(KEY) || '{}')).length } catch {}
    const traen = Object.keys(datos.v || {}).length
    if (tengo > 0) { setMsgImport(''); setConfirmaImport({ datos, tengo, traen }); return }
    aplicaImport(datos)
  }
  const descargaCopia = () => {
    try {
      const datos = {}
      const claves = [KEY, KEY_EPS, KEY_NOTAS, KEY_LISTAS, KEY_LECTOR, KEY_HORARIO, 'maraton-marvel-sync-v1', 'maraton-marvel-amigo-v1', 'maraton-marvel-club-v1']
      // y lo que se haya apartado por venir roto o por un rescate: es justo lo
      // que no se puede perder. La caché de TMDB no entra, que son megas y se
      // vuelve a bajar sola.
      for (const k of Object.keys(localStorage)) {
        // la sesión de la cuenta (y su cuarentena -roto) NUNCA viaja en la
        // copia: lleva el token de refresco, y una copia se comparte
        if (k.startsWith(KEY_CUENTA)) continue
        if (/^maraton-marvel.*(-roto|-rescate-v1)$/.test(k) && !claves.includes(k)) claves.push(k)
      }
      for (const k of claves) {
        const v = localStorage.getItem(k)
        if (v) datos[k] = v
      }
      const blob = new Blob([JSON.stringify({ app: 'maraton-marvel', fecha: new Date().toISOString(), datos }, null, 1)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `maraton-marvel-copia-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      // revocar en la misma línea podía cortar la descarga (iOS la empieza
      // después); y antes nada decía si había salido bien
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      setMsgCopia(tr(`Copia descargada: ${a.download}`, `Backup downloaded: ${a.download}`))
    } catch {
      setMsgCopia(tr('No se pudo descargar la copia. Prueba «Copiar código».', 'Couldn’t download the backup. Try “Copy code”.'))
    }
  }
  const restauraCopia = ev => {
    const archivo = ev.target.files && ev.target.files[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = () => {
      try {
        const j = JSON.parse(lector.result)
        if (j.app !== 'maraton-marvel' || !j.datos) throw new Error('formato')
        ev.target.value = ''
        // como «Cargar código»: si ya hay progreso, antes de sustituirlo se dice
        // cuánto tienes y cuánto trae el archivo (antes se escribía sin preguntar)
        let tengo = 0, traen = 0
        try { tengo = Object.keys(JSON.parse(localStorage.getItem(KEY) || '{}')).length } catch {}
        try { traen = Object.keys(JSON.parse(j.datos[KEY] || '{}')).length } catch {}
        setMsgCopia('')
        if (tengo > 0) { setConfirmaCopia({ j, tengo, traen }); return }
        aplicaCopia(j)
      } catch {
        ev.target.value = ''
        setMsgImport(tr('Ese archivo no parece una copia de la app', 'That file doesn’t look like a backup from this app'))
        setImportando(true)
      }
    }
    lector.readAsText(archivo)
  }
  const aplicaCopia = j => {
    try {
        Object.entries(j.datos).forEach(([k, v]) => {
          // una copia ajena no debe poder colar una sesión de cuenta (el
          // progreso se subiría al uid del archivo): en la cuenta se entra
          // solo con el botón de Google
          if (k.startsWith(KEY_CUENTA)) return
          if (k.startsWith('maraton-marvel-') || k === KEY) localStorage.setItem(k, v)
        })
        window.location.reload()
    } catch {
      setMsgCopia(tr('No se pudo restaurar la copia.', 'Couldn’t restore the backup.'))
    }
  }
  return (
    <>
      <div className="ajuste">
        <div className="ajuste-cab">
          <h3 className="ajuste-titulo" id="aj-sonido">{tr('Sonido', 'Sound')}</h3>
          <p className="ajuste-pista">{tr('Un toque breve al marcar un título como visto.', 'A short pop when you mark a title as watched.')}</p>
        </div>
        <div className="ajuste-ops" role="radiogroup" aria-labelledby="aj-sonido">
          {[[true, tr('Sí', 'Yes')], [false, 'No']].map(([v, t]) => (
            <button key={t} className="chip-btn" role="radio" aria-checked={sonido === v} onClick={() => {
              if (sonido === v) return
              setSonido(v)
              try { localStorage.setItem('maraton-marvel-sonido-v1', v ? '1' : '0') } catch {}
              if (v) suenaPop.ctx = null
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div className="ajuste">
        <div className="ajuste-cab">
          <h3 className="ajuste-titulo">{tr('Tu progreso', 'Your progress')}</h3>
          <p className="ajuste-pista">{tr('Un código para llevar lo visto a otro navegador, o una copia completa en archivo: progreso, episodios, notas, listas y lecturas.', 'A code to carry your progress to another browser, or a full backup file: progress, episodes, notes, lists and readings.')}</p>
        </div>
        <div className="ajuste-ops">
          <button className="chip-btn" onClick={exportar}>
            {copiado ? tr('¡Copiado!', 'Copied!') : tr('Copiar código', 'Copy code')}
          </button>
          <button className="chip-btn" onClick={() => { setImportando(i => !i); setMsgImport('') }}>
            {importando ? tr('Cancelar', 'Cancel') : tr('Cargar código', 'Load code')}
          </button>
          <button className="chip-btn" onClick={descargaCopia}>{tr('Descargar copia', 'Download backup')}</button>
          <label className="chip-btn restaurar">
            {tr('Restaurar copia', 'Restore backup')}
            <input type="file" accept="application/json,.json" onChange={restauraCopia} aria-label={tr('Restaurar copia de seguridad', 'Restore backup')} />
          </label>
        </div>
        {importando && (
          <span className="importar">
            <input className="busca" name="codigo-progreso" placeholder={tr('Pega el código aquí', 'Paste the code here')} spellCheck={false} autoComplete="off"
              aria-label={tr('Código de progreso', 'Progress code')} value={codigo} onChange={e => setCodigo(e.target.value)} />
            <button className="chip-btn" onClick={importar}>{tr('Cargar', 'Load')}</button>
            {msgImport && <span className="import-error">{msgImport}</span>}
          </span>
        )}
        {msgCopia && <p className="ajuste-pista" role="status">{msgCopia}</p>}
        {confirmaCopia && (
          <div className="aviso peligro" role="alertdialog" aria-label={tr('Confirmar restaurar copia', 'Confirm restoring backup')}>
            <p className="aviso-texto">
              {tr(<>Restaurar esta copia <b>sustituye</b> tu progreso: pasarías de{' '}
              <b>{confirmaCopia.tengo} título{confirmaCopia.tengo === 1 ? '' : 's'}</b> a{' '}
              <b>{confirmaCopia.traen} título{confirmaCopia.traen === 1 ? '' : 's'}</b>
              {confirmaCopia.j.fecha ? ` (copia del ${new Date(confirmaCopia.j.fecha).toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}.</>,
              <>Restoring this backup <b>replaces</b> your progress: you’d go from{' '}
              <b>{confirmaCopia.tengo} title{confirmaCopia.tengo === 1 ? '' : 's'}</b> to{' '}
              <b>{confirmaCopia.traen} title{confirmaCopia.traen === 1 ? '' : 's'}</b>
              {confirmaCopia.j.fecha ? ` (backup from ${new Date(confirmaCopia.j.fecha).toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}.</>)}
              {confirmaCopia.traen < confirmaCopia.tengo && tr(' Esto no se puede deshacer: descarga antes una copia si quieres conservarlo.', ' This can’t be undone: download a backup first if you want to keep it.')}
            </p>
            <div className="aviso-acciones">
              <button className="chip-btn peligro" onClick={() => aplicaCopia(confirmaCopia.j)}>
                {tr('Sí, restaurar la copia', 'Yes, restore the backup')}
              </button>
              <button className="chip-btn" onClick={() => setConfirmaCopia(null)}>{tr('Cancelar', 'Cancel')}</button>
            </div>
          </div>
        )}
        {confirmaImport && (
          <div className="aviso peligro" role="alertdialog" aria-label={tr('Confirmar carga de progreso', 'Confirm loading progress')}>
            <p className="aviso-texto">
              {tr(<>Cargar este código <b>sustituye</b> tu progreso: pasarías de{' '}
              <b>{confirmaImport.tengo} título{confirmaImport.tengo === 1 ? '' : 's'}</b> a{' '}
              <b>{confirmaImport.traen} título{confirmaImport.traen === 1 ? '' : 's'}</b>.</>, <>Loading this code <b>replaces</b> your progress: you’d go from{' '}
              <b>{confirmaImport.tengo} title{confirmaImport.tengo === 1 ? '' : 's'}</b> to{' '}
              <b>{confirmaImport.traen} title{confirmaImport.traen === 1 ? '' : 's'}</b>.</>)}
              {confirmaImport.traen < confirmaImport.tengo && tr(' Esto no se puede deshacer: descarga antes una copia si quieres conservarlo.', ' This can’t be undone: download a backup first if you want to keep it.')}
            </p>
            <div className="aviso-acciones">
              <button className="chip-btn peligro" onClick={() => aplicaImport(confirmaImport.datos)}>
                {tr('Sí, sustituir mi progreso', 'Yes, replace my progress')}
              </button>
              <button className="chip-btn" onClick={() => setConfirmaImport(null)}>{tr('Cancelar', 'Cancel')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="ajuste">
        <div className="ajuste-cab">
          <h3 className="ajuste-titulo">{tr('Empezar de cero', 'Start over')}</h3>
          <p className="ajuste-pista">{tr('Borra lo visto (títulos y episodios) y las lecturas de este navegador; durante unos segundos se puede deshacer. Las notas, las listas y los ajustes se quedan.', 'Erases watched titles, episodes and readings from this browser; you can undo it for a few seconds. Notes, lists and settings stay.')}</p>
        </div>
        <div className="ajuste-ops">
          <button className="chip-btn" onClick={() => setConfirmando(c => !c)}>
            {confirmando ? tr('Cancelar', 'Cancel') : tr('Reiniciar progreso', 'Reset progress')}
          </button>
          {confirmando && (
            <button className="chip-btn peligro" onClick={() => { onReset(); setConfirmando(false) }}>
              {tr('¿Seguro? Sí, borrar todo', 'Sure? Yes, erase it all')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// El pie de cada vista: la nota de uso, los créditos obligatorios de TMDB y,
// si hace falta, el rescate del progreso. Las herramientas de datos viven en
// Ajustes (Datos); aquí solo queda el camino hasta ellas.
// la nota de uso habla de tarjetas y de la Ruta express: solo en Maratón
// (en Perfil y Multiverso se leía como relleno); créditos y rescate, siempre
function Footer({ onAjustes, nota = true }) {
  const [rescate, setRescate] = useState(() => {
    try {
      const g = JSON.parse(localStorage.getItem(KEY_RESCATE))
      return g && Date.now() - g.t < 7 * 864e5 ? g : null
    } catch { return null }
  })
  return (
    <footer>
      {nota && <>
      <p className="nota-pie">
        {tr(`Pulsa una tarjeta para ver su ficha completa; la casilla redonda marca vista o pendiente y se guarda en este navegador. Las estrellas son la nota de IMDb y las duraciones de las series son aproximadas. La Ruta express deja solo lo imprescindible para llegar a ${TITULOS.doomsday}.`,
        `Tap a card for its full page; the round box marks watched or pending and saves in this browser. Stars are the IMDb rating and series runtimes are approximate. The Express route keeps only what’s essential to reach ${TITULOS.doomsday}.`)}
      </p>
      <button className="chip-btn pie-ajustes" onClick={onAjustes}>{tr('Copia de seguridad y código', 'Backup and code')}</button>
      </>}
      {rescate && Object.keys(rescate.v || {}).length > 0 && (
        <div className="aviso info en-pie" role="status">
          <p className="aviso-texto">
            {tr(<>La sincronización dejó tu progreso a cero y antes tenías{' '}
            <b>{Object.keys(rescate.v).length} título{Object.keys(rescate.v).length === 1 ? '' : 's'}</b>.
            Se guardó una copia por si fue un accidente.</>, <>Sync left your progress at zero and you had{' '}
            <b>{Object.keys(rescate.v).length} title{Object.keys(rescate.v).length === 1 ? '' : 's'}</b> before.
            A copy was saved in case it was an accident.</>)}
          </p>
          <div className="aviso-acciones">
            <button className="chip-btn destacado" aria-pressed="false" onClick={() => {
              try {
                localStorage.setItem(KEY, JSON.stringify(rescate.v || {}))
                localStorage.setItem(KEY_EPS, JSON.stringify(rescate.e || {}))
                localStorage.setItem(KEY_NOTAS, JSON.stringify(rescate.n || {}))
                localStorage.setItem(KEY_LISTAS, JSON.stringify(rescate.l || []))
                localStorage.removeItem(KEY_RESCATE)
              } catch {}
              window.location.reload()
            }}>{tr('Recuperar ese progreso', 'Recover that progress')}</button>
            <button className="chip-btn" onClick={() => {
              try { localStorage.removeItem(KEY_RESCATE) } catch {}
              setRescate(null)
            }}>{tr('Descartar', 'Dismiss')}</button>
          </div>
        </div>
      )}
      <p className="nota-pie">
        <a href="https://github.com/Ssebv/maraton-marvel/issues" target="_blank" rel="noopener noreferrer">
          {tr('¿Un fallo o una idea? Cuéntalo en GitHub', 'Found a bug or have an idea? Tell me on GitHub')}
        </a>
      </p>
      <p className="nota-pie nota-creditos">
        {tr(<>Carátulas, fotogramas, tráilers y reparto de <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>;
        este producto usa su API pero no está avalado ni certificado por TMDB.
        La disponibilidad por plataforma y sus logos vienen de <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a> a través de TMDB.</>, <>Covers, stills, trailers and cast from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>;
        this product uses their API but is not endorsed or certified by TMDB.
        Platform availability and logos come from <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a> via TMDB.</>)}
      </p>
    </footer>
  )
}
