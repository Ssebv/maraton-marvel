// Muelles para CSS: Motion convierte un muelle (duración visual + rebote) en
// una curva `linear()` con su duración total, y aquí se escriben como tokens
// --muelle-* entre las marcas de styles.css. Idempotente: si el bloque ya está
// al día no toca el archivo. Donde el navegador no entiende `linear()` quedan
// los valores de reserva (las curvas de siempre).
import { readFileSync, writeFileSync } from 'node:fs'
import { spring } from 'motion'

// [nombre, duración visual (s), rebote, reserva sin linear()]
const MUELLES = [
  // la hoja móvil sube y asienta apenas
  ['--muelle-hoja', 0.36, 0.1, '.38s var(--curva-hoja)'],
  // ventanas en escritorio, números que ruedan, lo que aparece al tocar
  ['--muelle', 0.28, 0.12, 'var(--dur-media) var(--curva)'],
  // pulsar y soltar: encoge y vuelve con un pequeño rebote
  ['--muelle-toque', 0.2, 0.3, 'var(--dur-corta) var(--curva)'],
  // confirmaciones: el icono de la pestaña, el check de la casilla
  ['--muelle-pop', 0.24, 0.42, 'var(--dur-media) var(--curva-rebote)'],
]

const ruta = new URL('../src/styles.css', import.meta.url)
const css = readFileSync(ruta, 'utf8')
const INI = '/* muelles:inicio'
const FIN = '/* muelles:fin */'
const a = css.indexOf(INI), b = css.indexOf(FIN)
if (a < 0 || b < a) { console.error('muelles: faltan las marcas en src/styles.css'); process.exit(1) }

const bloque = [
  `${INI} — generado por scripts/muelles.mjs con spring() de Motion; no editar a mano */`,
  `:root{${MUELLES.map(([n, , , r]) => `${n}:${r}`).join('; ')}}`,
  '@supports (animation-timing-function: linear(0, 1)){',
  `  :root{\n${MUELLES.map(([n, d, r]) => `    ${n}:${String(spring(d, r))};`).join('\n')}\n  }`,
  '}',
  FIN,
].join('\n')

const nuevo = css.slice(0, a) + bloque + css.slice(b + FIN.length)
if (nuevo !== css) { writeFileSync(ruta, nuevo); console.log('muelles: tokens actualizados') }
else console.log('muelles: al día')
