#!/usr/bin/env node
// Genera src/episodios-latam.js: el título de cada episodio como lo enseña
// Disney+ en Latinoamérica (TMDB en es-MX), solo donde difiere DE VERDAD del
// de España que lleva episodes.js. Se enseña cuando el país elegido en
// Ajustes no es España. No toca claves (id:s:n) ni orden: los bits siguen igual.
// Cada episodio se empareja por temporada y número, y se descarta si la fecha
// de TMDB no cuadra con la de episodes.js (numeración distinta = título ajeno).
// Necesita red: `npm run episodios` (y lo lanza `npm run plataformas`).
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cargaFuentes, raiz } from './contrato.mjs'

const { EPISODES, TMDB, TMDB_KEY, DESPLAZA_TEMPORADA } = await cargaFuentes()
const dormir = ms => new Promise(r => setTimeout(r, ms))
const huella = s => s.toLowerCase().replace(/[.\-–:,'’!¿?¡…]/g, '').replace(/\s+/g, ' ').trim()
const generico = t => /^(episodio|episode|capítulo|chapter)\s*\d+$/i.test(t.trim())
// loki2 guarda su temporada como 1 aunque en TMDB sea la 2 (src/tmdb.js)
const temporadaTmdb = (id, s) => s + (DESPLAZA_TEMPORADA[id] || 0)
const temporada = async (tmdbId, s, idioma) =>
  (await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${s}?api_key=${TMDB_KEY}&language=${idioma}`)).json()
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)

const salida = {}
let consultadas = 0, descartados = 0, distintos = 0
for (const [id, eps] of Object.entries(EPISODES)) {
  const m = TMDB[id]
  if (!m || m[1] !== 'tv') { console.error('  (sin serie de TMDB: ' + id + ')'); continue }
  const temporadas = [...new Set(eps.map(e => e.s))]
  for (const s of temporadas) {
    // TMDB devuelve el título INGLÉS cuando no tiene traducción es-MX: se pide
    // también el inglés y, si coinciden, no hay título latino que valga
    let r, en
    try {
      r = await temporada(m[0], temporadaTmdb(id, s), 'es-MX')
      en = await temporada(m[0], temporadaTmdb(id, s), 'en-US')
    } catch { console.error('  (sin red para ' + id + ' T' + s + ')'); continue }
    if (!Array.isArray(r.episodes)) { console.error('  (TMDB no dio episodios para ' + id + ' T' + s + ': ' + (r.status_message || '?') + ')'); continue }
    consultadas++
    const porNumero = new Map(r.episodes.map(e => [e.episode_number, e]))
    const ingles = new Map(((en && en.episodes) || []).map(e => [e.episode_number, e.name || '']))
    for (const ep of eps.filter(e => e.s === s)) {
      const t = porNumero.get(ep.n)
      if (!t || !t.name || generico(t.name)) continue
      if (huella(t.name) === huella(ingles.get(ep.n) || '')) continue
      if (ep.f && t.air_date && dias(ep.f, t.air_date) > 3) { descartados++; continue }
      const nombre = t.name.trim()
      if (huella(nombre) === huella(ep.t)) continue
      ;(salida[id] ||= {})[`${ep.s}:${ep.n}`] = nombre
      distintos++
    }
    await dormir(60)
  }
}
// Una ejecución sin red o con la clave caducada no debe dejar el fichero vacío
const destino = join(raiz, 'src', 'episodios-latam.js')
const antes = existsSync(destino) ? (readFileSync(destino, 'utf8').match(/"\d+:\d+":/g) || []).length : 0
if (consultadas === 0 || distintos < antes / 2) {
  console.error(`PARO sin escribir: ${consultadas} temporadas consultadas y ${distintos} títulos (antes había ${antes}). ¿Sin red o clave caducada?`)
  process.exit(1)
}
writeFileSync(destino, `// GENERADO por \`npm run episodios\` (scripts/episodios.mjs). NO SE EDITA A MANO.
//
// Título latinoamericano de cada episodio (TMDB es-MX) solo donde difiere de
// verdad del de España de episodes.js, por clave "temporada:número".
// Se enseña cuando el país elegido en Ajustes no es España.
export const EPISODIOS_LATAM = ${JSON.stringify(salida, null, 1)}
`)
console.log(`${consultadas} temporadas consultadas · ${distintos} títulos distintos en latino · ${descartados} descartados por fecha → src/episodios-latam.js`)
