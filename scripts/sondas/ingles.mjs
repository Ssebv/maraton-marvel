#!/usr/bin/env node
// Español que se cuela en la app en inglés (23 sep 2026). Recorre en English
// todas las vistas, las hojas de Filtros, Más y Ajustes, el Multiverso en sus
// tres modos, cuatro fichas y la bienvenida, y lista cada línea visible con
// pinta de español (tildes, ñ, ¿¡ o palabras como «de», «que», «para»). No
// falla: los nombres propios también casan (Maximiliano Hernández, «Español»
// en el selector de idioma). Uso: npm run build && node scripts/sondas/ingles.mjs
import { abre, espera } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'
const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}; ids.slice(0, 30).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const RE = /[áéíóúñ¿¡]|\b(de|del|que|los|las|una|para|con|por|sin|más|tus|vista|ver|ficha|pendiente|títulos?|episodios?|serie|temporada|hoy|días?|y)\b/i
const vistos = new Map()
const junta = async (c, d) => { for (const l of await c.eval(`document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean)`)) if (RE.test(l) && !vistos.has(l)) vistos.set(l, d) }
{
  const { cdp, navega, cierra } = await abre({ movil: false, ancho: 1280, alto: 900, siembra: { 'maraton-marvel-idioma-v1': 'en', 'maraton-marvel-pais-v1': 'US', 'maraton-marvel-v1': vistas } })
  try {
    await navega(''); await espera(1500); await junta(cdp, 'inicio')
    for (const v of ['crono', 'estreno', 'comics', 'animacion', 'stats', 'galeria', 'multiverso', 'listas', 'tiempo']) { await cdp.eval(`location.hash='${v}'`); await espera(900); await junta(cdp, v) }
    await cdp.eval(`location.hash='crono'`); await espera(800)
    for (const [sel, d] of [['.ctrl-filtros', 'filtros'], ['.ctrl-mas', 'más'], ['.chip-ajustes', 'ajustes']]) {
      await cdp.eval(`document.querySelector('${sel}').click()`); await espera(900)
      await cdp.eval(`document.querySelectorAll('details').forEach(d => d.open = true)`); await espera(300); await junta(cdp, d)
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await espera(600)
    }
    await cdp.eval(`location.hash='multiverso'`); await espera(800)
    for (const b of ['Map', 'Earths']) { await cdp.eval(`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === '${b}')?.click()`); await espera(900); await junta(cdp, 'mv ' + b) }
    for (const id of ['avengers1', 'loki1', 'c-civilwar', 'xmen97']) { await navega(`?t=${id}`); await espera(1500); await junta(cdp, 'ficha ' + id) }
  } finally { await cierra() }
}
{
  const { cdp, navega, cierra } = await abre({ movil: true, siembra: { 'maraton-marvel-idioma-v1': 'en' } })
  try {
    await cdp.eval(`localStorage.removeItem('maraton-marvel-bienvenida-v1')`); await navega(''); await espera(1500); await junta(cdp, 'bienvenida')
    for (let i = 0; i < 5; i++) { await cdp.eval(`[...document.querySelectorAll('button')].find(x => /Next|Continue|Start|Let/.test(x.textContent))?.click()`); await espera(700); await junta(cdp, 'bienvenida') }
  } finally { await cierra() }
}
console.log(vistos.size ? `${vistos.size} línea(s) para revisar:` : 'Nada con pinta de español.')
for (const [l, d] of vistos) console.log('  ' + d.padEnd(16), l.slice(0, 150))
