#!/usr/bin/env node
// Junta los detalles ampliados de las fichas (26 sep 2026): historia larga sin
// destripar, cambios de actor y extras (escenas eliminadas, versiones
// extendidas…, cada uno con su fuente) y genera lo que la app pide al abrir una
// ficha: public/detalles/es.json y en.json. Las fuentes quedan en
// scripts/detalles-fuentes.json (no viajan a la app).
//
//   node scripts/detalles.mjs <carpeta con salida*.json>
//
// Cada salida*.json: { "<id>": { es: { larga, cambios:[{p,antes,ahora,nota}], extras:[{t,d,donde}] }, en: {…}, fuentes: [url] } }
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cargaFuentes } from './contrato.mjs'

const RAIZ = fileURLToPath(new URL('../', import.meta.url))
const dir = process.argv[2]
if (!dir || !existsSync(dir)) { console.error('uso: node scripts/detalles.mjs <carpeta>'); process.exit(1) }
const { DATA } = await cargaFuentes()
const ids = new Set(DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id))))

const todo = {}
for (const f of readdirSync(dir).filter(f => /^salida.*\.json$/.test(f)).sort()) Object.assign(todo, JSON.parse(readFileSync(join(dir, f), 'utf8')))

const problemas = []
const texto = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max
const limpia = (id, idioma, b) => {
  if (!b || typeof b !== 'object') { problemas.push(`${id}/${idioma}: sin bloque`); return null }
  const out = {}
  if (texto(b.larga, 1400)) out.larga = b.larga.trim()
  else if (b.larga) problemas.push(`${id}/${idioma}: larga fuera de medida (${String(b.larga).length})`)
  const cambios = (Array.isArray(b.cambios) ? b.cambios : []).filter(c => texto(c.p, 80) && texto(c.antes, 160) && texto(c.ahora, 120))
    .map(c => ({ p: c.p.trim(), antes: c.antes.trim(), ahora: c.ahora.trim(), ...(texto(c.nota, 300) ? { nota: c.nota.trim() } : {}) }))
  const extras = (Array.isArray(b.extras) ? b.extras : []).filter(x => texto(x.t, 120) && texto(x.d, 400))
    .map(x => ({ t: x.t.trim(), d: x.d.trim(), ...(texto(x.donde, 120) ? { donde: x.donde.trim() } : {}) }))
  if (cambios.length) out.cambios = cambios
  if (extras.length) out.extras = extras
  return Object.keys(out).length ? out : null
}

const es = {}, en = {}, fuentes = {}
for (const [id, v] of Object.entries(todo)) {
  if (!ids.has(id)) { problemas.push(`${id}: no existe en el catálogo`); continue }
  const a = limpia(id, 'es', v.es), b = limpia(id, 'en', v.en)
  if (a) es[id] = a
  if (b) en[id] = b
  if (Array.isArray(v.fuentes) && v.fuentes.length) fuentes[id] = v.fuentes.filter(u => /^https?:\/\//.test(u))
  const nc = x => (x && x.cambios ? x.cambios.length : 0), nx = x => (x && x.extras ? x.extras.length : 0)
  if (nc(a) !== nc(b) || nx(a) !== nx(b)) problemas.push(`${id}: es/en no cuadran (cambios ${nc(a)}/${nc(b)}, extras ${nx(a)}/${nx(b)})`)
}

// escenas post-créditos explicadas (pcs*.json): { "<id>": { es:[{cuando,t,d,conecta}], en:[…], fuentes, pc_real? } }
const pcReal = []
for (const f of readdirSync(dir).filter(f => /^pcs.*\.json$/.test(f)).sort()) {
  for (const [id, v] of Object.entries(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
    if (!ids.has(id)) { problemas.push(`${id}: (pcs) no existe en el catálogo`); continue }
    const escenas = l => (Array.isArray(l) ? l : []).filter(e => texto(e.t, 90) && texto(e.d, 500))
      .map(e => ({ cuando: e.cuando === 'mitad' ? 'mitad' : 'final', t: e.t.trim(), d: e.d.trim(), ...(texto(e.conecta, 260) ? { conecta: e.conecta.trim() } : {}) }))
    const a = escenas(v.es), b = escenas(v.en)
    if (a.length !== b.length) problemas.push(`${id}: (pcs) es/en no cuadran (${a.length}/${b.length})`)
    if (a.length) (es[id] ||= {}).pcs = a
    if (b.length) (en[id] ||= {}).pcs = b
    if (Array.isArray(v.fuentes) && v.fuentes.length) fuentes[id] = [...new Set([...(fuentes[id] || []), ...v.fuentes.filter(u => /^https?:\/\//.test(u))])]
    const actual = DATA.flatMap(sg => sg.eras.flatMap(e => e.items)).find(i => i.id === id)
    if (typeof v.pc_real === 'string' && v.pc_real && actual && actual.pc !== v.pc_real && !(v.pc_real.startsWith('2 (') && actual.pc === '2 (mitad y final)')) pcReal.push(`${id}: ${v.pc_real} (ahora «${actual.pc ?? '—'}»)`)
  }
}

mkdirSync(join(RAIZ, 'public/detalles'), { recursive: true })
writeFileSync(join(RAIZ, 'public/detalles/es.json'), JSON.stringify(es))
writeFileSync(join(RAIZ, 'public/detalles/en.json'), JSON.stringify(en))
writeFileSync(join(RAIZ, 'scripts/detalles-fuentes.json'), JSON.stringify(fuentes, null, 1) + '\n')
const cuenta = o => Object.values(o).reduce((n, x) => ({ l: n.l + (x.larga ? 1 : 0), c: n.c + (x.cambios || []).length, x: n.x + (x.extras || []).length }), { l: 0, c: 0, x: 0 })
const c = cuenta(es)
const npcs = Object.values(es).reduce((n, x) => n + (x.pcs || []).length, 0)
console.log(`post-créditos: ${Object.values(es).filter(x => x.pcs).length} títulos · ${npcs} escenas explicadas`)
if (pcReal.length) console.log('corregir «pc» en data.js: ' + pcReal.join(' · '))
console.log(`detalles: ${Object.keys(es).length} títulos · ${c.l} historias · ${c.c} cambios de actor · ${c.x} extras · es ${(JSON.stringify(es).length / 1024).toFixed(0)} kB, en ${(JSON.stringify(en).length / 1024).toFixed(0)} kB`)
const faltan = [...ids].filter(id => !id.startsWith('c-') && !todo[id])
if (faltan.length) console.log(`sin detalles (${faltan.length}): ${faltan.slice(0, 12).join(', ')}${faltan.length > 12 ? '…' : ''}`)
if (problemas.length) { console.log(`avisos (${problemas.length}):`); problemas.slice(0, 20).forEach(p => console.log('  · ' + p)) }
