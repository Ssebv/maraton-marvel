#!/usr/bin/env node
// Multiverso › Sistema en dos capas (code-review del 21 sep 2026):
//  - tocar o clicar el NOMBRE de un planeta o del sol abre esa Tierra: el
//    nombre de la capa de planetas va con `visibility:hidden` y la copia de
//    encima deja pasar el toque; lo recoge la caja del botón, que lo contiene
//    (la revisión temía que cayera en el vacío: comprobado que no, se vigila);
//  - en escritorio, pasar el ratón por un planeta agranda y aviva también su
//    nombre, que vive en la otra capa.
// Con ratón y dedo reales de CDP (Input.*), no con clics sintéticos: un
// .click() sobre el botón no pasa por el hit-testing, que es lo que se mira.
import { abre, espera, informe } from './lib.mjs'

const filas = []
const centroNombre = i => `(() => { const n = document.querySelectorAll('.sistema-nombres .nav-nombre')[${i}]
  const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: n.textContent, w: r.width } })()`
const abierta = `!!document.querySelector('.tierra')`

// escritorio: ratón
{
  const { cdp, navega, cierra, errores } = await abre({ movil: false, ancho: 1280, alto: 900 })
  try {
    for (const [i, quien] of [[0, 'sol'], [1, 'planeta']]) {
      await navega('#multiverso')
      await cdp.hasta(`!!document.querySelector('.sistema-nombres .nav-nombre')`, 5000)
      await espera(600)
      let p = await cdp.eval(centroNombre(i))
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
      await espera(400) // pausa del giro (.sistema:hover) y transición de escala
      p = await cdp.eval(centroNombre(i))
      if (i === 1) {
        const h = await cdp.eval(`(() => { return {
          boton: document.querySelectorAll('.sistema-capa:not(.sistema-nombres) .sobre').length,
          nombre: document.querySelectorAll('.sistema-nombres .sobre').length } })()`)
        filas.push([h.boton === 1 && h.nombre === 1, `ratón sobre «${p.t}»: botón y nombre marcados (${h.boton}/${h.nombre})`])
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
      const ok = await cdp.hasta(abierta, 2000).then(() => true, () => false)
      filas.push([ok, `clic en el nombre del ${quien} «${p.t}» abre su Tierra`])
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    }
    filas.push([errores.length === 0, `sin errores de consola (${errores.length})`])
  } finally { await cierra() }
}

// móvil: dedo (el mapa va a escala .48 y el nombre es media diana)
{
  const { cdp, navega, cierra } = await abre()
  try {
    await navega('#multiverso')
    await cdp.hasta(`!!document.querySelector('.sistema-nombres .nav-nombre')`, 5000)
    await espera(600)
    const p = await cdp.eval(centroNombre(2))
    const punto = [{ x: p.x, y: p.y }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punto })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const ok = await cdp.hasta(abierta, 2000).then(() => true, () => false)
    filas.push([ok, `toque en el nombre «${p.t}» (móvil) abre su Tierra`])
  } finally { await cierra() }
}

process.exitCode = informe('Sistema del Multiverso', filas) ? 1 : 0
