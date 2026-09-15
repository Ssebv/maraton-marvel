// Fragmento del espejo de la app en Artifacts (https://claude.ai/code/artifact/53ae0333-…),
// generado desde dist/index.html al final de `npm run desplegar`. Queda en
// .espejo/maraton-marvel-espejo.html (ignorado por git) y se publica a mano
// sobre el artifact existente (mismo enlace).
// Estructura: título + script del tema + <style> del bundle + <link> de Google
// Fonts DESPUÉS del style (el CSP de los artifacts solo deja fuentes de
// fonts.gstatic.com y la última @font-face con el mismo nombre gana) +
// <div id="root"> + <script type="module">. Las rutas relativas de recursos
// (carátulas, fotos, fondos, fuentes…) se prefijan con la URL de producción.
// Falla (código 1) si no encuentra alguna pieza o si faltan prefijos esperados:
// un espejo con las carátulas rotas no debe llegar a publicarse.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const entrada = process.argv[2] || 'dist/index.html'
const salida = process.argv[3] || '.espejo/maraton-marvel-espejo.html'
const PROD = 'https://ssebv.github.io/maraton-marvel/'
const html = readFileSync(entrada, 'utf8')
const saca = re => {
  const m = html.match(re)
  if (!m) { console.error('espejo: no encontrado', re); process.exit(1) }
  return m[0]
}
const titulo = saca(/<title>[\s\S]*?<\/title>/)
const tema = saca(/<script>try\{var t=localStorage\.getItem\('maraton-marvel-tema-v1'\)[\s\S]*?<\/script>/)
const CARPETAS = ['posters', 'people', 'mini', 'fondo', 'rar', 'fonts']
const prefija = t => t
  .replace(new RegExp(`(["'\`(])(${CARPETAS.join('|')})/`, 'g'), (_, q, c) => `${q}${PROD}${c}/`)
  .replace(/(["'`(])(tierra\.jpg)/g, (_, q, f) => `${q}${PROD}${f}`)
  // rutas absolutas del sitio (la textura de los planetas: url('/maraton-marvel/tierra.jpg'))
  .replace(/(["'`(])\/maraton-marvel\//g, (_, q) => `${q}${PROD}`)
const estilo = prefija(saca(/<style[^>]*>[\s\S]*?<\/style>/))
const modulo = prefija(saca(/<script type="module"[^>]*>[\s\S]*?<\/script>/))
const fuentes = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&family=Archivo+Black&display=swap">'
const fragmento = [titulo, tema, estilo, fuentes, '<div id="root"></div>', modulo].join('\n')

const cuenta = c => (fragmento.match(new RegExp(PROD.replace(/[.]/g, '\\.') + c.replace('.', '\\.'), 'g')) || []).length
const cuentas = Object.fromEntries([...CARPETAS.map(c => c + '/'), 'tierra.jpg'].map(c => [c, cuenta(c)]))
const faltan = ['posters/', 'people/', 'fonts/', 'tierra.jpg'].filter(c => !cuentas[c])
if (faltan.length) { console.error('espejo: sin prefijar', faltan.join(', ')); process.exit(1) }

mkdirSync(salida.replace(/\/[^/]*$/, ''), { recursive: true })
writeFileSync(salida, fragmento)
console.log(`espejo: ${salida} (${Math.round(fragmento.length / 1024)} kB) · ${Object.entries(cuentas).map(([c, n]) => `${c} ${n}`).join(' · ')}`)
