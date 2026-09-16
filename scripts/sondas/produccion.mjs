#!/usr/bin/env node
// Espera a que GitHub Pages sirva exactamente docs/index.html. Compara por md5
// con una query nueva en cada intento (Pages cachea 10 min y un grep dio
// falsos positivos). Uso: node scripts/sondas/produccion.mjs [minutos]
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ, espera } from './lib.mjs'

const URL_PAGES = 'https://ssebv.github.io/maraton-marvel/'
const md5 = b => createHash('md5').update(b).digest('hex')
const local = md5(readFileSync(join(RAIZ, 'docs', 'index.html')))
const fin = Date.now() + (+process.argv[2] || 15) * 60000
const t0 = Date.now()
console.log(`docs/index.html ${local}`)
for (;;) {
  let remoto = '—'
  try {
    const r = await fetch(`${URL_PAGES}?v=${Date.now()}`, { cache: 'no-store' })
    if (r.ok) remoto = md5(Buffer.from(await r.arrayBuffer()))
  } catch (e) { remoto = 'error: ' + e.message }
  const s = Math.round((Date.now() - t0) / 1000)
  if (remoto === local) { console.log(`✓ producción sirve la build nueva (${s} s)`); break }
  if (Date.now() > fin) { console.log(`✗ a los ${s} s producción sigue en ${remoto}: mira gh api repos/Ssebv/maraton-marvel/pages/builds`); process.exitCode = 1; break }
  console.log(`  ${s} s: ${remoto}`)
  await espera(15000)
}
