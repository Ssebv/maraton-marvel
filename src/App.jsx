import { useEffect, useMemo, useState } from 'react'
import { DATA, ESTRENOS, JOYA_MIN, KEY } from './data.js'
import { POSTERS } from './posters.js'
import { PEOPLE } from './people.js'
import { EPISODES } from './episodes.js'

const KEY_EPS = 'maraton-marvel-eps-v1'
const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

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
  const [ancha, setAncha] = useState(false)
  const src = POSTERS[item.id]
  if (!src || err) return <Cover item={item} c={c} esComic={esComic} />
  if (ancha) {
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
    <img className="cover foto" src={src} alt={`Póster de ${item.t}`}
      loading="lazy"
      onLoad={e => { if (e.target.naturalWidth > e.target.naturalHeight * 1.05) setAncha(true) }}
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

function Calendario() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const objetivo = ESTRENOS.find(e => e.fecha && new Date(e.fecha + 'T00:00:00') > ahora)
  const fmtFecha = f => f
    ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  let cuenta = null
  if (objetivo) {
    const diff = new Date(objetivo.fecha + 'T00:00:00') - ahora
    const dias = Math.floor(diff / 86400000)
    const hh = String(Math.floor(diff / 3600000) % 24).padStart(2, '0')
    const mm = String(Math.floor(diff / 60000) % 60).padStart(2, '0')
    const ss = String(Math.floor(diff / 1000) % 60).padStart(2, '0')
    cuenta = { dias, hh, mm, ss }
  }
  return (
    <section className="calendario" aria-label="Calendario de estrenos">
      {objetivo && cuenta && (
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
        </div>
      )}
      <div className="proximos">
        {ESTRENOS.filter(e => !objetivo || e.t !== objetivo.t).map(e => (
          <div className="proximo" key={e.t}>
            <span className="proximo-fecha">{fmtFecha(e.fecha) || e.aprox}</span>
            <span className="proximo-titulo">{e.t}</span>
            <span className="proximo-tipo">{e.tipo}</span>
            <span className="proximo-nota">{e.n}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Card({ item, num, c, esComic, vista, onToggle, onAbrir, delay, eps }) {
  let epProg = null
  if (item.tipo === 'serie' && EPISODES[item.id]) {
    const total = EPISODES[item.id].length
    const hechos = EPISODES[item.id].filter(e => eps[`${item.id}:${e.s}:${e.n}`]).length
    if (hechos > 0 && !vista) epProg = `${hechos}/${total} ep`
  }
  return (
    <article className={`card${vista ? ' vista' : ''}`}
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

function Detalle({ d, vista, onToggle, onClose, eps, toggleEp }) {
  const { item, c, esComic } = d
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  const directores = item.dir
    ? limpiaNombre(item.dir).split(/ y | & /).map(s => s.trim()).filter(Boolean)
    : []
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
                              {hecho ? <CheckIcon /> : <span className="ep-num">{e.n}</span>}
                            </span>
                            <span className="ep-info">
                              <span className="ep-titulo">{e.t}</span>
                              {e.f && <span className="ep-fecha">{e.f}</span>}
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
          <div className="modal-acciones">
            <button className={`accion-principal${vista ? ' hecha' : ''}`} onClick={onToggle}>
              {vista ? '✓ Vista — marcar pendiente' : esComic ? 'Marcar como leído' : 'Marcar como vista'}
            </button>
            {!esComic && (
              <>
                <a className="ghost" href={urlTrailer(item.t)} target="_blank" rel="noopener noreferrer">▶ Tráiler</a>
                <a className="ghost" href={urlImdb(item.t)} target="_blank" rel="noopener noreferrer">IMDb</a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [vistas, setVistas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
  })
  const [filtros, setFiltros] = useState({ series: false, opc: false, vistas: false, joyas: false, express: false })
  const [vista, setVista] = useState('crono')
  const [detalle, setDetalle] = useState(null)
  const [busca, setBusca] = useState('')
  const [eps, setEps] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY_EPS)) || {} } catch { return {} }
  })
  const toggleEp = clave => setEps(prev => {
    const next = { ...prev }
    if (next[clave]) delete next[clave]; else next[clave] = 1
    try { localStorage.setItem(KEY_EPS, JSON.stringify(next)) } catch {}
    return next
  })

  const toggle = id => setVistas(prev => {
    const next = { ...prev }
    if (next[id]) delete next[id]; else next[id] = 1
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
            <div className="stat siguiente-stat">
              <span className="stat-label">▶ Siguiente</span>
              <span className="stat-sig">{stats.siguiente.t}</span>
              <span className="stat-foot">{stats.siguiente.h} · {fmtDur(stats.siguiente.d)}</span>
            </div>
          )}
        </div>
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
      </section>

      <Calendario />

      <header className="toolbar">
        <div className="controles" role="group" aria-label="Vista y filtros">
          <div className="tabs">
            <button className="tab" aria-pressed={vista === 'crono'} onClick={() => setVista('crono')}>Cronológico</button>
            <button className="tab" aria-pressed={vista === 'estreno'} onClick={() => setVista('estreno')}>Por estreno</button>
            <button className="tab" aria-pressed={vista === 'comics'} onClick={() => setVista('comics')}>Cómics</button>
            <button className="tab" aria-pressed={vista === 'stats'} onClick={() => setVista('stats')}>Estadísticas</button>
          </div>
          <button className="chip-btn destacado" aria-pressed={filtros.express} onClick={() => setF('express')}>⚡ Ruta express</button>
          <button className="chip-btn" aria-pressed={filtros.series} onClick={() => setF('series')}>Sin series</button>
          <button className="chip-btn" aria-pressed={filtros.opc} onClick={() => setF('opc')}>Sin opcionales</button>
          <button className="chip-btn" aria-pressed={filtros.vistas} onClick={() => setF('vistas')}>Solo pendientes</button>
          <button className="chip-btn" aria-pressed={filtros.joyas} onClick={() => setF('joyas')}>Joyas ★7,5+</button>
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
          <input className="busca" type="search" placeholder="Buscar…" value={busca}
            onChange={e => setBusca(e.target.value)} aria-label="Buscar título" />
          {vista === 'crono' && (
            <nav className="atajos">
              <a href="#saga-xmen">X-Men</a>
              <a href="#saga-ucm">UCM</a>
            </nav>
          )}
        </div>
      </header>

      {vista === 'stats' ? (
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
        <main className={vista === 'comics' ? 'comics' : 'crono'}>
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
                  const visibles = era.items.filter(it => pasaFiltro(it, esComic) && !oculto(it, esComic))
                  const numerados = era.items.filter(it => pasaFiltro(it, esComic))
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
                                delay={nextDelay()} eps={eps} />
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
        <main className="estreno">
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
                      delay={nextDelay()} eps={eps} />
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

      {detalle && (
        <Detalle d={detalle} vista={!!vistas[detalle.item.id]}
          onToggle={() => toggle(detalle.item.id)}
          onClose={() => setDetalle(null)}
          eps={eps} toggleEp={toggleEp} />
      )}

      <Footer onReset={() => { setVistas({}); try { localStorage.setItem(KEY, '{}') } catch {} }} />
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
            <input className="busca" placeholder="Pega el código aquí" value={codigo}
              onChange={e => setCodigo(e.target.value)} />
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
