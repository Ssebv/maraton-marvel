#!/usr/bin/env node
// Calendario de estrenos al que suscribirse (23 sep 2026, Sebastián: «¿qué más
// para iOS?» → «realiza lo necesario»). En el iPhone una web no puede avisar
// sin un servidor de push (y la app no tiene uno central); el Calendario sí:
// se suscribe a public/estrenos.ics (y estrenos-en.ics) con webcal://, lo
// vuelve a leer solo cada día y avisa con su propia notificación. Cada
// estreno con fecha y cada episodio que se emite ahora (futuro o últimos 60
// días) es un evento de día completo con aviso a las 10:00 de ese día.
// Solo se reescribe si cambian los eventos (como novedades.json).
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'calendario-'))
for (const f of ['data', 'episodes', 'en-textos', 'titulos-en']) copyFileSync(join(raiz, `src/${f}.js`), join(tmp, `${f}.mjs`))
const { DATA, ESTRENOS } = await import(pathToFileURL(join(tmp, 'data.mjs')))
const { EPISODES } = await import(pathToFileURL(join(tmp, 'episodes.mjs')))
const { EN_TEXTOS } = await import(pathToFileURL(join(tmp, 'en-textos.mjs')))
const { TITULOS_EN } = await import(pathToFileURL(join(tmp, 'titulos-en.mjs')))

const items = DATA.flatMap(s => s.eras.flatMap(e => e.items))
const hace60 = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)

const esc = s => String(s || '').replace(/\r?\n/g, ' ').replace(/([,;\\])/g, '\\$1')
const pliega = linea => {
  const out = []; let actual = '', bytes = 0
  for (const ch of linea) {
    const b = Buffer.byteLength(ch)
    if (bytes + b > 74) { out.push(actual); actual = ' ' + ch; bytes = 1 + b } else { actual += ch; bytes += b }
  }
  out.push(actual)
  return out.join('\r\n')
}
const diaSig = f => new Date(new Date(f + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10)

function eventos(en) {
  const t = s => (en ? (EN_TEXTOS[s] !== undefined ? EN_TEXTOS[s] : s) : s)
  const titulo = (id, es) => (en ? TITULOS_EN[id] || es : es)
  const ev = []
  for (const e of ESTRENOS) {
    if (!e.fecha) continue
    ev.push({
      uid: `estreno-${e.fecha}-${(e.id || e.t).replace(/[^\w]/g, '').slice(0, 24)}`,
      fecha: e.fecha,
      resumen: `${en ? 'Premiere' : 'Estreno'}: ${titulo(e.id, e.t)}`,
      desc: [t(e.tipo || ''), t(e.n || '')].filter(Boolean).join('. '),
    })
  }
  for (const [id, eps] of Object.entries(EPISODES)) {
    const it = items.find(i => i.id === id)
    for (const ep of eps) {
      if (!ep.f || ep.f < hace60) continue
      ev.push({
        uid: `ep-${id}-${ep.s}-${ep.n}`,
        fecha: ep.f,
        resumen: `${titulo(id, it ? it.t : id)} · ${en ? 'S' : 'T'}${ep.s}E${ep.n}`,
        desc: en ? 'New episode. Check it off in the Marvel & X-Men Marathon.' : 'Episodio nuevo. Márcalo en la Maratón Marvel & X-Men.',
      })
    }
  }
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.uid.localeCompare(b.uid))
}

function ics(en, ev) {
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//maraton-marvel//${en ? 'EN' : 'ES'}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${en ? 'Marvel Marathon · Premieres' : 'Maratón Marvel · Estrenos'}`,
    `X-WR-CALDESC:${esc(en ? 'Marvel and X-Men premieres and new episodes, from the Marvel & X-Men Marathon.' : 'Estrenos y episodios nuevos de Marvel y X-Men, de la Maratón Marvel & X-Men.')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D',
  ]
  for (const e of ev) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@maraton-marvel`,
      // fija, no la de hoy: si no, cada compilación cambiaría el archivo
      "DTSTAMP:20260923T000000Z",
      `DTSTART;VALUE=DATE:${e.fecha.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${diaSig(e.fecha).replace(/-/g, '')}`,
      `SUMMARY:${esc(e.resumen)}`,
      `DESCRIPTION:${esc(e.desc)}`,
      'URL:https://ssebv.github.io/maraton-marvel/',
      'TRANSP:TRANSPARENT',
      // aviso a las 10:00 del día (el evento empieza a las 00:00 locales)
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.resumen)}`, 'TRIGGER:PT10H', 'END:VALARM',
      'END:VEVENT',
    )
  }
  lineas.push('END:VCALENDAR')
  return lineas.map(pliega).join('\r\n') + '\r\n'
}

for (const [en, nombre] of [[false, 'estrenos.ics'], [true, 'estrenos-en.ics']]) {
  const ev = eventos(en)
  const texto = ics(en, ev)
  const ruta = join(raiz, 'public', nombre)
  let antes = null
  try { antes = readFileSync(ruta, 'utf8') } catch {}
  if (antes === texto) console.log(`${nombre}: ${ev.length} eventos, sin cambios`)
  else { writeFileSync(ruta, texto); console.log(`${nombre}: ${ev.length} eventos (actualizado)`) }
}
