import React, { useEffect, useMemo, useState } from 'react'
import { DATA, ESTRENOS, JOYA_MIN, KEY, MULTIVERSO } from './data.js'
import { POSTERS } from './posters.js'
import { PEOPLE } from './people.js'
import { EPISODES } from './episodes.js'

const KEY_EPS = 'maraton-marvel-eps-v1'
const KEY_SYNC = 'maraton-marvel-sync-v1'
const KEY_NOTAS = 'maraton-marvel-notas-v1'
const KEY_COMPACTO = 'maraton-marvel-compacto'
const KEY_LISTAS = 'maraton-marvel-listas-v1'

function normalizaDbUrl(txt) {
  let u = txt.trim().replace(/\/+$/, '')
  if (!u) return null
  if (!/^https?:\/\//.test(u)) u = 'https://' + u
  if (!/firebaseio\.com|firebasedatabase\.app/.test(u)) return null
  return u
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

const ORDEN_IDS = (() => {
  const a = []
  DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => a.push(it.id))))
  return a
})()
const ORDEN_EPS = (() => {
  const a = []
  ORDEN_IDS.forEach(id => (EPISODES[id] || []).forEach(e => a.push(`${id}:${e.s}:${e.n}`)))
  return a
})()
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
const VISTAS_VALIDAS = ['crono', 'estreno', 'comics', 'stats', 'galeria', 'multiverso', 'listas', 'tiempo']
const PESTANAS = [
  { id: 'crono', ico: '📖', label: 'Cronológico', corto: 'Crono' },
  { id: 'estreno', ico: '🗓️', label: 'Por estreno', corto: 'Estreno' },
  { id: 'comics', ico: '💥', label: 'Cómics', corto: 'Cómics' },
  { id: 'listas', ico: '📋', label: 'Listas', corto: 'Listas' },
  { id: 'galeria', ico: '🖼️', label: 'Galería', corto: 'Galería' },
  { id: 'multiverso', ico: '🪐', label: 'Multiverso', corto: 'Multi' },
  { id: 'tiempo', ico: '⏳', label: 'Línea temporal', corto: 'Tiempo' },
  { id: 'stats', ico: '📊', label: 'Estadísticas', corto: 'Stats' },
]
// Dúos y casos que el split por " y "/" & " rompería
const DUOS = {
  'Anthony y Joe Russo': ['Hermanos Russo'],
  'Rhys Thomas y Bert & Bertie': ['Rhys Thomas', 'Bert & Bertie'],
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

function Avatar({ nombre }) {
  const [err, setErr] = useState(false)
  const limpio = limpiaNombre(nombre)
  const src = PEOPLE[limpio]
  if (!src || err) {
    return <span className="avatar avatar-ini" aria-hidden="true">{iniciales(limpio)}</span>
  }
  return <img className="avatar" src={src} alt="" loading="lazy" onError={() => setErr(true)} />
}

const fmtFecha = f => f
  ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  : null

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
            <span className="cuenta-label">⏳ Próximo gran estreno</span>
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
            🎯 Ruta express: {meta.restante > 0
              ? <>quedan <b>{fmtDur(meta.restante)}</b> · necesitas <b>{meta.necesario} min/día</b></>
              : <b>¡completada! Llegas de sobra al estreno</b>}
          </span>
          {meta.restante > 0 && (
            <span className={`objetivo-chip ${meta.alDia ? 'ok' : 'tarde'}`}>
              {meta.alDia
                ? `Vas al día · ${meta.ritmo} min/día en las últimas 2 semanas`
                : `Acelera · llevas ${meta.ritmo} min/día en las últimas 2 semanas`}
            </span>
          )}
          <AvisosBtn />
        </div>
      )}
    </div>
  )
}

function AvisosBtn() {
  const sop = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
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
    ? <span className="aviso-on">🔔 Te avisaré cuando algo se estrene</span>
    : <button className="chip-btn aviso-btn" onClick={activar}>🔔 Avisarme de estrenos</button>
}

const TITULOS = Object.fromEntries(DATA.flatMap(s => s.eras.flatMap(e => e.items)).map(i => [i.id, i.t]))

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
    <div className="novedades" role="status">
      <span>🔔 <b>Desde tu última visita:</b> {lista.join(' · ')}</span>
      <button className="cerrar" onClick={() => setCerrado(true)} aria-label="Cerrar aviso">✕</button>
    </div>
  )
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
    let comicsVistos = 0, comicsTot = 0
    const sagas = []
    DATA.forEach(sg => {
      const esComic = sg.saga === 'comics'
      const items = sg.eras.flatMap(era => era.items.map(item => ({ item, c: era.c })))
      let v = 0
      items.forEach(({ item }) => {
        if (esComic) { comicsTot++; if (vistasP[item.id]) { comicsVistos++; v++ }; return }
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
    return { totMin, vistoMin, titulosVistos, titulosTot, comicsVistos, comicsTot, sagas, valoradas }
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
        </div>
        <div className="mapa" aria-label="Mapa de progreso">
          {est.sagas.map(sg => (
            <div className="mapa-fila" key={sg.saga}>
              <span className="mapa-label">
                {sg.saga === 'xmen' ? 'X-Men' : sg.saga === 'ucm' ? 'UCM' : 'Cómics'}
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
      <input className="busca sync-input" placeholder="Nombre de la lista (p. ej. Maratón con mi pareja)"
        value={nombre} maxLength={40} onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') enviar() }} aria-label="Nombre de la lista" />
      <button className="accion-principal" onClick={enviar}>Crear lista</button>
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
      <input className="busca sync-input" placeholder="Buscar título para añadir a la lista…" value={q}
        onChange={e => setQ(e.target.value)} aria-label="Añadir título a la lista"
        spellCheck={false} autoComplete="off" />
      {resultados.length > 0 && (
        <div className="sugerencias">
          {resultados.map(({ item }) => (
            <button key={item.id} className="chip-btn" aria-pressed={enLista.includes(item.id)}
              onClick={() => onAgregar(item.id)}>
              {enLista.includes(item.id) ? '✓ ' : '＋ '}{item.t}
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
  const capas = useMemo(() => [90, 55, 28].map((n, capa) => {
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
        <div className="chips">
          {item.uni && <span className="tipo uni">{item.uni}</span>}
          {item.tipo === 'serie' && <span className="tipo serie">Serie</span>}
          {item.tipo === 'esp' && <span className="tipo esp">Especial</span>}
          {item.opt && <span className="tipo opc">Opcional</span>}
          {item.plat && <span className="tipo plat">{item.plat}</span>}
        </div>
      </div>
    </article>
  )
}

function Detalle({ d, vista, onToggle, onClose, eps, toggleEp, nota, ponNota, listas, toggleEnLista }) {
  const { item, c, esComic } = d
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  const dirLimpio = item.dir ? limpiaNombre(item.dir) : ''
  const directores = DUOS[dirLimpio]
    || dirLimpio.split(/, | y | & /).map(s => s.trim()).filter(s => s && s !== 'otros')
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.t}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="modal-cover">
          <Portada item={item} c={c} esComic={esComic} />
        </div>
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
                ? <>🍿 Sin escenas post-créditos{item.pcn ? ` — ${item.pcn}` : ' — puedes saltarte los créditos'}</>
                : <>🍿 Escenas en los créditos: <b>{item.pc}</b>{item.pcn ? ` · ${item.pcn}` : ''}</>}
            </p>
          )}
          {(directores.length > 0 || item.cast) && (
            <div className="personas">
              {directores.map(p => (
                <a className="persona" key={p} href={urlPersona(p)} target="_blank" rel="noopener noreferrer"
                  title={`Ver filmografía de ${p}`}>
                  <Avatar nombre={p} />
                  <span className="persona-nombre">{p}</span>
                  <span className="persona-rol">Dirección</span>
                </a>
              ))}
              {(item.cast || []).map(p => (
                <a className="persona" key={p} href={urlPersona(p)} target="_blank" rel="noopener noreferrer"
                  title={`Ver filmografía de ${limpiaNombre(p)}`}>
                  <Avatar nombre={p} />
                  <span className="persona-nombre">{limpiaNombre(p)}</span>
                  <span className="persona-rol">Reparto</span>
                </a>
              ))}
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
                        return (
                          <button key={clave} className={`ep${hecho ? ' hecho' : ''}`}
                            onClick={() => toggleEp(clave)}
                            title={hecho ? 'Marcar pendiente' : 'Marcar visto'}>
                            <span className="ep-thumb" style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }}>
                              {POSTERS[item.id] && <img className="ep-img" src={POSTERS[item.id]} alt="" loading="lazy" />}
                              <span className={`ep-velo${hecho ? ' hecho' : ''}`} />
                              {hecho ? <CheckIcon /> : <span className="ep-num">{e.n}</span>}
                            </span>
                            <span className="ep-info">
                              <span className="ep-titulo">{e.t}</span>
                              {e.f && <span className="ep-fecha">{new Date(e.f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="valoracion">
            <span className="valoracion-label">Tu valoración</span>
            <span className="estrellas" role="radiogroup" aria-label="Tu valoración">
              {[1, 2, 3, 4, 5].map(p => (
                <button key={p} className={`estrella${nota.p >= p ? ' on' : ''}`}
                  aria-label={`${p} estrellas`} onClick={() => ponNota('p', p)}>★</button>
              ))}
            </span>
            <input className="busca nota-input" placeholder="Tus notas (solo tuyas)…"
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
                    {l.items.includes(item.id) ? '✓ ' : '＋ '}{l.nombre}
                  </button>
                ))}
              </span>
            </div>
          )}
          <div className="modal-acciones">
            <button className={`accion-principal${vista ? ' hecha' : ''}`} onClick={onToggle}>
              {vista ? '✓ Vista — marcar pendiente' : esComic ? 'Marcar como leído' : 'Marcar como vista'}
            </button>
            {!esComic && (
              <>
                <a className="ghost" href={urlTrailer(item.t)} target="_blank" rel="noopener noreferrer">▶ Tráiler</a>
                <a className="ghost" href={urlImdb(item.t)} target="_blank" rel="noopener noreferrer">IMDb</a>
                {!item.tipo && (
                  <a className="ghost" href={`https://letterboxd.com/search/films/${encodeURIComponent(item.t)}/`}
                    target="_blank" rel="noopener noreferrer">Letterboxd</a>
                )}
              </>
            )}
          </div>
        </div>
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
    x.fillText('⏳ PRÓXIMO GRAN ESTRENO', 116, y + 56)
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
  const [vistas, setVistas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
  })
  const [perfilModal, setPerfilModal] = useState(false)
  const [perfilNombre, setPerfilNombre] = useState('')
  const [perfilUrl, setPerfilUrl] = useState('')
  const [perfilCopiado, setPerfilCopiado] = useState(false)
  const perfil = useMemo(() => {
    const cod = new URLSearchParams(window.location.search).get('perfil')
    if (!cod) return null
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(cod.replace(/-/g, '+').replace(/_/g, '/')))))
      return {
        nombre: j.n || 'Alguien',
        vistasP: deBits(j.v, ORDEN_IDS),
        epsP: deBits(j.e, ORDEN_EPS),
        notasP: Object.fromEntries((j.r || []).map(([i, p]) => [ORDEN_IDS[i], p])),
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
  const [filtros, setFiltros] = useState({ series: false, opc: false, vistas: false, joyas: false, express: false })
  const [vista, setVista] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return VISTAS_VALIDAS.includes(h) ? h : 'crono'
  })
  useEffect(() => {
    if (perfil) return
    history.replaceState(null, '', vista === 'crono' ? window.location.pathname : '#' + vista)
  }, [vista, perfil])
  useEffect(() => {
    if (perfil) return
    const onHash = () => {
      const h = window.location.hash.replace('#', '')
      setVista(VISTAS_VALIDAS.includes(h) ? h : 'crono')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [perfil])
  const [detalle, setDetalle] = useState(null)
  const [tierra, setTierra] = useState(null)
  const [mvModo, setMvModo] = useState('sistema')
  const [planModal, setPlanModal] = useState(false)
  const [planHoras, setPlanHoras] = useState(2)
  const [planExpress, setPlanExpress] = useState(true)
  const [orden, setOrden] = useState('crono')
  const [listas, setListas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_LISTAS)) || [] } catch { return [] }
  })
  const [listaActiva, setListaActiva] = useState(null)
  const [cine, setCine] = useState(false)
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
  const [busca, setBusca] = useState('')
  const [compacto, setCompacto] = useState(() => localStorage.getItem(KEY_COMPACTO) === '1')
  const [notas, setNotas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_NOTAS)) || {} } catch { return {} }
  })
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
  const [eps, setEps] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_EPS)) || {} } catch { return {} }
  })
  const [sync, setSync] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_SYNC)) } catch { return null }
  })
  const [syncEstado, setSyncEstado] = useState('off')
  const [syncModal, setSyncModal] = useState(false)
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setPlanModal(false); setPerfilModal(false); setSyncModal(false) }
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
      if (datos && datos.t && datos.t > ultimoAplicado.current) {
        ultimoAplicado.current = datos.t
        aplicandoRemoto.current = true
        setVistas(datos.v || {})
        setEps(datos.e || {})
        setNotas(datos.n || {})
        setListas(datos.l || [])
        try {
          localStorage.setItem(KEY, JSON.stringify(datos.v || {}))
          localStorage.setItem(KEY_EPS, JSON.stringify(datos.e || {}))
          localStorage.setItem(KEY_NOTAS, JSON.stringify(datos.n || {}))
          localStorage.setItem(KEY_LISTAS, JSON.stringify(datos.l || []))
        } catch {}
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
        const v = { ...(datos && datos.v || {}), ...vistas }
        const e = { ...(datos && datos.e || {}), ...eps }
        const n = { ...(datos && datos.n || {}), ...notas }
        const lRemoto = (datos && datos.l) || []
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
    if (next[clave]) delete next[clave]; else next[clave] = Date.now()
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    return next
  })

  const toggle = id => setVistas(prev => {
    const next = { ...prev }
    if (next[id]) delete next[id]; else next[id] = Date.now()
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    return next
  })
  const setF = k => setFiltros(f => ({ ...f, [k]: !f[k] }))

  const pasaFiltro = (item, esComic) => {
    if (busca && !norm(item.t).includes(norm(busca))) return false
    if (filtros.series && item.tipo === 'serie') return false
    if (filtros.opc && item.opt) return false
    if (filtros.joyas && !esComic && (item.s == null || item.s < JOYA_MIN)) return false
    if (filtros.express && !item.exp) return false
    return true
  }

  const stats = useMemo(() => {
    let totV = 0, totN = 0, mins = 0, siguiente = null
    const porSaga = {}
    DATA.forEach(saga => {
      const esComic = saga.saga === 'comics'
      let v = 0, n = 0, m = 0
      saga.eras.forEach(era => era.items.forEach(item => {
        if (!pasaFiltro(item, esComic)) return
        n++
        if (vistas[item.id]) v++
        else {
          if (item.d) m += item.d
          if (!esComic && !siguiente) siguiente = item
        }
      }))
      porSaga[saga.saga] = { v, n, m: esComic ? 0 : m }
      totV += v; totN += n
      if (!esComic) mins += m
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
      if (saga.saga === 'comics') return
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
    let epVistos = 0, epTot = 0
    Object.entries(EPISODES).forEach(([sid, lista]) => {
      epTot += lista.length
      epVistos += lista.filter(e => eps[`${sid}:${e.s}:${e.n}`] || vistas[sid]).length
    })
    const comics = DATA.find(sg => sg.saga === 'comics')
    const comicsTot = comics.eras.reduce((a, e) => a + e.items.length, 0)
    const comicsVistos = comics.eras.reduce((a, e) => a + e.items.filter(i => vistas[i.id]).length, 0)
    return { fases, totMin, vistoMin, titulosVistos, titulosTot, tipos: Object.values(tipos), epVistos, epTot, comicsTot, comicsVistos }
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
    DATA.forEach(sg => { if (sg.saga === 'comics') return
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

  const objetivo = useMemo(() => {
    const meta = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > Date.now())
    if (!meta) return null
    const dias = Math.max(1, Math.ceil((new Date(meta.fecha + 'T00:00:00') - Date.now()) / 86400000))
    let restante = 0
    DATA.forEach(sg => { if (sg.saga === 'comics') return
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
      if (sg.saga === 'comics' || corta) continue
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
      if (saga.saga === 'comics') return
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

  let delayIdx = 0
  const nextDelay = () => Math.min((delayIdx++) * 30, 360)
  const pct = stats.totN ? Math.round(100 * stats.totV / stats.totN) : 0

  if (perfil) return <PerfilView {...perfil} />

  return (
    <div className="wrap">
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
              <span className="stat-label">▶ Siguiente</span>
              <span className="stat-sig">{stats.siguiente.t}</span>
              <span className="stat-foot">{stats.siguiente.h} · {fmtDur(stats.siguiente.d)}</span>
            </button>
          )}
        </div>
      </section>

      <Novedades eps={eps} />
      <div className="panel-superior">
        <div className="panel-izq">
        <div className="mapa" aria-label="Mapa de progreso">
          {DATA.map(saga => {
            const items = saga.eras.flatMap(era => era.items.map(item => ({ item, c: era.c })))
            const v = items.filter(({ item }) => vistas[item.id]).length
            return (
              <div className="mapa-fila" key={saga.saga}>
                <span className="mapa-label">
                  {saga.saga === 'xmen' ? 'X-Men' : saga.saga === 'ucm' ? 'UCM' : 'Cómics'}
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

      <header className="toolbar">
        <div className="controles" role="group" aria-label="Vista y filtros">
          <div className="tabs">
            {PESTANAS.map(p => (
              <button className="tab" key={p.id} aria-pressed={vista === p.id} aria-label={p.label}
                onClick={() => setVista(p.id)}>
                <span className="tab-ico" aria-hidden="true">{p.ico}</span>
                <span className="tab-txt">{p.label}</span>
                <span className="tab-corto" aria-hidden="true">{p.corto}</span>
              </button>
            ))}
          </div>
          <button className="chip-btn destacado" aria-pressed={filtros.express} onClick={() => setF('express')}>⚡ Ruta express</button>
          <button className="chip-btn" aria-pressed={filtros.series} onClick={() => setF('series')}>Sin series</button>
          <button className="chip-btn" aria-pressed={filtros.opc} onClick={() => setF('opc')}>Sin opcionales</button>
          <button className="chip-btn" aria-pressed={filtros.vistas} onClick={() => setF('vistas')}>Solo pendientes</button>
          <button className="chip-btn" aria-pressed={filtros.joyas} onClick={() => setF('joyas')}>Joyas ★7,5+</button>
          <button className="chip-btn" aria-pressed={compacto} onClick={alternaCompacto}>Compacto</button>
          <button className="chip-btn destacado" aria-pressed={planModal} onClick={() => setPlanModal(true)}>🍿 Plan de sesión</button>
          <button className="chip-btn" onClick={() => { setCineIdx(0); setCine(true) }}>🎬 Modo cine</button>
          <button className="chip-btn" onClick={() => setOrden(o => o === 'crono' ? 'imdb' : o === 'imdb' ? 'nota' : 'crono')}>
            {orden === 'crono' ? '↕ Orden: cronológico' : orden === 'imdb' ? '↕ Orden: nota IMDb' : '↕ Orden: tu nota'}
          </button>
          <button className="chip-btn" onClick={() => {
            const pendientes = []
            DATA.forEach(saga => { if (saga.saga === 'comics') return
              saga.eras.forEach(era => era.items.forEach(item => {
                if (pasaFiltro(item, false) && !vistas[item.id]) pendientes.push({ item, c: era.c })
              })) })
            if (pendientes.length) {
              const e = pendientes[Math.floor(Math.random() * pendientes.length)]
              setDetalle({ item: e.item, c: e.c, esComic: false })
            }
          }}>🎲 Sorpréndeme</button>
          <input className="busca" type="search" name="busqueda" placeholder="Buscar…" value={busca} spellCheck={false}
            autoComplete="off" onChange={e => setBusca(e.target.value)} aria-label="Buscar título" />
          <button className={`chip-btn sync-btn ${syncEstado}`} aria-live="polite" onClick={() => setSyncModal(true)}
            title={sync ? 'Sincronización activa' : 'Sincronizar entre dispositivos'}>
            {syncEstado === 'ok' ? '☁️ Sincronizado' : syncEstado === 'syncing' ? '☁️ Guardando…'
              : syncEstado === 'error' ? '☁️ Sin conexión' : '☁️ Sincronizar'}
          </button>
          {vista === 'crono' && (
            <nav className="atajos">
              <a href="#saga-xmen">X-Men</a>
              <a href="#saga-ucm">UCM</a>
            </nav>
          )}
        </div>
      </header>

      {vista === 'multiverso' && <Estrellas />}
      {vista === 'tiempo' ? (
        <main className="tiempo">
          <p className="saga-desc mv-intro">
            Cada título colocado en el año en que <b>ocurre su historia</b>, no en el que se estrenó:
            X-Men a la izquierda en dorado, UCM a la derecha en rojo. Pulsa cualquier tarjeta para abrir su ficha.
          </p>
          {(() => {
            const años = new Map()
            const fuera = []
            DATA.forEach(sg => { if (sg.saga === 'comics') return
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
                    <h2 className="lista-nombre">📋 {l.nombre}</h2>
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
                  <p className="saga-desc">Aún no tienes listas: crea la primera arriba.</p>
                ) : (
                  <div className="mv-grid">
                    {listas.map(l => {
                      const total = l.items.length
                      const v = l.items.filter(id => l.prog[id]).length
                      return (
                        <article key={l.id} className="mv-card lista-card" role="button" tabIndex={0}
                          onClick={() => setListaActiva(l.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setListaActiva(l.id) } }}>
                          <h2 className="mv-nombre">📋 {l.nombre}</h2>
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
                  <button className="tab" aria-pressed={mvModo === 'sistema'} onClick={() => setMvModo('sistema')}>🪐 Sistema</button>
                  <button className="tab" aria-pressed={mvModo === 'tarjetas'} onClick={() => setMvModo('tarjetas')}>▤ Tarjetas</button>
                </div>
              </div>
              {mvModo === 'sistema' ? (
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
          </div>

          <div className="stats-acciones">
            <button className="accion-principal compartir"
              onClick={() => compartirImagen(estadisticas, estadisticas.comicsVistos, estadisticas.comicsTot)}>
              📸 Compartir como imagen
            </button>
            <button className="chip-btn" onClick={() => { setPerfilUrl(''); setPerfilCopiado(false); setPerfilModal(true) }}>
              🔗 Perfil compartible
            </button>
          </div>

          <Actividad vistas={vistas} eps={eps} />

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
        <main className={(vista === 'comics' ? 'comics' : 'crono') + (compacto ? ' compacto' : '')}>
          {DATA.filter(saga => (vista === 'comics') === (saga.saga === 'comics')).map(saga => {
            const esComic = saga.saga === 'comics'
            const s = stats.porSaga[saga.saga]
            if (!s.n) return null
            let num = 0
            return (
              <section className="saga" data-saga={saga.saga} id={`saga-${saga.saga}`} key={saga.saga}>
                <div className="saga-head">
                  <h2>{saga.titulo}</h2>
                  <span className="uni-chip">{saga.uni}</span>
                  <span className="saga-count">
                    {s.v} / {s.n}{s.m ? ` · quedan ${fmtDur(s.m)}` : ''}
                  </span>
                </div>
                <p className="saga-desc">{saga.desc}</p>
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
          <div className="cine" role="dialog" aria-modal="true" aria-label="Modo cine">
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

      {perfilModal && (
        <div className="overlay" onClick={() => setPerfilModal(false)} role="dialog" aria-modal="true" aria-label="Perfil compartible">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPerfilModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">🔗 Perfil compartible</h2>
              <p className="modal-res">
                Genera una página de <b>solo lectura</b> con tu progreso, logros y valoraciones.
                Todo va dentro del propio enlace: quien lo reciba no puede tocar tu maratón (tus notas de texto no se incluyen).
              </p>
              <input className="busca sync-input" placeholder="Tu nombre para el perfil" value={perfilNombre}
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

      {planModal && plan && (
        <div className="overlay" onClick={() => setPlanModal(false)} role="dialog" aria-modal="true" aria-label="Plan de sesión">
          <div className="modal modal-sync" onClick={e => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setPlanModal(false)} aria-label="Cerrar">✕</button>
            <div className="modal-info">
              <h2 className="modal-titulo">🍿 Plan de sesión</h2>
              <p className="modal-res">¿Cuánto tiempo tienes hoy? Te propongo qué ver siguiendo el orden del maratón.</p>
              <div className="plan-controles">
                {[1, 2, 3, 4].map(h => (
                  <button key={h} className="chip-btn" aria-pressed={planHoras === h}
                    onClick={() => setPlanHoras(h)}>{h} h</button>
                ))}
                <button className="chip-btn destacado" aria-pressed={planExpress}
                  onClick={() => setPlanExpress(x => !x)}>⚡ Solo ruta express</button>
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
          listas={listas} toggleEnLista={toggleEnLista} />
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
          <h2 className="modal-titulo">☁️ Sincronización entre dispositivos</h2>
          {modo === 'activo' && sync ? (
            <>
              <p className="modal-res">
                Tu progreso se guarda en tu base de datos de Firebase y se actualiza solo
                (al momento en este dispositivo; cada pocos segundos en los demás).
                Estado: <b>{estado === 'ok' ? 'conectado' : estado === 'error' ? 'sin conexión' : 'guardando…'}</b>
              </p>
              <p className="modal-res">Para conectar otro dispositivo (el móvil, por ejemplo), abre allí la web,
                pulsa ☁️ Sincronizar → «Conectar con un código» y pega este código:</p>
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
  const [copiado, setCopiado] = useState(false)
  const [importando, setImportando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [msgImport, setMsgImport] = useState('')
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
  const importar = () => {
    try {
      const datos = JSON.parse(decodeURIComponent(escape(atob(codigo.trim()))))
      if (datos.v) localStorage.setItem(KEY, JSON.stringify(datos.v))
      if (datos.e) localStorage.setItem(KEY_EPS, JSON.stringify(datos.e))
      if (datos.n) localStorage.setItem(KEY_NOTAS, JSON.stringify(datos.n))
      if (datos.l) localStorage.setItem(KEY_LISTAS, JSON.stringify(datos.l))
      window.location.reload()
    } catch {
      setMsgImport('Código no válido')
    }
  }
  return (
    <footer>
      <p className="nota-pie">
        Pulsa una tarjeta para ver su ficha completa; la casilla redonda marca vista o pendiente y se guarda en este navegador.
        Las estrellas son la nota de IMDb y las duraciones de las series son aproximadas.
        La ⚡ Ruta express deja solo lo imprescindible para llegar a Vengadores: Doomsday.
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
