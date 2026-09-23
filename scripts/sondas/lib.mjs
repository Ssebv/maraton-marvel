// Arnés de sondas: Chrome sin cabeza + CDP contra la build de `dist/`.
// Antes cada sesión rehacía estas piezas en una carpeta temporal y se perdían;
// aquí quedan con las trampas ya resueltas:
//  - servidor propio en Node sobre dist/ (nada de http.server zombis que
//    sirven otra copia) y comprobación de que dist está construido;
//  - perfil de Chrome NUEVO en cada pasada y borrado al salir (el service
//    worker de un perfil reutilizado sirve la build vieja sin avisar);
//  - emulación táctil ANTES de navegar (ES_TACTIL se evalúa al cargar);
//  - siembra de localStorage desde el mismo origen y recarga pasando por
//    about:blank (cambiar solo el hash no relee lo sembrado);
//  - foco emulado (sin él, focus/focusin no se disparan).
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
// DIST=<carpeta> sirve otra build (p. ej. una sin minificar para perfilar)
const DIST = process.env.DIST || join(RAIZ, 'dist')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }

export const espera = ms => new Promise(r => setTimeout(r, ms))

export function servidor({ puerto = 0, proxy = null } = {}) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/ no está construido: npm run build')
  const srv = createServer((req, res) => {
    // proxy: rutas como /auth/v1 y /rest/v1 a otro servidor (el Supabase local)
    const pref = proxy && Object.keys(proxy).find(p => req.url.startsWith(p + '/') || req.url.startsWith(p + '?'))
    if (pref) {
      const destino = new URL(proxy[pref] + req.url.slice(pref.length))
      const sub = httpRequest(destino, { method: req.method, headers: { ...req.headers, host: destino.host } }, r => {
        res.writeHead(r.statusCode, r.headers)
        r.pipe(res)
      })
      sub.on('error', e => { res.writeHead(502); res.end(String(e)) })
      req.pipe(sub)
      return
    }
    let ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    // el CSS pide algunas imágenes con la ruta absoluta de Pages
    // (`/maraton-marvel/tierra.jpg`): sin esto daban 404 y las capturas
    // enseñaban planetas sin textura (21 sep 2026)
    ruta = ruta.replace(/^[/\\]maraton-marvel(?=[/\\])/, '')
    let f = join(DIST, ruta)
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
    if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404); return res.end() }
    // gzip como GitHub Pages: sin él, una medida de arranque con red lenta
    // cuenta 955 kB donde el usuario baja 283
    const cuerpo = readFileSync(f), tipo = TIPOS[extname(f)] || 'application/octet-stream'
    const comprime = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|manifest/.test(tipo)
    res.writeHead(200, { 'content-type': tipo, 'cache-control': 'no-store', ...(comprime ? { 'content-encoding': 'gzip' } : {}) })
    res.end(comprime ? gzipSync(cuerpo) : cuerpo)
  })
  return new Promise(r => srv.listen(puerto, 'localhost', () => r(srv)))
}

// Mensajes JSON separados por NUL sobre las tuberías de Chrome.
class Tubo {
  constructor(escribe, lee) {
    this.escribe = escribe; this.onmessage = null
    let buf = ''
    lee.on('data', d => {
      buf += d
      let i
      while ((i = buf.indexOf('\0')) >= 0) { const m = buf.slice(0, i); buf = buf.slice(i + 1); this.onmessage && this.onmessage({ data: m }) }
    })
  }
  send(t) { this.escribe.write(t + '\0') }
  close() { this.escribe.end() }
}

class Cdp {
  constructor(ws, sessionId, raiz) {
    this.ws = ws; this.sessionId = sessionId
    if (raiz) { this.r = raiz; return }
    this.r = this; this.n = 0; this.pend = new Map(); this.oyentes = []
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && this.pend.has(m.id)) {
        const { ok, ko } = this.pend.get(m.id); this.pend.delete(m.id)
        m.error ? ko(new Error(m.error.message)) : ok(m.result)
      } else if (m.method) this.oyentes.forEach(f => f(m))
    }
  }
  sesion(id) { return new Cdp(this.ws, id, this) }
  async hasta_(pide, vale, ms = 15000) {
    const fin = Date.now() + ms
    for (;;) { const r = await pide().catch(() => null); if (r && vale(r)) return r; if (Date.now() > fin) throw new Error('Chrome no responde'); await espera(100) }
  }
  send(method, params = {}) {
    const r = this.r, id = ++r.n
    const msg = { id, method, params }
    if (this.sessionId) msg.sessionId = this.sessionId
    return new Promise((ok, ko) => { r.pend.set(id, { ok, ko }); this.ws.send(JSON.stringify(msg)) })
  }
  // Evalúa una expresión (puede ser async) y devuelve su valor. Un error de la
  // página se lanza aquí: una sonda nunca debe confundir null con «bien».
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('en la página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
  // Espera hasta que la expresión devuelva algo verdadero.
  async hasta(expr, ms = 15000) {
    const fin = Date.now() + ms
    for (;;) {
      const v = await this.eval(expr).catch(() => null)
      if (v) return v
      if (Date.now() > fin) throw new Error('tiempo agotado esperando: ' + expr)
      await espera(100)
    }
  }
}

// Lo mínimo para que la app arranque directa, sin bienvenida ni aviso, en español.
export const SIEMBRA_BASE = {
  'maraton-marvel-bienvenida-v1': '1',
  'maraton-marvel-aviso-v1': '2026-09-03',
  'maraton-marvel-idioma-v1': 'es',
  'maraton-marvel-pais-v1': 'CL',
}

// abre({ movil, siembra }) → { cdp, url, navega, cierra, errores }
export async function abre({ movil = true, ancho = 390, alto = 844, siembra = {}, puerto = 0, proxy = null } = {}) {
  const srv = await servidor({ puerto, proxy })
  const url = `http://localhost:${srv.address().port}/`
  const perfil = mkdtempSync(join(tmpdir(), 'sonda-maraton-'))
  // CDP por tubería (fd 3 y 4), no por red: este Mac no tiene 127.0.0.1 en
  // lo0 y además así no hay puertos que se queden ocupados
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--js-flags=--expose-gc', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  const tubo = new Tubo(chrome.stdio[3], chrome.stdio[4])
  const cdp0 = new Cdp(tubo)
  const { targetInfos } = await cdp0.hasta_(() => cdp0.send('Target.getTargets'), r => r.targetInfos.some(t => t.type === 'page'))
  const { sessionId } = await cdp0.send('Target.attachToTarget', { targetId: targetInfos.find(t => t.type === 'page').targetId, flatten: true })
  const cdp = cdp0.sesion(sessionId)
  const errores = []
  cdp0.oyentes.push(m => {
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(m.params.args.map(a => a.value ?? a.description).join(' '))
  })
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Performance.enable')
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  if (movil) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: true })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true })
  } else {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false })
  }

  // navega(ruta): pasa por about:blank para que la app relea localStorage
  const navega = async (ruta = '') => {
    await cdp.send('Page.navigate', { url: 'about:blank' })
    await espera(50)
    await cdp.send('Page.navigate', { url: url + ruta })
    await cdp.hasta(`document.readyState === 'complete' && !!document.querySelector('#root > *')`)
    await cdp.eval(`document.fonts.ready.then(() => 1)`)
  }
  // primera carga para tener el origen, siembra y recarga
  await cdp.send('Page.navigate', { url })
  await cdp.hasta(`document.readyState === 'complete'`)
  const todo = { ...SIEMBRA_BASE, ...siembra }
  await cdp.eval(`(() => { localStorage.clear(); const s = ${JSON.stringify(todo)}; for (const k in s) localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k])); return 1 })()`)

  const cierra = async () => {
    try { ws.close() } catch {}
    chrome.kill('SIGKILL')
    srv.close()
    await espera(200)
    rmSync(perfil, { recursive: true, force: true })
  }
  return { cdp, url, navega, cierra, errores }
}

// Métricas de memoria tras forzar recolección.
export async function memoria(cdp) {
  await cdp.send('HeapProfiler.enable')
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map(x => [x.name, x.value]))
  const extra = await cdp.eval(`({ ls: Object.keys(localStorage).reduce((s, k) => s + k.length + localStorage.getItem(k).length, 0), anim: document.getAnimations().length })`)
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodos: m.Nodes, oyentes: m.JSEventListeners, docs: m.Documents, marcos: m.Frames, lsKB: +(extra.ls / 1024).toFixed(1), animaciones: extra.anim }
}

// Toque real (pointer/mouse/click) sobre el primer elemento que case.
export const toca = (cdp, sel) => cdp.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false
  const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o))
  el.click(); return true })()`)

// Salida con puerta: una comprobación que falla sale con código 1.
export function informe(titulo, comprobaciones) {
  console.log(`\n── ${titulo} ──`)
  let malas = 0
  for (const [ok, texto] of comprobaciones) { console.log(`${ok ? '  ✓' : '  ✗'} ${texto}`); if (!ok) malas++ }
  return malas
}

// Captura de la pantalla visible a un PNG (la página puede estar desplazada:
// sin clip, así nunca sale un recorte vacío).
export async function captura(cdp, archivo) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(archivo, Buffer.from(data, 'base64'))
  return archivo
}
