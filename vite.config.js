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

export default defineConfig({
  define: { __BUILD__: JSON.stringify(sello) },
  plugins: [react(), viteSingleFile(), versionJson],
})
