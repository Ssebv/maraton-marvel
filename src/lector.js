// Lector de cómics DENTRO de la app, para los archivos que el usuario tiene:
// CBZ/ZIP (imágenes comprimidas), una carpeta de imágenes o un PDF. El archivo
// se guarda en IndexedDB de este navegador (nada sale de aquí ni se descarga
// de ningún sitio) y la ficha del cómic lo abre a pantalla completa.
// Los CBR (RAR) se abren con node-unrar-js, que NO va en el bundle: son 250 kB
// (public/rar/unrar.js + unrar.wasm) que se cargan la primera vez que alguien
// elige un CBR. Ver README, «Lector de cómics».
import { unzipSync } from 'fflate'

const DB = 'maraton-marvel-lector'
const ALMACEN = 'archivos'
const ES_IMAGEN = /\.(jpe?g|png|webp|gif|avif)$/i

function abreDb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('Este navegador no guarda archivos'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error || new Error('No se pudo abrir el almacén'))
  })
}
function pide(modo, fn) {
  return abreDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(ALMACEN, modo)
    const r = fn(tx.objectStore(ALMACEN))
    tx.oncomplete = () => { db.close(); res(r.result) }
    tx.onerror = () => { db.close(); rej(tx.error || new Error('Fallo al guardar')) }
    tx.onabort = () => { db.close(); rej(tx.error || new Error('Guardado cancelado (¿sin espacio?)')) }
  }))
}

// Lo que entra: un archivo (.cbz/.zip/.pdf) o varias imágenes (una carpeta)
export function clasifica(archivos) {
  const lista = [...archivos].filter(f => f && typeof f.name === 'string')
  if (!lista.length) return { error: 'No se eligió ningún archivo' }
  if (lista.length > 1) {
    const imgs = lista.filter(f => ES_IMAGEN.test(f.name))
    if (!imgs.length) return { error: 'Varios archivos, pero ninguno es una imagen' }
    return { tipo: 'imagenes', archivos: imgs.sort(ordenNatural), nombre: `${imgs.length} imágenes` }
  }
  const f = lista[0]
  if (/\.cbr$|\.rar$/i.test(f.name)) return { tipo: 'cbr', archivo: f, nombre: f.name }
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return { tipo: 'pdf', archivo: f, nombre: f.name }
  if (/\.cbz$|\.zip$/i.test(f.name) || /zip/.test(f.type)) return { tipo: 'cbz', archivo: f, nombre: f.name }
  if (ES_IMAGEN.test(f.name)) return { tipo: 'imagenes', archivos: [f], nombre: f.name }
  return { error: 'Formato no reconocido: vale un CBZ/ZIP, un CBR, un PDF o imágenes' }
}

const ordenNatural = (a, b) => (a.name || a).localeCompare(b.name || b, 'es', { numeric: true, sensitivity: 'base' })

export async function guardaArchivo(id, eleccion) {
  const reg = { tipo: eleccion.tipo, nombre: eleccion.nombre, fecha: Date.now() }
  if (eleccion.tipo === 'imagenes') { reg.archivos = eleccion.archivos; reg.tam = eleccion.archivos.reduce((s, f) => s + f.size, 0) }
  else { reg.archivo = eleccion.archivo; reg.tam = eleccion.archivo.size }
  await pide('readwrite', st => st.put(reg, id))
  pidePersistencia()
  return meta(reg)
}
// Todo lo que sale del almacén se valida por tipo: un registro raro no debe
// tumbar la ficha
function valido(reg) {
  if (!reg || typeof reg !== 'object' || typeof reg.nombre !== 'string') return false
  if (reg.tipo === 'imagenes') return Array.isArray(reg.archivos) && reg.archivos.every(f => f instanceof Blob)
  return (reg.tipo === 'cbz' || reg.tipo === 'cbr' || reg.tipo === 'pdf') && reg.archivo instanceof Blob
}
const meta = reg => ({ tipo: reg.tipo, nombre: reg.nombre, tam: typeof reg.tam === 'number' ? reg.tam : 0 })
export async function leeArchivo(id) {
  const reg = await pide('readonly', st => st.get(id))
  return valido(reg) ? reg : null
}
export const borraArchivo = id => pide('readwrite', st => st.delete(id))
// Todos los archivos guardados, solo sus datos (no los bytes): { id: meta }
export async function listaArchivos() {
  try {
    const db = await abreDb()
    return await new Promise((res, rej) => {
      const out = {}
      const cur = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).openCursor()
      cur.onsuccess = () => { const c = cur.result; if (!c) { db.close(); res(out); return } if (typeof c.key === 'string' && valido(c.value)) out[c.key] = meta(c.value); c.continue() }
      cur.onerror = () => { db.close(); rej(cur.error) }
    })
  } catch { return {} }
}
// Safari borra el almacén de una web que no se abre en 7 días (no si está
// instalada como app); Chrome y Firefox lo respetan si se pide persistencia.
export async function persistencia() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return null
    return await navigator.storage.persisted()
  } catch { return null }
}
export async function pidePersistencia() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : null } catch { return null }
}
export async function espacio() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null
    const e = await navigator.storage.estimate()
    return { usado: e.usage || 0, cuota: e.quota || 0 }
  } catch { return null }
}
export async function metaArchivo(id) {
  try { const r = await leeArchivo(id); return r ? meta(r) : null } catch { return null }
}

const ZIP_MAGIC = [0x50, 0x4b]
const RAR_MAGIC = [0x52, 0x61, 0x72, 0x21]
const empiezaPor = (u8, m) => m.every((b, i) => u8[i] === b)
const esPagina = n => ES_IMAGEN.test(n) && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\./.test(n)

// El descompresor de RAR se trae una sola vez, desde la carpeta de la app
// (misma ruta relativa que las carátulas: vale en Pages y en local)
let unrarPromesa = null
function cargaUnrar() {
  if (!unrarPromesa) {
    unrarPromesa = (async () => {
      const base = new URL('rar/', document.baseURI)
      const [mod, wasm] = await Promise.all([
        import(/* @vite-ignore */ new URL('unrar.js', base).href),
        fetch(new URL('unrar.wasm', base)).then(r => { if (!r.ok) throw new Error('wasm ' + r.status); return r.arrayBuffer() }),
      ])
      return { crea: mod.createExtractorFromData, wasm }
    })().catch(e => { unrarPromesa = null; throw new Error('No se pudo cargar el descompresor de RAR (¿sin conexión?): ' + (e && e.message ? e.message : e)) })
  }
  return unrarPromesa
}
async function abreRar(data) {
  const { crea, wasm } = await cargaUnrar()
  let ex
  try { ex = await crea({ wasmBinary: wasm, data }) } catch (e) { throw new Error('El archivo no es un RAR/CBR válido' + (e && e.message ? ' (' + e.message + ')' : '')) }
  let cabeceras
  try { cabeceras = [...ex.getFileList().fileHeaders] } catch (e) { throw new Error('No se pudo leer el índice del CBR' + (e && e.message ? ' (' + e.message + ')' : '')) }
  const nombres = cabeceras.filter(h => h && !(h.flags && h.flags.directory) && typeof h.name === 'string' && esPagina(h.name)).map(h => h.name).sort(ordenNatural)
  if (!nombres.length) throw new Error('El CBR no trae imágenes')
  const urls = new Map()
  return {
    tipo: 'imagenes', tot: nombres.length,
    pagina(i) {
      if (!urls.has(i)) {
        const n = nombres[i]
        let bytes = null
        try { for (const f of ex.extract({ files: [n] }).files) if (f && f.extraction) bytes = f.extraction } catch { bytes = null }
        if (!bytes) throw new Error(`No se pudo leer la página ${i + 1}: el archivo está dañado o cifrado`)
        urls.set(i, URL.createObjectURL(new Blob([bytes])))
        for (const k of [...urls.keys()]) if (urls.size > 8 && Math.abs(k - i) > 3) { URL.revokeObjectURL(urls.get(k)); urls.delete(k) }
      }
      return urls.get(i)
    },
    cierra() { urls.forEach(u => URL.revokeObjectURL(u)) },
  }
}

// Abre un registro y devuelve cómo pasar página. Las imágenes de un CBZ se
// descomprimen una a una al pedirlas (un CBZ de 100 MB no se expande entero).
export async function abreComic(reg) {
  if (reg.tipo === 'pdf') return { tipo: 'pdf', url: URL.createObjectURL(reg.archivo), tot: 0, cierra() { URL.revokeObjectURL(this.url) } }
  if (reg.tipo === 'imagenes') {
    const urls = new Map()
    return {
      tipo: 'imagenes', tot: reg.archivos.length,
      pagina(i) { if (!urls.has(i)) urls.set(i, URL.createObjectURL(reg.archivos[i])); return urls.get(i) },
      cierra() { urls.forEach(u => URL.revokeObjectURL(u)) },
    }
  }
  const data = new Uint8Array(await reg.archivo.arrayBuffer())
  // manda lo que el archivo ES, no su extensión: hay CBZ que son RAR y al revés
  if (empiezaPor(data, RAR_MAGIC)) return abreRar(data)
  if (!empiezaPor(data, ZIP_MAGIC)) throw new Error(reg.tipo === 'cbr' ? 'El archivo no es un RAR/CBR válido' : 'El archivo no es un ZIP/CBZ válido')
  const nombres = []
  try {
    unzipSync(data, { filter: f => { if (esPagina(f.name)) nombres.push(f.name); return false } })
  } catch { throw new Error('El archivo está dañado o no es un ZIP/CBZ válido') }
  nombres.sort(ordenNatural)
  if (!nombres.length) throw new Error('El CBZ no trae imágenes')
  const urls = new Map()
  return {
    tipo: 'imagenes', tot: nombres.length,
    pagina(i) {
      if (!urls.has(i)) {
        const n = nombres[i]
        let bytes
        try { bytes = unzipSync(data, { filter: f => f.name === n })[n] } catch { bytes = null }
        if (!bytes) throw new Error(`No se pudo leer la página ${i + 1}: el archivo está dañado`)
        urls.set(i, URL.createObjectURL(new Blob([bytes])))
        // no más de ocho páginas descomprimidas a la vez
        for (const k of [...urls.keys()]) if (urls.size > 8 && Math.abs(k - i) > 3) { URL.revokeObjectURL(urls.get(k)); urls.delete(k) }
      }
      return urls.get(i)
    },
    cierra() { urls.forEach(u => URL.revokeObjectURL(u)) },
  }
}

export const fmtTam = n => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round(n / 1e3) + ' kB')
