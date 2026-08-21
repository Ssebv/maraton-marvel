#!/usr/bin/env node
// Extiende el orden congelado: scripts/contrato.lock.json (el testigo) y
// src/orden.js (lo que se embarca). SOLO AÑADE POR EL FINAL. Si lo congelado
// dejara de ser un prefijo de lo nuevo, para: eso significaría que alguien ha
// editado orden.js a mano, y mover una posición invalida todos los enlaces
// de perfil y los datos de club que haya compartidos por ahí.
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// src/*.js son ESM pero el package.json dice commonjs: se copian a .mjs
export async function cargaFuentes() {
  const tmp = mkdtempSync(join(tmpdir(), 'maraton-'))
  const mod = {}
  const ficheros = ['data', 'episodes', 'posters', 'people', 'tmdb', 'orden']
  for (const f of ficheros) {
    const org = join(raiz, 'src', f + '.js')
    if (existsSync(org)) copyFileSync(org, join(tmp, f + '.mjs'))
  }
  for (const f of ficheros) {
    const c = join(tmp, f + '.mjs')
    if (existsSync(c)) Object.assign(mod, await import(pathToFileURL(c)))
  }
  return mod
}

// Lo congelado manda; lo que no esté, detrás y en el orden de la pantalla.
export const congela = (congelado, actuales) => {
  const yaEsta = new Set(congelado)
  return [...congelado, ...actuales.filter(x => !yaEsta.has(x))]
}

// El orden de la PANTALLA (data.js) y el de los BITS (congelado + lo nuevo)
export function ordenes({ DATA, EPISODES, ORDEN_CONGELADO }) {
  const vista = []
  DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => vista.push(it.id))))
  const epsVista = []
  vista.forEach(id => (EPISODES[id] || []).forEach(e => epsVista.push(`${id}:${e.s}:${e.n}`)))
  const cong = ORDEN_CONGELADO || { ids: [], eps: [] }
  return { vista, epsVista, ids: congela(cong.ids, vista), eps: congela(cong.eps, epsVista) }
}

export const RUTA_LOCK = join(raiz, 'scripts', 'contrato.lock.json')
export const leeLock = () => existsSync(RUTA_LOCK) ? JSON.parse(readFileSync(RUTA_LOCK, 'utf8')) : null

function comoJs(xs) {
  const out = []; let linea = []
  for (const x of xs) {
    linea.push(JSON.stringify(x))
    if (linea.join(',').length > 100) { out.push(linea.join(',')); linea = [] }
  }
  if (linea.length) out.push(linea.join(','))
  return '\n  ' + out.join(',\n  ') + '\n'
}

if (process.argv[1] && process.argv[1].endsWith('contrato.mjs')) {
  const fuentes = await cargaFuentes()
  const { ids, eps } = ordenes(fuentes)
  const antes = leeLock()
  if (antes) {
    const i = antes.ids.findIndex((k, n) => ids[n] !== k)
    const j = antes.eps.findIndex((k, n) => eps[n] !== k)
    if (i >= 0 || j >= 0) {
      console.error('✗ Lo congelado ya no es un prefijo de lo nuevo.')
      if (i >= 0) console.error(`  ids, posición ${i}: era «${antes.ids[i]}» y sale «${ids[i]}»`)
      if (j >= 0) console.error(`  eps, posición ${j}: era «${antes.eps[j]}» y sale «${eps[j]}»`)
      console.error('  Alguien ha editado src/orden.js a mano. Ese fichero solo crece por el final.')
      process.exit(1)
    }
    const nuevos = ids.length - antes.ids.length, nuevosEps = eps.length - antes.eps.length
    console.log(nuevos || nuevosEps ? `añadiendo al final: +${nuevos} títulos, +${nuevosEps} episodios` : 'nada nuevo que añadir')
  }
  writeFileSync(RUTA_LOCK, JSON.stringify({ ids, eps }))
  writeFileSync(join(raiz, 'src', 'orden.js'),
`// GENERADO por \`npm run contrato\`. NO SE EDITA A MANO, Y SOLO CRECE POR EL FINAL.
//
// Este es el orden con el que los perfiles compartidos, el duelo y el club
// codifican el progreso: cada título y cada episodio ocupan una POSICIÓN fija
// en un mapa de bits. Antes ese orden salía de recorrer src/data.js, así que
// meter un estreno nuevo en su hueco cronológico —que es donde tiene que ir—
// corría todo lo que venía detrás y los enlaces ya compartidos pasaban a leer
// datos de otro título. Con el orden aquí congelado, data.js se puede
// reordenar libremente: lo que ya existe no se mueve nunca, y lo nuevo entra
// al final de esta lista aunque en pantalla salga en medio.
//
// Un id que desaparezca de data.js se queda aquí de todos modos, ocupando su
// bit, para que nada de lo que venga después cambie de sitio.
export const ORDEN_CONGELADO = {
  ids: [${comoJs(ids)}],
  eps: [${comoJs(eps)}],
}
`)
  console.log(`✓ ${ids.length} títulos y ${eps.length} episodios congelados (scripts/contrato.lock.json + src/orden.js)`)
}
