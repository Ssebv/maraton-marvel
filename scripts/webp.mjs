// Convierte las carátulas de public/posters/ a WebP (q72, sharp_yuv: la mitad
// de bytes que el JPEG/PNG que llega de Wikipedia, sin pérdida visible a
// 132 px) y reescribe src/posters.js con las rutas nuevas. Idempotente: solo
// toca lo que aún no es .webp. Si `cwebp` no está instalado (la rutina en la
// nube), no hace NADA y sale en verde: la app funciona igual con .jpg.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'

const tieneCwebp = spawnSync('cwebp', ['-version'], { stdio: 'ignore' }).status === 0
if (!tieneCwebp) { console.log('webp: sin cwebp, se conservan las carátulas tal cual'); process.exit(0) }

const ruta = new URL('../src/posters.js', import.meta.url)
let js = readFileSync(ruta, 'utf8')
let n = 0, antes = 0, despues = 0
js = js.replace(/"(posters\/[\w.-]+)\.(jpe?g|png)"/g, (todo, base, ext) => {
  const origen = new URL(`../public/${base}.${ext}`, import.meta.url)
  const destino = new URL(`../public/${base}.webp`, import.meta.url)
  if (!existsSync(origen)) return todo
  try {
    execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', '-sharp_yuv', '-metadata', 'none', origen.pathname, '-o', destino.pathname])
  } catch { return todo }
  antes += readFileSync(origen).length; despues += readFileSync(destino).length
  unlinkSync(origen); n++
  return `"${base}.webp"`
})
if (n) {
  writeFileSync(ruta, js)
  console.log(`webp: ${n} carátulas convertidas, ${Math.round(antes / 1024)} → ${Math.round(despues / 1024)} KB`)
} else console.log('webp: nada que convertir')
