#!/usr/bin/env node
// Genera src/titulos.js: el título de cada obra como lo distribuye Disney en
// Latinoamérica (TMDB en es-MX), solo donde difiere DE VERDAD del de España
// que lleva data.js. Se enseña cuando el país elegido en Ajustes no es España.
// No toca ids ni orden: los perfiles compartidos siguen leyendo lo mismo.
// Necesita red: `npm run titulos` (y lo lanza `npm run plataformas`).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cargaFuentes } from './contrato.mjs'

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))

// Lo que data.js añade a mano para distinguir obras homónimas: se conserva
const APOSTILLA = /(:\s*La serie animada)?(\s\((?:T\d[^)]*|cortos|\d{4}|Unlimited)\))?$/
// Solo cuentan las diferencias de palabras: ni mayúsculas ni puntuación
const huella = s => s.toLowerCase().replace(/[.\-–:,'’!¿?]/g, '').replace(/\s+/g, ' ').trim()
const MENORES = new Set(['y', 'e', 'o', 'el', 'la', 'los', 'las', 'del', 'de', 'en', 'a', 'al', 'por', 'para', 'un', 'una', 'con', 'sin'])

const salida = {}
let consultados = 0
for (const it of items) {
  const m = TMDB[it.id]
  if (!m) continue
  let r
  try {
    r = await (await fetch(`https://api.themoviedb.org/3/${m[1]}/${m[0]}?api_key=${TMDB_KEY}&language=es-MX`)).json()
  } catch { console.error('  (sin red para ' + it.id + ')'); continue }
  consultados++
  let t = ((m[1] === 'tv' ? r.name : r.title) || '').trim()
  if (!t) continue
  // ruido de TMDB: «Marvel - Daredevil», «Marvel's Hit-Monkey», «Iron man - El hombre…»
  t = t.replace(/^Marvel(?:'s|’s|s\b|\s*-)\s*/i, '').replace(/\s-\s/g, ': ')
  // «Falcon Y El Soldado Del Invierno»: las partículas van en minúscula,
  // salvo la primera palabra y la que abre un subtítulo tras los dos puntos
  const palabras = t.split(' ')
  t = palabras.map((w, i) => {
    const abre = i === 0 || /:$/.test(palabras[i - 1])
    if (abre) return w.charAt(0).toUpperCase() + w.slice(1)
    return MENORES.has(w.toLowerCase()) ? w.toLowerCase() : w
  }).join(' ')
  const apostilla = (it.t.match(APOSTILLA) || [''])[0]
  const baseEs = it.t.replace(APOSTILLA, '')
  // si el latino empieza por el de España («Iron Man: El hombre de hierro»),
  // hereda sus mayúsculas
  if (t.toLowerCase().startsWith(baseEs.toLowerCase())) t = baseEs + t.slice(baseEs.length)
  // «Sin Limites» ya dice lo que la apostilla «(Unlimited)» distinguía
  const conApostilla = /l[ií]mites/i.test(t) && /Unlimited/.test(apostilla) ? t : t + apostilla
  if (huella(conApostilla) === huella(it.t)) continue
  salida[it.id] = conApostilla
  await dormir(60)
}
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
writeFileSync(join(raiz, 'src', 'titulos.js'), `// GENERADO por \`npm run titulos\` (scripts/titulos.mjs). NO SE EDITA A MANO.
//
// Título latinoamericano (TMDB es-MX) solo donde difiere de verdad del de
// España de data.js. Se enseña cuando el país elegido en Ajustes no es España.
export const TITULOS_LATAM = ${JSON.stringify(salida, null, 1)}
`)
console.log(`${consultados} consultados · ${Object.keys(salida).length} títulos distintos en latino → src/titulos.js`)
for (const [id, t] of Object.entries(salida)) console.log(`  ${id}: ${items.find(i => i.id === id).t}  →  ${t}`)
