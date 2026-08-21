// Genera public/novedades.json para que el service worker pueda avisar de
// estrenos sin cargar la app: fechas de ESTRENOS + últimos episodios con fecha.
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'novedades-'))
copyFileSync(join(raiz, 'src/data.js'), join(tmp, 'data.mjs'))
copyFileSync(join(raiz, 'src/episodes.js'), join(tmp, 'episodes.mjs'))

const { DATA, ESTRENOS } = await import(pathToFileURL(join(tmp, 'data.mjs')))
const { EPISODES } = await import(pathToFileURL(join(tmp, 'episodes.mjs')))

const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const titulo = id => items.find(i => i.id === id)?.t || id

const eventos = []
for (const e of ESTRENOS) {
  if (e.fecha) eventos.push({ f: e.fecha, t: e.t, tipo: e.tipo })
}
// episodios con fecha futura o de los últimos 60 días (series en emisión)
const hoy = new Date().toISOString().slice(0, 10)
const hace60 = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
for (const [id, eps] of Object.entries(EPISODES)) {
  for (const ep of eps) {
    if (ep.f && ep.f >= hace60) {
      eventos.push({ f: ep.f, t: `${titulo(id)} — T${ep.s}E${ep.n}`, tipo: 'Episodio', serie: id })
    }
  }
}
eventos.sort((a, b) => a.f.localeCompare(b.f))

// Solo se reescribe si CAMBIAN los eventos. Antes la fecha `gen` se refrescaba
// en cada compilación y ensuciaba el diff todos los meses aunque no hubiera
// nada nuevo, y eso obliga a decidir «¿esto es un cambio de verdad?» a quien
// compile —incluida la rutina mensual, que compila sola. Nadie lee `gen`: el
// service worker solo mira `eventos`.
const ruta = join(raiz, 'public/novedades.json')
let antes = null
try { antes = JSON.parse(readFileSync(ruta, 'utf8')) } catch {}
const iguales = antes && JSON.stringify(antes.eventos) === JSON.stringify(eventos)
if (iguales) {
  console.log(`novedades.json: ${eventos.length} eventos, sin cambios (se deja el gen de ${antes.gen})`)
} else {
  writeFileSync(ruta, JSON.stringify({ gen: hoy, eventos }))
  console.log(`novedades.json: ${eventos.length} eventos (actualizado ${hoy})`)
}
