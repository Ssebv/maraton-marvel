// Pasa a WebP (q72, sharp_yuv: la mitad de bytes que el JPEG/PNG original, sin
// pérdida visible a los tamaños en que se ven) las imágenes que se sirven en
// la app: carátulas (src/posters.js), fotos del reparto (src/people.js), las
// franjas de saga y el muro de miniaturas (rutas fijas en App.jsx). Reescribe
// los dos mapas generados con las rutas nuevas. Idempotente: solo toca lo que
// aún no es .webp. Si `cwebp` no está instalado (la rutina en la nube), no
// hace NADA y sale en verde: la app funciona igual con el .jpg que haya.
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tieneCwebp = spawnSync('cwebp', ['-version'], { stdio: 'ignore' }).status === 0
if (!tieneCwebp) { console.log('webp: sin cwebp, se conservan las imágenes tal cual'); process.exit(0) }

let n = 0, antes = 0, despues = 0
const convierte = (origen, destino) => {
  try {
    execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', '-sharp_yuv', '-metadata', 'none', origen, '-o', destino])
  } catch { return false }
  antes += readFileSync(origen).length; despues += readFileSync(destino).length
  unlinkSync(origen); n++
  return true
}
const pub = fileURLToPath(new URL('../public/', import.meta.url))

// mapas generados: la ruta cambia de extensión en el propio archivo
for (const [archivo, carpeta] of [['posters.js', 'posters'], ['people.js', 'people']]) {
  const ruta = new URL(`../src/${archivo}`, import.meta.url)
  const js = readFileSync(ruta, 'utf8')
  const nuevo = js.replace(new RegExp(`"(${carpeta}/[\\w.-]+)\\.(jpe?g|png)"`, 'g'), (todo, base, ext) => {
    // Si hay .jpg nuevo (la rutina mensual reemplaza una carátula), se convierte
    // aunque exista un .webp viejo al lado. Si NO hay original, dos nombres
    // comparten foto («Russo brothers» y «Hermanos Russo»): se reapunta.
    if (existsSync(`${pub}${base}.${ext}`)) return convierte(`${pub}${base}.${ext}`, `${pub}${base}.webp`) ? `"${base}.webp"` : todo
    if (existsSync(`${pub}${base}.webp`)) return `"${base}.webp"`
    return todo
  })
  if (nuevo !== js) writeFileSync(ruta, nuevo)
}
// rutas fijas (App.jsx ya las pide en .webp). En fondo/ SOLO las cuatro franjas
// de saga: los banners de estreno (doomsday.jpg y los que añada la rutina
// mensual) se referencian desde data.js con su .jpg y no se tocan.
const FRANJAS = /^(xmen|ucm|comics|animacion)(-560)?\.jpe?g$/
for (const carpeta of ['fondo', 'mini']) {
  for (const f of readdirSync(pub + carpeta)) {
    if (!/\.jpe?g$/.test(f) || (carpeta === 'fondo' && !FRANJAS.test(f))) continue
    convierte(`${pub}${carpeta}/${f}`, `${pub}${carpeta}/${f.replace(/\.jpe?g$/, '.webp')}`)
  }
}
console.log(n ? `webp: ${n} imágenes convertidas, ${Math.round(antes / 1024)} → ${Math.round(despues / 1024)} KB` : 'webp: nada que convertir')
