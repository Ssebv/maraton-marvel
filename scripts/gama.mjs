#!/usr/bin/env node
// La gama de color, medida: cada texto pequeño a 4,5:1 sobre --panel2 (la
// superficie más exigente), el texto sobre acento a 4,5:1, y los colores de
// eras y Tierras legibles una vez mezclados con la tinta. Corre con `npm test`
// y antes de compilar. Si bajas un contraste, esto lo dice antes que nadie.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(raiz, 'src/styles.css'), 'utf8')
const data = readFileSync(join(raiz, 'src/data.js'), 'utf8')

const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) }
const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const lum = h => { const [r, g, b] = hex2rgb(h).map(lin); return .2126 * r + .7152 * g + .0722 * b }
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }
// matiz HSL, para distinguir dos colores de la misma luminosidad
const matiz = h => { const [r, g, b] = hex2rgb(h); const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return 0; let H = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; return H < 0 ? H + 360 : H }
const mezcla = (a, b, pa) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round((v * pa + B[i] * (1 - pa)) * 255).toString(16).padStart(2, '0')).join('') }

// Tokens de un bloque: solo los que son un hex literal
const bloque = sel => {
  const i = css.indexOf(sel); if (i < 0) throw new Error('no encuentro ' + sel)
  const cuerpo = css.slice(i, css.indexOf('}', i))
  const t = {}
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):(#[0-9A-Fa-f]{6})\b/g)) t[m[1]] = m[2]
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):(\d+)%/g)) t[m[1]] = Number(m[2]) / 100
  return t
}
const claro = bloque('\n:root{\n  --bg:')
const oscuro = bloque('\n:root[data-theme="dark"]{')
// El bloque de prefers-color-scheme debe decir lo mismo que el de data-theme
const media = bloque(':root:not([data-theme="light"]){')
const fallos = []
for (const k of Object.keys(oscuro)) if (media[k] !== oscuro[k]) fallos.push(`oscuro: --${k} difiere entre el bloque de sistema (${media[k]}) y el de data-theme (${oscuro[k]})`)

const mide = (tema, nombre) => {
  const sobre = tema.panel2
  const texto = ['ink', 'ink2', 'ink3', 'red', 'gold-texto', 'blue', 'violet', 'teal', 'done', 'doom']
  for (const k of texto) {
    const c = contraste(tema[k], sobre)
    if (c < 4.5) fallos.push(`${nombre}: --${k} ${tema[k]} sobre --panel2 da ${c.toFixed(2)} (mínimo 4,5)`)
  }
  // jerarquía del texto: tres pasos que se distinguen
  const L = k => lum(tema[k])
  const orden = nombre === 'claro' ? L('ink') < L('ink2') && L('ink2') < L('ink3') : L('ink') > L('ink2') && L('ink2') > L('ink3')
  if (!orden) fallos.push(`${nombre}: --ink, --ink2 e --ink3 no van en escalera`)
  if (contraste(tema.ink2, tema.ink3) < 1.25) fallos.push(`${nombre}: --ink2 e --ink3 casi no se distinguen (${contraste(tema.ink2, tema.ink3).toFixed(2)})`)
  // texto sobre acento
  const sobreAcento = tema['sobre-acento'] || (nombre === 'claro' ? '#ffffff' : tema.bg)
  for (const k of ['red', 'gold', 'violet', 'teal', 'doom', 'done']) {
    const c = contraste(sobreAcento, tema[k])
    if (c < 4.5) fallos.push(`${nombre}: --sobre-acento sobre --${k} da ${c.toFixed(2)}`)
  }
  // los dos verdes se distinguen
  if (Math.abs(matiz(tema.done) - matiz(tema.doom)) < 12) fallos.push(`${nombre}: --done y --doom son casi el mismo verde (matices a ${Math.abs(matiz(tema.done) - matiz(tema.doom)).toFixed(0)}°)`)
  // eras y Tierras como texto, mezcladas con la tinta
  const eras = [...data.matchAll(/c: \["(#[0-9A-Fa-f]{6})", "(#[0-9A-Fa-f]{6})"\]/g)].map(m => m[1])
  const tierras = [...data.matchAll(/c: "(#[0-9A-Fa-f]{6})"/g)].map(m => m[1])
  for (const e of eras) { const c = contraste(mezcla(e, tema.ink, tema['era-tinta']), sobre); if (c < 4.5) fallos.push(`${nombre}: la era ${e} mezclada con la tinta da ${c.toFixed(2)}`) }
  for (const t of tierras) { const c = contraste(mezcla(t, tema.ink, tema['tc-tinta']), sobre); if (c < 4.5) fallos.push(`${nombre}: la Tierra ${t} mezclada con la tinta da ${c.toFixed(2)}`) }
  // era y Tierra sin repetir
  const rep = xs => xs.filter((x, i) => xs.indexOf(x) !== i)
  if (nombre === 'claro') { for (const r of new Set(rep(eras))) fallos.push(`hay dos eras con el color ${r}`); for (const r of new Set(rep(tierras))) fallos.push(`hay dos Tierras con el color ${r}`) }
}
mide(claro, 'claro'); mide(oscuro, 'oscuro')

// Blanco sobre los tokens fijos
for (const k of ['sello', 'calido']) { const c = contraste('#ffffff', claro[k]); if (c < 4.5) fallos.push(`blanco sobre --${k} da ${c.toFixed(2)}`) }
for (const f of fallos) console.log('✗ ' + f)
console.log(fallos.length ? `\n${fallos.length} fallo(s) de gama.` : 'Gama en orden: contraste, escalera de tinta, acentos, eras y Tierras.')
process.exit(fallos.length ? 1 : 0)
