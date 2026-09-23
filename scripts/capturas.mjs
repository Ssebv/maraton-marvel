#!/usr/bin/env node
// Capturas del README (23 sep 2026): las mismas pantallas en español y en
// inglés, en escritorio y en el móvil, con un avance de ejemplo sembrado.
// Uso: npm run build && npm run capturas   → capturas/{es,en}/*.png
// (luego se pasan a JPG; ver DESARROLLO.md, «Capturas del README»).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { abre, captura, espera, RAIZ } from './sondas/lib.mjs'

const DIA = 864e5, ahora = Date.now()
// Unos 20 títulos vistos repartidos en tres semanas: da ritmo, racha y calendario.
const VISTOS = ['first-class', 'origins-wolverine', 'xmen1', 'x2', 'last-stand', 'the-wolverine', 'dofp', 'apocalypse',
  'dark-phoenix', 'deadpool1', 'logan', 'cap1', 'oneshot-carter', 'capmarvel', 'ironman1', 'ironman2', 'thor1', 'hulk', 'avengers1']
const progreso = Object.fromEntries(VISTOS.map((id, i) => [id, ahora - (VISTOS.length - i) * 1.1 * DIA]))
const eps = { 'legion:1:1': 1, 'legion:1:2': 1, 'legion:1:3': 1 }

const listo = cdp => cdp.eval(`document.fonts.ready.then(() => Promise.all([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000) }))))`)

for (const idioma of ['es', 'en']) {
  const dir = join(RAIZ, 'capturas', idioma)
  mkdirSync(dir, { recursive: true })
  for (const movil of [false, true]) {
    const { cdp, navega, cierra } = await abre({ movil, ancho: movil ? 390 : 1320, alto: movil ? 844 : 950, siembra: {
      'maraton-marvel-idioma-v1': idioma, 'maraton-marvel-pais-v1': idioma === 'en' ? 'US' : 'CL', 'maraton-marvel-tema-v1': 'dark',
      'maraton-marvel-v1': progreso, 'maraton-marvel-eps-v1': eps,
    } })
    await cdp.send('Emulation.setScrollbarsHidden', { hidden: true })
    const foto = async nombre => { await listo(cdp); await espera(900); await captura(cdp, join(dir, `${movil ? 'movil' : 'escritorio'}-${nombre}.png`)) }
    try {
      await navega('')
      await cdp.hasta(`!!document.querySelector('.inicio-nf .nf-cartel-t')`, 8000)
      await foto('inicio')
      if (!movil) {
        // desde «A continuación»: «Continuar viendo» con una sola serie deja la fila medio vacía
        await cdp.eval(`(() => { const f = [...document.querySelectorAll('.nf-fila')].find(x => /A continuación|Up next|Sigue en/.test(x.querySelector('.nf-fila-t').textContent))
          scrollTo(0, f.getBoundingClientRect().top + scrollY - 160) })()`)
        await foto('filas')
        await navega('#multiverso')
        await cdp.hasta(`!!document.querySelector('.sistema-nombres')`, 8000)
        await cdp.eval(`scrollTo(0, 240)`)
        await foto('multiverso')
      } else {
        await navega('?t=avengers1')
        await cdp.hasta(`!!document.querySelector('.modal h2, .modal .modal-titulo')`, 8000)
        await foto('ficha')
        await navega('#stats')
        await espera(500)
        await foto('perfil')
      }
    } finally { await cierra() }
  }
  console.log(`capturas/${idioma} listas`)
}
