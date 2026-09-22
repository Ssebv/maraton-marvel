#!/usr/bin/env node
// Genera src/plataformas.js: en qué plataforma de suscripción está cada título
// en cada país que la app ofrece en Ajustes. Sale de TMDB (que lo toma de
// JustWatch), una sola petición por título: la respuesta trae todos los países.
// El campo `plat` de data.js sigue siendo la versión curada de ESPAÑA; este
// fichero es lo que se enseña cuando el país elegido es otro.
// Necesita red: se lanza con `npm run plataformas` (después de la comprobación
// de España) y la rutina mensual lo regenera.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cargaFuentes } from './contrato.mjs'

export const PAISES = [
  { id: 'ES', nombre: 'España' },
  { id: 'AR', nombre: 'Argentina' },
  { id: 'BO', nombre: 'Bolivia' },
  { id: 'CL', nombre: 'Chile' },
  { id: 'CO', nombre: 'Colombia' },
  { id: 'CR', nombre: 'Costa Rica' },
  { id: 'EC', nombre: 'Ecuador' },
  { id: 'SV', nombre: 'El Salvador' },
  { id: 'US', nombre: 'Estados Unidos' },
  { id: 'GT', nombre: 'Guatemala' },
  { id: 'HN', nombre: 'Honduras' },
  { id: 'MX', nombre: 'México' },
  { id: 'NI', nombre: 'Nicaragua' },
  { id: 'PA', nombre: 'Panamá' },
  { id: 'PY', nombre: 'Paraguay' },
  { id: 'PE', nombre: 'Perú' },
  { id: 'DO', nombre: 'República Dominicana' },
  { id: 'UY', nombre: 'Uruguay' },
  { id: 'VE', nombre: 'Venezuela' },
]

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))

// TMDB los llama «Disney Plus», «Amazon Prime Video», «Universal+ Amazon
// Channel»…: nombres de la casa. El orden es la prioridad al enseñarlas (las
// grandes antes que los paquetes de la tele de pago). Un «canal» dentro de
// Prime Video o Apple TV es suscribirse a esa plataforma por otra vía: cuenta
// como ella; sin marca conocida (Cinemax, Tivify, fuboTV…) no se enseña.
const MARCAS = [
  [/^disney/, 'Disney+'], [/^netflix/, 'Netflix'], [/^amazon prime video|^prime video/, 'Prime Video'],
  [/^hbo max|^max$/, 'HBO Max'], [/^paramount/, 'Paramount+'], [/^apple tv(\+| plus)$/, 'Apple TV+'],
  [/^hulu/, 'Hulu'], [/^peacock/, 'Peacock'], [/^universal\+/, 'Universal+'], [/^vix/, 'ViX'],
  [/^star ?\+|^star plus/, 'Star+'], [/^skyshowtime/, 'SkyShowtime'], [/^starz/, 'Starz'],
  [/^filmin/, 'Filmin'], [/^mubi/, 'MUBI'], [/^movistar/, 'Movistar'], [/^claro video/, 'Claro video'],
]
// gratis con anuncios: solo servicios de verdad abiertos a todo el mundo
const GRATIS = [[/^mercado play/, 'Mercado Play'], [/^vix/, 'ViX'], [/^pluto/, 'Pluto TV'], [/^tubi/, 'Tubi'], [/^the roku channel/, 'The Roku Channel'], [/^rtve/, 'RTVE Play']]
const marca = (lista, nombre) => {
  const s = nombre.trim().toLowerCase().replace(/ (amazon|apple tv|roku premium) channel$/, '').replace(/ (standard )?with ads$/, '')
  const i = lista.findIndex(([re]) => re.test(s))
  return i < 0 ? null : { i, n: lista[i][1] }
}
const nombres = (lista, provs) => [...new Map((provs || []).map(x => marca(lista, x.provider_name)).filter(Boolean).sort((a, b) => a.i - b.i).map(m => [m.n, m])).keys()]

// Plataformas de un título en un país: de pago (en orden de prioridad) y gratis
function listas(pais, id) {
  const pago = nombres(MARCAS, pais.flatrate).map(n => (n === 'Movistar' ? (id === 'ES' ? 'Movistar+' : 'Movistar TV') : n))
  const gratis = nombres(GRATIS, [...(pais.ads || []), ...(pais.free || [])]).filter(n => !pago.includes(n)).map(n => n + ' gratis')
  return { pago, gratis }
}
// Lo que se enseña: hasta 3 nombres, y si además se puede ver gratis se dice
// (ocupa el último sitio). null si ni siquiera se alquila.
function etiquetaPais(pais, id) {
  const { pago, gratis } = listas(pais, id)
  const partes = gratis.length ? [...pago.slice(0, 2), gratis[0]] : pago.slice(0, 3)
  if (partes.length) return partes.join(' / ')
  if ((pais.rent || []).length || (pais.buy || []).length) return 'Solo alquiler'
  return null
}

// Los bloques de varias películas no tienen ficha propia en TMDB: se consulta
// cada una y se enseñan las plataformas que tienen más
const BLOQUES = {
  // (los lotes de Sony y de los 4F de Fox se partieron en títulos sueltos el 22 sep 2026)
}

const pide = async (tipo, id) => {
  try {
    return (await (await fetch(`https://api.themoviedb.org/3/${tipo}/${id}/watch/providers?api_key=${TMDB_KEY}`)).json()).results || {}
  } catch { console.error('  (sin red para ' + id + ')'); return null }
}

const salida = Object.fromEntries(PAISES.map(p => [p.id, {}]))
let hechos = 0
for (const it of items) {
  const m = TMDB[it.id]
  if (!m) continue
  const r = await pide(m[1], m[0])
  if (!r) continue
  for (const p of PAISES) {
    const e = etiquetaPais(r[p.id] || {}, p.id)
    if (e) salida[p.id][it.id] = e
    // Sin ninguna oferta en ese país: si en España tampoco está, no está. Si
    // no, casi siempre es un hueco de JustWatch (cortos y especiales que Disney+
    // tiene en toda la región): se queda el dato curado de data.js.
    else if (!r[p.id] && /^no est/i.test(it.plat || '')) salida[p.id][it.id] = 'No está en ' + p.nombre
    else if (r[p.id]) salida[p.id][it.id] = 'No está en ' + p.nombre
  }
  hechos++
  await dormir(60)
}

for (const [bloque, ids] of Object.entries(BLOQUES)) {
  const res = []
  for (const id of ids) { const r = await pide('movie', id); if (r) res.push(r); await dormir(60) }
  if (res.length < ids.length) continue // sin red a medias: se queda el dato curado
  const minimo = Math.min(3, ids.length)
  for (const p of PAISES) {
    const cuenta = new Map()
    for (const r of res) {
      const { pago, gratis } = listas(r[p.id] || {}, p.id)
      for (const n of [...pago, ...gratis]) cuenta.set(n, (cuenta.get(n) || 0) + 1)
    }
    // las que tienen al menos 3 de las películas (todas si son menos), de más a menos
    const top = [...cuenta].filter(([, c]) => c >= minimo).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
    salida[p.id][bloque] = top.length ? top.join(' / ') : 'Solo alquiler'
  }
  hechos++
}

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const cuerpo = `// GENERADO por \`npm run plataformas\` (scripts/paises.mjs). NO SE EDITA A MANO.
//
// Plataforma de suscripción de cada título por país, según TMDB/JustWatch.
// España sigue mandando desde el campo \`plat\` de data.js (curado a mano);
// este mapa es lo que se enseña cuando el país elegido en Ajustes es otro.
// Caduca solo: los catálogos cambian cada mes.
export const PAISES = ${JSON.stringify(PAISES)}
export const PLATAFORMAS = ${JSON.stringify(salida, null, 1)}
`
writeFileSync(join(raiz, 'src', 'plataformas.js'), cuerpo)
const resumen = PAISES.map(p => {
  const v = Object.values(salida[p.id])
  return `${p.nombre}: ${v.filter(x => x.startsWith('Disney+')).length} en Disney+ de ${v.length}`
}).join(' · ')
console.log(`${hechos} títulos consultados → src/plataformas.js\n${resumen}`)
