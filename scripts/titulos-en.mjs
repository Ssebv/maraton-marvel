#!/usr/bin/env node
// Genera src/titulos-en.js: el título original de cada obra en inglés (TMDB
// en-US), solo donde difiere DE VERDAD del de España que lleva data.js. Se
// enseña cuando el idioma elegido en Ajustes es English. No toca ids ni
// orden. Los cómics no hacen falta: ya llevan su título inglés en el campo
// `en` de data.js (el de la búsqueda de Marvel Unlimited).
// Necesita red: `npm run titulos-en` (y lo lanza `npm run plataformas`).
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cargaFuentes } from './contrato.mjs'

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))

// Lo que data.js añade a mano para distinguir obras homónimas se conserva,
// traducido donde el añadido es prosa
const APOSTILLA = /(:\s*La serie animada)?(\s\((?:T\d[^)]*|cortos|\d{4}|Unlimited)\))?$/
const traduceApostilla = a => a
  .replace(': La serie animada', ': The Animated Series')
  .replace('(cortos)', '(shorts)')
  // las temporadas: «(T1)» y «(T1–T2)» → «(S1)» y «(S1–S2)»
  .replace(/\(T(\d)/, '(S$1')
  .replace(/–T(\d)/, '–S$1')
const huella = s => s.toLowerCase().replace(/[.\-–:,'’!¿?]/g, '').replace(/\s+/g, ' ').trim()

const salida = {}
let consultados = 0
for (const it of items) {
  const m = TMDB[it.id]
  if (!m) continue
  let r
  try {
    r = await (await fetch(`https://api.themoviedb.org/3/${m[1]}/${m[0]}?api_key=${TMDB_KEY}&language=en-US`)).json()
  } catch { console.error('  (sin red para ' + it.id + ')'); continue }
  // el respiro va antes de los descartes o la mayoría de vueltas iría a pelo
  await dormir(60)
  consultados++
  let t = ((m[1] === 'tv' ? r.name : r.title) || '').trim()
  if (!t) continue
  // ruido de TMDB: «Marvel's Agents of S.H.I.E.L.D.» pierde el poseedor
  t = t.replace(/^Marvel(?:'s|’s|s\b|\s*-)\s*/i, '')
  const apostilla = traduceApostilla((it.t.match(APOSTILLA) || [''])[0])
  const conApostilla = t + apostilla
  if (huella(conApostilla) === huella(it.t)) continue
  salida[it.id] = conApostilla
}
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
// Una ejecución sin red o con la clave caducada no debe dejar el fichero
// vacío con salida 0: la rutina mensual seguiría y los usuarios en inglés
// se quedarían con los títulos en español sin que nadie lo viera.
const destino = join(raiz, 'src', 'titulos-en.js')
const antes = existsSync(destino) ? (readFileSync(destino, 'utf8').match(/^ "/gm) || []).length : 0
const distintos = Object.keys(salida).length
if (consultados === 0 || distintos < antes / 2) {
  console.error(`PARO sin escribir: ${consultados} consultados y ${distintos} títulos (antes había ${antes}). ¿Sin red o clave caducada?`)
  process.exit(1)
}
writeFileSync(destino, `// GENERADO por \`npm run titulos-en\` (scripts/titulos-en.mjs). NO SE EDITA A MANO.
//
// Título en inglés (TMDB en-US) solo donde difiere de verdad del de España
// de data.js. Se enseña cuando el idioma elegido en Ajustes es English.
export const TITULOS_EN = ${JSON.stringify(salida, null, 1)}
`)
console.log(`${consultados} consultados → src/titulos-en.js (${Object.keys(salida).length} distintos)`)
