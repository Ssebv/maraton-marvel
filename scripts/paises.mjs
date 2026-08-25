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
  { id: 'CL', nombre: 'Chile' },
  { id: 'MX', nombre: 'México' },
  { id: 'AR', nombre: 'Argentina' },
  { id: 'CO', nombre: 'Colombia' },
  { id: 'PE', nombre: 'Perú' },
]

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))

// TMDB los llama «Disney Plus», «Amazon Prime Video», «Max»…: nombres de la casa
const etiqueta = n => {
  const s = n.toLowerCase()
  if (/disney/.test(s)) return 'Disney+'
  if (/star plus|star\+/.test(s)) return 'Star+'
  if (/amazon prime|prime video/.test(s)) return 'Prime Video'
  if (/netflix/.test(s)) return 'Netflix'
  if (/hbo|^max$|\bmax\b/.test(s)) return 'Max'
  if (/paramount/.test(s)) return 'Paramount+'
  if (/apple tv/.test(s)) return 'Apple TV+'
  if (/movistar/.test(s)) return 'Movistar+'
  if (/skyshowtime/.test(s)) return 'SkyShowtime'
  if (/claro/.test(s)) return 'Claro video'
  if (/mubi/.test(s)) return 'MUBI'
  return null
}
// canales dentro de otra plataforma y variantes con anuncios no son «estar en»
const esCanal = n => /channel|with ads|amazon channel|apple tv channel/i.test(n)

const salida = Object.fromEntries(PAISES.map(p => [p.id, {}]))
let hechos = 0
for (const it of items) {
  const m = TMDB[it.id]
  if (!m) continue
  let r
  try {
    r = await (await fetch(`https://api.themoviedb.org/3/${m[1]}/${m[0]}/watch/providers?api_key=${TMDB_KEY}`)).json()
  } catch { console.error('  (sin red para ' + it.id + ')'); continue }
  for (const p of PAISES) {
    const pais = (r.results && r.results[p.id]) || {}
    const flat = [...new Set((pais.flatrate || []).filter(x => !esCanal(x.provider_name)).map(x => etiqueta(x.provider_name)).filter(Boolean))]
    if (flat.length) salida[p.id][it.id] = flat.slice(0, 2).join(' / ')
    else if ((pais.rent || []).length || (pais.buy || []).length) salida[p.id][it.id] = 'Solo alquiler'
    else salida[p.id][it.id] = 'No está en ' + p.nombre
  }
  hechos++
  await dormir(60)
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
  return `${p.nombre}: ${v.filter(x => x === 'Disney+' || x.startsWith('Disney+')).length} en Disney+ de ${v.length}`
}).join(' · ')
console.log(`${hechos} títulos consultados → src/plataformas.js\n${resumen}`)
