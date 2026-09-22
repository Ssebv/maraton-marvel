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
      // preselección (22 sep): el primer clic elige y enseña la ficha, el segundo entra
      const clic = async () => {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
      }
      await clic(); await espera(400)
      const sel = await cdp.eval(`({ ficha: (document.querySelector('.mv-sel .mv-num') || {}).textContent || null, tierra: !!document.querySelector('.tierra'),
        elegidos: document.querySelectorAll('.sistema-capa:not(.sistema-nombres) .elegido').length })`)
      filas.push([!!sel.ficha && !sel.tierra && sel.elegidos === 1, `primer clic en «${p.t}» lo preselecciona: ficha de ${sel.ficha}, sin entrar`])
      p = await cdp.eval(centroNombre(i))
      await clic()
      const ok = await cdp.hasta(abierta, 2000).then(() => true, () => false)
      filas.push([ok, `segundo clic en el nombre del ${quien} «${p.t}» abre su Tierra`])
      if (ok && i === 1) {
        // al volver, el planeta que se tocó no se queda agrandado (su
        // pointerleave no llega: la vista del Sistema se desmonta al abrir)
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }) // con el ratón encima, el hover sería legítimo
        await cdp.eval(`document.querySelector('.tierra .chip-btn').click()`)
        await cdp.hasta(`!!document.querySelector('.sistema')`, 3000)
        await espera(400)
        const quedan = await cdp.eval(`document.querySelectorAll('.sistema .sobre').length`)
        filas.push([quedan === 0, `al volver de su Tierra ningún planeta se queda en hover (${quedan})`])
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    }
    filas.push([errores.length === 0, `sin errores de consola (${errores.length})`])
  } finally { await cierra() }
}

// móvil: dedo. Desde el 22 sep el Sistema se mide con el ancho (sin
// scale(.48)) y los planetas van sin nombre (los nombra el índice de debajo)
{
  const { cdp, navega, cierra } = await abre()
  try {
    await navega('#multiverso')
    await cdp.hasta(`!!document.querySelector('.sistema .planeta-nav')`, 5000)
    await espera(600)
    const m = await cdp.eval(`(() => {
      const s = document.querySelector('.sistema').getBoundingClientRect()
      const orbes = [...document.querySelectorAll('.sistema-capa:not(.sistema-nombres) .planeta-orbe')].map(o => o.getBoundingClientRect().width)
      const rec = document.querySelector('.planeta-recorte'), cs = getComputedStyle(rec)
      const visibles = [...document.querySelectorAll('.sistema-nombres .nav-nombre')].filter(n => getComputedStyle(n).display !== 'none').map(n => n.textContent)
      return { ancho: Math.round(s.width), vw: innerWidth, min: Math.round(Math.min(...orbes)), clip: cs.clipPath, visibles,
        arcos: document.querySelectorAll('.sistema-capa:not(.sistema-nombres) .orbe-progreso').length,
        filas: document.querySelectorAll('.mv-indice .mv-fila').length }
    })()`)
    filas.push([m.ancho <= m.vw - 32 && m.ancho >= m.vw - 60, `el Sistema ocupa el ancho del móvil sin salirse (${m.ancho} de ${m.vw})`])
    filas.push([m.min >= 28, `planetas de al menos 28 px en el móvil (${m.min})`])
    filas.push([/circle/.test(m.clip), `la textura se recorta con clip-path, no con overflow (Safari): ${m.clip}`])
    filas.push([m.visibles.length === 1 && m.visibles[0] === 'Tierra-616', `solo el nombre del centro en el móvil: ${JSON.stringify(m.visibles)}`])
    filas.push([m.arcos === 12 && m.filas === 12, `arco de progreso en los 12 planetas y 12 filas en el índice (${m.arcos}/${m.filas})`])
    const p = await cdp.eval(`(() => { const b = document.querySelectorAll('.sistema-capa:not(.sistema-nombres) .planeta-nav')[2]
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.title } })()`)
    // el planeta gira: se pausa la animación para que el dedo caiga donde se midió
    await cdp.eval(`document.getAnimations().forEach(a => a.pause()); 1`)
    const punto = [{ x: p.x, y: p.y }]
    const toque = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punto })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    await toque(); await espera(400)
    const sel = await cdp.eval(`(() => { const n = document.querySelector('.sistema-nombres .elegido .nav-nombre')
      return { ficha: !!document.querySelector('.mv-sel'), nombre: n && getComputedStyle(n).display !== 'none' ? n.textContent : null, tierra: !!document.querySelector('.tierra') } })()`)
    filas.push([sel.ficha && !!sel.nombre && !sel.tierra, `primer toque en «${p.t}» (móvil): se ve su nombre («${sel.nombre}») y su ficha, sin entrar`])
    await toque()
    const ok = await cdp.hasta(abierta, 2000).then(() => true, () => false)
    filas.push([ok, `segundo toque en el planeta «${p.t}» (móvil) abre su Tierra`])
    await cdp.eval(`document.querySelector('.tierra .chip-btn').click()`)
    await cdp.hasta(`!!document.querySelector('.mv-indice')`, 3000)
    await cdp.eval(`document.querySelectorAll('.mv-fila')[4].scrollIntoView({ block: 'center', behavior: 'instant' })`); await espera(300)
    const f = await cdp.eval(`(() => { const b = document.querySelectorAll('.mv-fila')[4], r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.querySelector('b').textContent } })()`)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: f.x, y: f.y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const t = await cdp.hasta(abierta, 2000).then(() => cdp.eval(`document.querySelector('.tierra-num').textContent`), () => null)
    filas.push([t === f.t, `la fila «${f.t}» del índice abre su Tierra (${t})`])
  } finally { await cierra() }
}

// lotes partidos (22 sep): quien tenía «sony» o «fox4f» marcado conserva la
// marca, con su fecha, en cada película; Sony enseña sus seis y la Tierra de
// los 4F de Fox es opcional (no cuenta en el total)
{
  const { cdp, navega, cierra } = await abre({ siembra: { 'maraton-marvel-v1': { sony: 1754000000000, fox4f: 1, nwh: 1 } } })
  try {
    await navega('#multiverso')
    await cdp.hasta(`!!document.querySelector('.mv-fila')`, 5000)
    await espera(400)
    const v = await cdp.eval(`JSON.parse(localStorage.getItem('maraton-marvel-v1'))`)
    const piezas = ['sm-raimi1', 'sm-raimi2', 'sm-raimi3', 'asm1', 'asm2', 'venom1', 'venom2', 'morbius', 'madameweb', 'venom3', 'kraven']
    filas.push([!v.sony && !v.fox4f && piezas.every(id => v[id] === 1754000000000) && v.ff2005 && v.ff2015, `los lotes se migran a sus ${piezas.length} + 3 películas con su fecha y se borran`])
    const r = await cdp.eval(`(() => { const fila = t => [...document.querySelectorAll('.mv-fila')].find(b => b.textContent.includes(t))
      return { sony: fila('Universo Sony').querySelector('.mv-fila-cuenta').textContent, fox: fila('121698').textContent, resumen: document.querySelector('.mv-resumen-texto').textContent } })()`)
    filas.push([r.sony === '6/6' && /opcional/i.test(r.fox) && /de 11 Tierras/.test(r.resumen), `Sony ${r.sony}, los 4F de Fox opcionales y fuera del total («${r.resumen}»)`])
  } finally { await cierra() }
}

process.exitCode = informe('Sistema del Multiverso', filas) ? 1 : 0
