#!/usr/bin/env node
// `npm run sonda`: todas las sondas contra dist/, en serie. Sale con 1 si alguna falla.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))
const pedidas = process.argv.slice(2)
const sondas = pedidas.length ? pedidas : ['humo', 'cupo', 'hig', 'detalles', 'barra', 'fluidez', 'navegacion', 'sistema', 'arranque', 'memoria']
const fallidas = sondas.filter(s => spawnSync(process.execPath, [dir + s + '.mjs', ...(s === 'memoria' ? ['6'] : [])], { stdio: 'inherit' }).status !== 0)
console.log(fallidas.length ? `\n✗ fallan: ${fallidas.join(', ')}` : `\n✓ ${sondas.length} sondas en verde`)
process.exitCode = fallidas.length ? 1 : 0
