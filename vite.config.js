import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Sello de compilación: va dentro del código (__BUILD__) y en version.json.
// La app compara los dos al volver a primer plano para ofrecer recargar
// cuando hay versión nueva (la instalada puede vivir días abierta).
const sello = Date.now().toString(36)
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
