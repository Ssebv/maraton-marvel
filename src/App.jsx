import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DATA, ESTRENOS, JOYA_MIN, KEY, MULTIVERSO } from './data.js'
import { POSTERS } from './posters.js'
import { PEOPLE } from './people.js'
import { EPISODES } from './episodes.js'
import { TMDB, TMDB_KEY } from './tmdb.js'
import { ORDEN_CONGELADO } from './orden.js'

const KEY_EPS = 'maraton-marvel-eps-v1'
const KEY_SYNC = 'maraton-marvel-sync-v1'
const KEY_NOTAS = 'maraton-marvel-notas-v1'
const KEY_COMPACTO = 'maraton-marvel-compacto'
const KEY_LISTAS = 'maraton-marvel-listas-v1'
const KEY_PANEL = 'maraton-marvel-panel-v1'
const KEY_FONDO = 'maraton-marvel-fondo-v1'
const KEY_RESCATE = 'maraton-marvel-rescate-v1'

// Pósters propios (public/mini, 200 px) para el fondo del encabezado y las franjas de saga
const MURO = ['avengers1', 'endgame', 'logan', 'deadpool1', 'cap1', 'blackpanther',
  'dofp', 'first-class', 'drstrange', 'infinitywar', 'thor1', 'capmarvel']
// Un fotograma apaisado por saga (TMDB): recortar pósters verticales en una
// banda daba fragmentos sueltos que parecían un error de maquetación.
const FRANJA = ['xmen', 'ucm', 'comics', 'animacion']
const FONDOS = [
  { id: 'banner', nombre: 'Banner' },
  { id: 'muro', nombre: 'Muro' },
  { id: 'no', nombre: 'Sin fondo' },
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
// { id: { p: 1-5, txt: "\u2026" } }
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
  if (personaMem[tmdbId]) return personaMem[tmdbId]
  const ls = 'maraton-marvel-persona-v3:' + tmdbId
  try {
    const g = JSON.parse(localStorage.getItem(ls))
    if (g && Date.now() - g.t < 30 * 864e5) { personaMem[tmdbId] = g.d; return g.d }
  } catch {}
  const j = await tmdbJson(`/person/${tmdbId}?append_to_response=combined_credits`)
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
  personaMem[tmdbId] = d
  try { localStorage.setItem(ls, JSON.stringify({ t: Date.now(), d })) } catch {}
  return d
}

async function tmdbJson(ruta) {
  const r = await fetch(`https://api.themoviedb.org/3${ruta}${ruta.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=es-ES`)
  if (!r.ok) throw new Error('tmdb ' + r.status)
  return r.json()
}
// Subir la versión de la caché deja atrás ~106 entradas por usuario; se barren
// una vez para no dejarle megas muertos en el navegador.
try {
  for (const k of Object.keys(localStorage)) {
    if (/^maraton-marvel-tmdb-v[0-7]:/.test(k)) localStorage.removeItem(k)
  }
} catch {}
async function cargaTmdb(itemId) {
  if (tmdbMem[itemId]) return tmdbMem[itemId]
  const m = TMDB[itemId]
  if (!m) return null
  const claveLS = 'maraton-marvel-tmdb-v8:' + itemId
  try {
    const g = JSON.parse(localStorage.getItem(claveLS))
    if (g && Date.now() - g.t < 7 * 864e5) { tmdbMem[itemId] = g.d; return g.d }
  } catch {}
  const [tid, tipo] = m
  const base = await tmdbJson(`/${tipo}/${tid}?append_to_response=videos,watch/providers,${tipo === 'tv' ? 'aggregate_credits' : 'credits'}`)
  const vids = (base.videos && base.videos.results) || []
  const tr = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
    || vids.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || vids.find(v => v.site === 'YouTube' && v.type === 'Teaser')
  const es = base['watch/providers'] && base['watch/providers'].results && base['watch/providers'].results.ES
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
    prov: ((es && es.flatrate) || [])
      .filter(p => p && typeof p.provider_name === 'string')
      .map(p => ({ n: p.provider_name, l: typeof p.logo_path === 'string' ? p.logo_path : null }))
      .slice(0, 4),
    eps: {},
  }
  if (tipo === 'tv' && EPISODES[itemId]) {
    const temporadas = [...new Set(EPISODES[itemId].map(e => e.s))]
    for (const t of temporadas) {
      try {
        const sd = await tmdbJson(`/tv/${tid}/season/${t}`)
        ;(sd.episodes || []).forEach(ep => {
          d.eps[`${t}:${ep.episode_number}`] = { im: ep.still_path || null, o: ep.overview || null }
        })
      } catch {}
    }
  }
  tmdbMem[itemId] = d
  try { localStorage.setItem(claveLS, JSON.stringify({ t: Date.now(), d })) } catch {}
  return d
}
function useTmdb(item) {
  const [extra, setExtra] = useState(() => tmdbMem[item.id] || null)
  useEffect(() => {
    let vivo = true
    cargaTmdb(item.id).then(d => { if (vivo && d) setExtra(d) }).catch(() => {})
    return () => { vivo = false }
  }, [item.id])
  return extra
}

// «Thwip» sutil al marcar (solo si el usuario lo activa en el pie)
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
const ACENTOS = [
  { id: '616', nombre: 'Tierra-616' },
  { id: 'xmen', nombre: 'X-Men' },
  { id: 'tva', nombre: 'La TVA' },
  { id: 'zombi', nombre: 'Zombi' },
  { id: '828', nombre: '4 Fantásticos' },
]

// Nueve pestañas eran nueve destinos planos, pero seis de ellas son formas
// de mirar el mismo catálogo. Arriba quedan tres; el resto pasa a ser un
// selector dentro de cada uno. Los ids de vista y el hash no cambian: los
// enlaces antiguos siguen abriendo lo que abrían.
const DESTINOS = [
  { id: 'maraton', label: 'Maratón', vistas: ['crono', 'estreno', 'comics', 'animacion', 'galeria', 'tiempo'] },
  { id: 'mio', label: 'Mío', vistas: ['listas', 'stats'] },
  { id: 'multiverso', label: 'Multiverso', vistas: ['multiverso'] },
]
const destinoDe = v => (DESTINOS.find(d => d.vistas.includes(v)) || DESTINOS[0]).id

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'the', 'of', 'a', 'al', 'un', 'una'])

function iniciales(t) {
  const palabras = t.split(/[\s:·(]+/).filter(w => w && !STOP.has(w.toLowerCase()))
  return palabras.slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function fmtDur(d) {
  if (!d) return ''
  if (d >= 600) return `~${Math.round(d / 60)} h`
  const h = Math.floor(d / 60), m = d % 60
  if (!h) return `${m} min`
  return `${h} h${m ? ` ${m} min` : ''}`
}

const limpiaNombre = n => n.replace(/ \((voz|creador|creadora|showrunner|creadores)\)$/, '')
const VISTAS_VALIDAS = ['crono', 'estreno', 'comics', 'animacion', 'stats', 'galeria', 'multiverso', 'listas', 'tiempo']
const PESTANAS = [
  { id: 'crono', label: 'Cronológico' },
  { id: 'estreno', label: 'Por estreno' },
  { id: 'comics', label: 'Cómics' },
  { id: 'animacion', label: 'Animación' },
  { id: 'listas', label: 'Listas' },
  { id: 'galeria', label: 'Galería' },
  { id: 'multiverso', label: 'Multiverso' },
  { id: 'tiempo', label: 'Línea temporal' },
  { id: 'stats', label: 'Estadísticas' },
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
const urlTrailer = t => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' tráiler español')}`
const urlImdb = t => `https://www.imdb.com/find/?q=${encodeURIComponent(t)}`
const urlPersona = n => `https://www.imdb.com/find/?q=${encodeURIComponent(limpiaNombre(n))}&s=nm`

function Cover({ item, c, esComic }) {
  const [c1, c2] = c
  const gid = `g-${item.id}`
  return (
    <svg className="cover" viewBox="0 0 120 180" role="img" aria-label={`Carátula de ${item.t}`}>
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
        {esComic ? 'CÓMIC' : item.tipo === 'serie' ? 'SERIE' : item.tipo === 'esp' ? 'ESPECIAL' : 'PELÍCULA'}
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
        <div className="cover logo-cover" role="img" aria-label={`Carátula de ${item.t}`}
          style={{ background: `linear-gradient(160deg, ${c[0]}, ${c[1]})` }}>
          <img src={src} alt="" onError={() => setErr(true)} />
          <span className="lc-year">{item.r}</span>
          <span className="lc-tipo">
            {esComic ? 'CÓMIC' : item.tipo === 'serie' ? 'SERIE' : item.tipo === 'esp' ? 'ESPECIAL' : 'PELÍCULA'}
          </span>
        </div>
      )
    }
    return (
      <div className="cover keyart" role="img" aria-label={`Carátula de ${item.t}`}>
        <img src={src} alt="" onError={() => setErr(true)} />
        <span className="ka-sombra" style={{ '--ka': c[0] }} />
        <span className="lc-year">{item.r}</span>
        <span className="lc-tipo">
          {item.tipo === 'serie' ? 'SERIE' : item.tipo === 'esp' ? 'ESPECIAL' : 'PELÍCULA'}
        </span>
      </div>
    )
  }
  return (
    <img className="cover foto" src={src} alt={`Póster de ${item.t}`}
      loading="lazy"
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
    <path d="M2.5 8.5l3.5 3.5 7-8" fill="none" stroke="#fff" strokeWidth="2.5"
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
  ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  : null

function FichaPersona({ nombre, rol, papel, tmdbId, onVolver, onAbrirTitulo, itemActualId, tituloActual }) {
  const [datos, setDatos] = useState(() => (tmdbId && personaMem[tmdbId]) || null)
  const [fallo, setFallo] = useState(false)
  const [masBio, setMasBio] = useState(false)
  useEffect(() => {
    let vivo = true
    setFallo(false)
    if (tmdbId) cargaPersona(tmdbId)
      .then(d => { if (vivo) setDatos(d) })
      .catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [tmdbId])

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
        <IcoAtras />{tituloActual ? `Volver a ${tituloActual}` : 'Volver a la ficha'}
      </button>
      <div className="pf-cabecera">
        <Avatar nombre={nombre} grande />
        <div className="pf-titulos">
          <h3 className="pf-nombre">{nombre}</h3>
          {papel
            ? <p className="pf-papel">Interpreta a <b>{papel}</b></p>
            : <p className="pf-papel pf-papel-rol">{rol}</p>}
          {datos && (datos.nacimiento || datos.lugar) && (
            <p className="pf-datos">
              {datos.nacimiento ? new Date(datos.nacimiento + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              {datos.nacimiento && datos.lugar ? ' · ' : ''}{datos.lugar || ''}
            </p>
          )}
        </div>
      </div>

      {bioCorta
        ? <p className="pf-bio">{bioCorta}{bio.length > 420 && (
            <button className="pf-mas" onClick={() => setMasBio(v => !v)}>{masBio ? 'Menos' : 'Leer más'}</button>
          )}</p>
        : <p className="pf-bio pf-vacia">
            {!tmdbId ? 'No hay ficha de esta persona en TMDB.'
              : fallo ? 'No se pudo cargar su biografía. Comprueba tu conexión.'
              : datos ? 'TMDB no tiene biografía en español de esta persona.'
              : 'Cargando su biografía…'}
          </p>}

      {tambienEn.length > 0 && (
        <div className="pf-tambien">
          <h4 className="pf-sub">También en tu maratón ({tambienEn.length})</h4>
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

function CuentaAtras({ meta }) {
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
            <span className="cuenta-label">Próximo gran estreno</span>
            <span className="cuenta-titulo">{objetivo.t}</span>
            <span className="cuenta-fecha">{fmtFecha(objetivo.fecha)} · {objetivo.tipo}</span>
          </div>
      <div className="cuenta-reloj" role="timer">
        <span className="cr-bloque"><b>{cuenta.dias}</b><small>días</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.hh}</b><small>horas</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.mm}</b><small>min</small></span>
        <span className="cr-sep">:</span>
        <span className="cr-bloque"><b>{cuenta.ss}</b><small>seg</small></span>
      </div>
      {meta && (
        <div className="objetivo">
          <span className="objetivo-linea">
            Ruta express: {meta.restante > 0
              ? <>quedan <b>{fmtDur(meta.restante)}</b> · necesitas <b>{meta.necesario} min/día</b></>
              : <b>¡completada! Llegas de sobra al estreno</b>}
          </span>
          {meta.restante > 0 && (
            <span className={`objetivo-chip ${meta.ritmo === 0 ? 'neutro' : meta.alDia ? 'ok' : 'tarde'}`}>
              {meta.ritmo === 0
                ? 'Sin ritmo todavía · marca algo y aquí verás si llegas'
                : meta.alDia
                  ? `Vas al día · ${meta.ritmo} min/día en las últimas 2 semanas`
                  : `Acelera · llevas ${meta.ritmo} min/día en las últimas 2 semanas`}
            </span>
          )}
          {meta.restante > 0 && meta.ritmo > 0 && (() => {
            const fin = new Date(Date.now() + Math.ceil(meta.restante / meta.ritmo) * 86400000)
            const llega = fin <= new Date(objetivo.fecha + 'T00:00:00')
            return (
              <span className="proyeccion">
                A tu ritmo acabarías la ruta express el <b>{fin.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</b>
                {llega ? ' — llegas al estreno' : ' — después del estreno, aprieta un poco'}
              </span>
            )
          })()}
          <button className="chip-btn aviso-btn" onClick={() => descargaIcs(objetivo)}>Al calendario</button>
          <AvisosBtn />
        </div>
      )}
    </div>
  )
}

function Diario({ vistas, notas }) {
  const marcas = useMemo(() => (
    Object.entries(vistas)
      .filter(([id, ts]) => typeof ts === 'number' && ts > 1e12 && TITULOS[id])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
  ), [vistas])
  if (!marcas.length) return null
  return (
    <section className="grafica diario">
      <h3 className="grafica-titulo">Diario del maratón</h3>
      <div className="diario-lista">
        {marcas.map(([id, ts]) => (
          <div className="diario-fila" key={id}>
            <span className="diario-fecha">{new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
            <span className="diario-titulo">{TITULOS[id]}</span>
            {notas[id] && notas[id].p ? <span className="diario-estrellas">{'★'.repeat(notas[id].p)}</span> : null}
          </div>
        ))}
      </div>
      {Object.keys(vistas).length > 30 && <p className="diario-mas">Se muestran tus últimas 30 marcas.</p>}
    </section>
  )
}

// El iPad moderno se anuncia como MacIntel; lo delata el táctil
const ES_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const YA_INSTALADA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  || window.navigator.standalone === true
// Con el dedo, el placeholder dice qué se puede buscar (el atajo «/» no existe)
const ES_TACTIL = !!(window.matchMedia && window.matchMedia('(hover: none)').matches)

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
    ? <span className="aviso-on">Te avisaré cuando algo se estrene</span>
    : <button className="chip-btn aviso-btn" onClick={activar}>Avisarme de estrenos</button>
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
function conciliaAtras() {
  queueMicrotask(() => {
    if (capasAtras.length && !entradaAtras) { history.pushState({ capa: 1 }, ''); entradaAtras = true }
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
  entradaAtras = false
  const capa = capasAtras.pop()
  capa()
  conciliaAtras()
})
function useVolverCierra(abierto, onCerrar) {
  const cierra = useRef(onCerrar)
  cierra.current = onCerrar
  useEffect(() => {
    if (!abierto) return undefined
    const capa = () => cierra.current()
    capasAtras.push(capa)
    conciliaAtras()
    return () => {
      capasAtras = capasAtras.filter(c => c !== capa)
      conciliaAtras()
    }
  }, [abierto])
}

// Lo que aria-modal promete: el foco entra, no se escapa con el tabulador
// y vuelve a su sitio al cerrar. Escrito una vez para todos los diálogos.
const FOCABLES = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
function useDialogo(ref, onEscape, activo = true) {
  const salir = useRef(onEscape)
  salir.current = onEscape
  useEffect(() => {
    if (!activo) return undefined
    const previo = document.activeElement
    const t = setTimeout(() => ref.current && ref.current.focus(), 0)
    document.body.style.overflow = 'hidden'
    const onKey = e => {
      if (e.key === 'Escape') { salir.current && salir.current(); return }
      if (e.key !== 'Tab' || !ref.current) return
      const foco = [...ref.current.querySelectorAll(FOCABLES)].filter(el => el.offsetParent !== null)
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
      document.body.style.overflow = ''
      try { previo && previo.focus() } catch {}
    }
  }, [ref, activo])
}

const TITULOS = Object.fromEntries(DATA.flatMap(s => s.eras.flatMap(e => e.items)).map(i => [i.id, i.t]))

function Bienvenida({ onCerrar, onExpress }) {
  const ref = useRef(null)
  useDialogo(ref, onCerrar)
  return (
    <div className="overlay" ref={ref} tabIndex={-1} onClick={onCerrar}
      role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div className="modal modal-sync bienvenida" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="modal-info">
          <span className="hero-eyebrow">Guía de maratón</span>
          <h2 className="modal-titulo">Todo Marvel y X-Men, en orden</h2>
          <ol className="bienvenida-pasos">
            <li><b>117 títulos en orden cronológico</b> de la historia: la saga X-Men a un lado, el UCM al otro, los cómics en su pestaña — y una bóveda de animación aparte.</li>
            <li><b>Marca lo visto</b> con la casilla redonda de cada tarjeta — o entra en la ficha para episodios, tráiler, sinopsis y escenas post-créditos.</li>
            <li><b>La cuenta atrás de Doomsday</b> te dice el ritmo que necesitas; el Plan de sesión te propone qué ver hoy.</li>
          </ol>
          <div className="bienvenida-acciones">
            <button className="accion-principal" onClick={onCerrar}>Empezar por el principio</button>
            <button className="chip-btn" onClick={onExpress}>Solo lo esencial para Doomsday</button>
          </div>
          <p className="bienvenida-nota">Consejo: desde el móvil puedes instalarla como app (menú del navegador → «Añadir a pantalla de inicio»).</p>
        </div>
      </div>
    </div>
  )
}

// ── Mapa del multiverso: conexiones canónicas título a título ──
const MAPA_NODOS = [
  { id: 'dofp', x: 140, y: 200, c: '#F5B822' },
  { id: 'logan', x: 140, y: 360, c: '#F5B822' },
  { id: 'deadpool2', x: 140, y: 500, c: '#F5B822' },
  { id: 'deadpool3', x: 320, y: 560, c: '#F5B822' },
  { id: 'avengers1', x: 500, y: 70, c: '#E5484D' },
  { id: 'endgame', x: 500, y: 170, c: '#E5484D' },
  { id: 'wandavision', x: 300, y: 200, c: '#E5484D' },
  { id: 'loki1', x: 500, y: 270, c: '#8B5CF6' },
  { id: 'loki2', x: 620, y: 340, c: '#8B5CF6' },
  { id: 'quantumania', x: 380, y: 340, c: '#E5484D' },
  { id: 'mom', x: 300, y: 420, c: '#6FA8DC' },
  { id: 'nwh', x: 500, y: 470, c: '#E5484D' },
  { id: 'sony', x: 500, y: 615, c: '#7A8090' },
  { id: 'marvels', x: 680, y: 200, c: '#E5484D' },
  { id: 'whatif', x: 820, y: 340, c: '#9B7BD8' },
  { id: 'zombies', x: 820, y: 470, c: '#4FB57A' },
  { id: 'ff', x: 680, y: 470, c: '#2E8C7A' },
  { id: 'thunderbolts', x: 680, y: 580, c: '#E5484D' },
  { id: 'doomsday', x: 820, y: 615, c: '#2E8C7A' },
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
            <button className="chip-btn" onClick={() => onAbrir(buscaItem(sel))}>Ver ficha</button>
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
        <p className="mapa-ayuda">Pulsa un título para iluminar sus conexiones con el resto del multiverso.</p>
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
        ...resumenMaraton(deBits(v, ORDEN_IDS), deBits(e, ORDEN_EPS)) })
    }
    return out.sort((a, b) => b.n - a.n || b.min - a.min)
  }, [miembros, vistas, eps, club])
  const total = ID_MARATON.size
  const media = Math.round(filas.reduce((s, f) => s + f.n, 0) / filas.length)
  const medallas = ['🥇', '🥈', '🥉']
  return (
    <section className="duelo club">
      <div className="duelo-cab">
        <h2>Club de maratón <span className="club-sala">· sala {club.sala}</span></h2>
        <button className="chip-btn" onClick={onInvitar}>Invitar</button>
        <button className="chip-btn" onClick={onSalir}>Salir</button>
      </div>
      {filas.map((f, i) => (
        <div className={`duelo-fila${f.yo ? ' yo' : ''}`} key={f.alias}>
          <span className="duelo-nombre">{medallas[i] || `${i + 1}º`} {f.alias}{f.yo ? ' (tú)' : ''}</span>
          <div className="duelo-barra"><i style={{ width: `${Math.round(f.n / total * 100)}%` }} /></div>
          <span className="duelo-datos">{f.n}/{total} · {fmtDur(f.min)}</span>
        </div>
      ))}
      <p className="duelo-veredicto">
        Media del club: <b>{media}/{total}</b> títulos.
        {filas.length < 2 && ' Aún estás solo: pulsa Invitar y comparte el código.'}
      </p>
      <p className="duelo-fecha">Cada miembro publica su avance al marcar; el ranking se refresca solo.</p>
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
      <span className="valoracion-label">Club · {lista.length === 1 ? '1 comentario' : `${lista.length} comentarios`}</span>
      {oculto ? (
        <button className="club-velo" onClick={() => setDesvelado(true)}>
          Aún no lo has visto: pulsa para leer los comentarios del club
        </button>
      ) : lista.map((c, i) => (
        <p className="club-coment" key={i}>
          <b>{c.n}</b> {c.t}
          {c.f > 0 && <span className="club-coment-f">{new Date(c.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>}
        </p>
      ))}
      <div className="club-coment-envio">
        <input className="busca" placeholder="Comenta para el club (sin spoilers gordos 😉)…" autoComplete="off"
          value={txt} maxLength={280} onChange={e => setTxt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') envia() }} />
        <button className="chip-btn" onClick={envia}>Enviar</button>
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
    const vA = esLive ? (saneaMarcas(remoto && remoto.v) || {}) : deBits(amigo.v, ORDEN_IDS)
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
        <h2>Duelo de maratones{esLive && <span className="duelo-live">EN VIVO</span>}</h2>
        <button className="chip-btn" onClick={onQuitar}>Quitar rival</button>
      </div>
      {[['Tú', datos.yo], [amigo.n, datos.el]].map(([quien, r]) => (
        <div className="duelo-fila" key={quien}>
          <span className="duelo-nombre">{quien}</span>
          <div className="duelo-barra"><i style={{ width: `${Math.round(r.n / total * 100)}%` }} /></div>
          <span className="duelo-datos">{r.n}/{total} · {fmtDur(r.min)}</span>
        </div>
      ))}
      <p className="duelo-veredicto">
        {dif === 0
          ? 'Empate técnico: vais exactamente igual.'
          : dif > 0
            ? <>Vas <b>{dif} título{dif > 1 ? 's' : ''}</b> por delante. 🏆</>
            : <>{amigo.n} te saca <b>{-dif} título{dif < -1 ? 's' : ''}</b>: toca acelerar.</>}
        {' '}Habéis visto <b>{datos.comunes}</b> en común.
      </p>
      {datos.soloEl.length > 0 && (
        <p className="duelo-pista">
          {amigo.n} ya vio y tú no: {datos.soloEl.slice(0, 3).map(id => TITULOS[id]).join(' · ')}
          {datos.soloEl.length > 3 ? ` y ${datos.soloEl.length - 3} más` : ''}
        </p>
      )}
      {esLive
        ? <p className="duelo-fecha">{remoto
            ? `Conectado a su sincronización — actualizado ${remoto.t ? 'el ' + new Date(remoto.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ahora'}. Se refresca solo.`
            : 'Conectando con su sincronización…'}</p>
        : amigo.t && <p className="duelo-fecha">Su maratón a fecha de {fmtFecha(new Date(amigo.t).toISOString().slice(0, 10))} — pídele un enlace nuevo para actualizarlo.</p>}
    </section>
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
        if (e.fecha && e.fecha > antes && e.fecha <= hoy) out.push(`${e.t} ya se estrenó`)
      }
      for (const [id, caps] of Object.entries(EPISODES)) {
        if (!seguidas.has(id)) continue
        const nuevos = caps.filter(ep => ep.f && ep.f > antes && ep.f <= hoy).length
        if (nuevos) out.push(`${TITULOS[id] || id}: ${nuevos} episodio${nuevos > 1 ? 's' : ''} nuevo${nuevos > 1 ? 's' : ''}`)
      }
      setLista(out.slice(0, 4))
    } catch {}
  }, [])
  if (!lista.length || cerrado) return null
  return (
    <div className="aviso info novedades" role="status">
      <span><b>Desde tu última visita:</b> {lista.join(' · ')}</span>
      <button className="cerrar" onClick={() => setCerrado(true)} aria-label="Cerrar aviso">✕</button>
    </div>
  )
}

// Un .ics de un evento de día completo: el calendario del sistema lo abre tal
// cual, en iOS y Android igual, sin servidor de por medio.
function descargaIcs(e) {
  const dia = e.fecha.replace(/-/g, '')
  const fin = new Date(new Date(e.fecha + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10).replace(/-/g, '')
  // un salto de línea en una nota partiría el evento en dos propiedades
  const esc = s => String(s || '').replace(/\r?\n/g, ' ').replace(/([,;\\])/g, '\\$1')
  // iCalendar parte las líneas a 75 octetos (no caracteres: las tildes pesan 2)
  const pliega = linea => {
    const out = []; let actual = '', bytes = 0
    for (const ch of linea) {
      const b = new TextEncoder().encode(ch).length
      if (bytes + b > 74) { out.push(actual); actual = ' ' + ch; bytes = 1 + b } else { actual += ch; bytes += b }
    }
    out.push(actual)
    return out.join('\r\n')
  }
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//maraton-marvel//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${dia}-${e.t.replace(/[^\w]/g, '').slice(0, 24)}@maraton-marvel`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${dia}`,
    `DTEND;VALUE=DATE:${fin}`,
    `SUMMARY:${esc('Estreno: ' + e.t)}`,
    `DESCRIPTION:${esc((e.tipo ? e.tipo + '. ' : '') + (e.n || ''))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].map(pliega).join('\r\n')
  const nombre = `estreno-${e.t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.ics`
  // Con el dedo va por la hoja de compartir del sistema: en la app instalada
  // de iOS una descarga por <a download> puede no hacer nada, y sin aviso.
  const archivo = new File([ics], nombre, { type: 'text/calendar' })
  if (ES_TACTIL && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    navigator.share({ files: [archivo], title: 'Estreno: ' + e.t }).catch(() => {})
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

function Proximos() {
  const primero = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
  return (
    <div className="proximos">
      {ESTRENOS.filter(e => !primero || e.t !== primero.t).map(e => (
        <div className="proximo" key={e.t}>
          <span className="proximo-fecha">{fmtFecha(e.fecha) || e.aprox}</span>
          <span className="proximo-titulo">{e.t}</span>
          <span className="proximo-tipo">{e.tipo}</span>
          <span className="proximo-nota">{e.n}</span>
          {e.fecha && <button className="proximo-cal" onClick={() => descargaIcs(e)}>Al calendario</button>}
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

function PerfilView({ nombre, vistasP, epsP, notasP }) {
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
    horasVistas: est.vistoMin / 60,
    titulosVistos: est.titulosVistos,
    titulosTot: est.titulosTot,
    xmenCompleto: DATA[0].eras.every(era => era.items.every(it => vistasP[it.id])),
    expressCompleta: DATA.slice(0, 2).every(sg => sg.eras.every(era => era.items.filter(it => it.exp).every(it => vistasP[it.id]))),
    todoCompleto: DATA.every(sg => sg.eras.every(era => era.items.every(it => vistasP[it.id]))),
  }

  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-titulo">
          <p className="hero-eyebrow">Perfil compartido · solo lectura</p>
          <h1>El maratón de <span className="rojo">{nombre}</span></h1>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Horas vistas</span>
            <span className="stat-num">{Math.round(est.vistoMin / 60)}<small> / {Math.round(est.totMin / 60)} h</small></span>
            <div className="barra"><i style={{ width: `${pct}%` }} /></div>
            <span className="stat-foot">{pct}% del maratón</span>
          </div>
          <div className="stat">
            <span className="stat-label">Títulos vistos</span>
            <span className="stat-num">{est.titulosVistos}<small> / {est.titulosTot}</small></span>
            <span className="stat-foot">películas, series y especiales</span>
          </div>
          <div className="stat">
            <span className="stat-label">Cómics leídos</span>
            <span className="stat-num">{est.comicsVistos}<small> / {est.comicsTot}</small></span>
            <span className="stat-foot">lecturas esenciales</span>
          </div>
          <div className="stat">
            <span className="stat-label">Bóveda de animación</span>
            <span className="stat-num">{est.bovedaVistos}<small> / {est.bovedaTot}</small></span>
            <span className="stat-foot">episodios de las 17 series</span>
          </div>
        </div>
        <div className="mapa" aria-label="Mapa de progreso">
          {est.sagas.map(sg => (
            <div className="mapa-fila" key={sg.saga}>
              <span className="mapa-label">
                {sg.saga === 'xmen' ? 'X-Men' : sg.saga === 'ucm' ? 'UCM' : sg.saga === 'animacion' ? 'Anim.' : 'Cómics'}
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
      </section>
      <main className="stats-vista">
        <Logros ctx={ctx} />
        {est.valoradas.length > 0 && (
          <section className="grafica">
            <h3 className="grafica-titulo">Sus valoraciones</h3>
            <div className="galeria-grid perfil-valoradas">
              {est.valoradas.map(({ item, c, punt, esComic }) => (
                <div key={item.id} className="galeria-item perfil-item" title={item.t}>
                  <Portada item={item} c={c} esComic={esComic} />
                  <span className="perfil-estrellas">{'★'.repeat(punt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer>
        <p className="nota-pie">Esta página es una instantánea de solo lectura del progreso de {nombre}.</p>
        <div className="reset">
          <a className="accion-principal" href={window.location.pathname}>Crea tu propio maratón →</a>
        </div>
      </footer>
    </div>
  )
}

function MiniTl({ item, c, vista, onAbrir }) {
  return (
    <button className={`tl-card${vista ? ' vista' : ''}`} style={{ '--glow': c[0] }} onClick={onAbrir}>
      <span className="tl-poster"><Portada item={item} c={c} esComic={false} /></span>
      <span className="tl-info">
        <span className="tl-titulo">{item.t}</span>
        <span className="tl-h">{item.h}</span>
      </span>
    </button>
  )
}

function CrearLista({ onCrear }) {
  const [nombre, setNombre] = useState('')
  const enviar = () => { const n = nombre.trim(); if (n) { onCrear(n); setNombre('') } }
  return (
    <div className="crear-lista">
      <input className="busca sync-input" placeholder="Nombre de la lista (p. ej. Maratón con mi pareja)" autoComplete="off"
        value={nombre} maxLength={40} onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') enviar() }} aria-label="Nombre de la lista" />
      <button className="accion-principal" onClick={enviar} disabled={!nombre.trim()}>Crear lista</button>
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
      <input className="busca sync-input" placeholder="Buscar título para añadir a la lista…" autoComplete="off" value={q}
        onChange={e => setQ(e.target.value)} aria-label="Añadir título a la lista"
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
      <button className="chip-btn" onClick={() => setConf(c => !c)}>{conf ? 'Cancelar' : 'Eliminar esta lista'}</button>
      {conf && <button className="chip-btn peligro" onClick={onBorrar}>¿Seguro? Sí, eliminar</button>}
    </div>
  )
}

function Estrellas() {
  const capas = useMemo(() => [150, 90, 44].map((n, capa) => {
    const sombras = []
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 100).toFixed(1)
      const y = (Math.random() * 100).toFixed(1)
      const brillo = (0.35 + capa * 0.22 + Math.random() * 0.2).toFixed(2)
      sombras.push(`${x}vw ${y}vh 0 ${capa === 2 ? '1px' : '0'} rgba(242,239,230,${brillo})`)
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

function Card({ item, num, c, esComic, vista, onToggle, onAbrir, delay, eps, miNota }) {
  let epProg = null
  if (item.tipo === 'serie' && EPISODES[item.id]) {
    const total = EPISODES[item.id].length
    const hechos = EPISODES[item.id].filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
    if (hechos > 0 && !vista) epProg = `${hechos}/${total} ep`
  }
  return (
    <article className={`card${vista ? ' vista' : ''}`} id={`card-${item.id}`}
      style={{ animationDelay: `${delay}ms`, '--glow': c[0] }}>
      <button className="checkbox" aria-pressed={vista} onClick={onToggle}
        title={vista ? 'Vista — pulsa para marcar pendiente' : 'Pendiente — pulsa para marcar vista'}>
        <CheckIcon />
        <span className="checkbox-label">{vista ? 'Vista' : ''}</span>
      </button>
      <button className="abrir" onClick={onAbrir} title="Ver ficha">
        <span className="cover-wrap">
          <Portada item={item} c={c} esComic={esComic} />
          {item.s != null && !esComic && <span className="rating-badge">★ {item.s.toFixed(1)}</span>}
          {vista && <span className="sello sello-mini" aria-hidden="true">{esComic ? 'LEÍDO' : 'VISTA'}</span>}
        </span>
        <span className="info">
          <span className="fila-titulo"><span className="num">{num}</span><span className="titulo">{item.t}</span></span>
          <span className="meta">
            {esComic
              ? <><span className="hist">{item.a}</span> · {item.r}</>
              : <><span className="hist">{item.h}</span> · estreno {item.r}{item.d ? <> · {fmtDur(item.d)}</> : null}</>}
            {epProg && <span className="ep-prog"> · {epProg}</span>}
            {miNota && <span className="mi-nota"> · Tú: ★{miNota}</span>}
          </span>
          {item.res && <span className="res">{item.res}</span>}
          {(item.dir || item.cast) && (
            <span className="credits">
              {item.dir && <>Dir. {item.dir}</>}
              {item.cast && <> · Con {item.cast.map(limpiaNombre).join(', ')}</>}
            </span>
          )}
        </span>
      </button>
      <div className="lado">
        {(item.opt || item.tipo === 'esp' || item.tipo === 'serie') && (
          <div className="chips">
            {item.opt
              ? <span className="tipo opc">Opcional</span>
              : item.tipo === 'esp' ? <span className="tipo esp">Especial</span>
              : <span className="tipo serie">Serie</span>}
          </div>
        )}
      </div>
    </article>
  )
}

function Detalle({ d, vista, onToggle, onClose, eps, toggleEp, nota, ponNota, listas, toggleEnLista, club, onNav, onIrA }) {
  const { item, c, esComic } = d
  const extra = useTmdb(item)
  const [verTrailer, setVerTrailer] = useState(false)
  const [sinAbierta, setSinAbierta] = useState(null)
  const [desveladas, setDesveladas] = useState({})
  const [enlaceCopiado, setEnlaceCopiado] = useState(false)
  const [persona, setPersona] = useState(null)
  const refOverlay = useRef(null)
  const refModal = useRef(null)
  const refCierra = useRef(onClose)
  refCierra.current = onClose
  // La biografía es una capa dentro de la ficha: atrás vuelve a la ficha, como
  // hace Escape, y no cierra las dos de golpe
  useVolverCierra(!!persona, () => setPersona(null))
  // El asa de la hoja móvil arrastra de verdad: seguir al dedo desde la franja
  // superior y, si el tirón pasa de umbral (o es un latigazo), cerrar. Si no,
  // volver a su sitio. Solo toca transform, y solo existe donde hay hoja.
  useEffect(() => {
    const el = refModal.current
    if (!el || !window.matchMedia('(max-width:720px)').matches) return undefined
    let y0 = null, dy = 0, t0 = 0, cerrando = false
    const onStart = e => {
      if (cerrando || e.touches.length !== 1) return
      if (e.target.closest('button,a,input,textarea')) return
      const t = e.touches[0]
      if (t.clientY - el.getBoundingClientRect().top > 44) return
      y0 = t.clientY; dy = 0; t0 = e.timeStamp
      el.style.transition = 'none'
    }
    const onMove = e => {
      if (y0 == null) return
      dy = Math.max(0, e.touches[0].clientY - y0)
      e.preventDefault()
      el.style.transform = `translateY(${dy}px)`
    }
    // mientras la hoja se va (240 ms) ni un toque nuevo ni un touchcancel la
    // devuelven a su sitio: se cerraría de golpe sin salida
    const suelta = () => { if (cerrando) return; y0 = null; el.style.transition = ''; el.style.transform = '' }
    const onEnd = e => {
      if (y0 == null) return
      const latigazo = dy > 24 && e.timeStamp - t0 < 250
      if (dy > 140 || latigazo) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { suelta(); refCierra.current(); return }
        cerrando = true
        el.style.transition = 'transform var(--dur-media) var(--curva)'
        el.style.transform = 'translateY(105%)'
        setTimeout(() => { cerrando = false; suelta(); refCierra.current() }, 240)
      } else {
        el.style.transition = 'transform var(--dur-media) var(--curva)'
        el.style.transform = ''
      }
      y0 = null
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
  const refNav = useRef(onNav)
  refNav.current = onNav
  const refPersona = useRef(persona)
  refPersona.current = persona
  // Deslizar en horizontal pasa de título, como las flechas ‹ ›. El eje se
  // decide con el primer tramo del movimiento: si domina la vertical, el
  // scroll sigue siendo del navegador y aquí no se toca nada. Quedan fuera el
  // asa (que es del gesto de cerrar), el carril del reparto (que ya se desliza
  // solo) y la ficha de persona (donde las flechas tampoco navegan).
  useEffect(() => {
    const el = refModal.current
    if (!el || !window.matchMedia('(max-width:720px)').matches) return undefined
    let x0 = null, y0 = null, dx = 0, modo = null
    const onStart = e => {
      if (e.touches.length !== 1 || refPersona.current || !refNav.current) return
      const t = e.touches[0]
      if (t.clientY - el.getBoundingClientRect().top <= 44) return
      if (e.target.closest('.carril-personas,input,textarea')) return
      x0 = t.clientX; y0 = t.clientY; dx = 0; modo = null
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
    const onEnd = () => {
      if (x0 == null) return
      if (modo === 'x') {
        el.style.transition = 'transform var(--dur-media) var(--curva)'
        el.style.transform = ''
        if (Math.abs(dx) > 70 && refNav.current) refNav.current(dx < 0 ? 1 : -1)
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
  useEffect(() => { setVerTrailer(false); setSinAbierta(null); setEnlaceCopiado(false); setPersona(null) }, [item.id])
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
  const dirLimpio = item.dir ? limpiaNombre(item.dir) : ''
  const directores = DUOS[dirLimpio]
    || dirLimpio.split(/, | y | & /).map(s => s.trim()).filter(s => s && s !== 'otros')
  return (
    <div className="overlay" ref={refOverlay} tabIndex={-1} onClick={onClose}
      role="dialog" aria-modal="true" aria-label={item.t}>
      {/* fuera de .modal: dentro quedaban recortadas por su overflow y le añadían scroll */}
      {onNav && (
        <>
          <button className="nav-ficha izq" onClick={e => { e.stopPropagation(); onNav(-1) }} aria-label="Título anterior" title="Anterior (←)">‹</button>
          <button className="nav-ficha der" onClick={e => { e.stopPropagation(); onNav(1) }} aria-label="Título siguiente" title="Siguiente (→)">›</button>
        </>
      )}
      <div className="modal" ref={refModal} onClick={e => e.stopPropagation()}>
        {extra?.fondo && (
          <div className="modal-fondo" aria-hidden="true">
            <img src={`${TMDB_IMG}w780${extra.fondo}`} alt="" />
            <span className="mf-velo" />
          </div>
        )}
        <button className="cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="modal-cover">
          <div className="modal-portada">
            <Portada item={item} c={c} esComic={esComic} />
            {vista && <span className="sello" aria-hidden="true">{esComic ? 'LEÍDO' : 'VISTA'}</span>}
          </div>
          <button className={`accion-principal${vista ? ' hecha' : ''}`} onClick={onToggle}>
            {vista ? '✓ Vista — marcar pendiente' : esComic ? 'Marcar como leído' : 'Marcar como vista'}
          </button>
        </div>
        {persona ? (
          <FichaPersona {...persona} itemActualId={item.id} tituloActual={item.t}
            onVolver={() => setPersona(null)}
            onAbrirTitulo={d => { setPersona(null); onIrA && onIrA(d) }} />
        ) : (
        <div className="modal-info">
          <div className="modal-chips">
            {item.uni && <span className="tipo uni">{item.uni}</span>}
            {item.tipo === 'serie' && <span className="tipo serie">Serie</span>}
            {item.tipo === 'esp' && <span className="tipo esp">Especial</span>}
            {item.opt && <span className="tipo opc">Opcional</span>}
            {item.plat && <span className="tipo plat">{item.plat}</span>}
          </div>
          <h2 className="modal-titulo">{item.t}</h2>
          <p className="modal-meta">
            {item.s != null && <span className="star">★ {item.s.toFixed(1)} en IMDb · </span>}
            {esComic
              ? <>{item.a} · {item.r}</>
              : <><span className="hist">{item.h}</span> · estreno {item.r}{item.d ? <> · {fmtDur(item.d)}</> : null}</>}
          </p>
          {item.res && <p className="modal-res">{item.res}</p>}
          {item.n && <p className="modal-nota">{item.n}</p>}
          {item.pc != null && (
            <p className={`modal-pc${item.pc === '0' ? ' sin' : ''}`}>
              {item.pc === '0'
                ? <>Sin escenas post-créditos{item.pcn ? ` — ${item.pcn}` : ' — puedes saltarte los créditos'}</>
                : <>Escenas en los créditos: <b>{item.pc}</b>{item.pcn ? ` · ${item.pcn}` : ''}</>}
            </p>
          )}
          {(directores.length > 0 || item.cast) && (
            <section className="reparto">
              <h3 className="reparto-titulo">Dirección y reparto</h3>
              <div className="carril-personas">
              {directores.map(p => (
                <button className="persona" key={p}
                  onClick={() => setPersona({ nombre: p, rol: 'Dirección',
                    tmdbId: extra && extra.reparto && extra.reparto[clave(p)] && extra.reparto[clave(p)].id })}
                  title={`Ver a ${p} en tu maratón`}>
                  <Avatar nombre={p} />
                  <span className="persona-nombre">{p}</span>
                  <span className="persona-rol">Dirección</span>
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
                      onClick={() => setPersona({ nombre: c.n, rol: 'Reparto', papel, tmdbId: c.id })}
                      title={papel ? `${c.n} — ${papel}` : `Ver a ${c.n} en tu maratón`}>
                      <Avatar nombre={c.n} foto={c.f} />
                      <span className="persona-nombre">{c.n}</span>
                      <span className="persona-rol">{papel || 'Reparto'}</span>
                    </button>
                  )
                })
              })()}
              </div>
            </section>
          )}
          {extra && Array.isArray(extra.prov) && extra.prov.length > 0 && (
            <div className="prov">
              <span className="prov-label">Hoy en España</span>
              <div className="prov-lista">
                {extra.prov.map((pv, i) => {
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
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          <div className="valoracion">
            <span className="valoracion-label">Tu valoración</span>
            <span className="estrellas" role="radiogroup" aria-label="Tu valoración">
              {[1, 2, 3, 4, 5].map(p => (
                <button key={p} className={`estrella${nota.p >= p ? ' on' : ''}`}
                  aria-label={`${p} estrellas`} onClick={() => ponNota('p', p)}>{nota.p >= p ? '★' : '☆'}</button>
              ))}
            </span>
            <input className="busca nota-input" placeholder="Tus notas (solo tuyas)…" autoComplete="off"
              value={nota.txt || ''} maxLength={280} spellCheck={true}
              onChange={e => ponNota('txt', e.target.value)} aria-label="Tus notas" />
          </div>
          {listas && listas.length > 0 && (
            <div className="valoracion">
              <span className="valoracion-label">Listas</span>
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
            const lista = EPISODES[item.id]
            const temporadas = [...new Set(lista.map(e => e.s))]
            const hechos = lista.filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
            return (
              <div className="episodios">
                <div className="episodios-head">
                  <h3>Episodios</h3>
                  <span className="episodios-count">{hechos}/{lista.length}</span>
                </div>
                {temporadas.map(t => (
                  <div key={t}>
                    {temporadas.length > 1 && <div className="temporada">Temporada {t}</div>}
                    <div className="ep-lista">
                      {lista.filter(e => e.s === t).map(e => {
                        const clave = `${item.id}:${e.s}:${e.n}`
                        const hecho = !!eps[clave]
                        const tm = extra && extra.eps[`${e.s}:${e.n}`]
                        const sinopsis = tm && tm.o
                        const abierta = sinAbierta === clave
                        return (
                          <div key={clave} className={`ep${hecho ? ' hecho' : ''}`}>
                            <button className="ep-toggle"
                              onClick={() => toggleEp(clave)}
                              title={hecho ? 'Marcar pendiente' : 'Marcar visto'}>
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
                                <span className="ep-titulo" title={e.t}>{e.t}</span>
                                {e.f && <span className="ep-fecha">{new Date(e.f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                              </span>
                            </button>
                            {sinopsis && (
                              <button className={`ep-sin-btn${abierta ? ' on' : ''}`} aria-label="Sinopsis del episodio"
                                onClick={() => setSinAbierta(abierta ? null : clave)}>ⓘ</button>
                            )}
                            {abierta && sinopsis && (
                              (hecho || desveladas[clave])
                                ? <p className="ep-sinopsis">{sinopsis}</p>
                                : <p className="ep-sinopsis velada" role="button" tabIndex={0}
                                    onClick={() => setDesveladas(v => ({ ...v, [clave]: true }))}
                                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setDesveladas(v => ({ ...v, [clave]: true })) } }}>
                                    <span className="ep-sin-aviso">Aún no lo has visto: pulsa para desvelar la sinopsis</span>
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
          {verTrailer && extra && extra.trailer && (
            <div className="trailer-caja">
              <iframe src={`https://www.youtube-nocookie.com/embed/${extra.trailer}?autoplay=1`}
                title={`Tráiler de ${item.t}`} allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            </div>
          )}
          <div className="modal-acciones">
            {!esComic && (
              <>
                {extra && extra.trailer
                  ? <button className="ghost" aria-pressed={verTrailer} onClick={() => setVerTrailer(v => !v)}>
                      {verTrailer ? <><IcoCerrar />Cerrar tráiler</> : <><IcoPlay />Tráiler</>}
                    </button>
                  : <a className="ghost" href={urlTrailer(item.t)} target="_blank" rel="noopener noreferrer"><IcoPlay />Tráiler</a>}
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
            }}>{enlaceCopiado ? '✓ Copiado' : <><IcoEnlace />Enlace</>}</button>
            {!!navigator.share && (
              <button className="ghost" onClick={() => {
                navigator.share({ url: `${window.location.origin}${window.location.pathname}?t=${item.id}`, title: item.t }).catch(() => {})
              }}>Compartir…</button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

function Actividad({ vistas, eps }) {
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
  const total = [...dias.values()].reduce((a, b) => a + b, 0)
  return (
    <section className="grafica">
      <h3 className="grafica-titulo">Actividad del maratón</h3>
      <p className="grafica-sub">
        Últimas 20 semanas · {total} marcas con fecha{racha > 0 ? ` · 🔥 racha de ${racha} día${racha > 1 ? 's' : ''}` : ''}
      </p>
      <div className="heatmap" role="img" aria-label="Calendario de actividad">
        {celdas.map(c => (
          <span key={c.t} className="hm-celda"
            title={`${c.f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: ${c.n} marca${c.n === 1 ? '' : 's'}`}
            style={c.n ? { background: `color-mix(in srgb, var(--red) ${25 + 75 * c.n / max}%, var(--panel2))` } : undefined} />
        ))}
      </div>
    </section>
  )
}

const LOGROS = [
  { id: 'primero', e: '🎬', t: 'Primer paso', d: 'Marca tu primer título', f: (v) => Object.keys(v.vistas).some(id => !id.startsWith('c-')) },
  { id: 'capi', e: '🛡️', t: 'Trilogía del Capi', d: 'El primer vengador, Soldado de Invierno y Civil War', f: v => ['cap1', 'cap2', 'civilwar'].every(id => v.vistas[id]) },
  { id: 'thanos', e: '🧤', t: 'El chasquido', d: 'Infinity War y Endgame', f: v => ['infinitywar', 'endgame'].every(id => v.vistas[id]) },
  { id: 'mutante', e: '🧬', t: 'Mutante y orgulloso', d: 'Toda la saga X-Men', f: v => v.xmenCompleto },
  { id: 'defensores', e: '🥊', t: 'Los Defensores', d: 'Las 6 series de Netflix', f: v => ['daredevil', 'jessicajones', 'lukecage', 'ironfist', 'defenders', 'punisher'].every(id => v.vistas[id]) },
  { id: 'express', e: '⚡', t: 'Ruta express', d: 'Todo lo imprescindible para Doomsday', f: v => v.expressCompleta },
  { id: 'lector', e: '📚', t: 'Ratón de biblioteca', d: 'Lee 5 cómics esenciales', f: v => Object.keys(v.vistas).filter(id => id.startsWith('c-')).length >= 5 },
  { id: 'cien', e: '💯', t: 'Cien horas', d: '100 horas de maratón vistas', f: v => v.horasVistas >= 100 },
  { id: 'mitad', e: '🌗', t: 'Media maratón', d: 'La mitad de los títulos', f: v => v.titulosVistos >= Math.ceil(v.titulosTot / 2) },
  { id: 'completista', e: '🏆', t: 'Completista', d: 'Absolutamente todo visto y leído', f: v => v.todoCompleto },
]

function Logros({ ctx }) {
  const desbloqueados = LOGROS.filter(l => l.f(ctx)).length
  return (
    <section className="grafica">
      <h3 className="grafica-titulo">Logros</h3>
      <p className="grafica-sub">{desbloqueados} de {LOGROS.length} desbloqueados</p>
      <div className="logros">
        {LOGROS.map(l => {
          const ok = l.f(ctx)
          return (
            <div key={l.id} className={`logro${ok ? ' ok' : ''}`} title={l.d}>
              <span className="logro-emoji">{l.e}</span>
              <span className="logro-nombre">{l.t}</span>
              <span className="logro-desc">{l.d}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

async function compartirImagen(est, comicsVistos, comicsTot) {
  try { await document.fonts.ready } catch {}
  const W = 1080, H = 1350
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const x = cv.getContext('2d')

  // Fondo de tinta nocturna con semitono
  x.fillStyle = '#0A0C14'; x.fillRect(0, 0, W, H)
  x.fillStyle = 'rgba(242,239,230,0.045)'
  for (let i = 20; i < W; i += 26) for (let j = 20; j < H; j += 26) {
    x.beginPath(); x.arc(i, j, 1.3, 0, 7); x.fill()
  }

  // Rótulo rojo inclinado
  x.save(); x.translate(80, 84); x.transform(1, 0, -0.14, 1, 0, 0)
  x.fillStyle = '#E5484D'; x.fillRect(0, 0, 470, 46); x.restore()
  x.fillStyle = '#fff'; x.font = '700 21px Archivo, sans-serif'
  x.fillText('GUÍA DE MARATÓN · MI PROGRESO', 100, 115)

  // Título
  const g1 = x.createLinearGradient(80, 0, 980, 0)
  g1.addColorStop(0, '#F2EFE6'); g1.addColorStop(.45, '#E5484D'); g1.addColorStop(1, '#F5B822')
  x.fillStyle = g1
  x.font = '400 88px "Archivo Black", Archivo, sans-serif'
  x.fillText('MARATÓN', 80, 246)
  x.fillText('MARVEL & X-MEN', 80, 340)

  // Porcentaje gigante
  const pct = est.totMin ? Math.round(100 * est.vistoMin / est.totMin) : 0
  const g2 = x.createLinearGradient(80, 420, 80, 660)
  g2.addColorStop(0, '#E5484D'); g2.addColorStop(1, '#F5B822')
  x.fillStyle = g2
  x.font = '400 230px "Archivo Black", Archivo, sans-serif'
  x.fillText(pct + '%', 74, 650)
  x.fillStyle = '#A39F92'; x.font = '500 34px Archivo, sans-serif'
  x.fillText(`${est.titulosVistos} de ${est.titulosTot} títulos · ${Math.round(est.vistoMin / 60)} de ${Math.round(est.totMin / 60)} horas vistas`, 80, 716)

  // Barras por saga
  const filas = []
  const fx = est.fases.filter(f => f.saga === 'xmen')
  const fu = est.fases.filter(f => f.saga === 'ucm')
  const suma = fs => fs.reduce((a, f) => [a[0] + f.visto, a[1] + f.tot, a[2] + f.vistos, a[3] + f.items], [0, 0, 0, 0])
  const [xv, xt, xvi, xit] = suma(fx)
  const [uv, ut, uvi, uit] = suma(fu)
  filas.push(['SAGA X-MEN', xvi, xit, xt ? xv / xt : 0, '#F5B822'])
  filas.push(['UCM', uvi, uit, ut ? uv / ut : 0, '#E5484D'])
  filas.push(['CÓMICS', comicsVistos, comicsTot, comicsTot ? comicsVistos / comicsTot : 0, '#9B7BD8'])
  let y = 800
  filas.forEach(([nombre, v, n, frac, color]) => {
    x.fillStyle = '#F2EFE6'; x.font = '700 26px Archivo, sans-serif'
    x.fillText(nombre, 80, y + 26)
    x.fillStyle = '#A39F92'; x.font = '500 26px Archivo, sans-serif'
    x.textAlign = 'right'; x.fillText(`${v} / ${n}`, 1000, y + 26); x.textAlign = 'left'
    x.fillStyle = '#1C2133'
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
    x.strokeStyle = '#2E7D32'; x.lineWidth = 3
    x.beginPath(); x.roundRect(80, y + 10, 920, 110, 14); x.stroke()
    x.fillStyle = '#5FD068'; x.font = '700 24px Archivo, sans-serif'
    x.fillText('PRÓXIMO GRAN ESTRENO', 116, y + 56)
    x.fillStyle = '#F2EFE6'; x.font = '400 34px "Archivo Black", Archivo, sans-serif'
    x.fillText(`${objetivo.t.toUpperCase()} · FALTAN ${dias} DÍAS`, 116, y + 100)
  }

  // Pie
  x.fillStyle = '#6B6878'; x.font = '600 24px Archivo, sans-serif'
  x.fillText('ssebv.github.io/maraton-marvel', 80, H - 60)

  const blob = await new Promise(res => cv.toBlob(res, 'image/png'))
  const archivo = new File([blob], 'maraton-marvel.png', { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Mi maratón Marvel' }); return } catch {}
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
        nombre: typeof j.n === 'string' && j.n.trim() ? j.n.trim().slice(0, 40) : 'Alguien',
        vistasP: deBits(typeof j.v === 'string' ? j.v : '', ORDEN_IDS),
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
  const [ultimaVista, setUltimaVista] = useState({})
  useEffect(() => {
    setUltimaVista(u => (u[destinoDe(vista)] === vista ? u : { ...u, [destinoDe(vista)]: vista }))
  }, [vista])
  useEffect(() => {
    if (perfil) return
    const onHash = () => {
      const h = window.location.hash.replace('#', '')
      setVista(VISTAS_VALIDAS.includes(h) ? h : 'crono')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [perfil])
  const [detalle, setDetalle] = useState(() => {
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
  const navegaDetalle = dir => setDetalle(d => {
    if (!d) return d
    // por la pantalla, no por los bits: aquí «siguiente» es el de al lado
    const i = ORDEN_VISTA.indexOf(d.item.id)
    const nid = ORDEN_VISTA[i + dir]
    return nid ? buscaItem(nid) : d
  })
  const [tierra, setTierra] = useState(null)
  const [mvModo, setMvModo] = useState('sistema')
  const [planModal, setPlanModal] = useState(false)
  const [planHoras, setPlanHoras] = useState(2)
  const [planExpress, setPlanExpress] = useState(true)
  const [orden, setOrden] = useState('crono')
  const [listas, setListas] = useState(() => leeGuardado(KEY_LISTAS, saneaListas, []))
  const [listaActiva, setListaActiva] = useState(null)
  const [cine, setCine] = useState(false)
  const refCine = useRef(null)
  useDialogo(refCine, () => setCine(false), cine)
  const [cineIdx, setCineIdx] = useState(0)
  const guardaListas = next => {
    setListas(next)
    try { localStorage.setItem(KEY_LISTAS, JSON.stringify(next)) } catch {}
  }
  const crearLista = nombre => guardaListas([...listas, { id: Math.random().toString(36).slice(2, 9), nombre, items: [], prog: {} }])
  const borrarLista = id => { guardaListas(listas.filter(l => l.id !== id)); if (listaActiva === id) setListaActiva(null) }
  const toggleEnLista = (lid, itemId) => guardaListas(listas.map(l => {
    if (l.id !== lid) return l
    const dentro = l.items.includes(itemId)
    const prog = { ...l.prog }
    if (dentro) delete prog[itemId]
    return { ...l, items: dentro ? l.items.filter(x => x !== itemId) : [...l.items, itemId], prog }
  }))
  const toggleProgLista = (lid, itemId) => guardaListas(listas.map(l => {
    if (l.id !== lid) return l
    const prog = { ...l.prog }
    if (prog[itemId]) delete prog[itemId]; else prog[itemId] = Date.now()
    return { ...l, prog }
  }))
  const [busca, setBusca] = useState(() => leeVistaUrl().busca)
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
  const ponNota = (id, campo, valor) => setNotas(prev => {
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
  useVolverCierra(!!detalle, () => setDetalle(null))
  useVolverCierra(cine, () => setCine(false))
  useVolverCierra(ajustes, () => setAjustes(false))
  useVolverCierra(planModal, () => setPlanModal(false))
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
      if (e.key === 'Escape') { setPlanModal(false); setPerfilModal(false); setSyncModal(false); setDueloModal(false); setClubModal(false); setClubInvitar(false) }
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) {
        const campo = document.querySelector('input[name="busqueda"]')
        if (campo) { e.preventDefault(); campo.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const aplicandoRemoto = React.useRef(false)
  const ultimoAplicado = React.useRef(0)

  const endpoint = s => `${s.url}/maraton/${s.room}.json`

  const empujar = async (conf, v, e, n, l) => {
    try {
      setSyncEstado('syncing')
      const t = Date.now()
      const r = await fetch(endpoint(conf), {
        method: 'PUT',
        body: JSON.stringify({ v, e, n: n || notas, l: l || listas, t }),
      })
      if (!r.ok) throw new Error(r.status)
      ultimoAplicado.current = t
      setSyncEstado('ok')
    } catch { setSyncEstado('error') }
  }

  const tirar = async conf => {
    try {
      const r = await fetch(endpoint(conf))
      if (!r.ok) throw new Error(r.status)
      const datos = await r.json()
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
        aplicandoRemoto.current = true
        if (v) { setVistas(v); try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
        if (e) { setEps(e); try { localStorage.setItem(KEY_EPS, JSON.stringify(e)) } catch {} }
        if (n) { setNotas(n); try { localStorage.setItem(KEY_NOTAS, JSON.stringify(n)) } catch {} }
        if (l) { setListas(l); try { localStorage.setItem(KEY_LISTAS, JSON.stringify(l)) } catch {} }
      }
      setSyncEstado('ok')
    } catch { setSyncEstado('error') }
  }

  useEffect(() => {
    if (perfil) return
    if (!sync) { setSyncEstado('off'); return }
    tirar(sync)
    const id = setInterval(() => tirar(sync), 25000)
    const alFoco = () => tirar(sync)
    window.addEventListener('focus', alFoco)
    return () => { clearInterval(id); window.removeEventListener('focus', alFoco) }
  }, [sync])

  useEffect(() => {
    if (perfil || !sync) return
    if (aplicandoRemoto.current) { aplicandoRemoto.current = false; return }
    const id = setTimeout(() => empujar(sync, vistas, eps, notas, listas), 1200)
    return () => clearTimeout(id)
  }, [vistas, eps, notas, listas])

  const activarSync = async (url, roomExistente) => {
    const room = roomExistente || Math.random().toString(36).slice(2, 10)
    const conf = { url, room }
    if (roomExistente) {
      // unirse: fusionar lo remoto con lo local y subir la unión
      try {
        const r = await fetch(endpoint(conf))
        const datos = r.ok ? await r.json() : null
        // lo remoto se sanea igual que en tirar(): al unirse a una sala ajena
        // es cuando más fácil es tragarse la forma equivocada
        const v = { ...(esObj(datos) && saneaMarcas(datos.v) || {}), ...vistas }
        const e = { ...(esObj(datos) && saneaMarcas(datos.e) || {}), ...eps }
        const n = { ...(esObj(datos) && saneaNotas(datos.n) || {}), ...notas }
        const lRemoto = (esObj(datos) && saneaListas(datos.l)) || []
        const l = [...lRemoto, ...listas.filter(x => !lRemoto.some(r => r.id === x.id))]
        aplicandoRemoto.current = true
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

  const toggleEp = clave => setEps(prev => {
    const next = { ...prev }
    if (next[clave]) delete next[clave]; else { next[clave] = Date.now(); suenaPop() }
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    return next
  })

  const toggle = id => setVistas(prev => {
    const next = { ...prev }
    if (next[id]) delete next[id]; else { next[id] = Date.now(); suenaPop() }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    return next
  })
  const setF = k => setFiltros(f => ({ ...f, [k]: !f[k] }))
  const [acento, setAcento] = useState(() => {
    try { return localStorage.getItem('maraton-marvel-acento-v1') || '616' } catch { return '616' }
  })
  useEffect(() => {
    if (acento === '616') document.documentElement.removeAttribute('data-acento')
    else document.documentElement.setAttribute('data-acento', acento)
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

  const pasaFiltro = (item, esComic) => {
    if (busca) {
      const pajar = norm([item.t, item.dir || '', ...(item.cast || []), String(item.r)].join(' '))
      if (!pajar.includes(norm(busca))) return false
    }
    if (filtros.series && item.tipo === 'serie') return false
    if (filtros.opc && item.opt) return false
    if (filtros.joyas && !esComic && (item.s == null || item.s < JOYA_MIN)) return false
    if (filtros.express && !item.exp) return false
    // «esta noche sin alquilar»: 102 de los 108 del maratón están en Disney+,
    // así que el filtro es un solo interruptor y no un selector de plataforma.
    // Los cómics van por Panini y quedan fuera del criterio.
    if (filtros.disney && !esComic && item.plat !== 'Disney+') return false
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
    return { totV, totN, mins, siguiente, porSaga }
  }, [vistas, filtros])

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
    const tipos = { peli: { t: 'Películas', tot: 0, visto: 0 }, serie: { t: 'Series', tot: 0, visto: 0 }, esp: { t: 'Especiales', tot: 0, visto: 0 } }
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
  }, [vistas, eps])

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
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
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

  const plan = useMemo(() => {
    if (!planModal) return null
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
  }, [planModal, planHoras, planExpress, vistas, eps])

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
  }, [filtros])

  const oculto = (item, esComic) => filtros.vistas && vistas[item.id] && pasaFiltro(item, esComic)

  // Cuántos títulos deja ver lo que hay puesto. Ojo: "Solo pendientes" no
  // vive en pasaFiltro, se aplica aparte, así que hay que mirar los dos.
  const resumenFiltros = useMemo(() => {
    const activos = Object.values(filtros).filter(Boolean).length + (busca.trim() ? 1 : 0)
    if (!activos) return null
    let tot = 0, vis = 0
    DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => {
      const esComic = sg.saga === 'comics' || sg.saga === 'animacion'
      tot++
      if (pasaFiltro(it, esComic) && !(filtros.vistas && vistas[it.id])) vis++
    })))
    return { activos, tot, vis }
  }, [filtros, busca, vistas])
  const limpiaFiltros = () => {
    setFiltros(sinFiltros())
    setBusca('')
  }

  let delayIdx = 0
  const nextDelay = () => Math.min((delayIdx++) * 30, 360)
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
    const base = 'Maratón Marvel & X-Men'
    if (detalle) { document.title = `${detalle.item.t} · ${base}`; return }
    const p = PESTANAS.find(x => x.id === vista)
    document.title = (!p || vista === 'crono') ? base : `${p.label} · ${base}`
  }, [vista, detalle])

  if (perfil) return <PerfilView {...perfil} />

  return (
    <div className="wrap">
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      {fondo === 'banner' && proxEstreno?.img && (
        <div className="fondo-hero fh-banner" aria-hidden="true">
          <img src={proxEstreno.img} alt=""
            srcSet={`${proxEstreno.img.replace(/\.jpg$/, '-780.jpg')} 780w, ${proxEstreno.img} 1280w`}
            sizes="100vw" />
          <span className="fh-velo" />
        </div>
      )}
      {fondo === 'muro' && (
        <div className="fondo-hero fh-muro" aria-hidden="true">
          <div className="fh-tira">
            {MURO.map(id => <img key={id} src={`mini/${id}.jpg`} alt="" loading="lazy" />)}
          </div>
          <span className="fh-velo" />
        </div>
      )}
      <section className="hero">
        <div className="hero-titulo">
          <p className="hero-eyebrow">Guía de maratón · cronología completa</p>
          <h1>Maratón <span className="rojo">Marvel</span> &amp; X-Men</h1>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Completados</span>
            <span className="stat-num">{stats.totV}<small> / {stats.totN}</small></span>
            <div className="barra"><i style={{ width: `${pct}%` }} /></div>
            <span className="stat-foot">{pct}% del maratón</span>
          </div>
          <div className="stat">
            <span className="stat-label">Te quedan</span>
            <span className="stat-num">{Math.round(stats.mins / 60)}<small> h</small></span>
            <span className="stat-foot">de películas y series</span>
          </div>
          {stats.siguiente && (
            <button className="stat siguiente-stat" title="Ir a la tarjeta" onClick={() => {
              if (vista !== 'crono') setVista('crono')
              setTimeout(() => {
                const el = document.getElementById('card-' + stats.siguiente.id)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  el.classList.add('destello')
                  setTimeout(() => el.classList.remove('destello'), 1600)
                }
              }, vista !== 'crono' ? 120 : 0)
            }}>
              <span className="stat-label">Siguiente</span>
              <span className="stat-sig">{stats.siguiente.t}</span>
              <span className="stat-foot">{stats.siguiente.h} · {fmtDur(stats.siguiente.d)}</span>
            </button>
          )}
        </div>
      </section>

      <Novedades eps={eps} />
      {!panelAbierto && (
        <button className="panel-resumen" aria-expanded="false" onClick={alternaPanel}>
          <span className="pr-datos">
            {proxEstreno && objetivo
              ? <>
                  <b>{proxEstreno.t.replace(/^Vengadores: /, '')}</b> en <b className="pr-dias">{objetivo.dias} días</b>
                  {objetivo.restante > 0 && <span className="pr-extra"> · ruta express: {objetivo.necesario} min/día</span>}
                </>
              : <>Mapa de progreso, próximos estrenos y cuenta atrás</>}
          </span>
          <span className="pr-abrir">Panel completo</span>
        </button>
      )}
      <div className="panel-superior" hidden={!panelAbierto}>
        <div className="panel-izq">
        <div className="mapa" aria-label="Mapa de progreso">
          {DATA.map(saga => {
            const items = saga.eras.flatMap(era => era.items.map(item => ({ item, c: era.c })))
            const v = items.filter(({ item }) => vistas[item.id]).length
            return (
              <div className="mapa-fila" key={saga.saga}>
                <span className="mapa-label">
                  {saga.saga === 'xmen' ? 'X-Men' : saga.saga === 'ucm' ? 'UCM' : saga.saga === 'animacion' ? 'Anim.' : 'Cómics'}
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
        <CuentaAtras meta={objetivo} />
      </div>
      {panelAbierto && (
        <button className="panel-plegar" aria-expanded="true" onClick={alternaPanel}>Ocultar panel</button>
      )}

      <header className="toolbar">
        <div className="controles" role="group" aria-label="Vista y filtros">
          <nav className="tabs" aria-label="Secciones">
            {DESTINOS.map(d => {
              // volver a un destino te devuelve donde lo dejaste
              const destino = ultimaVista[d.id] || d.vistas[0]
              return (
                <a className="tab" key={d.id} href={'#' + destino}
                  aria-current={destinoDe(vista) === d.id ? 'page' : undefined}
                  onClick={e => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                    e.preventDefault()
                    setVista(destino)
                  }}>
                  {d.label}
                </a>
              )
            })}
          </nav>
          <span className="ctrl-sep" aria-hidden="true" />
          <div className="ctrl-grupo">
          <button className="chip-btn destacado" aria-pressed={filtros.express} onClick={() => setF('express')}>Ruta express</button>
          <button className="chip-btn" aria-pressed={filtros.series} onClick={() => setF('series')}>Sin series</button>
          <button className="chip-btn" aria-pressed={filtros.opc} onClick={() => setF('opc')}>Sin opcionales</button>
          <button className="chip-btn" aria-pressed={filtros.vistas} onClick={() => setF('vistas')}>Solo pendientes</button>
          <button className="chip-btn" aria-pressed={filtros.joyas} onClick={() => setF('joyas')}>Joyas ★7,5+</button>
          <button className="chip-btn" aria-pressed={filtros.disney} onClick={() => setF('disney')}>En Disney+</button>
          </div>
          <span className="ctrl-sep" aria-hidden="true" />
          <div className="ctrl-grupo">
          <button className="chip-btn destacado" aria-pressed={planModal} onClick={() => setPlanModal(true)}>Plan de sesión</button>
          <button className="chip-btn" onClick={() => { setCineIdx(0); setCine(true) }}>Modo cine</button>
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
          }}>Sorpréndeme</button>
          <input className="busca" type="search" name="busqueda" placeholder={ES_TACTIL ? 'Título, actor, director o año' : 'Buscar… ( / )'} title="Busca por título, actor, director o año — atajo: /" value={busca} spellCheck={false}
            autoComplete="off" onChange={e => setBusca(e.target.value)} aria-label="Buscar título" />
          <button className="chip-btn" aria-pressed={ajustes} onClick={() => setAjustes(true)}>Ajustes</button>
          {/* El estado de sincronización es estado, no un botón: solo se
              muestra cuando hay algo que mirar. */}
          {syncEstado === 'error' && (
            <button className="chip-btn sync-btn error" aria-live="polite" onClick={() => setSyncModal(true)}>
              Sin conexión
            </button>
          )}
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
          <nav className="subvistas" aria-label={`Cómo ver ${d.label}`}>
            {d.vistas.map(v => {
              const p = PESTANAS.find(x => x.id === v)
              return (
                <a className="subvista" key={v} href={'#' + v}
                  aria-current={vista === v ? 'page' : undefined}
                  onClick={e => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                    e.preventDefault()
                    setVista(v)
                  }}>{p ? p.label : v}</a>
              )
            })}
          </nav>
        )
      })()}

      <span id="contenido" tabIndex={-1} />

      {resumenFiltros && (
        <p className="filtros-resumen" role="status">
          Ves <b>{resumenFiltros.vis}</b> de {resumenFiltros.tot}
          {' · '}{resumenFiltros.activos === 1 ? '1 filtro activo' : `${resumenFiltros.activos} filtros activos`}
          <button className="filtros-quitar" onClick={limpiaFiltros}>Quitar</button>
        </p>
      )}

      <Estrellas />
      {vista === 'tiempo' ? (
        <main className="tiempo">
          <p className="saga-desc mv-intro">
            Cada título colocado en el año en que <b>ocurre su historia</b>, no en el que se estrenó:
            X-Men a la izquierda en dorado, UCM a la derecha en rojo. Pulsa cualquier tarjeta para abrir su ficha.
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
                      {salto > 0 && <div className="tl-salto">⋯ {salto} años después ⋯</div>}
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
                    <div className="tl-salto">∞ fuera del tiempo ∞</div>
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
                  <button className="chip-btn" onClick={() => setListaActiva(null)}>← Mis listas</button>
                  <header className="lista-hero">
                    <h2 className="lista-nombre">{l.nombre}</h2>
                    <span className="stat-foot">{v} / {itemsOrdenados.length} vistos en esta lista · progreso independiente del maratón</span>
                    <div className="barra"><i style={{ width: `${itemsOrdenados.length ? 100 * v / itemsOrdenados.length : 0}%` }} /></div>
                    <AgregarALista indice={indice} idOrden={idOrden} enLista={l.items}
                      onAgregar={id => toggleEnLista(l.id, id)} />
                  </header>
                  {itemsOrdenados.length === 0 && (
                    <p className="saga-desc">La lista está vacía: busca títulos arriba o añádelos desde cualquier ficha.</p>
                  )}
                  <div className="grid tierra-grid">
                    {itemsOrdenados.map(({ item, c, esComic }, i) => (
                      <Card key={item.id} item={item} num={i + 1} c={c} esComic={esComic}
                        vista={!!l.prog[item.id]}
                        onToggle={() => toggleProgLista(l.id, item.id)}
                        onAbrir={() => setDetalle({ item, c, esComic })}
                        delay={Math.min(i * 30, 300)} eps={eps}
                        miNota={notas[item.id] && notas[item.id].p} />
                    ))}
                  </div>
                  <BorrarLista onBorrar={() => borrarLista(l.id)} />
                </div>
              )
            }
            return (
              <>
                <p className="saga-desc mv-intro">
                  Rutas personalizadas con su propio progreso, independiente del maratón principal — perfectas para re-ver con alguien o armar sesiones temáticas.
                </p>
                <CrearLista onCrear={crearLista} />
                {listas.length === 0 ? (
                  <div className="aviso centrado">
                    <p className="sr-titulo">Todavía no tienes listas</p>
                    <p className="sr-detalle">
                      Ponle nombre arriba y créala: podrás añadirle títulos desde su ficha,
                      y llevará su propio progreso al margen del maratón.
                    </p>
                  </div>
                ) : (
                  <div className="mv-grid">
                    {listas.map(l => {
                      const total = l.items.length
                      const v = l.items.filter(id => l.prog[id]).length
                      return (
                        <article key={l.id} className="mv-card lista-card" role="button" tabIndex={0}
                          onClick={() => setListaActiva(l.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setListaActiva(l.id) } }}>
                          <h2 className="mv-nombre">{l.nombre}</h2>
                          <div className="barra"><i style={{ width: `${total ? 100 * v / total : 0}%` }} /></div>
                          <span className="stat-foot">{v} / {total} títulos vistos</span>
                          <span className="mv-entrar">Abrir lista →</span>
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
                <button className="chip-btn" onClick={() => setTierra(null)}>← Volver al multiverso</button>
                <header className="tierra-hero">
                  <span className="planeta planeta-grande" aria-hidden="true" />
                  <span className="mv-num tierra-num">{u.num}</span>
                  <h2 className="tierra-nombre">{u.nombre}</h2>
                  <span className="tierra-estado">{u.estado}</span>
                  <p className="tierra-desc">{u.desc}</p>
                  <div className="barra tierra-barra">
                    <i style={{ width: `${items.length ? 100 * v / items.length : 0}%` }} />
                  </div>
                  <span className="tierra-count">{v} / {items.length} completados en este universo</span>
                </header>
                <div className="grid tierra-grid">
                  {items.map(({ item, c }, i) => (
                    <Card key={item.id} item={item} num={i + 1} c={c}
                      esComic={item.id.startsWith('c-')}
                      vista={!!vistas[item.id]}
                      onToggle={() => toggle(item.id)}
                      onAbrir={() => setDetalle({ item, c, esComic: item.id.startsWith('c-') })}
                      delay={Math.min(i * 30, 300)} eps={eps}
                      miNota={notas[item.id] && notas[item.id].p} />
                  ))}
                </div>
              </div>
            )
          })() : (
            <>
              <div className="mv-cabecera">
                <p className="saga-desc mv-intro">
                  Los universos que hay que conocer antes de Vengadores: Doomsday. Entra en cada Tierra para ver y marcar todo lo que ocurre en ella.
                </p>
                <div className="tabs mv-modos">
                  <button className="tab" aria-pressed={mvModo === 'sistema'} onClick={() => setMvModo('sistema')}>Sistema</button>
                  <button className="tab" aria-pressed={mvModo === 'mapa'} onClick={() => setMvModo('mapa')}>Mapa</button>
                  <button className="tab" aria-pressed={mvModo === 'tarjetas'} onClick={() => setMvModo('tarjetas')}>Tarjetas</button>
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
                    {(() => {
                      const u616 = MULTIVERSO.find(u => u.num === 'Tierra-616')
                      return (
                        <button className="sol" style={{ '--tc': u616.c }}
                          onClick={() => setTierra(u616.num)} title={u616.nombre}>
                          <span className="planeta planeta-orbe planeta-sol" />
                          <span className="nav-nombre">Tierra-616</span>
                        </button>
                      )
                    })()}
                    {MULTIVERSO.filter(u => ORBITAS[u.num]).map(u => {
                      const [r, fase, dur, dir, tam] = ORBITAS[u.num]
                      return (
                        <div className={`orbita${dir < 0 ? ' inversa' : ''}`} key={u.num}
                          style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, transform: `rotate(${fase}deg)` }}>
                          <div className="giro" style={{ animationDuration: dur + 's' }}>
                            <div className="nav-pos" style={{ transform: `translateX(-50%) rotate(${-fase}deg)` }}>
                              <div className="contra" style={{ animationDuration: dur + 's' }}>
                                <button className="planeta-nav" style={{ '--tc': u.c }}
                                  onClick={() => setTierra(u.num)} title={u.nombre}>
                                  <span className="planeta planeta-orbe" style={{ width: tam, height: tam }} />
                                  <span className="nav-nombre">{u.num.replace('Tierra-', 'T-')}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
              <div className="mv-grid">
                {MULTIVERSO.map(u => (
                  <article className="mv-card" key={u.num} style={{ '--tc': u.c }}
                    role="button" tabIndex={0}
                    onClick={() => setTierra(u.num)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTierra(u.num) } }}>
                    <span className="planeta planeta-mini" aria-hidden="true" />
                    <span className="mv-num">{u.num}</span>
                    <h2 className="mv-nombre">{u.nombre}</h2>
                    <p className="mv-desc">{u.desc}</p>
                    <span className="mv-estado">{u.estado}</span>
                    <span className="mv-entrar">Entrar en esta Tierra →</span>
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
                    <button key={item.id} className={`galeria-item${vistas[item.id] ? ' vista' : ''}`}
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
              <span className="stat-label">Horas vistas</span>
              <span className="stat-num">{Math.round(estadisticas.vistoMin / 60)}<small> / {Math.round(estadisticas.totMin / 60)} h</small></span>
              <div className="barra"><i style={{ width: `${estadisticas.totMin ? 100 * estadisticas.vistoMin / estadisticas.totMin : 0}%` }} /></div>
              <span className="stat-foot">{estadisticas.totMin ? Math.round(100 * estadisticas.vistoMin / estadisticas.totMin) : 0}% del tiempo total</span>
            </div>
            <div className="stat">
              <span className="stat-label">Títulos vistos</span>
              <span className="stat-num">{estadisticas.titulosVistos}<small> / {estadisticas.titulosTot}</small></span>
              <span className="stat-foot">películas, series y especiales</span>
            </div>
            <div className="stat">
              <span className="stat-label">Episodios vistos</span>
              <span className="stat-num">{estadisticas.epVistos}<small> / {estadisticas.epTot}</small></span>
              <span className="stat-foot">de las series con lista</span>
            </div>
            <div className="stat">
              <span className="stat-label">Cómics leídos</span>
              <span className="stat-num">{estadisticas.comicsVistos}<small> / {estadisticas.comicsTot}</small></span>
              <span className="stat-foot">lecturas esenciales</span>
            </div>
            <div className="stat">
              <span className="stat-label">Bóveda de animación</span>
              <span className="stat-num">{estadisticas.bovedaEpVistos}<small> / {estadisticas.bovedaEpTot}</small></span>
              <span className="stat-foot">episodios de las 17 series</span>
            </div>
          </div>

          {estadisticas.titulosVistos === 0 && (
            <p className="aviso info stats-vacio">
              Aún está todo por estrenar: en cuanto marques tu primera película, aquí aparecerán
              tus horas, tu racha, tus logros y el mapa de calor. 🍿
            </p>
          )}
          <div className="stats-acciones">
            <button className="accion-principal compartir"
              onClick={() => compartirImagen(estadisticas, estadisticas.comicsVistos, estadisticas.comicsTot)}>
              Compartir como imagen
            </button>
            <button className="chip-btn" onClick={() => { setPerfilUrl(''); setPerfilCopiado(false); setPerfilModal(true) }}>
              Perfil compartible
            </button>
            {!amigo && (
              <button className="chip-btn" onClick={() => { setDueloInput(''); setDueloNombre(''); setDueloError(''); setDueloModal(true) }}>
                Modo duelo
              </button>
            )}
            {!club && (
              <button className="chip-btn" onClick={() => { setClubCod(''); setClubAlias(''); setClubError(''); setClubModal(true) }}>
                Club de maratón
              </button>
            )}
          </div>

          {amigo && <Duelo amigo={amigo} vistas={vistas} eps={eps} onQuitar={() => guardaAmigo(null)} />}
          {club && <Club club={club} vistas={vistas} eps={eps}
            onSalir={() => guardaClub(null)} onInvitar={() => setClubInvitar(true)} />}

          <Actividad vistas={vistas} eps={eps} />

          <Diario vistas={vistas} notas={notas} />

          <Logros ctx={{
            vistas,
            horasVistas: estadisticas.vistoMin / 60,
            titulosVistos: estadisticas.titulosVistos,
            titulosTot: estadisticas.titulosTot,
            xmenCompleto: DATA[0].eras.every(era => era.items.every(it => vistas[it.id])),
            expressCompleta: DATA.slice(0, 2).every(sg => sg.eras.every(era => era.items.filter(it => it.exp).every(it => vistas[it.id]))),
            todoCompleto: DATA.every(sg => sg.eras.every(era => era.items.every(it => vistas[it.id]))),
          }} />

          <section className="grafica">
            <h3 className="grafica-titulo">Horas por fase y era</h3>
            <p className="grafica-sub">La barra tenue es la duración total de cada era; el relleno, lo que ya has visto.</p>
            {['xmen', 'ucm'].map(sg => (
              <div key={sg} className="grafica-grupo">
                <div className="grafica-grupo-nombre">{sg === 'xmen' ? 'Saga X-Men' : 'UCM'}</div>
                {estadisticas.fases.filter(f => f.saga === sg).map(f => {
                  const pct = f.tot ? 100 * f.visto / f.tot : 0
                  return (
                    <div className="gbar" key={f.era}
                      title={`${f.era}: ${Math.round(f.visto / 60)} h de ${Math.round(f.tot / 60)} h · ${f.vistos}/${f.items} títulos`}>
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
            <h3 className="grafica-titulo">Avance por tipo</h3>
            {estadisticas.tipos.map(t => {
              const pct = t.tot ? 100 * t.visto / t.tot : 0
              return (
                <div className="gbar" key={t.t} title={`${t.t}: ${Math.round(t.visto / 60)} h de ${Math.round(t.tot / 60)} h`}>
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
              <p className="sr-titulo">Nada coincide con lo que buscas</p>
              <p className="sr-detalle">
                {busca.trim()
                  ? <>No hay ningún título con «<b>{busca.trim()}</b>»{filtrosActivos > 0 ? ' entre los filtros que tienes puestos' : ''}.</>
                  : <>Los filtros que tienes puestos no dejan ningún título.</>}
              </p>
              <button className="chip-btn destacado" aria-pressed="false" onClick={limpiaTodo}>
                Quitar filtros y búsqueda
              </button>
            </div>
          )}
          {DATA.filter(saga => vista === 'comics' ? saga.saga === 'comics' : vista === 'animacion' ? saga.saga === 'animacion' : (saga.saga !== 'comics' && saga.saga !== 'animacion')).map(saga => {
            const esComic = saga.saga === 'comics'
            const s = stats.porSaga[saga.saga]
            // s.n es el total de la saga; hay que contar los que pasan el filtro
            const visibles = saga.eras.reduce((acc, era) => acc + era.items.filter(it => pasaFiltro(it, esComic)).length, 0)
            if (!s.n || !visibles) return null
            let num = 0
            return (
              <section className="saga" data-saga={saga.saga} id={`saga-${saga.saga}`} key={saga.saga}>
                <div className="saga-head">
                  {FRANJA.includes(saga.saga) && (
                    <div className="saga-franja" aria-hidden="true">
                      <img src={`fondo/${saga.saga}.jpg`} alt="" loading="lazy"
                        srcSet={`fondo/${saga.saga}-560.jpg 560w, fondo/${saga.saga}.jpg 900w`}
                        sizes="(max-width: 640px) 100vw, 50vw" />
                      <span className="sf-velo" />
                    </div>
                  )}
                  <h2>{saga.titulo}</h2>
                  <span className="uni-chip">{saga.uni}</span>
                  <span className="saga-count">
                    {s.v} / {s.n}{s.m ? ` · quedan ${fmtDur(s.m)}` : ''}
                  </span>
                </div>
                <p className="saga-desc">{saga.desc}</p>
                {saga.guia && (
                  <details className="saga-guia">
                    <summary>Cómo entender la saga</summary>
                    {saga.guia.map(g => <p key={g.t}><b>{g.t}.</b> {g.p}</p>)}
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
                  return (
                    <div className="era" key={era.era} style={{ '--era': era.c[0] }}>
                      <div className="era-head">
                        <h3>{era.era}</h3>
                        <span className="era-rango">{era.rango}</span>
                        <span className="era-prog">
                          <i style={{ width: `${100 * vEra / numerados.length}%` }} />
                        </span>
                        <span className="era-count">{vEra}/{numerados.length}</span>
                      </div>
                      <div className="era-borde">
                        <div className="grid">
                          {numerados.map((item, i) =>
                            visibles.includes(item) && (
                              <Card key={item.id} item={item} num={base + i + 1} c={era.c}
                                esComic={esComic} vista={!!vistas[item.id]}
                                onToggle={() => toggle(item.id)}
                                onAbrir={() => setDetalle({ item, c: era.c, esComic })}
                                delay={nextDelay()} eps={eps} miNota={notas[item.id] && notas[item.id].p} />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
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
                    <Card key={item.id} item={item} num={i + 1} c={item.c}
                      esComic={false} vista={!!vistas[item.id]}
                      onToggle={() => toggle(item.id)}
                      onAbrir={() => setDetalle({ item, c: item.c, esComic: false })}
                      delay={nextDelay()} eps={eps} miNota={notas[item.id] && notas[item.id].p} />
                  ))}
                </div>
              </section>
            )
          })}
          <p className="saga-desc" style={{ marginTop: 24 }}>
            La vista por estreno ordena películas y series por su año de salida (los cómics solo aparecen en su pestaña).
          </p>
        </main>
      )}

      {cine && cineLista.length > 0 && (() => {
        const idx = Math.min(cineIdx, cineLista.length - 1)
        const { item, c } = cineLista[idx]
        return (
          <div className="cine" ref={refCine} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Modo cine">
            <button className="cerrar cine-cerrar" onClick={() => setCine(false)} aria-label="Salir">✕</button>
            <div className="cine-centro">
              <button className="cine-flecha" onClick={() => setCineIdx(i => Math.max(0, i - 1))}
                disabled={idx === 0} aria-label="Anterior">‹</button>
              <div className="cine-panel" style={{ '--glow': c[0] }}>
                <div className="cine-poster"><Portada item={item} c={c} esComic={false} /></div>
                <div className="cine-info">
                  <span className="cine-contador">{idx + 1} de {cineLista.length} pendientes · orden del maratón</span>
                  <h2 className="cine-titulo">{item.t}</h2>
                  <p className="cine-meta">
                    {item.s != null && <span className="star">★ {item.s.toFixed(1)} · </span>}
                    <span className="hist">{item.h}</span>{item.d ? <> · {fmtDur(item.d)}</> : null}
                  </p>
                  {item.res && <p className="cine-res">{item.res}</p>}
                  <div className="modal-acciones">
                    <button className="accion-principal" onClick={() => toggle(item.id)}>✓ La veo — marcar vista</button>
                    <button className="ghost" onClick={() => setDetalle({ item, c, esComic: false })}>Ver ficha</button>
                  </div>
                </div>
              </div>
              <button className="cine-flecha" onClick={() => setCineIdx(i => Math.min(cineLista.length - 1, i + 1))}
                disabled={idx === cineLista.length - 1} aria-label="Siguiente">›</button>
            </div>
            <p className="cine-ayuda">← → navegar · Enter marcar vista · Esc salir</p>
          </div>
        )
      })()}

      {dueloModal && (
        <div className="overlay" onClick={() => setDueloModal(false)} role="dialog" aria-modal="true" aria-label="Modo duelo">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setDueloModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Modo duelo</h2>
              <p className="modal-res">
                Pega el enlace de <b>Perfil compartible</b> de la otra persona (botón «Perfil compartible» en sus Estadísticas)
                para una foto fija, o su <b>código de sincronización</b> (botón «Sincronizar») para un duelo
                <b> en vivo</b> que se actualiza solo. Todo queda en este navegador.
              </p>
              <input className="busca duelo-input" placeholder="Enlace de perfil o código de sincronización" autoComplete="off" spellCheck={false}
                value={dueloInput} onChange={e => { setDueloInput(e.target.value); setDueloError('') }} />
              <input className="busca duelo-input" placeholder="Nombre de tu rival (opcional)"
                value={dueloNombre} onChange={e => setDueloNombre(e.target.value)} maxLength={24} />
              {dueloError && <p className="duelo-error">{dueloError}</p>}
              <button className="accion-principal" onClick={() => {
                const p = parsePerfilCod(dueloInput)
                if (p) { guardaAmigo(dueloNombre.trim() ? { ...p, n: dueloNombre.trim() } : p); setDueloModal(false); return }
                const sc = decodificaSync(dueloInput)
                if (sc) { guardaAmigo({ tipo: 'live', n: dueloNombre.trim() || 'Tu rival', url: sc.url, room: sc.room }); setDueloModal(false); return }
                setDueloError('Eso no parece ni un enlace de perfil ni un código de sincronización: revisa que esté completo.')
              }}>
                Empezar el duelo
              </button>
            </div>
          </div>
        </div>
      )}
      {bienvenida && !perfil && (
        <Bienvenida onCerrar={cierraBienvenida}
          onExpress={() => { if (!filtros.express) setF('express'); cierraBienvenida() }} />
      )}
      {clubModal && (
        <div className="overlay" onClick={() => setClubModal(false)} role="dialog" aria-modal="true" aria-label="Club de maratón">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setClubModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Club de maratón</h2>
              <p className="modal-res">
                Un ranking en vivo para 2 o más personas, con comentarios por título.
                {sync ? ' Puedes crear un club con tu Firebase o unirte con un código.' : ' Para crear un club necesitas configurar antes Sincronizar; para unirte basta un código.'}
              </p>
              <input className="busca duelo-input" placeholder="Código del club (déjalo vacío para crear uno)"
                value={clubCod} onChange={e => { setClubCod(e.target.value); setClubError('') }} />
              <input className="busca duelo-input" placeholder="Tu nombre en el club"
                value={clubAlias} onChange={e => { setClubAlias(e.target.value); setClubError('') }} maxLength={20} />
              {clubError && <p className="duelo-error">{clubError}</p>}
              <button className="accion-principal" onClick={() => {
                const alias = clubAlias.trim()
                if (!alias) { setClubError('Ponte un nombre para el ranking.'); return }
                if (clubCod.trim()) {
                  const sc = decodificaSync(clubCod)
                  if (!sc) { setClubError('Ese código no parece válido: revisa que esté completo.'); return }
                  guardaClub({ url: sc.url, sala: sc.room, alias }); setClubModal(false); setClubInvitar(true); return
                }
                if (!sync) { setClubError('Para crear un club, configura primero Sincronizar (arriba) o pide un código.'); return }
                const sala = 'club-' + Math.random().toString(36).slice(2, 8)
                guardaClub({ url: sync.url, sala, alias }); setClubModal(false); setClubInvitar(true)
              }}>
                {clubCod.trim() ? 'Unirme al club' : 'Crear club'}
              </button>
            </div>
          </div>
        </div>
      )}
      {clubInvitar && club && (
        <div className="overlay" onClick={() => setClubInvitar(false)} role="dialog" aria-modal="true" aria-label="Invitar al club">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setClubInvitar(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Invita a tu club</h2>
              <p className="modal-res">Comparte este código: quien lo pegue en Club de maratón entrará en tu sala.</p>
              <code className="club-codigo">{codigoSync(club.url, club.sala)}</code>
              <button className="accion-principal" onClick={() => {
                try { navigator.clipboard.writeText(codigoSync(club.url, club.sala)) } catch {}
              }}>Copiar código</button>
            </div>
          </div>
        </div>
      )}
      {perfilModal && (
        <div className="overlay" onClick={() => setPerfilModal(false)} role="dialog" aria-modal="true" aria-label="Perfil compartible">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPerfilModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Perfil compartible</h2>
              <p className="modal-res">
                Genera una página de <b>solo lectura</b> con tu progreso, logros y valoraciones.
                Todo va dentro del propio enlace: quien lo reciba no puede tocar tu maratón (tus notas de texto no se incluyen).
              </p>
              <input className="busca sync-input" placeholder="Tu nombre para el perfil" autoComplete="off" value={perfilNombre}
                maxLength={30} onChange={e => setPerfilNombre(e.target.value)} aria-label="Tu nombre" />
              <div className="modal-acciones">
                <button className="accion-principal" onClick={() => {
                  const n = perfilNombre.trim() || 'Alguien'
                  setPerfilUrl(generarPerfil(n))
                  setPerfilCopiado(false)
                }}>Generar enlace</button>
                {perfilUrl && (
                  <button className="chip-btn" onClick={() => {
                    navigator.clipboard.writeText(perfilUrl).then(() => {
                      setPerfilCopiado(true); setTimeout(() => setPerfilCopiado(false), 2500)
                    })
                  }}>{perfilCopiado ? '¡Copiado!' : 'Copiar enlace'}</button>
                )}
                {perfilUrl && !!navigator.share && (
                  <button className="chip-btn" onClick={() => {
                    navigator.share({ url: perfilUrl, title: 'Mi maratón Marvel' }).catch(() => {})
                  }}>Compartir…</button>
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

      {ajustes && (
        <div className="overlay" onClick={() => setAjustes(false)} role="dialog" aria-modal="true" aria-label="Ajustes">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setAjustes(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Ajustes</h2>
              <p className="modal-res">Se guardan en este navegador. Lo que cambies aquí no afecta a tu progreso.</p>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">Densidad</h3>
                  <p className="ajuste-pista">El modo compacto esconde carátulas y sinopsis: cabe el triple de títulos en pantalla.</p>
                </div>
                <div className="ajuste-ops">
                  <button className="chip-btn" aria-pressed={!compacto} onClick={() => { if (compacto) alternaCompacto() }}>Completa</button>
                  <button className="chip-btn" aria-pressed={compacto} onClick={() => { if (!compacto) alternaCompacto() }}>Compacta</button>
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">Orden</h3>
                  <p className="ajuste-pista">Dentro de cada era. El cronológico es el orden del maratón; los otros dos reordenan por nota.</p>
                </div>
                <div className="ajuste-ops">
                  {[['crono', 'Cronológico'], ['imdb', 'Nota IMDb'], ['nota', 'Tu nota']].map(([id, nombre]) => (
                    <button key={id} className="chip-btn" aria-pressed={orden === id} onClick={() => setOrden(id)}>{nombre}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">Fondo del encabezado</h3>
                  <p className="ajuste-pista">El banner usa el fotograma del próximo estreno, así que se renueva solo. El muro son tus carátulas.</p>
                </div>
                <div className="ajuste-ops">
                  {FONDOS.map(f => (
                    <button key={f.id} className="chip-btn" aria-pressed={fondo === f.id} onClick={() => ponFondo(f.id)}>{f.nombre}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">Color de acento</h3>
                  <p className="ajuste-pista">Cambia el color que la app usa para destacar. No cambia el modo claro u oscuro, que lo decide tu sistema.</p>
                </div>
                <div className="ajuste-ops">
                  {ACENTOS.map(a => (
                    <button key={a.id} className="chip-btn" aria-pressed={acento === a.id} onClick={() => setAcento(a.id)}>{a.nombre}</button>
                  ))}
                </div>
              </div>

              <div className="ajuste">
                <div className="ajuste-cab">
                  <h3 className="ajuste-titulo">Sincronización entre dispositivos</h3>
                  <p className="ajuste-pista">
                    {syncEstado === 'ok' ? 'Activa y al día. Tu progreso viaja entre el móvil y el ordenador.'
                      : syncEstado === 'syncing' ? 'Guardando cambios…'
                      : syncEstado === 'error' ? 'Activa, pero ahora mismo sin conexión. Se reintenta al volver a la app.'
                      : 'Apagada. Tu progreso vive solo en este navegador.'}
                  </p>
                </div>
                <div className="ajuste-ops">
                  <button className={`chip-btn sync-btn ${syncEstado}`} onClick={() => { setAjustes(false); setSyncModal(true) }}>
                    {sync ? 'Configurar' : 'Activar'}
                  </button>
                </div>
              </div>

              {!YA_INSTALADA && (ES_IOS || instalable) && (
                <div className="ajuste">
                  <div className="ajuste-cab">
                    <h3 className="ajuste-titulo">Como app</h3>
                    <p className="ajuste-pista">
                      {ES_IOS
                        ? 'En Safari: botón Compartir y «Añadir a pantalla de inicio». La guía queda a pantalla completa, con su icono.'
                        : 'Instálala y la guía tendrá su propia ventana y su icono, sin el navegador alrededor.'}
                    </p>
                  </div>
                  {!ES_IOS && (
                    <div className="ajuste-ops">
                      <button className="chip-btn" onClick={instalar}>Instalar</button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      {planModal && plan && (
        <div className="overlay" onClick={() => setPlanModal(false)} role="dialog" aria-modal="true" aria-label="Plan de sesión">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPlanModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">Plan de sesión</h2>
              <p className="modal-res">¿Cuánto tiempo tienes hoy? Te propongo qué ver siguiendo el orden del maratón.</p>
              <div className="plan-controles">
                {[1, 2, 3, 4].map(h => (
                  <button key={h} className="chip-btn" aria-pressed={planHoras === h}
                    onClick={() => setPlanHoras(h)}>{h} h</button>
                ))}
                <button className="chip-btn destacado" aria-pressed={planExpress}
                  onClick={() => setPlanExpress(x => !x)}>Solo ruta express</button>
              </div>
              {plan.items.length === 0 ? (
                <p className="modal-res">Nada pendiente encaja en ese tiempo{planExpress ? ' dentro de la ruta express' : ''}. Prueba con más horas o quita el filtro.</p>
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
                            ? `${nEps} capítulo${nEps > 1 ? 's' : ''} desde T${desde.s}·E${desde.n} · ~${fmtDur(min)}`
                            : `Completa · ${fmtDur(min)}`}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {plan.items.length > 0 && (
                <p className="plan-total">Total del plan: <b>{fmtDur(plan.total)}</b> de {planHoras} h disponibles</p>
              )}
            </div>
          </div>
        </div>
      )}

      {syncModal && (
        <SyncModal sync={sync} estado={syncEstado}
          onActivar={activarSync} onDesactivar={desactivarSync}
          onClose={() => setSyncModal(false)} />
      )}

      {detalle && (
        <Detalle d={detalle} vista={!!vistas[detalle.item.id]}
          onToggle={() => toggle(detalle.item.id)}
          onClose={() => setDetalle(null)}
          eps={eps} toggleEp={toggleEp}
          nota={notas[detalle.item.id] || {}}
          ponNota={(campo, valor) => ponNota(detalle.item.id, campo, valor)}
          listas={listas} toggleEnLista={toggleEnLista} club={club} onNav={navegaDetalle}
          onIrA={d => setDetalle(d)} />
      )}

      <Footer onReset={() => { setVistas({}); try { localStorage.setItem(KEY, '{}') } catch {} }} />
    </div>
  )
}

function SyncModal({ sync, estado, onActivar, onDesactivar, onClose }) {
  const [modo, setModo] = useState(sync ? 'activo' : 'menu')
  const [url, setUrl] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const crear = async () => {
    const u = normalizaDbUrl(url)
    if (!u) { setError('Esa URL no parece de Firebase (debe terminar en firebaseio.com o firebasedatabase.app).'); return }
    setError('')
    const ok = await onActivar(u, null)
    if (ok) setModo('activo')
    else setError('No se pudo escribir en la base de datos. Revisa que las reglas permitan lectura y escritura.')
  }
  const unirse = async () => {
    const conf = decodificaSync(codigo)
    if (!conf) { setError('Código no válido.'); return }
    setError('')
    const ok = await onActivar(conf.url, conf.room)
    if (ok) setModo('activo')
    else setError('No se pudo conectar con ese código.')
  }
  const copiarCodigo = () => {
    if (!sync) return
    navigator.clipboard.writeText(codigoSync(sync.url, sync.room)).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    })
  }
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sincronización">
      <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="modal-info">
          <h2 className="modal-titulo">Sincronización entre dispositivos</h2>
          {modo === 'activo' && sync ? (
            <>
              <p className="modal-res">
                Tu progreso se guarda en tu base de datos de Firebase y se actualiza solo
                (al momento en este dispositivo; cada pocos segundos en los demás).
                Estado: <b>{estado === 'ok' ? 'conectado' : estado === 'error' ? 'sin conexión' : 'guardando…'}</b>
              </p>
              <p className="modal-res">Para conectar otro dispositivo (el móvil, por ejemplo), abre allí la web,
                pulsa Sincronizar → «Conectar con un código» y pega este código:</p>
              <div className="sync-codigo">
                <code>{codigoSync(sync.url, sync.room)}</code>
                <button className="chip-btn" onClick={copiarCodigo}>{copiado ? '¡Copiado!' : 'Copiar'}</button>
              </div>
              <div className="modal-acciones">
                <button className="chip-btn peligro" onClick={() => { onDesactivar(); setModo('menu') }}>
                  Desconectar este dispositivo
                </button>
              </div>
            </>
          ) : modo === 'crear' ? (
            <>
              <p className="modal-res">Necesitas una base de datos gratuita de Firebase (2 minutos, una sola vez):</p>
              <ol className="sync-pasos">
                <li>Entra en <b>console.firebase.google.com</b> con tu cuenta de Google y crea un proyecto (el nombre da igual).</li>
                <li>En el menú: <b>Compilación → Realtime Database → Crear base de datos</b>, elige la zona y el <b>modo de prueba</b>.</li>
                <li>En la pestaña <b>Reglas</b>, deja lectura y escritura en <code>true</code> y publica.</li>
                <li>Copia la <b>URL</b> que aparece arriba de la pestaña Datos (algo como <code>https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app</code>) y pégala aquí:</li>
              </ol>
              <input className="busca sync-input" type="url" name="dburl" placeholder="https://…firebasedatabase.app" spellCheck={false}
                autoComplete="off" aria-label="URL de la base de datos" value={url} onChange={e => setUrl(e.target.value)} />
              {error && <p className="import-error">{error}</p>}
              <div className="modal-acciones">
                <button className="accion-principal" onClick={crear}>Activar sincronización</button>
                <button className="chip-btn" onClick={() => { setModo('menu'); setError('') }}>Volver</button>
              </div>
            </>
          ) : modo === 'unir' ? (
            <>
              <p className="modal-res">Pega el código que te dio tu otro dispositivo:</p>
              <input className="busca sync-input" name="codigo" placeholder="Código de sincronización" spellCheck={false}
                autoComplete="off" aria-label="Código de sincronización" value={codigo} onChange={e => setCodigo(e.target.value)} />
              {error && <p className="import-error">{error}</p>}
              <div className="modal-acciones">
                <button className="accion-principal" onClick={unirse}>Conectar</button>
                <button className="chip-btn" onClick={() => { setModo('menu'); setError('') }}>Volver</button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-res">Conecta tus dispositivos para que el progreso se comparta solo,
                usando tu propia base de datos gratuita de Firebase (tus datos son solo tuyos).</p>
              <div className="modal-acciones">
                <button className="accion-principal" onClick={() => setModo('crear')}>Soy el primer dispositivo</button>
                <button className="chip-btn" onClick={() => setModo('unir')}>Conectar con un código</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Footer({ onReset }) {
  const [confirmando, setConfirmando] = useState(false)
  const [sonido, setSonido] = useState(() => {
    try { return localStorage.getItem('maraton-marvel-sonido-v1') === '1' } catch { return false }
  })
  const [copiado, setCopiado] = useState(false)
  const [importando, setImportando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [msgImport, setMsgImport] = useState('')
  const [confirmaImport, setConfirmaImport] = useState(null)
  const [rescate, setRescate] = useState(() => {
    try {
      const g = JSON.parse(localStorage.getItem(KEY_RESCATE))
      return g && Date.now() - g.t < 7 * 864e5 ? g : null
    } catch { return null }
  })
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
    } catch { setMsgImport('Código no válido'); return }
    if (!datos || typeof datos !== 'object' || (!datos.v && !datos.e && !datos.n && !datos.l)) {
      setMsgImport('Código no válido'); return
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
      const claves = [KEY, KEY_EPS, KEY_NOTAS, KEY_LISTAS, 'maraton-marvel-sync-v1', 'maraton-marvel-amigo-v1', 'maraton-marvel-club-v1']
      // y lo que se haya apartado por venir roto o por un rescate: es justo lo
      // que no se puede perder. La caché de TMDB no entra, que son megas y se
      // vuelve a bajar sola.
      for (const k of Object.keys(localStorage)) {
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
      URL.revokeObjectURL(a.href)
    } catch {}
  }
  const restauraCopia = ev => {
    const archivo = ev.target.files && ev.target.files[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = () => {
      try {
        const j = JSON.parse(lector.result)
        if (j.app !== 'maraton-marvel' || !j.datos) throw new Error('formato')
        Object.entries(j.datos).forEach(([k, v]) => {
          if (k.startsWith('maraton-marvel-') || k === KEY) localStorage.setItem(k, v)
        })
        window.location.reload()
      } catch {
        setMsgImport('Ese archivo no parece una copia de la app')
        setImportando(true)
      }
    }
    lector.readAsText(archivo)
  }
  return (
    <footer>
      <p className="nota-pie">
        Pulsa una tarjeta para ver su ficha completa; la casilla redonda marca vista o pendiente y se guarda en este navegador.
        Las estrellas son la nota de IMDb y las duraciones de las series son aproximadas.
        La Ruta express deja solo lo imprescindible para llegar a Vengadores: Doomsday.
      </p>
      <p className="nota-pie nota-creditos">
        Carátulas, fotogramas, tráilers y reparto de <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>;
        este producto usa su API pero no está avalado ni certificado por TMDB.
        La disponibilidad por plataforma y sus logos vienen de <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a> a través de TMDB.
      </p>
      <div className="reset">
        <button className="chip-btn" onClick={exportar}>
          {copiado ? '¡Copiado!' : 'Copiar código de progreso'}
        </button>
        <button className="chip-btn" onClick={() => { setImportando(i => !i); setMsgImport('') }}>
          {importando ? 'Cancelar' : 'Cargar código'}
        </button>
        {importando && (
          <span className="importar">
            <input className="busca" name="codigo-progreso" placeholder="Pega el código aquí" spellCheck={false} autoComplete="off"
              aria-label="Código de progreso" value={codigo} onChange={e => setCodigo(e.target.value)} />
            <button className="chip-btn" onClick={importar}>Cargar</button>
            {msgImport && <span className="import-error">{msgImport}</span>}
          </span>
        )}
        {rescate && Object.keys(rescate.v || {}).length > 0 && (
          <div className="aviso info en-pie" role="status">
            <p className="aviso-texto">
              La sincronización dejó tu progreso a cero y antes tenías{' '}
              <b>{Object.keys(rescate.v).length} título{Object.keys(rescate.v).length === 1 ? '' : 's'}</b>.
              Se guardó una copia por si fue un accidente.
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
              }}>Recuperar ese progreso</button>
              <button className="chip-btn" onClick={() => {
                try { localStorage.removeItem(KEY_RESCATE) } catch {}
                setRescate(null)
              }}>Descartar</button>
            </div>
          </div>
        )}
        {confirmaImport && (
          <div className="aviso peligro en-pie" role="alertdialog" aria-label="Confirmar carga de progreso">
            <p className="aviso-texto">
              Cargar este código <b>sustituye</b> tu progreso: pasarías de{' '}
              <b>{confirmaImport.tengo} título{confirmaImport.tengo === 1 ? '' : 's'}</b> a{' '}
              <b>{confirmaImport.traen} título{confirmaImport.traen === 1 ? '' : 's'}</b>.
              {confirmaImport.traen < confirmaImport.tengo && ' Esto no se puede deshacer: descarga antes una copia si quieres conservarlo.'}
            </p>
            <div className="aviso-acciones">
              <button className="chip-btn peligro" onClick={() => aplicaImport(confirmaImport.datos)}>
                Sí, sustituir mi progreso
              </button>
              <button className="chip-btn" onClick={() => setConfirmaImport(null)}>Cancelar</button>
            </div>
          </div>
        )}
        <button className="chip-btn" aria-pressed={sonido} onClick={() => {
          const v = !sonido
          setSonido(v)
          try { localStorage.setItem('maraton-marvel-sonido-v1', v ? '1' : '0') } catch {}
          if (v) suenaPop.ctx = null
        }}>
          {sonido ? 'Sonido al marcar: sí' : 'Sonido al marcar: no'}
        </button>
        <button className="chip-btn" onClick={descargaCopia}>Descargar copia</button>
        <label className="chip-btn restaurar">
          Restaurar copia
          <input type="file" accept="application/json,.json" onChange={restauraCopia} aria-label="Restaurar copia de seguridad" />
        </label>
        <button className="chip-btn" onClick={() => setConfirmando(c => !c)}>
          {confirmando ? 'Cancelar' : 'Reiniciar progreso'}
        </button>
        {confirmando && (
          <button className="chip-btn peligro" onClick={() => { onReset(); setConfirmando(false) }}>
            ¿Seguro? Sí, borrar todo
          </button>
        )}
      </div>
    </footer>
  )
}
