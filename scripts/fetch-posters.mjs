// Resuelve la URL del póster de cada título vía la API REST de Wikipedia (en inglés).
// No descarga ni re-aloja imágenes: guarda solo las URLs de upload.wikimedia.org.
import { writeFileSync } from 'node:fs'

const TITULOS = {
  'first-class': 'X-Men: First Class',
  'origins-wolverine': 'X-Men Origins: Wolverine',
  'dofp': 'X-Men: Days of Future Past',
  'apocalypse': 'X-Men: Apocalypse',
  'dark-phoenix': 'Dark Phoenix (film)',
  'xmen1': 'X-Men (film)',
  'x2': 'X2 (film)',
  'last-stand': 'X-Men: The Last Stand',
  'the-wolverine': 'The Wolverine (film)',
  'deadpool1': 'Deadpool (film)',
  'deadpool2': 'Deadpool 2',
  'new-mutants': 'The New Mutants (film)',
  'logan': 'Logan (film)',
  'xmen97': "X-Men '97",
  'cap1': 'Captain America: The First Avenger',
  'agent-carter': 'Agent Carter (TV series)',
  'capmarvel': 'Captain Marvel (film)',
  'ironman1': 'Iron Man (2008 film)',
  'ironman2': 'Iron Man 2',
  'hulk': 'The Incredible Hulk (film)',
  'thor1': 'Thor (film)',
  'avengers1': 'The Avengers (2012 film)',
  'ironman3': 'Iron Man 3',
  'thor2': 'Thor: The Dark World',
  'cap2': 'Captain America: The Winter Soldier',
  'gotg1': 'Guardians of the Galaxy (film)',
  'gotg2': 'Guardians of the Galaxy Vol. 2',
  'netflix': 'Daredevil (TV series)',
  'ultron': 'Avengers: Age of Ultron',
  'antman1': 'Ant-Man (film)',
  'civilwar': 'Captain America: Civil War',
  'blackwidow': 'Black Widow (2021 film)',
  'blackpanther': 'Black Panther (film)',
  'homecoming': 'Spider-Man: Homecoming',
  'drstrange': 'Doctor Strange (2016 film)',
  'ragnarok': 'Thor: Ragnarok',
  'antman2': 'Ant-Man and the Wasp',
  'infinitywar': 'Avengers: Infinity War',
  'endgame': 'Avengers: Endgame',
  'loki1': 'Loki (TV series)',
  'whatif': 'What If...? (TV series)',
  'wandavision': 'WandaVision',
  'fatws': 'The Falcon and the Winter Soldier',
  'shangchi': 'Shang-Chi and the Legend of the Ten Rings',
  'eternals': 'Eternals (film)',
  'ffh': 'Spider-Man: Far From Home',
  'nwh': 'Spider-Man: No Way Home',
  'sony': 'Spider-Man (2002 film)',
  'mom': 'Doctor Strange in the Multiverse of Madness',
  'hawkeye': 'Hawkeye (miniseries)',
  'moonknight': 'Moon Knight (TV series)',
  'msmarvel': 'Ms. Marvel (TV series)',
  'lovethunder': 'Thor: Love and Thunder',
  'shehulk': 'She-Hulk: Attorney at Law',
  'werewolf': 'Werewolf by Night',
  'wakandaforever': 'Black Panther: Wakanda Forever',
  'holiday': 'The Guardians of the Galaxy Holiday Special',
  'quantumania': 'Ant-Man and the Wasp: Quantumania',
  'gotg3': 'Guardians of the Galaxy Vol. 3',
  'secretinvasion': 'Secret Invasion (TV series)',
  'loki2': 'Loki (season 2)',
  'marvels': 'The Marvels',
  'echo': 'Echo (TV series)',
  'deadpool3': 'Deadpool & Wolverine',
  'agatha': 'Agatha All Along',
  'daredevil-ba': 'Daredevil: Born Again',
  'bravenewworld': 'Captain America: Brave New World',
  'thunderbolts': 'Thunderbolts*',
  'ironheart': 'Ironheart (TV series)',
  'eyeswakanda': 'Eyes of Wakanda',
  'zombies': 'Marvel Zombies (TV series)',
  'wonderman': 'Wonder Man (miniseries)',
  'ff': 'The Fantastic Four: First Steps',
  'brandnewday': 'Spider-Man: Brand New Day',
  'doomsday': 'Avengers: Doomsday',
  'c-giantsize': 'Giant-Size X-Men',
  'c-darkphoenix': 'The Dark Phoenix Saga',
  'c-dofp': 'Days of Future Past',
  'c-godloves': 'God Loves, Man Kills',
  'c-newxmen': 'New X-Men',
  'c-astonishing': 'Astonishing X-Men',
  'c-houseofm': 'House of M',
  'c-oldmanlogan': 'Old Man Logan',
  'c-hoxpox': 'House of X',
  'c-galactus': 'The Galactus Trilogy',
  'c-infinitygauntlet': 'The Infinity Gauntlet',
  'c-ultimates': 'The Ultimates',
  'c-extremis': 'Extremis (comics)',
  'c-wintersoldier': 'The Winter Soldier (comics)',
  'c-civilwar': 'Civil War (comics)',
  'c-planethulk': 'Planet Hulk',
  'c-secretwars': 'Secret Wars (2015 comic book)',
  'c-bornagain': 'Daredevil: Born Again',
  'c-ultimatespider': 'Ultimate Spider-Man',
  'c-hawkeyefraction': 'Hawkeye (2012 comic book)',
  'c-msmarvel': 'Ms. Marvel (Kamala Khan)',
  'c-visionking': 'The Vision (2015 comic book)',
}

let out = {}
try {
  const prev = await import('../src/posters.js')
  out = { ...prev.POSTERS }
  console.log(`Reutilizando ${Object.keys(out).length} ya resueltos`)
} catch {}

const espera = ms => new Promise(res => setTimeout(res, ms))
const misses = []
for (const [id, titulo] of Object.entries(TITULOS)) {
  if (out[id]) continue
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titulo)
  let hecho = false
  for (let intento = 0; intento < 4 && !hecho; intento++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'maraton-marvel/1.0 (personal watch tracker; contact: github.com/Ssebv)' } })
      if (r.status === 429) { await espera(8000 * (intento + 1)); continue }
      hecho = true
      if (!r.ok) { misses.push(`${id} (${titulo}): HTTP ${r.status}`); break }
      const j = await r.json()
      const src = j.thumbnail && j.thumbnail.source
      if (!src) { misses.push(`${id} (${titulo}): sin imagen`); break }
      out[id] = src.replace(/\/(\d+)px-/, '/300px-')
    } catch (e) {
      misses.push(`${id} (${titulo}): ${e.message}`); hecho = true
    }
  }
  if (!hecho) misses.push(`${id} (${titulo}): 429 persistente`)
  await espera(1200)
}

const js = '// Generado por scripts/fetch-posters.mjs — URLs de pósters vía Wikipedia\n' +
  'export const POSTERS = ' + JSON.stringify(out, null, 2) + '\n'
writeFileSync(new URL('../src/posters.js', import.meta.url), js)
console.log(`OK: ${Object.keys(out).length} pósters resueltos`)
if (misses.length) console.log('SIN PÓSTER:\n  ' + misses.join('\n  '))
