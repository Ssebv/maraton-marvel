#!/usr/bin/env node
// Genera scripts/contrato.lock.json: la foto del orden del que dependen los
// bitsets de perfil, duelo y club. Solo se regenera A PROPÓSITO, y solo cuando
// se ha AÑADIDO algo al final: verifica.mjs comprueba contra este fichero que
// el prefijo no se ha movido, porque moverlo invalida todos los enlaces que
// alguien haya compartido.
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// src/*.js son ESM pero el package.json dice commonjs: se copian a .mjs
export async function cargaFuentes() {
  const tmp = mkdtempSync(join(tmpdir(), 'maraton-'))
  const mod = {}
  for (const f of ['data', 'episodes', 'posters', 'people', 'tmdb']) {
    copyFileSync(join(raiz, 'src', f + '.js'), join(tmp, f + '.mjs'))
  }
  for (const f of ['data', 'episodes', 'posters', 'people', 'tmdb']) {
    Object.assign(mod, await import(pathToFileURL(join(tmp, f + '.mjs'))))
  }
  return mod
}

export function ordenes({ DATA, EPISODES }) {
  const ids = []
  DATA.forEach(sg => sg.eras.forEach(era => era.items.forEach(it => ids.push(it.id))))
  const eps = []
  ids.forEach(id => (EPISODES[id] || []).forEach(e => eps.push(`${id}:${e.s}:${e.n}`)))
  return { ids, eps }
}

export const RUTA_LOCK = join(raiz, 'scripts', 'contrato.lock.json')
export const leeLock = () => existsSync(RUTA_LOCK) ? JSON.parse(readFileSync(RUTA_LOCK, 'utf8')) : null

if (process.argv[1] && process.argv[1].endsWith('contrato.mjs')) {
  const { ids, eps } = ordenes(await cargaFuentes())
  const antes = leeLock()
  if (antes) {
    const rotoIds = !antes.ids.every((k, i) => ids[i] === k)
    const rotoEps = !antes.eps.every((k, i) => eps[i] === k)
    if (rotoIds || rotoEps) {
      console.error('✗ El orden guardado NO es un prefijo del actual: regenerar así')
      console.error('  invalidaría los perfiles y clubes ya compartidos. Revísalo antes.')
      process.exit(1)
    }
    console.log(`orden anterior: ${antes.ids.length} títulos, ${antes.eps.length} episodios`)
  }
  writeFileSync(RUTA_LOCK, JSON.stringify({ ids, eps }))
  console.log(`✓ contrato.lock.json: ${ids.length} títulos, ${eps.length} episodios`)
}
