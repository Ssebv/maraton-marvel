import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Sello de compilación: va dentro del código (__BUILD__) y en version.json.
// La app compara los dos al volver a primer plano para ofrecer recargar
// cuando hay versión nueva (la instalada puede vivir días abierta). Es un
// hash de la fuente, no la fecha: la rutina mensual compila sola y con la
// fecha avisaría de «versión nueva» sin haber cambiado nada.
const archivos = dir => readdirSync(dir).flatMap(n => { const r = join(dir, n); return statSync(r).isDirectory() ? archivos(r) : [r] })
const h = createHash('md5')
for (const f of [...archivos('src').sort(), 'index.html', 'public/sw.js', 'public/manifest.webmanifest']) h.update(readFileSync(f))
const sello = h.digest('hex').slice(0, 10)
const versionJson = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: sello }) })
  },
}

// la foto de la cartelera del primer título, para precargarla desde el <head>
// en la primera visita (index.html, %LCP_INICIAL%)
const lcpInicial = (readFileSync('src/fondos.js', 'utf8').match(/"first-class":\s*"(\/[\w-]+\.jpg)"/) || [])[1] || ''
const lcpHtml = { name: 'lcp-inicial', transformIndexHtml: h => h.replace('%LCP_INICIAL%', lcpInicial) }

// los banners de estreno que tienen .webp al compilar (scripts/webp.mjs):
// la app solo ofrece el WebP de los que existen
const fondosWebp = readdirSync('public/fondo').filter(f => f.endsWith('.webp'))

export default defineConfig({
  define: { __BUILD__: JSON.stringify(sello), __FONDOS_WEBP__: JSON.stringify(fondosWebp) },
  plugins: [react(), viteSingleFile(), versionJson, lcpHtml],
  // Preact en lugar de React (21 sep 2026): el código sigue importando de
  // 'react' y 'react-dom' y aquí se redirige a preact/compat. react-dom era el
  // 29 % del HTML; medido A/B alterno en 4G lenta y CPU ×4: usable 2,04 → 1,73 s,
  // LCP 2,55 → 2,22 s, 306 → 259 kB gzip, y las 10 sondas y las 5 de comunidad
  // en verde. Diferencia a tener en cuenta: los eventos son los nativos
  // (onPointerEnter escucha pointerenter, no el pointerover de React) y el
  // render va en una microtarea, no dentro del mismo evento.
  resolve: {
    alias: [
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
    ],
  },
})
