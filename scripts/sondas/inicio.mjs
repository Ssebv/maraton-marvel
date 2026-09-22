#!/usr/bin/env node
// Inicio al estilo Netflix (22 sep 2026): la vista por defecto del Maratón.
//  - sin hash se abre Inicio, con la cartelera del siguiente título pendiente;
//  - «Marcar vista» lo marca y la cartelera pasa al siguiente (con Deshacer);
//  - una serie empezada sale en «Continuar viendo» con su barra y su episodio;
//  - tocar una carátula abre la ficha; los carriles no ensanchan la página;
//  - #crono sigue enseñando la lista de tarjetas.
import { abre, espera, informe } from './lib.mjs'

const filas = []
const ahora = Date.now()
for (const [movil, ancho] of [[true, 390], [false, 1280]]) {
  const donde = movil ? 'móvil' : 'escritorio'
  const { cdp, navega, cierra, errores } = await abre({ movil, ancho, alto: movil ? 844 : 900, siembra: {
    'maraton-marvel-v1': { 'first-class': ahora - 3e8, 'origins-wolverine': ahora - 2e8 },
    'maraton-marvel-eps-v1': { 'legion:1:1': 1, 'legion:1:2': 1 },
    'maraton-marvel-listas-v1': [{ id: 'l1', nombre: 'Con Cata', items: ['ironman1', 'thor1'], prog: { ironman1: 1 } }],
  } })
  try {
    await navega('')
    await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-cartel-t')`, 5000)
    const t0 = await cdp.eval(`document.querySelector('.nf-cartel-t').textContent`)
    const sub = await cdp.eval(`(document.querySelector('.subvista[aria-current="page"]') || {}).textContent`)
    filas.push([sub === 'Inicio' && !!t0, `${donde}: sin hash abre Inicio (${sub}) con la cartelera de «${t0}»`])
    const cont = await cdp.eval(`(() => { const f = [...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'Continuar viendo')
      if (!f) return null; const t = f.querySelector('.nf-tile'); return { t: t.querySelector('.nf-tile-t').textContent, w: parseFloat(t.querySelector('.nf-prog i').style.width) } })()`)
    filas.push([!!cont && /Legion/.test(cont.t) && cont.w > 0, `${donde}: «Continuar viendo» con Legion, su episodio y su barra: ${JSON.stringify(cont)}`])
    const extra = await cdp.eval(`({ cal: !!document.querySelector('.inicio-nf .cal-inicio') && !document.querySelector('.hero .cal-inicio'),
      filas: [...document.querySelectorAll('.nf-fila-t')].map(x => x.textContent) })`)
    // las carátulas de Próximamente se ven (el fundido de las filas las dejaba en opacidad 0)
    const prox = await cdp.eval(`(() => { const f = [...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'Próximamente')
      f.scrollIntoView(); return [...f.querySelectorAll('.nf-img img')].map(i => getComputedStyle(i).opacity) })()`)
    filas.push([prox.length > 0 && prox.every(o => o === '1'), `${donde}: las carátulas de «Próximamente» se ven (opacidades ${prox})`])
    filas.push([extra.cal && extra.filas.includes('Próximamente') && extra.filas.includes('Con Cata'), `${donde}: calendario bajo la cartelera (no en la cabecera), «Próximamente» y la lista «Con Cata»`])
    const ancho = await cdp.eval(`({ doc: document.documentElement.scrollWidth, vw: innerWidth })`)
    filas.push([ancho.doc <= ancho.vw, `${donde}: los carriles no ensanchan la página (${ancho.doc} ≤ ${ancho.vw})`])
    // tráiler (solo si TMDB respondió): abre dentro de la cartelera, sin tapar el texto, y se cierra
    const tb = await cdp.hasta(`!!document.querySelector('.nf-btn[aria-pressed]')`, 8000).then(() => true, () => false)
    if (tb) {
      await cdp.eval(`document.querySelector('.nf-btn[aria-pressed]').click()`); await espera(300)
      const t = await cdp.eval(`(() => { const f = document.querySelector('.nf-trailer'), e = document.querySelector('.nf-eyebrow'); if (!f) return null
        return { encima: f.getBoundingClientRect().bottom <= e.getBoundingClientRect().top + 1 } })()`)
      await cdp.eval(`document.querySelector('.nf-btn[aria-pressed]').click()`); await espera(200)
      const cerrado = await cdp.eval(`!document.querySelector('.nf-trailer')`)
      filas.push([!!t && t.encima && cerrado, `${donde}: el tráiler se abre en la cartelera por encima del texto y se cierra: ${JSON.stringify(t)}`])
    } else filas.push([true, `${donde}: sin respuesta de TMDB, no hay botón de tráiler (se omite)`])
    const lavado = await cdp.eval(`(() => { const f = [...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'Visto hace poco')
      const i = f && f.querySelector('.nf-img img'); return i ? getComputedStyle(i).opacity : null })()`)
    filas.push([lavado === null || lavado === '1' || lavado === '0', `${donde}: «Visto hace poco» no se atenúa (opacidad ${lavado})`])
    await cdp.eval(`document.querySelector('.nf-btn-marcar').click()`)
    await cdp.hasta(`!!document.querySelector('.deshacer')`, 3000)
    await espera(300)
    const t1 = await cdp.eval(`document.querySelector('.nf-cartel-t').textContent`)
    const marcada = await cdp.eval(`Object.keys(JSON.parse(localStorage.getItem('maraton-marvel-v1'))).length`)
    filas.push([t1 !== t0 && marcada === 3, `${donde}: «Marcar vista» marca «${t0}» y la cartelera pasa a «${t1}» (${marcada} marcas)`])
    await cdp.eval(`[...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'A continuación').querySelector('.nf-tile .nf-abrir').click()`)
    const ficha = await cdp.hasta(`!!document.querySelector('.overlay')`, 3000).then(() => true, () => false)
    filas.push([ficha, `${donde}: tocar una carátula abre su ficha`])
    // buscar en Inicio (code-review del 22 sep): la cartelera es el primer
    // resultado pendiente, con su puesto, y «A continuación» no se lo come
    await cdp.eval(`(() => { const c = document.querySelector('.overlay .cerrar'); if (c) c.click(); return 1 })()`); await espera(600)
    await cdp.eval(`(() => { const b = document.querySelector('input[name="busqueda"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(b, 'loki'); b.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
    await espera(900)
    const bq = await cdp.eval(`({ t: document.querySelector('.nf-cartel-t').textContent, e: document.querySelector('.nf-eyebrow').textContent,
      sig: (() => { const f = [...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'A continuación'); return f ? [...f.querySelectorAll('.nf-tile .nf-abrir')].map(x => x.getAttribute('aria-label')) : [] })() })`)
    filas.push([/Loki/.test(bq.t) && !/ 0 \//.test(bq.e) && !bq.sig.some(l => l.startsWith(bq.t)), `${donde}: buscando «loki», la cartelera es «${bq.t}» (${bq.e.trim()}) y «A continuación» sigue: ${JSON.stringify(bq.sig)}`])
    // marca rápida en la carátula: marca sin abrir la ficha, y desmarcar ofrece Deshacer
    await cdp.eval(`document.querySelector('.input-limpio, input[name="busqueda"]') && (() => { const b = document.querySelector('input[name="busqueda"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(b, ''); b.dispatchEvent(new Event('input', { bubbles: true })) })(); 1`)
    await espera(700)
    const fila = `[...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'La línea original')`
    const m0 = await cdp.eval(`(() => { const b = ${fila}.querySelectorAll('.nf-marca')[3]; const id = b.getAttribute('aria-label'); b.click(); return id })()`)
    await espera(400)
    const m1 = await cdp.eval(`({ pulsada: ${fila}.querySelectorAll('.nf-marca')[3].getAttribute('aria-pressed'), ficha: !!document.querySelector('.overlay') })`)
    await cdp.eval(`${fila}.querySelectorAll('.nf-marca')[3].click()`)
    const deshacer = await cdp.hasta(`!!document.querySelector('.deshacer')`, 3000).then(() => true, () => false)
    filas.push([m1.pulsada === 'true' && !m1.ficha && deshacer, `${donde}: marca rápida «${m0}»: marca sin abrir la ficha (${JSON.stringify(m1)}) y desmarcar ofrece Deshacer (${deshacer})`])
    await cdp.eval(`${fila}.querySelector('.nf-ver-todo').click()`)
    const era = await cdp.hasta(`location.hash === '#crono' && !!document.getElementById('card-first-class')`, 4000).then(() => cdp.eval(`Math.round(document.getElementById('card-first-class').closest('.era').getBoundingClientRect().top)`), () => null)
    filas.push([era !== null && era >= 0 && era < 400, `${donde}: «Ver todo» de «La línea original» lleva a su era en Cronológico (cabecera a ${era} px)`])
    await navega('#crono')
    const cards = await cdp.hasta(`document.querySelectorAll('.card').length > 10`, 5000).then(() => true, () => false)
    filas.push([cards, `${donde}: #crono sigue con la lista de tarjetas`])
    filas.push([errores.length === 0, `${donde}: sin errores de consola (${errores.length})`])
  } finally { await cierra() }
}
// «Ver todo» con «Solo pendientes» (code-review del 22 sep): el primer título
// de la era ya visto no tiene tarjeta en la lista; la era se busca por su id
{
  const { cdp, url, navega, cierra } = await abre({ siembra: { 'maraton-marvel-v1': { 'first-class': Date.now() - 1e8 } } })
  try {
    await navega('?f=vistas')
    await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-ver-todo')`, 5000)
    await cdp.eval(`[...document.querySelectorAll('.nf-fila')].find(x => x.querySelector('.nf-fila-t').textContent === 'La línea original').querySelector('.nf-ver-todo').click()`)
    const top = await cdp.hasta(`!!document.getElementById('era-first-class')`, 4000).then(async () => { await espera(300); return cdp.eval(`Math.round(document.getElementById('era-first-class').getBoundingClientRect().top)`) }, () => null)
    filas.push([top !== null && top >= 0 && top < 400, `«Ver todo» con «Solo pendientes» y el primer título visto llega a la era (cabecera a ${top} px)`])
  } finally { await cierra() }
}
// sin TMDB (sin conexión o caído): las fotos de las filas anchas pasan a la
// carátula local y la cartelera se queda con la suya, sin imágenes rotas
{
  const { cdp, navega, cierra } = await abre({ siembra: { 'maraton-marvel-v1': { 'first-class': Date.now() - 2e8, 'origins-wolverine': Date.now() - 1e8 }, 'maraton-marvel-eps-v1': { 'legion:1:1': 1 } } })
  try {
    await cdp.send('Network.enable')
    await cdp.send('Network.setBlockedURLs', { urls: ['*image.tmdb.org*', '*api.themoviedb.org*'] })
    await navega('')
    await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-cartel-t')`, 5000)
    await cdp.eval(`document.querySelectorAll('.nf-ancha').forEach(f => f.scrollIntoView()); 1`); await espera(1500)
    const r = await cdp.eval(`(() => {
      const anchas = [...document.querySelectorAll('.nf-ancha .nf-img img')]
      const rotas = anchas.filter(i => i.complete && !i.naturalWidth && i.style.visibility !== 'hidden').length
      const locales = anchas.filter(i => i.naturalWidth && !i.src.includes('tmdb')).length
      const previo = document.querySelector('.nf-cartel-previo, .nf-cartel-poster'), foto = document.querySelector('.nf-cartel-foto')
      return { anchas: anchas.length, rotas, locales, previo: !!previo && previo.naturalWidth > 0, fotoOculta: !foto || foto.style.display === 'none' || !foto.classList.contains('cargada') }
    })()`)
    filas.push([r.anchas > 0 && r.rotas === 0 && r.locales === r.anchas && r.previo && r.fotoOculta, `sin TMDB: fichas anchas con la carátula local y cartelera con la suya, sin rotas: ${JSON.stringify(r)}`])
  } finally { await cierra() }
}
// guía para quien empieza: con 0 marcas aparece, «Entendido» la cierra y no vuelve al recargar
{
  const { cdp, navega, cierra } = await abre()
  try {
    await navega('')
    await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-cartel-t')`, 5000)
    const a = await cdp.eval(`!!document.querySelector('.nf-guia')`)
    await cdp.eval(`document.querySelector('.nf-guia .chip-btn').click()`); await espera(300)
    const b = await cdp.eval(`!!document.querySelector('.nf-guia')`)
    await navega(''); await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-cartel-t')`, 5000)
    const c = await cdp.eval(`!!document.querySelector('.nf-guia')`)
    filas.push([a && !b && !c, `guía para quien empieza: sale con 0 marcas (${a}), «Entendido» la cierra (${!b}) y no vuelve (${!c})`])
  } finally { await cierra() }
}
process.exitCode = informe('Inicio estilo Netflix', filas) ? 1 : 0
