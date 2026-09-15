#!/usr/bin/env node
// Genera src/fondos.js: la ruta del fotograma (backdrop) de TMDB de cada título.
// Con ella la ficha empieza a bajar la imagen al apoyar el dedo en la tarjeta,
// sin esperar a la respuesta de la API (que tardaba ~330 ms con 4G lenta antes
// de que el fotograma pudiera siquiera pedirse). La ficha sigue usando el que
// devuelve TMDB cuando llega; esto solo adelanta el primero.
// Necesita red: `npm run fondos`.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cargaFuentes } from './contrato.mjs'

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const salida = {}
let fallos = 0
for (const it of items) {
  const m = TMDB[it.id]
  if (!m || salida[it.id]) continue
  try {
    const r = await (await fetch(`https://api.themoviedb.org/3/${m[1]}/${m[0]}?api_key=${TMDB_KEY}&language=es-ES`)).json()
    if (typeof r.backdrop_path === 'string' && /^\/[\w.-]+$/.test(r.backdrop_path)) salida[it.id] = r.backdrop_path
  } catch { fallos++ }
  await dormir(40)
}
// sin red o con TMDB caído no se pisa el archivo bueno con uno vacío
if (fallos > 5 || Object.keys(salida).length < 50) { console.error(`fondos: ${fallos} fallos, ${Object.keys(salida).length} rutas — no se escribe`); process.exit(1) }
const dir = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(dir, '../src/fondos.js'),
  '// Generado con scripts/fondos.mjs: ruta del fotograma de TMDB por título (w780 al pedirlo)\n' +
  'export const FOTOGRAMAS = ' + JSON.stringify(salida, null, 1) + '\n')
console.log(`fondos: ${Object.keys(salida).length} rutas de ${items.length} títulos (${fallos} fallos)`)
