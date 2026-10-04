#!/usr/bin/env node
// Exporta los datos de la web a JSON para la app de iOS (`npm run ios:datos`).
// La web sigue siendo la fuente: data.js, episodios, títulos, pósters… se leen
// tal cual y se escriben en ios/MaratonKit/Sources/MaratonKit/Recursos/, que
// está en .gitignore (se regenera antes de compilar o probar en Swift).
// También escribe los vectores de prueba de los bits con las funciones aBits y
// deBits COPIADAS de src/App.jsx, para que Swift codifique exactamente igual.
import { mkdtempSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { raiz, ordenes } from './contrato.mjs'

const salida = join(raiz, 'ios', 'MaratonKit', 'Sources', 'MaratonKit', 'Recursos')
const vectores = join(raiz, 'ios', 'MaratonKit', 'Tests', 'MaratonKitTests', 'vectores.json')
const fallos = []

// Los módulos de src/ son ESM sin "type": "module": se copian como .mjs
const tmp = mkdtempSync(join(tmpdir(), 'maraton-ios-'))
const mod = {}
for (const f of ['data', 'episodes', 'episodios-en', 'episodios-latam', 'en-textos', 'titulos', 'titulos-en',
  'people', 'posters', 'posters-en', 'plataformas', 'tmdb', 'orden', 'fondos']) {
  const org = join(raiz, 'src', f + '.js')
  if (!existsSync(org)) { fallos.push(`falta src/${f}.js`); continue }
  copyFileSync(org, join(tmp, f + '.mjs'))
  Object.assign(mod, await import(pathToFileURL(join(tmp, f + '.mjs'))))
}
rmSync(tmp, { recursive: true, force: true })

const { DATA, ESTRENOS, MULTIVERSO, JOYA_MIN, EPISODES, EPISODIOS_EN, EPISODIOS_LATAM, EN_TEXTOS, TITULOS_LATAM,
  TITULOS_EN, PEOPLE, POSTERS, POSTERS_EN, PAISES, PLATAFORMAS, TMDB, TMDB_KEY, FOTOGRAMAS, ORDEN_CONGELADO } = mod

// Lo que vive dentro de App.jsx y no en un módulo: se extrae por su texto y,
// si cambia de forma, el script falla en vez de exportar algo a medias.
const app = readFileSync(join(raiz, 'src', 'App.jsx'), 'utf8')
const extrae = (re, nombre) => {
  const m = app.match(re)
  if (!m) { fallos.push(`no encuentro ${nombre} en src/App.jsx`); return null }
  return m[1]
}
const lotesTxt = extrae(/const LOTES_PARTIDOS = (\{[\s\S]*?\n\})/, 'LOTES_PARTIDOS')
const LOTES_PARTIDOS = lotesTxt ? Function(`return ${lotesTxt}`)() : {}
const aBitsTxt = extrae(/const aBits = (\(marcas, orden\) => \{[\s\S]*?\n\})/, 'aBits')
const deBitsTxt = extrae(/const deBits = (\(b64, orden\) => \{[\s\S]*?\n\})/, 'deBits')
// El Multiverso: las conexiones del mapa, las órbitas y anillos del sistema y los nombres cortos
const objeto = (re, nombre) => { const t = extrae(re, nombre); return t ? Function(`return ${t}`)() : null }
const MAPA_ARISTAS = objeto(/const MAPA_ARISTAS = (\[[\s\S]*?\n\])/, 'MAPA_ARISTAS')
const ANILLOS = objeto(/const ANILLOS = (\[[\s\S]*?\n\])/, 'ANILLOS')
const ORBITAS = objeto(/const ORBITAS = (\{[\s\S]*?\n\})/, 'ORBITAS')
const NUM_EN = objeto(/const NUM_EN = (\{[\s\S]*?\})\n/, 'NUM_EN')
const CORTO_SISTEMA = objeto(/const CORTO_SISTEMA = (\{[^\n]*\})\n/, 'CORTO_SISTEMA')

// El orden de los bits: congelado + lo nuevo detrás (igual que ORDEN_IDS/ORDEN_EPS)
const { ids, eps } = ordenes({ DATA, EPISODES, ORDEN_CONGELADO })
const enDatos = new Set(DATA.flatMap(s => s.eras.flatMap(e => e.items.map(it => it.id))))
const enLotes = new Set(Object.keys(LOTES_PARTIDOS))
for (const id of ids) if (!enDatos.has(id) && !enLotes.has(id)) console.log(`  aviso: el bit de «${id}» ya no tiene título (se conserva)`)

for (const l of ['es', 'en']) if (!existsSync(join(raiz, 'public', 'detalles', l + '.json'))) fallos.push(`falta public/detalles/${l}.json`)

if (fallos.length) {
  console.error('✗ exportar-ios:\n  ' + fallos.join('\n  '))
  process.exit(1)
}

rmSync(salida, { recursive: true, force: true })
const datos = join(salida, 'datos')
mkdirSync(datos, { recursive: true })
const escribe = (nombre, obj) => writeFileSync(join(datos, nombre), JSON.stringify(obj))

escribe('catalogo.json', { sagas: DATA, estrenos: ESTRENOS, multiverso: MULTIVERSO, joyaMin: JOYA_MIN })
escribe('episodios.json', EPISODES)
escribe('multiverso.json', { aristas: MAPA_ARISTAS, anillos: ANILLOS, orbitas: ORBITAS, numEn: NUM_EN, corto: CORTO_SISTEMA })
escribe('orden.json', { ids, eps, lotes: LOTES_PARTIDOS })
escribe('idiomas.json', {
  en: { textos: EN_TEXTOS, titulos: TITULOS_EN, episodios: EPISODIOS_EN },
  latam: { titulos: TITULOS_LATAM, episodios: EPISODIOS_LATAM },
})
escribe('plataformas.json', { paises: PAISES, porPais: PLATAFORMAS })
escribe('imagenes.json', { posters: POSTERS, postersEn: POSTERS_EN, personas: PEOPLE, tmdb: TMDB, tmdbKey: TMDB_KEY, fotogramas: FOTOGRAMAS })
for (const l of ['es', 'en']) copyFileSync(join(raiz, 'public', 'detalles', l + '.json'), join(datos, `detalles-${l}.json`))

// Imágenes: solo las que los mapas y los estrenos citan, con su misma ruta relativa
let nImg = 0
for (const ruta of new Set([...Object.values(POSTERS), ...Object.values(POSTERS_EN || {}), ...Object.values(PEOPLE), ...ESTRENOS.map(e => e.poster).filter(Boolean)])) {
  const org = join(raiz, 'public', ruta)
  if (!existsSync(org)) { console.log(`  aviso: falta public/${ruta}`); continue }
  mkdirSync(join(salida, ruta, '..'), { recursive: true })
  copyFileSync(org, join(salida, ruta))
  nImg++
}

// Fondos de saga y de estrenos (public/fondo), en su tamaño grande
mkdirSync(join(salida, 'fondo'), { recursive: true })
for (const f of readdirSync(join(raiz, 'public', 'fondo'))) {
  if (/-\d+\.(webp|jpg)$/.test(f)) continue
  copyFileSync(join(raiz, 'public', 'fondo', f), join(salida, 'fondo', f))
  nImg++
}

// Vectores de prueba: marcas sueltas, todas, ninguna y una mezcla fija
const aBits = Function(`return ${aBitsTxt}`)()
const deBits = Function(`return ${deBitsTxt}`)()
const casos = []
const caso = (nombre, sel, orden) => {
  const marcas = Object.fromEntries(orden.filter(sel).map(k => [k, 1]))
  const b64 = aBits(marcas, orden)
  if (Object.keys(deBits(b64, orden)).length !== Object.keys(marcas).length) throw new Error('aBits/deBits no cuadran: ' + nombre)
  casos.push({ nombre, claves: Object.keys(marcas).sort(), b64 })
}
caso('ids: ninguno', () => false, ids)
caso('ids: todos', () => true, ids)
caso('ids: primero y último', (k, i) => i === 0 || i === ids.length - 1, ids)
caso('ids: uno de cada tres', (k, i) => i % 3 === 0, ids)
caso('eps: uno de cada siete', (k, i) => i % 7 === 0, eps)
caso('eps: últimos diez', (k, i) => i >= eps.length - 10, eps)

// Vectores del horario: la simulaHorario de la web con todos los días de la
// semana (así las fechas no importan) y progresos fijos
const simulaTxt = extrae(/(function simulaHorario\([\s\S]*?\n\})/, 'simulaHorario')
const simulaHorario = Function('DATA', 'EPISODES', `${simulaTxt}; return simulaHorario`)(DATA, EPISODES)
const horario = []
const casoH = (nombre, h, selIds, selEps) => {
  // sin lotes viejos: la web los reparte en sus piezas al cargar (migraMarcas)
  const vistas = Object.fromEntries(ids.filter(selIds).filter(k => !LOTES_PARTIDOS[k]).map(k => [k, 1]))
  const marcasEps = Object.fromEntries(eps.filter(selEps).map(k => [k, 1]))
  const sim = simulaHorario(h, vistas, marcasEps, 8)
  horario.push({
    nombre, h, vistas: Object.keys(vistas), eps: Object.keys(marcasEps),
    totalMin: sim.totalMin, nSesiones: sim.nSesiones, seAcaba: sim.seAcaba,
    sesiones: sim.sesiones.map(x => ({ min: x.min, trozos: x.trozos.map(t => [t.item.id, t.txt || '']) })),
  })
}
const semana = [0, 1, 2, 3, 4, 5, 6]
casoH('horario: express desde cero', { dias: semana, min: 90, hora: '21:00', exp: true }, () => false, () => false)
casoH('horario: completo a medias', { dias: semana, min: 120, hora: '21:00', exp: false }, (k, i) => i % 3 === 0, (k, i) => i % 5 === 0)
casoH('horario: sesiones cortas', { dias: semana, min: 30, hora: '21:00', exp: false }, (k, i) => i < 20, (k, i) => i < 40)
casoH('horario: una hora a la semana no se acaba', { dias: [6], min: 60, hora: '21:00', exp: false }, () => false, () => false)

mkdirSync(join(vectores, '..'), { recursive: true })
writeFileSync(vectores, JSON.stringify({ ids: casos.filter(c => c.nombre.startsWith('ids')), eps: casos.filter(c => c.nombre.startsWith('eps')), horario }, null, 1) + '\n')

const pesa = d => readdirSync(d, { withFileTypes: true }).reduce((a, f) => a + (f.isDirectory() ? 0 : 1), 0)
console.log(`✓ iOS: ${enDatos.size} títulos, ${eps.length} episodios en bits, ${pesa(datos)} JSON y ${nImg} imágenes en ios/MaratonKit/…/Recursos`)
