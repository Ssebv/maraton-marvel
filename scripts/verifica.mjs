#!/usr/bin/env node
// Comprobaciones que antes se hacían a mano y por eso a veces no se hacían.
// Corre con `npm test`, y `npm run build` la ejecuta antes de compilar.
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { raiz, cargaFuentes, ordenes, leeLock } from './contrato.mjs'

const fallos = [], avisos = []
const mal = m => fallos.push(m)
const ojo = m => avisos.push(m)
const bien = []

const { DATA, EPISODES, POSTERS, PEOPLE, TMDB } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(it => ({ ...it, saga: s.saga }))))
const { ids, eps } = ordenes({ DATA, EPISODES })

// ── 1 · El contrato de los bitsets ──
const lock = leeLock()
if (!lock) ojo('no hay contrato.lock.json: genéralo con `node scripts/contrato.mjs`')
else {
  const cortaIds = lock.ids.findIndex((k, i) => ids[i] !== k)
  const cortaEps = lock.eps.findIndex((k, i) => eps[i] !== k)
  if (cortaIds >= 0) mal(`ORDEN_IDS cambia en la posición ${cortaIds}: era «${lock.ids[cortaIds]}» y ahora «${ids[cortaIds]}».\n` +
    '    Solo se añade AL FINAL. Mover o quitar algo invalida los perfiles y clubes ya compartidos.')
  else if (cortaEps >= 0) mal(`ORDEN_EPS cambia en la posición ${cortaEps}: era «${lock.eps[cortaEps]}» y ahora «${eps[cortaEps]}».\n` +
    '    Solo se añade AL FINAL. Cambiar el TÍTULO de un episodio sí es seguro; su temporada o su número, no.')
  else if (ids.length > lock.ids.length || eps.length > lock.eps.length)
    ojo(`se ha añadido al final (+${ids.length - lock.ids.length} títulos, +${eps.length - lock.eps.length} episodios).\n` +
        '    Es seguro. Cuando lo des por bueno: `node scripts/contrato.mjs` para actualizar el candado.')
  else bien.push(`contrato intacto (${ids.length} títulos, ${eps.length} episodios)`)
}

// ── 2 · Dataset ──
const vistos = new Set()
for (const it of items) { if (vistos.has(it.id)) mal(`id repetido: ${it.id}`); vistos.add(it.id) }
for (const it of items) {
  if (!it.t) mal(`${it.id}: sin título`)
  if (it.saga !== 'comics' && !it.r) mal(`${it.id}: sin año`)
  if (it.s != null && (typeof it.s !== 'number' || it.s < 0 || it.s > 10)) mal(`${it.id}: nota fuera de rango (${it.s})`)
  if (it.r && (it.r < 1960 || it.r > 2035)) mal(`${it.id}: año raro (${it.r})`)
  if (it.d != null && (typeof it.d !== 'number' || it.d <= 0)) mal(`${it.id}: duración rara (${it.d})`)
}
bien.push(`${items.length} títulos, ids únicos y campos en rango`)

// ── 3 · Episodios ──
let sinT = 0, sinF = 0
for (const [id, lista] of Object.entries(EPISODES)) {
  if (!vistos.has(id)) mal(`EPISODES tiene «${id}», que no existe en data.js`)
  const porT = {}
  for (const e of lista) (porT[e.s] = porT[e.s] || []).push(e.n)
  for (const [t, ns] of Object.entries(porT)) {
    const o = [...ns].sort((a, b) => a - b)
    if (o[0] !== 1) mal(`${id} T${t}: empieza en el episodio ${o[0]}`)
    for (let i = 1; i < o.length; i++) {
      if (o[i] === o[i - 1]) mal(`${id} T${t}: episodio ${o[i]} duplicado`)
      else if (o[i] !== o[i - 1] + 1) mal(`${id} T${t}: hueco entre ${o[i - 1]} y ${o[i]}`)
    }
  }
  for (const e of lista) { if (!e.t) sinT++; if (!e.f) sinF++ }
}
if (sinT) mal(`${sinT} episodios sin título`)
if (sinF) ojo(`${sinF} episodios sin fecha`)
const series = items.filter(i => i.tipo === 'serie')
const sinEps = series.filter(s => !EPISODES[s.id])
if (sinEps.length) ojo(`series sin lista de episodios: ${sinEps.map(s => s.id).join(', ')}`)
bien.push(`${eps.length} episodios: secuencias sin huecos ni duplicados`)

// ── 4 · Archivos ──
const pub = join(raiz, 'public')
for (const [id, ruta] of Object.entries(POSTERS)) {
  if (!vistos.has(id)) mal(`POSTERS tiene «${id}», que no existe en data.js`)
  if (!existsSync(join(pub, ruta))) mal(`falta el archivo ${ruta} (carátula de ${id})`)
}
for (const [n, ruta] of Object.entries(PEOPLE)) if (!existsSync(join(pub, ruta))) mal(`falta el archivo ${ruta} (foto de ${n})`)
const usados = new Set([...Object.values(POSTERS), ...Object.values(PEOPLE)].map(r => r.split('/').pop()))
for (const carpeta of ['posters', 'people']) {
  const sobran = readdirSync(join(pub, carpeta)).filter(f => !usados.has(f))
  if (sobran.length) ojo(`${carpeta}/: ${sobran.length} archivo(s) que no referencia nadie — ${sobran.slice(0, 4).join(', ')}`)
}
const sinPoster = items.filter(i => !POSTERS[i.id])
if (sinPoster.length) ojo(`sin carátula: ${sinPoster.map(i => i.id).join(', ')}`)
bien.push('todas las carátulas y fotos referenciadas existen')

// ── 5 · TMDB ──
const sinTmdb = items.filter(i => i.saga !== 'comics' && !TMDB[i.id])
if (sinTmdb.length) ojo(`sin mapeo de TMDB: ${sinTmdb.map(i => i.id).join(', ')} (sin él nacen sin tráiler, reparto ni plataforma)`)
const porTmdb = {}
for (const [id, m] of Object.entries(TMDB)) {
  if (!vistos.has(id)) mal(`TMDB tiene «${id}», que no existe en data.js`)
  const k = m.join('/'); (porTmdb[k] = porTmdb[k] || []).push(id)
}
for (const [k, l] of Object.entries(porTmdb)) {
  if (l.length > 1 && l.join(',') !== 'loki1,loki2') ojo(`comparten el mismo TMDB ${k}: ${l.join(', ')}`)
}
bien.push(`${Object.keys(TMDB).length} mapeos de TMDB coherentes con data.js`)

// ── 6 · Reglas del CSS ──
const css = readFileSync(join(raiz, 'src', 'styles.css'), 'utf8')
const trans = [...css.matchAll(/transition:\s*([^;}]+)/g)].map(m => m[1])
for (const t of trans) {
  if (/\ball\b/.test(t)) mal(`transition:all — arrastra border-color y congela el tema: «${t.trim()}»`)
  if (/(^|[\s,])(color|border-color)\b/.test(t)) mal(`transición con color/border-color, se congela al cambiar de tema: «${t.trim()}»`)
}
const fondos = trans.filter(t => /\bbackground\b/.test(t))
if (fondos.length > 2) mal(`${fondos.length} transiciones con background (solo se admiten las de .checkbox y .ep-velo)`)
const radios = [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim())
  .filter(v => /\d/.test(v) && !/var\(--r-|50%|0(\s|$)|100%/.test(v))
if (radios.length) mal(`border-radius con valores sueltos: ${radios.slice(0, 4).join(' · ')}`)
bien.push('CSS: sin transition:all, sin transiciones de color y radios tokenizados')

// ── 7 · Que no se publique una página de sonda ──
for (const carpeta of ['dist', 'docs']) {
  const dir = join(raiz, carpeta)
  if (!existsSync(dir)) continue
  const sondas = readdirSync(dir).filter(f => /^(sonda|mirar|hoja)/.test(f))
  if (sondas.length) mal(`${carpeta}/ lleva páginas de prueba: ${sondas.join(', ')} — bórralas antes de publicar`)
}
bien.push('ni dist/ ni docs/ llevan páginas de prueba')

// ── informe ──
for (const b of bien) console.log('  ✓ ' + b)
for (const a of avisos) console.log('  · ' + a)
for (const f of fallos) console.error('  ✗ ' + f)
console.log(fallos.length ? `\n${fallos.length} fallo(s).` : `\nTodo en orden${avisos.length ? ` (${avisos.length} aviso(s))` : ''}.`)
process.exit(fallos.length ? 1 : 0)
