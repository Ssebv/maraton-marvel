// Cómo se dice en Latinoamérica lo que data.js escribe como en España.
// Los títulos ya vienen de src/titulos.js (TMDB es-MX); esto es para las
// sinopsis, notas, guías y descripciones, que están escritas a mano y no
// pueden traducirse enteras: se cambian los NOMBRES que el doblaje latino
// dice distinto («Lobezno viaja a 1973» → «Wolverine viaja a 1973»).
// Una sola pasada: lo ya sustituido no se vuelve a mirar, así «(en España,
// «el Lapso»)» conserva la palabra de España. Orden: primero lo largo.
// Se aplica con `latiniza(texto)` cuando el país elegido no es España.
export const TERMINOS_LATAM = [
  // títulos citados dentro de un texto (los de la lista los pone titulos.js)
  ['Deadpool y Lobezno', 'Deadpool & Wolverine'],
  ['Lobezno inmortal', 'Wolverine: Inmortal'],
  ['X-Men: La decisión final', 'X-Men 3: La Batalla Final'],
  ['No Way Home', 'Sin camino a casa'],
  ['Far From Home', 'Lejos de casa'],
  ['«Lapso» (Blip)', '«Blip» (en España, «el Lapso»)'],
  // personajes y conceptos, como los dice el doblaje latino
  ['Lobezno', 'Wolverine'],
  ['Lapso', 'Blip'],
  ['Ojo de Halcón', 'Hawkeye'],
  ['Soldado de Invierno', 'Soldado del Invierno'],
  ['Hulka', 'She-Hulk'],
  ['Rondador Nocturno', 'Nightcrawler'],
  ['Castigador', 'Punisher'],
  ['Caballero Luna', 'Moon Knight'],
  ['Puño de Hierro', 'Iron Fist'],
  ['el Capi', 'el Cap'], ['El Capi', 'El Cap'], ['del Capi', 'del Cap'], ['al Capi', 'al Cap'],
  ['Masacre', 'Deadpool'],
  ['Patrulla-X', 'X-Men'],
  ['Doctor Muerte', 'Doctor Doom'],
  ['Estela Plateada', 'Silver Surfer'],
  ['Mapache Cohete', 'Rocket'],
  ['Hombre Hormiga', 'Ant-Man'],
]

const escapa = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// límites de palabra solo donde el término empieza/acaba en letra: «Lobezno»
// no debe casar dentro de otra palabra, pero «Lapso» empieza por comillas
const conLimites = s => (/^[\wÀ-ſ]/.test(s) ? '\\b' : '') + escapa(s) + (/[\wÀ-ſ]$/.test(s) ? '\\b' : '')
const RE = new RegExp(TERMINOS_LATAM.map(([de]) => '(' + conLimites(de) + ')').join('|'), 'g')

export function latiniza(texto) {
  if (typeof texto !== 'string' || !texto) return texto
  return texto.replace(RE, (...m) => {
    const i = m.slice(1, 1 + TERMINOS_LATAM.length).findIndex(g => g !== undefined)
    return i < 0 ? m[0] : TERMINOS_LATAM[i][1]
  })
}
