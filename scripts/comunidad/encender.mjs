#!/usr/bin/env node
// Enciende la cuenta y las comunidades en producción de una vez (24 sep 2026,
// Sebastián: «¿no lo podemos dejar configurado?»). Lo único que hace falta
// antes es iniciar sesión en Supabase UNA vez, porque el proyecto queda a su
// nombre:  npx supabase login
//
//   npm run nube:encender            → crea o reutiliza el proyecto y lo deja listo
//   npm run nube:encender -- --prueba → solo comprueba y cuenta lo que haría
//
// Pasos (todos en el plan gratuito, sin tarjeta):
//   1. proyecto «maraton-marvel» en São Paulo (sa-east-1), o el que ya exista;
//      la contraseña de la base se genera y se guarda FUERA del repositorio
//      (~/.maraton-marvel-db.txt, solo legible por ti)
//   2. espera a que esté en marcha
//   3. aplica las migraciones de supabase/migrations y el catálogo (seed)
//   4. sube la configuración de acceso de PRODUCCIÓN (dirección del sitio y
//      redirecciones de GitHub Pages, entrar por correo). No usa el
//      config.toml del repositorio, que apunta a localhost: escribe uno aparte
//      en una carpeta temporal y enseña la diferencia antes de aplicarla
//   5. pega la Project URL y la anon key en src/nube.js (NUBE_PRODUCCION)
// Después: npm run desplegar. Entrar con Google es un paso aparte en la
// consola de Google (supabase/LEEME.md, apartado 3).
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const PRUEBA = process.argv.includes('--prueba')
const CLI = ['-y', 'supabase@2.117.0']
const NOMBRE = 'maraton-marvel', REGION = 'sa-east-1'
const SITIO = 'https://ssebv.github.io/maraton-marvel/'
const CLAVE_DB = join(homedir(), '.maraton-marvel-db.txt')
const NUBE_JS = join(RAIZ, 'src/nube.js')
const espera = ms => new Promise(r => setTimeout(r, ms))
const paso = t => console.log(`\n▸ ${t}`)

// `clave`: la contraseña de la base va por variable de entorno, no en la línea
// de órdenes (ahí la vería cualquiera con `ps`)
function sb(args, { json = false, cwd = RAIZ, entrada, mostrar = false, clave } = {}) {
  const env = clave ? { ...process.env, SUPABASE_DB_PASSWORD: clave } : process.env
  const r = spawnSync('npx', [...CLI, ...args, ...(json ? ['-o', 'json'] : [])], { cwd, env, encoding: 'utf8', input: entrada, stdio: mostrar ? ['pipe', 'inherit', 'inherit'] : 'pipe' })
  if (r.status !== 0) {
    const err = new Error(`supabase ${args.join(' ')} falló:\n${(r.stderr || r.stdout || '').trim()}`)
    err.salida = (r.stderr || '') + (r.stdout || '')
    throw err
  }
  if (!json) return r.stdout
  const t = r.stdout.trim()
  return JSON.parse(t.slice(t.search(/[[{]/)))
}

async function main() {
  paso('¿Sesión iniciada en Supabase?')
  let proyectos
  try { proyectos = sb(['projects', 'list'], { json: true }) } catch (e) {
    if (/access token|login|not logged/i.test(e.salida || e.message)) {
      console.log('  Falta iniciar sesión (una vez, abre el navegador):\n\n    npx supabase login\n\n  y vuelve a ejecutar: npm run nube:encender')
      process.exitCode = PRUEBA ? 0 : 1
      return
    }
    throw e
  }
  console.log(`  sí: ${proyectos.length} proyecto(s) en la cuenta`)
  let p = proyectos.find(x => x.name === NOMBRE)
  if (PRUEBA) {
    console.log(p ? `  reutilizaría «${NOMBRE}» (${p.id}, ${p.region}, ${p.status})` : `  crearía «${NOMBRE}» en ${REGION} (plan gratuito)`)
    console.log('  aplicaría migraciones + catálogo, la configuración de acceso de producción y pegaría las claves en src/nube.js')
    return
  }

  paso(`Proyecto «${NOMBRE}»`)
  let clave = existsSync(CLAVE_DB) ? readFileSync(CLAVE_DB, 'utf8').trim() : ''
  const creado = !p
  if (!p) {
    const orgs = sb(['orgs', 'list'], { json: true })
    if (!orgs.length) throw new Error('La cuenta no tiene organización: crea una (gratis) en supabase.com y vuelve a intentarlo.')
    clave = randomBytes(24).toString('base64url')
    writeFileSync(CLAVE_DB, clave + '\n', { mode: 0o600 }); chmodSync(CLAVE_DB, 0o600)
    console.log(`  contraseña de la base guardada en ${CLAVE_DB} (no va al repositorio)`)
    sb(['projects', 'create', NOMBRE, '--org-id', orgs[0].id, '--region', REGION, '--db-password', clave], { mostrar: true })
    p = sb(['projects', 'list'], { json: true }).find(x => x.name === NOMBRE)
  } else {
    console.log(`  ya existe (${p.id}); se reutiliza`)
    if (!clave) throw new Error(`Falta la contraseña de la base en ${CLAVE_DB} (Supabase › Project Settings › Database › Reset password y guárdala ahí).`)
  }
  const ref = p.id || p.ref

  paso('Esperando a que el proyecto esté en marcha')
  for (let i = 0; i < 60; i++) {
    const e = sb(['projects', 'list'], { json: true }).find(x => (x.id || x.ref) === ref)
    if (e && /ACTIVE_HEALTHY/.test(e.status)) { console.log('  en marcha'); break }
    if (i === 59) throw new Error('El proyecto tarda demasiado en arrancar; vuelve a ejecutar esto en unos minutos.')
    process.stdout.write('.'); await espera(10000)
  }

  paso('Migraciones y catálogo')
  sb(['link', '--project-ref', ref], { mostrar: true, clave })
  sb(['db', 'push', '--linked', '--include-seed', '--yes'], { mostrar: true, clave })

  paso('Configuración de acceso de producción')
  // solo en un proyecto recién creado: `config push` sube también los valores
  // por defecto de lo que el archivo no declara, y en uno que ya existía
  // apagaría lo activado después a mano (Google, el correo propio)
  if (!creado) console.log('  el proyecto ya existía: la configuración de acceso no se toca (revísala en el panel si hace falta)')
  else {
  const dir = mkdtempSync(join(tmpdir(), 'maraton-nube-'))
  mkdirSync(join(dir, 'supabase'))
  writeFileSync(join(dir, 'supabase', 'config.toml'), [
    `project_id = "${NOMBRE}"`,
    '[auth]',
    `site_url = "${SITIO}"`,
    `additional_redirect_urls = ["${SITIO}**", "http://localhost:5173/**"]`,
    'enable_signup = true',
    '[auth.email]',
    'enable_signup = true',
    'enable_confirmations = false',
    '',
  ].join('\n'))
  console.log(sb(['--workdir', dir, 'config', 'diff', '--project-ref', ref]))
  sb(['--workdir', dir, 'config', 'push', '--project-ref', ref, '--yes'], { mostrar: true })
  }

  paso('Claves en src/nube.js')
  const claves = sb(['projects', 'api-keys', '--project-ref', ref], { json: true })
  const anon = (claves.find(k => k.name === 'anon') || {}).api_key
  if (!anon || !/^eyJ/.test(anon)) throw new Error('No encontré la anon key (JWT) del proyecto.')
  const url = `https://${ref}.supabase.co`
  const js = readFileSync(NUBE_JS, 'utf8')
  const nuevo = js.replace(/^export const NUBE_PRODUCCION = .*$/m, `export const NUBE_PRODUCCION = { url: '${url}', anon: '${anon}' }`)
  if (nuevo === js) throw new Error('No encontré la línea NUBE_PRODUCCION en src/nube.js')
  writeFileSync(NUBE_JS, nuevo)
  console.log(`  NUBE_PRODUCCION = ${url}`)

  console.log(`\n✓ Nube encendida. Falta desplegar: npm run desplegar
  Para entrar con Google: supabase/LEEME.md, apartado 3 (consola de Google, 5 min).
  Hasta entonces se entra con enlace por correo (el correo gratis de Supabase manda pocos al día; LEEME.md explica Brevo, también gratis).`)
}

main().catch(e => { console.error('\n✗ ' + (e && e.message)); process.exitCode = 1 })
