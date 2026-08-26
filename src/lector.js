// Lector de cómics DENTRO de la app, para los archivos que el usuario tiene:
// CBZ/ZIP (imágenes comprimidas), una carpeta de imágenes o un PDF. El archivo
// se guarda en IndexedDB de este navegador (nada sale de aquí ni se descarga
// de ningún sitio) y la ficha del cómic lo abre a pantalla completa.
// CBR (RAR) no: haría falta un descompresor de 1 MB; se avisa y se pide CBZ.
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
  if (/\.cbr$|\.rar$/i.test(f.name)) return { error: 'Es un CBR (RAR): conviértelo a CBZ (ZIP) para leerlo aquí' }
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return { tipo: 'pdf', archivo: f, nombre: f.name }
  if (/\.cbz$|\.zip$/i.test(f.name) || /zip/.test(f.type)) return { tipo: 'cbz', archivo: f, nombre: f.name }
  if (ES_IMAGEN.test(f.name)) return { tipo: 'imagenes', archivos: [f], nombre: f.name }
  return { error: 'Formato no reconocido: vale un CBZ/ZIP, un PDF o imágenes' }
}

const ordenNatural = (a, b) => (a.name || a).localeCompare(b.name || b, 'es', { numeric: true, sensitivity: 'base' })

export async function guardaArchivo(id, eleccion) {
  const reg = { tipo: eleccion.tipo, nombre: eleccion.nombre, fecha: Date.now() }
  if (eleccion.tipo === 'imagenes') { reg.archivos = eleccion.archivos; reg.tam = eleccion.archivos.reduce((s, f) => s + f.size, 0) }
  else { reg.archivo = eleccion.archivo; reg.tam = eleccion.archivo.size }
  await pide('readwrite', st => st.put(reg, id))
  return meta(reg)
}
// Todo lo que sale del almacén se valida por tipo: un registro raro no debe
// tumbar la ficha
function valido(reg) {
  if (!reg || typeof reg !== 'object' || typeof reg.nombre !== 'string') return false
  if (reg.tipo === 'imagenes') return Array.isArray(reg.archivos) && reg.archivos.every(f => f instanceof Blob)
  return (reg.tipo === 'cbz' || reg.tipo === 'pdf') && reg.archivo instanceof Blob
}
const meta = reg => ({ tipo: reg.tipo, nombre: reg.nombre, tam: typeof reg.tam === 'number' ? reg.tam : 0 })
export async function leeArchivo(id) {
  const reg = await pide('readonly', st => st.get(id))
  return valido(reg) ? reg : null
}
export const borraArchivo = id => pide('readwrite', st => st.delete(id))
export async function metaArchivo(id) {
  try { const r = await leeArchivo(id); return r ? meta(r) : null } catch { return null }
}

const ZIP_MAGIC = [0x50, 0x4b]
const RAR_MAGIC = [0x52, 0x61, 0x72, 0x21]
const empiezaPor = (u8, m) => m.every((b, i) => u8[i] === b)

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
  if (empiezaPor(data, RAR_MAGIC)) throw new Error('Es un CBR (RAR) con otra extensión: conviértelo a CBZ')
  if (!empiezaPor(data, ZIP_MAGIC)) throw new Error('El archivo no es un ZIP/CBZ válido')
  const nombres = []
  try {
    unzipSync(data, { filter: f => { if (ES_IMAGEN.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name) && !/(^|\/)\./.test(f.name)) nombres.push(f.name); return false } })
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
