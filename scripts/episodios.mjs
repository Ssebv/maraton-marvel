#!/usr/bin/env node
// Genera src/episodios-latam.js: el título de cada episodio como lo enseña
// Disney+ en Latinoamérica (TMDB en es-MX), solo donde difiere DE VERDAD del
// de España que lleva episodes.js. Se enseña cuando el país elegido en
// Ajustes no es España. No toca claves (id:s:n) ni orden: los bits siguen igual.
// Cada episodio se empareja por temporada y número, y se descarta si la fecha
// de TMDB no cuadra con la de episodes.js (numeración distinta = título ajeno).
// Necesita red: `npm run episodios` (y lo lanza `npm run plataformas`).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cargaFuentes } from './contrato.mjs'

const { EPISODES, TMDB, TMDB_KEY } = await cargaFuentes()
const dormir = ms => new Promise(r => setTimeout(r, ms))
const huella = s => s.toLowerCase().replace(/[.\-–:,'’!¿?¡…]/g, '').replace(/\s+/g, ' ').trim()
const generico = t => /^(episodio|episode|capítulo|chapter)\s*\d+$/i.test(t.trim())
// loki1 y loki2 comparten serie en TMDB y el segundo guarda su temporada como 1
const temporadaTmdb = (id, s) => (id === 'loki2' ? s + 1 : s)
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)

const salida = {}
let consultadas = 0, descartados = 0, distintos = 0
for (const [id, eps] of Object.entries(EPISODES)) {
  const m = TMDB[id]
  if (!m || m[1] !== 'tv') { console.error('  (sin serie de TMDB: ' + id + ')'); continue }
  const temporadas = [...new Set(eps.map(e => e.s))]
  for (const s of temporadas) {
    let r
    try {
      r = await (await fetch(`https://api.themoviedb.org/3/tv/${m[0]}/season/${temporadaTmdb(id, s)}?api_key=${TMDB_KEY}&language=es-MX`)).json()
    } catch { console.error('  (sin red para ' + id + ' T' + s + ')'); continue }
    consultadas++
    const porNumero = new Map((r.episodes || []).map(e => [e.episode_number, e]))
    for (const ep of eps.filter(e => e.s === s)) {
      const t = porNumero.get(ep.n)
      if (!t || !t.name || generico(t.name)) continue
      if (ep.f && t.air_date && dias(ep.f, t.air_date) > 3) { descartados++; continue }
      const nombre = t.name.trim()
      if (huella(nombre) === huella(ep.t)) continue
      ;(salida[id] ||= {})[`${ep.s}:${ep.n}`] = nombre
      distintos++
    }
    await dormir(60)
  }
}
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
writeFileSync(join(raiz, 'src', 'episodios-latam.js'), `// GENERADO por \`npm run episodios\` (scripts/episodios.mjs). NO SE EDITA A MANO.
//
// Título latinoamericano de cada episodio (TMDB es-MX) solo donde difiere de
// verdad del de España de episodes.js, por clave "temporada:número".
// Se enseña cuando el país elegido en Ajustes no es España.
export const EPISODIOS_LATAM = ${JSON.stringify(salida, null, 1)}
`)
console.log(`${consultadas} temporadas consultadas · ${distintos} títulos distintos en latino · ${descartados} descartados por fecha → src/episodios-latam.js`)
