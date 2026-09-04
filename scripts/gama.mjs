#!/usr/bin/env node
// La gama de color, medida: cada texto pequeño a 4,5:1 sobre --panel2 (la
// superficie más exigente), el texto sobre acento a 4,5:1 —también con los
// acentos de universo—, los colores de eras y Tierras legibles una vez
// mezclados con la tinta, y la tarjeta para compartir con los mismos valores
// que el tema oscuro. Corre con `npm test` y antes de compilar. Si bajas un
// contraste, esto lo dice antes que nadie.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { raiz, cargaFuentes } from './contrato.mjs'

const css = readFileSync(join(raiz, 'src/styles.css'), 'utf8')
const app = readFileSync(join(raiz, 'src/App.jsx'), 'utf8')
const { DATA, MULTIVERSO } = await cargaFuentes()

const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) }
const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const lum = h => { const [r, g, b] = hex2rgb(h).map(lin); return .2126 * r + .7152 * g + .0722 * b }
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }
// matiz HSL, para distinguir dos colores de la misma luminosidad
const matiz = h => { const [r, g, b] = hex2rgb(h); const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return 0; let H = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; return H < 0 ? H + 360 : H }
const mezcla = (a, b, pa) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round((v * pa + B[i] * (1 - pa)) * 255).toString(16).padStart(2, '0')).join('') }
const hex6 = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return '#' + h.toUpperCase() }

// Tokens de un bloque: hex (3 o 6 cifras), porcentajes (con decimales) y
// alias var(--x) resueltos dentro del mismo bloque o contra el claro.
const bloque = (sel, base = {}) => {
  const i = css.indexOf(sel); if (i < 0) throw new Error('no encuentro ' + sel)
  const cuerpo = css.slice(i, css.indexOf('}', i))
  const t = { ...base }
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{3,6})\b/g)) t[m[1]] = hex6(m[2])
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):([\d.]+)%/g)) t[m[1]] = Number(m[2]) / 100
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):var\(--([a-z0-9-]+)\)/g)) t[m[1]] = t[m[2]]
  return t
}
const claro = bloque('\n:root{\n  --bg:')
const oscuro = bloque('\n:root[data-theme="dark"]{', claro)
const media = bloque(':root:not([data-theme="light"]){', claro)
const fallos = []
for (const k of Object.keys(oscuro)) if (media[k] !== oscuro[k]) fallos.push(`oscuro: --${k} difiere entre el bloque de sistema (${media[k]}) y el de data-theme (${oscuro[k]})`)

const eras = DATA.flatMap(s => s.eras.map(e => e.c[0]))
const tierras = MULTIVERSO.map(u => u.c)
const NECESARIOS = ['bg', 'panel', 'panel2', 'ink', 'ink2', 'ink3', 'red', 'gold', 'gold-texto', 'blue', 'violet', 'teal', 'done', 'doom', 'sobre-acento', 'era-tinta', 'tinte']
// Los alias de acento por universo: ver `:root[data-acento=…]` al final del CSS
const ALIAS = [...css.matchAll(/data-acento="([a-z0-9]+)"\]\{--red:var\(--([a-z-]+)\)/g)].map(m => [m[1], m[2]])

const mide = (tema, nombre) => {
  for (const k of NECESARIOS) if (tema[k] == null) { fallos.push(`${nombre}: falta el token --${k} (o no es un valor que sepa leer)`); return }
  const sobre = tema.panel2
  const baja = (c, min) => !(c >= min)  // también atrapa NaN
  const texto = ['ink', 'ink2', 'ink3', 'red', 'gold-texto', 'blue', 'violet', 'teal', 'done', 'doom']
  for (const k of texto) { const c = contraste(tema[k], sobre); if (baja(c, 4.5)) fallos.push(`${nombre}: --${k} ${tema[k]} sobre --panel2 da ${c.toFixed(2)} (mínimo 4,5)`) }
  // jerarquía del texto: tres pasos que se distinguen
  const L = k => lum(tema[k])
  const orden = nombre === 'claro' ? L('ink') < L('ink2') && L('ink2') < L('ink3') : L('ink') > L('ink2') && L('ink2') > L('ink3')
  if (!orden) fallos.push(`${nombre}: --ink, --ink2 e --ink3 no van en escalera`)
  if (baja(contraste(tema.ink2, tema.ink3), 1.25)) fallos.push(`${nombre}: --ink2 e --ink3 casi no se distinguen (${contraste(tema.ink2, tema.ink3).toFixed(2)})`)
  // texto sobre acento, también con cada acento de universo
  for (const k of ['red', 'gold', 'violet', 'teal', 'doom', 'done']) { const c = contraste(tema['sobre-acento'], tema[k]); if (baja(c, 4.5)) fallos.push(`${nombre}: --sobre-acento sobre --${k} da ${c.toFixed(2)}`) }
  if (!ALIAS.length) fallos.push('no encuentro los alias data-acento en styles.css')
  for (const [ac, k] of ALIAS) {
    if (tema[k] == null) { fallos.push(`${nombre}: el acento ${ac} apunta a --${k}, que no existe`); continue }
    const c = contraste(tema[k], sobre); if (baja(c, 4.5)) fallos.push(`${nombre}: con el acento ${ac}, --red pasa a --${k} ${tema[k]}, que sobre --panel2 da ${c.toFixed(2)}`)
    const s = contraste(tema['sobre-acento'], tema[k]); if (baja(s, 4.5)) fallos.push(`${nombre}: con el acento ${ac}, --sobre-acento sobre --${k} da ${s.toFixed(2)}`)
  }
  // los dos verdes se distinguen
  if (Math.abs(matiz(tema.done) - matiz(tema.doom)) < 12) fallos.push(`${nombre}: --done y --doom son casi el mismo verde (matices a ${Math.abs(matiz(tema.done) - matiz(tema.doom)).toFixed(0)}°)`)
  // eras y Tierras como texto, mezcladas con la tinta en --era-tinta
  for (const e of eras) { const c = contraste(mezcla(e, tema.ink, tema['era-tinta']), sobre); if (baja(c, 4.5)) fallos.push(`${nombre}: la era ${e} mezclada con la tinta da ${c.toFixed(2)}`) }
  for (const t of tierras) { const c = contraste(mezcla(t, tema.ink, tema['era-tinta']), sobre); if (baja(c, 4.5)) fallos.push(`${nombre}: la Tierra ${t} mezclada con la tinta da ${c.toFixed(2)}`) }
}
mide(claro, 'claro'); mide(oscuro, 'oscuro')

// era y Tierra sin repetir
const rep = xs => xs.filter((x, i) => xs.indexOf(x) !== i)
for (const r of new Set(rep(eras))) fallos.push(`hay dos eras con el color ${r}`)
for (const r of new Set(rep(tierras))) fallos.push(`hay dos Tierras con el color ${r}`)

// Blanco sobre los tokens fijos
for (const k of ['sello', 'calido']) { if (!claro[k]) { fallos.push(`falta --${k}`); continue } const c = contraste('#FFFFFF', claro[k]); if (!(c >= 4.5)) fallos.push(`blanco sobre --${k} da ${c.toFixed(2)}`) }

// La tarjeta para compartir (siempre oscura) usa los valores del tema oscuro
const ini = app.indexOf('const OSCURO = {'), fin = app.indexOf('\n}', app.indexOf('async function compartirImagen('))
if (ini < 0 || fin < 0) fallos.push('no encuentro OSCURO / compartirImagen en App.jsx')
else {
  const permitidos = new Set([...Object.values(oscuro), claro.sello, claro.calido, claro['gold-vivo'], claro.noche, '#FFFFFF'].filter(Boolean))
  for (const m of new Set([...app.slice(ini, fin).matchAll(/'(#[0-9A-Fa-f]{3,6})'/g)].map(x => hex6(x[1])))) if (!permitidos.has(m)) fallos.push(`la tarjeta para compartir usa ${m}, que no es un token del tema oscuro`)
}

for (const f of fallos) console.log('✗ ' + f)
console.log(fallos.length ? `\n${fallos.length} fallo(s) de gama.` : `Gama en orden: contraste, escalera de tinta, acentos (${ALIAS.map(a => a[0]).join(', ')}), ${eras.length} eras, ${tierras.length} Tierras y la tarjeta para compartir.`)
process.exit(fallos.length ? 1 : 0)
