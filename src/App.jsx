import { useMemo, useState } from 'react'
import { DATA, JOYA_MIN, KEY } from './data.js'

const STOP = new Set(['de','del','la','el','los','las','y','en','the','of','a','al','un','una'])

function iniciales(t) {
  const limpio = t.replace(/^(X-Men|Capitán América|Spider-Man|Vengadores|Guardianes de la Galaxia|Doctor Strange|Iron Man|Thor|Ant-Man y la Avispa|Black Panther):\s*/i, m => m)
  const palabras = limpio.split(/[\s:·(]+/).filter(w => w && !STOP.has(w.toLowerCase()))
  return palabras.slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function fmtDur(d) {
  if (!d) return ''
  if (d >= 600) return `~${Math.round(d / 60)} h`
  const h = Math.floor(d / 60), m = d % 60
  if (!h) return `${m} min`
  return `${h} h${m ? ` ${m} min` : ''}`
}

const urlTrailer = t => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' tráiler español')}`
const urlImdb = t => `https://www.imdb.com/find/?q=${encodeURIComponent(t)}`
const urlPersona = n => `https://www.imdb.com/find/?q=${encodeURIComponent(n.replace(/ \((voz|creador|creadora|showrunner)\)$/, ''))}&s=nm`

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
        fontFamily="'Avenir Next Condensed','Arial Narrow',sans-serif"
        fontWeight="800" fontSize={esComic ? 34 : 42} letterSpacing="1">
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

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 8.5l3.5 3.5 7-8" fill="none" stroke="#fff" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Card({ item, num, c, esComic, vista, onToggle, delay }) {
  const meta = esComic
    ? <><span className="hist">{item.a}</span> · {item.r}</>
    : <>
        {item.s != null && <><span className="star">★ {item.s.toFixed(1)}</span> · </>}
        <span className="hist">{item.h}</span> · estreno {item.r}
        {item.d ? <> · {fmtDur(item.d)}</> : null}
      </>
  return (
    <div className={`card${vista ? ' vista' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="cover-wrap">
        <Cover item={item} c={c} esComic={esComic} />
        {vista && <span className="cover-check"><CheckIcon /></span>}
      </div>
      <div className="centro">
        <button className="toggle" aria-pressed={vista} onClick={onToggle}>
          <span className="info">
            <div className="titulo">{num}. {item.t}</div>
            <div className="meta">{meta}</div>
            {item.res && <div className="res">{item.res}</div>}
            {item.n && <div className="nota">{item.n}</div>}
          </span>
        </button>
        {(item.dir || item.cast) && (
          <div className="credits">
            {item.dir && <span>Dir. {item.dir}</span>}
            {item.cast && (
              <span>
                {' · Con '}
                {item.cast.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ', '}
                    <a href={urlPersona(p)} target="_blank" rel="noopener noreferrer"
                      title={`Ver filmografía de ${p}`}>{p}</a>
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="lado">
        <div className="chips">
          {item.uni && <span className="tipo uni">{item.uni}</span>}
          {item.tipo === 'serie' && <span className="tipo serie">Serie</span>}
          {item.tipo === 'esp' && <span className="tipo esp">Especial</span>}
          {item.opt && <span className="tipo opc">Opcional</span>}
          {item.plat && <span className="tipo plat">{item.plat}</span>}
        </div>
        {!esComic && (
          <div className="enlaces">
            <a href={urlTrailer(item.t)} target="_blank" rel="noopener noreferrer">▶<span> Tráiler</span></a>
            <a href={urlImdb(item.t)} target="_blank" rel="noopener noreferrer">IMDb</a>
          </div>
        )}
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

  const toggle = id => setVistas(prev => {
    const next = { ...prev }
    if (next[id]) delete next[id]; else next[id] = 1
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    return next
  })
  const setF = k => setFiltros(f => ({ ...f, [k]: !f[k] }))

  const pasaFiltro = (item, esComic) => {
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
          if (!esComic && !siguiente) siguiente = item.t
        }
      }))
      porSaga[saga.saga] = { v, n, m: esComic ? 0 : m }
      totV += v; totN += n
      if (!esComic) mins += m
    })
    return { totV, totN, mins, siguiente, porSaga }
  }, [vistas, filtros])

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
  const nextDelay = () => Math.min((delayIdx++) * 35, 420)

  return (
    <div className="wrap">
      <header>
        <div className="masthead">
          <h1>Maratón <span className="rojo">Marvel</span> &amp; X-Men</h1>
          <div className="total-num">
            <strong>{stats.totV}</strong> / {stats.totN} completados
            {stats.mins > 0 && ` · quedan ~${Math.round(stats.mins / 60)} h`}
          </div>
        </div>
        <div className="barra"><i style={{ width: `${stats.totN ? 100 * stats.totV / stats.totN : 0}%` }} /></div>
        <div className="controles" role="group" aria-label="Vista y filtros">
          <div className="tabs">
            <button className="tab" aria-pressed={vista === 'crono'} onClick={() => setVista('crono')}>Cronológico</button>
            <button className="tab" aria-pressed={vista === 'estreno'} onClick={() => setVista('estreno')}>Por estreno</button>
          </div>
          <button className="chip-btn destacado" aria-pressed={filtros.express} onClick={() => setF('express')}>⚡ Ruta express</button>
          <button className="chip-btn" aria-pressed={filtros.series} onClick={() => setF('series')}>Ocultar series</button>
          <button className="chip-btn" aria-pressed={filtros.opc} onClick={() => setF('opc')}>Ocultar opcionales</button>
          <button className="chip-btn" aria-pressed={filtros.vistas} onClick={() => setF('vistas')}>Ocultar completados</button>
          <button className="chip-btn" aria-pressed={filtros.joyas} onClick={() => setF('joyas')}>Solo joyas ★7,5+</button>
          {vista === 'crono' && (
            <nav className="atajos">
              <a href="#saga-xmen">X-Men</a>
              <a href="#saga-ucm">UCM</a>
              <a href="#saga-comics">Cómics</a>
            </nav>
          )}
        </div>
      </header>

      {stats.siguiente && stats.totV > 0 && stats.totV < stats.totN && (
        <div className="siguiente">
          <span className="tag">▶ Siguiente</span>
          <span className="peli">{stats.siguiente}</span>
        </div>
      )}

      {vista === 'crono' ? (
        <main>
          {DATA.map(saga => {
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
                  return (
                    <div className="era" key={era.era}>
                      <div className="era-head">
                        <h3>{era.era}</h3>
                        <span className="era-rango">{era.rango}</span>
                      </div>
                      <div className="era-borde" style={{ borderColor: era.c[0] }}>
                        <div className="grid">
                          {numerados.map((item, i) =>
                            visibles.includes(item) && (
                              <Card key={item.id} item={item} num={base + i + 1} c={era.c}
                                esComic={esComic} vista={!!vistas[item.id]}
                                onToggle={() => toggle(item.id)} delay={nextDelay()} />
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
        <main>
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
                      onToggle={() => toggle(item.id)} delay={nextDelay()} />
                  ))}
                </div>
              </section>
            )
          })}
          <p className="saga-desc" style={{ marginTop: 24 }}>
            La vista por estreno ordena películas y series por su año de salida (los cómics solo aparecen en la vista cronológica).
          </p>
        </main>
      )}

      <Footer onReset={() => { setVistas({}); try { localStorage.setItem(KEY, '{}') } catch {} }} />
    </div>
  )
}

function Footer({ onReset }) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <footer>
      <p className="nota-pie">
        Tu progreso se guarda en este navegador automáticamente. El año azul es cuándo ocurre la historia; el gris, el de estreno.
        Las estrellas son la nota de IMDb y las duraciones de las series son aproximadas (instantánea de agosto de 2026).
        La ⚡ Ruta express deja solo lo imprescindible para llegar a Vengadores: Doomsday.
      </p>
      <div className="reset">
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
