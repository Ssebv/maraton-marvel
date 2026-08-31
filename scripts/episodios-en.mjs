#!/usr/bin/env node
// Genera src/episodios-en.js: el título original en inglés de cada episodio
// (TMDB en-US), solo donde difiere del de España que lleva episodes.js, por
// clave «temporada:número». Se enseña cuando el idioma elegido en Ajustes es
// English. No toca claves (id:s:n) ni orden: los bits siguen igual.
// Cada episodio se empareja por temporada y número, y se descarta si la fecha
// de TMDB no cuadra con la de episodes.js (numeración distinta = título ajeno).
// Necesita red: `npm run episodios-en` (y lo lanza `npm run plataformas`).
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
    let en
    try {
      en = await temporada(m[0], temporadaTmdb(id, s), 'en-US')
    } catch { console.error('  (sin red para ' + id + ' T' + s + ')'); continue }
    if (!Array.isArray(en.episodes)) { console.error('  (TMDB no dio episodios para ' + id + ' T' + s + ': ' + (en.status_message || '?') + ')'); continue }
    consultadas++
    const porNumero = new Map(en.episodes.map(e => [e.episode_number, e]))
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
// Una ejecución sin red o con la clave caducada no debe dejar el fichero vacío
const destino = join(raiz, 'src', 'episodios-en.js')
const antes = existsSync(destino) ? (readFileSync(destino, 'utf8').match(/"\d+:\d+":/g) || []).length : 0
if (consultadas === 0 || distintos < antes / 2) {
  console.error(`PARO sin escribir: ${consultadas} temporadas consultadas y ${distintos} títulos (antes había ${antes}). ¿Sin red o clave caducada?`)
  process.exit(1)
}
writeFileSync(destino, `// GENERADO por \`npm run episodios-en\` (scripts/episodios-en.mjs). NO SE EDITA A MANO.
//
// Título original en inglés de cada episodio (TMDB en-US) solo donde difiere
// del de España de episodes.js, por clave "temporada:número".
// Se enseña cuando el idioma elegido en Ajustes es English.
export const EPISODIOS_EN = ${JSON.stringify(salida, null, 1)}
`)
console.log(`${consultadas} temporadas consultadas · ${distintos} títulos distintos en inglés · ${descartados} descartados por fecha → src/episodios-en.js`)
