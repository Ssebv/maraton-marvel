#!/usr/bin/env node
// Noticias de Marvel para la barra lateral (23 sep 2026, Sebastián: «igual
// que mi Norte donde tengo noticias, en el lateral lo mismo pero noticias
// relacionadas a Marvel»). Lee los RSS públicos de medios (hechos para
// sindicarse), se queda con lo que habla de Marvel y X-Men y escribe
// public/noticias.json: titular, medio, fecha, enlace y, si la hay, imagen.
// No se copia el texto de la noticia: el enlace lleva a su sitio. Google
// Noticias queda fuera: sus condiciones solo permiten el uso personal.
// Lo corre cada mañana .github/workflows/noticias.yml (y se puede a mano).
import { writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const FUENTES = {
  es: [
    { url: 'https://www.espinof.com/tag/marvel/rss2.xml', medio: 'Espinof', todo: true },
    { url: 'https://www.cinemascomics.com/feed/', medio: 'Cinemascomics' },
  ],
  en: [
    { url: 'https://www.ign.com/rss/articles/feed?tags=marvel', medio: 'IGN', todo: true },
    { url: 'https://www.superherohype.com/feed', medio: 'SuperHeroHype' },
  ],
}
const MARVEL = /marvel|x-?men|mutante|mutant|vengador|avenger|doomsday|secret wars|deadpool|wolverine|lobezno|spider-?man|hombre araña|thor\b|loki|iron ?man|capit[aá]n am[eé]rica|captain america|black panther|pantera negra|hulk|daredevil|punisher|fantastic four|4 fant[aá]sticos|cuatro fant[aá]sticos|doctor strange|guardianes de la galaxia|guardians of the galaxy|thunderbolts|venom|vision ?quest|visi[oó]n|wanda|kevin feige|mcu|ucm/i

const des = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim()
const campo = (item, t) => { const m = item.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')); return m ? des(m[1]) : '' }
const imagen = item => {
  const m = item.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i) || item.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)
    || item.match(/<img[^>]+src="([^"]+)"/i)
  return m && /^https:\/\//.test(m[1]) ? m[1].replace(/&amp;/g, '&') : null
}

async function lee({ url, medio, todo }) {
  const r = await fetch(url, { headers: { 'User-Agent': 'maraton-marvel/1.0 (+https://ssebv.github.io/maraton-marvel/)' }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${medio}: ${r.status}`)
  const xml = await r.text()
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([item]) => {
    const t = campo(item, 'title'), link = campo(item, 'link'), f = Date.parse(campo(item, 'pubDate'))
    return { t, url: link, medio, f: isNaN(f) ? 0 : f, img: imagen(item), ok: todo || MARVEL.test(t) }
  }).filter(n => n.ok && n.t && /^https:\/\//.test(n.url))
}

const salida = { gen: new Date().toISOString() }
for (const [idioma, fuentes] of Object.entries(FUENTES)) {
  const todas = []
  for (const f of fuentes) {
    // como mucho 7 por medio: si no, el que publica más se come la lista
    try { todas.push(...(await lee(f)).sort((a, b) => b.f - a.f).slice(0, 7)) } catch (e) { console.warn('  · ' + e.message) }
  }
  const vistos = new Set()
  salida[idioma] = todas
    .filter(n => { const k = n.t.toLowerCase().slice(0, 60); if (vistos.has(k)) return false; vistos.add(k); return true })
    .sort((a, b) => b.f - a.f).slice(0, 12)
    .map(({ t, url, medio, f, img }) => ({ t, url, medio, f, img }))
  console.log(`noticias ${idioma}: ${salida[idioma].length}`)
}
// si todo falla, se conserva lo anterior (una noticia vieja es mejor que un hueco)
const ruta = join(raiz, 'public', 'noticias.json')
if (!salida.es.length && !salida.en.length && existsSync(ruta)) { console.warn('sin noticias nuevas: se deja el archivo anterior'); process.exit(0) }
writeFileSync(ruta, JSON.stringify(salida))
// y en docs/, lo que sirve Pages, sin tener que compilar
if (existsSync(join(raiz, 'docs'))) copyFileSync(ruta, join(raiz, 'docs', 'noticias.json'))
