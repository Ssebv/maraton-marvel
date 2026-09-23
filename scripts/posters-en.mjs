#!/usr/bin/env node
// Carátulas en inglés (23 sep 2026): con la app en English salían los pósters
// de España («Vengadores», «Los Nuevos Mutantes»). Para cada título con
// carátula y mapeo de TMDB se baja el póster en inglés mejor valorado (el de
// su temporada si DESPLAZA_TEMPORADA lo pide), a 342 px como los de español,
// en WebP a public/posters-en/, y se escribe src/posters-en.js con los que hay.
// Los cómics no están en TMDB: se quedan con la suya. Idempotente: no vuelve a
// bajar lo que ya existe. Uso: node scripts/posters-en.mjs (necesita cwebp).
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cargaFuentes, raiz } from './contrato.mjs'

const { POSTERS, TMDB, TMDB_KEY, DESPLAZA_TEMPORADA = {} } = await cargaFuentes()
const DEST = join(raiz, 'public', 'posters-en')
mkdirSync(DEST, { recursive: true })

const api = async ruta => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.themoviedb.org/3${ruta}${ruta.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`)
    if (r.status === 429) { await new Promise(ok => setTimeout(ok, 2000 * (i + 1))); continue }
    if (!r.ok) return null
    return r.json()
  }
  return null
}
const mejor = lista => (lista || []).filter(p => p.iso_639_1 === 'en')
  .sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count)[0]

const sinIngles = []
let nuevas = 0
for (const id of Object.keys(POSTERS)) {
  const t = TMDB[id]
  if (!t) continue
  const destino = join(DEST, `${id}.webp`)
  if (existsSync(destino)) continue
  const [tmdbId, tipo] = t
  let p = null
  if (tipo === 'tv' && DESPLAZA_TEMPORADA[id]) p = mejor((await api(`/tv/${tmdbId}/season/${1 + DESPLAZA_TEMPORADA[id]}/images?include_image_language=en`))?.posters)
  p ||= mejor((await api(`/${tipo}/${tmdbId}/images?include_image_language=en`))?.posters)
  if (!p) { sinIngles.push(id); continue }
  const img = await fetch(`https://image.tmdb.org/t/p/w342${p.file_path}`)
  if (!img.ok) { sinIngles.push(id); continue }
  const tmp = join(tmpdir(), `poster-en-${id}.jpg`)
  writeFileSync(tmp, Buffer.from(await img.arrayBuffer()))
  execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', '-sharp_yuv', '-metadata', 'none', tmp, '-o', destino])
  unlinkSync(tmp)
  nuevas++
}

const hay = readdirSync(DEST).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).filter(id => POSTERS[id]).sort()
writeFileSync(join(raiz, 'src', 'posters-en.js'),
  '// GENERADO por `node scripts/posters-en.mjs`. NO SE EDITA A MANO.\n' +
  '// Póster en inglés (TMDB) de cada título que lo tiene; con la app en English\n' +
  '// sustituye al de src/posters.js. Los cómics se quedan con el suyo.\n' +
  'export const POSTERS_EN = {\n' + hay.map(id => `  "${id}": "posters-en/${id}.webp",`).join('\n') + '\n}\n')
console.log(`posters-en: ${nuevas} nuevas, ${hay.length} en total` + (sinIngles.length ? `; sin póster en inglés: ${sinIngles.join(', ')}` : ''))
