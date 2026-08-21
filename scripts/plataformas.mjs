#!/usr/bin/env node
// Compara el campo `plat` de cada título con lo que de verdad está en
// suscripción EN ESPAÑA, según TMDB (que lo saca de JustWatch). Es lo único
// del dataset que caduca solo: los catálogos cambian cada mes.
// No entra en `npm test` porque necesita red; se lanza con `npm run plataformas`.
import { cargaFuentes } from './contrato.mjs'

const { DATA, TMDB, TMDB_KEY } = await cargaFuentes()
const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const dormir = ms => new Promise(r => setTimeout(r, ms))
// TMDB los llama «Disney Plus», «Amazon Prime Video»…: se comparan normalizados
const clave = n => n.toLowerCase()
  .replace(/disney\s*(plus|\+)/, 'disney')
  .replace(/amazon prime video.*|prime video/, 'amazon')
  .replace(/hbo max.*/, 'hbo').replace(/movistar.*/, 'movistar').replace(/netflix.*/, 'netflix')
  .replace(/skyshowtime.*/, 'skyshowtime')

const malos = []
let ok = 0, saltados = 0
for (const it of items) {
  const m = TMDB[it.id]
  // sin mapeo, en cine, o con una etiqueta que no es una plataforma de streaming
  if (!m || !it.plat || /^cine|^solo alquiler|^no est/i.test(it.plat) || /panini|unlimited/i.test(it.plat)) { saltados++; continue }
  let es = {}
  try {
    const r = await (await fetch(`https://api.themoviedb.org/3/${m[1]}/${m[0]}/watch/providers?api_key=${TMDB_KEY}`)).json()
    es = (r.results && r.results.ES) || {}
  } catch { console.error('  (sin red para ' + it.id + ')'); continue }
  const hay = [...new Set((es.flatrate || []).map(p => clave(p.provider_name)))]
  const otros = [...new Set([...(es.rent || []), ...(es.buy || [])].map(p => p.provider_name))]
  const dice = it.plat.split(/\s*\/\s*/).map(clave)
  if (dice.some(d => hay.includes(d))) ok++
  else malos.push({ id: it.id, t: it.t, dice: it.plat, hay, otros })
  await dormir(70)
}
console.log(`\n${ok} títulos con la plataforma correcta · ${saltados} sin comprobar (cine, cómics o ya marcados aparte)`)
if (!malos.length) { console.log('Ninguno desactualizado.'); process.exit(0) }
console.log(`\n${malos.length} desactualizado(s):`)
for (const d of malos) {
  const donde = d.hay.length ? d.hay.join(', ') : (d.otros.length ? 'solo alquiler/compra (' + d.otros.slice(0, 2).join(', ') + ')' : 'en ninguna parte')
  console.log(`  ${d.id.padEnd(16)} dice «${d.dice}»  →  en España está en: ${donde}`)
}
console.log('\nOJO: si TMDB no tiene datos de ES para un estreno reciente puede ser un hueco suyo,')
console.log('no un error del dataset. Compruébalo en otro país antes de cambiarlo.')
