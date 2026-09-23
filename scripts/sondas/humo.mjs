#!/usr/bin/env node
// Prueba de humo: cada vista en el móvil (390) y en escritorio (1280), sin
// errores en consola, sin scroll horizontal, con su contenido y con el dock;
// y una ficha abierta por enlace directo. Uso: node scripts/sondas/humo.mjs
import { abre, espera, informe } from './lib.mjs'
import { cargaFuentes } from '../contrato.mjs'

const { DATA } = await cargaFuentes()
const ids = DATA.flatMap(s => s.eras.flatMap(e => e.items.map(i => i.id)))
const vistas = {}
ids.slice(0, 40).forEach((id, i) => vistas[id] = Date.now() - i * 86400000)
const VISTAS = ['crono', 'estreno', 'comics', 'animacion', 'stats', 'galeria', 'multiverso', 'listas', 'tiempo']

let malas = 0
for (const [nombre, opciones] of [['móvil 390', { movil: true }], ['escritorio 1280', { movil: false, ancho: 1280, alto: 800 }]]) {
  const { cdp, navega, cierra, errores } = await abre({ ...opciones, siembra: { 'maraton-marvel-v1': vistas } })
  const filas = []
  try {
    await navega('#crono')
    await espera(1500)
    for (const v of VISTAS) {
      await cdp.eval(`location.hash = '${v}'`)
      await espera(700)
      const m = await cdp.eval(`(() => {
        const main = document.querySelector('main')
        // pestañas (móvil y escritorio estrecho) o la barra lateral (desde 1100 px)
        const dock = document.querySelector('nav.tabs') || document.querySelector('.lateral')
        const r = dock && dock.getBoundingClientRect()
        return {
          ancho: document.documentElement.scrollWidth, vp: innerWidth,
          alto: main ? Math.round(main.getBoundingClientRect().height) : 0,
          dock: !!r && r.width > 0 && r.height > 0,
        } })()`)
      filas.push([m.ancho <= m.vp + 1 && m.alto > 200 && m.dock,
        `${v}: ancho ${m.ancho}/${m.vp}, main ${m.alto} px, nav ${m.dock ? 'sí' : 'NO'}`])
    }
    await navega(`?t=${ids[0]}`)
    const ficha = await cdp.hasta(`(() => { const t = document.querySelector('.modal h2, .modal .modal-titulo'); return t && t.textContent.trim() })()`, 8000).catch(() => '')
    filas.push([!!ficha, `ficha por enlace directo: «${ficha}»`])
    filas.push([errores.length === 0, `errores en consola: ${errores.length}${errores.length ? '\n    ' + errores.slice(0, 5).join('\n    ') : ''}`])
  } catch (e) {
    filas.push([false, 'la sonda se cayó: ' + e.message])
  } finally { await cierra() }
  malas += informe(`humo · ${nombre}`, filas)
}
process.exitCode = malas ? 1 : 0
