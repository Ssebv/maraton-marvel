#!/usr/bin/env node
// El progreso se guarda aunque la caché de TMDB haya llenado localStorage, y
// la poda del arranque borra lo caducado sin tocar lo vigente.
import { abre, espera, informe } from './lib.mjs'

const dia = 864e5, ahora = Date.now()
const entrada = t => JSON.stringify({ t, d: { elenco: [] } })
const { cdp, navega, cierra, errores } = await abre({ siembra: {
  'maraton-marvel-tmdb-v12:vigente': entrada(ahora - 2 * dia),
  'maraton-marvel-tmdb-v12:caducada': entrada(ahora - 9 * dia),
  'maraton-marvel-tmdb-v11:vieja': entrada(ahora),
  'maraton-marvel-persona-v3:bio': entrada(ahora - 20 * dia),
  'maraton-marvel-persona-v3:biovieja': entrada(ahora - 40 * dia),
} })
try {
  await navega('#crono')
  await espera(4000) // la poda va en un momento libre
  const poda = await cdp.eval(`['vigente', 'caducada'].map(k => !!localStorage.getItem('maraton-marvel-tmdb-v12:' + k))
    .concat(!!localStorage.getItem('maraton-marvel-tmdb-v11:vieja'), !!localStorage.getItem('maraton-marvel-persona-v3:bio'), !!localStorage.getItem('maraton-marvel-persona-v3:biovieja'))`)

  // llenar hasta el cupo con caché «vigente»
  // llenar hasta el último byte con caché «vigente»: trozos cada vez menores
  const relleno = await cdp.eval(`(() => {
    let i = 0
    for (const tam of [256 * 1024, 16 * 1024, 1024, 64, 1]) {
      const trozo = '{"t":' + Date.now() + ',"d":"' + 'x'.repeat(tam) + '"}'
      try { for (;;) localStorage.setItem('maraton-marvel-tmdb-v12:relleno' + i++, trozo) } catch {}
    }
    try { localStorage.setItem('maraton-marvel-tmdb-v12:prueba', 'x'.repeat(40)); return -1 } catch { return i }
  })()`)
  await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`)
  await espera(300)
  const id = await cdp.eval(`(() => {
    const c = [...document.querySelectorAll('.card')].find(c => !c.classList.contains('vista') && c.querySelector('.checkbox'))
    c.querySelector(".checkbox").click(); return c.id.replace(/^card-/, "") })()`)
  await espera(800)
  const guardado = await cdp.eval(`JSON.parse(localStorage.getItem('maraton-marvel-v1') || '{}')[${JSON.stringify(id)}] > 0`)
  const quedan = await cdp.eval(`Object.keys(localStorage).filter(k => k.includes('relleno')).length`)

  process.exitCode = informe('cupo de localStorage', [
    [poda[0] && !poda[1], `tmdb: vigente se queda (${poda[0]}), caducada se va (${!poda[1]})`],
    [!poda[2], `versión vieja de la caché barrida (${!poda[2]})`],
    [poda[3] && !poda[4], `biografías: 20 días se queda (${poda[3]}), 40 días se va (${!poda[4]})`],
    [relleno > 0, `cupo lleno hasta el byte (${relleno} trozos; 40 caracteres ya no caben)`],
    [!!id && guardado, `marcar «${id}» con el cupo lleno se guarda: ${guardado}`],
    [quedan === 0, `la caché se vació para hacer sitio (quedan ${quedan})`],
    [errores.length === 0, `errores en consola: ${errores.length} ${errores.slice(0, 3).join(' | ')}`],
  ]) ? 1 : 0
} finally { await cierra() }
