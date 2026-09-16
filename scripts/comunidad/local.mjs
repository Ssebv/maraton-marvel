#!/usr/bin/env node
// Un Supabase local para desarrollar y probar la comunidad sin crear nada en
// internet: Postgres de Supabase, su servicio de cuentas (GoTrue), PostgREST y
// un buzón de correo de prueba (Mailpit), en Docker, con las mismas versiones
// que la CLI de Supabase. Se hace a mano y no con `supabase start` porque la
// CLI conecta a 127.0.0.1 fijo y este Mac no lo tiene en el loopback: aquí se
// usa la IPv4 que sí tenga lo0.
//
//   node scripts/comunidad/local.mjs arranca   → levanta todo y aplica migración y catálogo
//   node scripts/comunidad/local.mjs para      → lo quita (contenedores y red)
//
// Las sondas importan arranca()/para() y abre({ puerto: 4173, proxy: PROXY })
// para servir la app con /auth/v1 y /rest/v1 en el MISMO origen, como el
// dominio de Supabase pero sin CORS.
import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const RED = 'maraton-comunidad'
const IMG = {
  db: 'public.ecr.aws/supabase/postgres:17.6.1.167',
  auth: 'public.ecr.aws/supabase/gotrue:v2.196.0',
  rest: 'public.ecr.aws/supabase/postgrest:v16.2',
  mail: 'public.ecr.aws/supabase/mailpit:v1.30.2',
}
export const PUERTOS = { db: 54322, auth: 54329, rest: 54330, mail: 54324, app: 4173 }
const SECRETO = 'secreto-local-de-pruebas-maraton-marvel-no-usar-en-produccion'
const ESPERA = ms => new Promise(r => setTimeout(r, ms))

// la IPv4 del loopback (127.0.0.1 en casi todos los Mac; 10.10.10.1 en este)
export const LOOP = (() => {
  const lo = (networkInterfaces().lo0 || networkInterfaces().lo || []).filter(a => a.family === 'IPv4')
  return (lo.find(a => a.address === '127.0.0.1') || lo[0] || { address: '127.0.0.1' }).address
})()

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = rol => {
  const cab = b64({ alg: 'HS256', typ: 'JWT' }), cuerpo = b64({ role: rol, iss: 'supabase-local', iat: 1757980800, exp: 2073340800 })
  return `${cab}.${cuerpo}.${createHmac('sha256', SECRETO).update(`${cab}.${cuerpo}`).digest('base64url')}`
}
export const CLAVES = { anon: jwt('anon'), service: jwt('service_role') }
export const PROXY = { '/auth/v1': `http://${LOOP}:${PUERTOS.auth}`, '/rest/v1': `http://${LOOP}:${PUERTOS.rest}` }
export const MAILPIT = `http://${LOOP}:${PUERTOS.mail}`

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' })
const psql = (sql, usuario = 'postgres') => spawnSync(
  existsPsql(), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', LOOP, '-p', String(PUERTOS.db), '-U', usuario, '-d', 'postgres'],
  { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } })
function existsPsql() {
  for (const d of ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/bin', '/usr/local/bin'])
    try { if (readdirSync(d).includes('psql')) return join(d, 'psql') } catch {}
  return 'psql'
}

export async function para() {
  for (const n of ['mc-rest', 'mc-auth', 'mc-mail', 'mc-db']) docker('rm', '-f', n)
  docker('network', 'rm', RED)
}

export async function arranca({ silencio = false } = {}) {
  const di = m => { if (!silencio) console.log(m) }
  await para()
  docker('network', 'create', RED)
  const corre = (nombre, img, puertos, env) => {
    const r = docker('run', '-d', '--name', nombre, '--network', RED, ...puertos.flatMap(p => ['-p', p]),
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), img)
    if (r.status !== 0) throw new Error(`${nombre}: ${r.stderr}`)
  }
  corre('mc-db', IMG.db, [`${PUERTOS.db}:5432`], { POSTGRES_PASSWORD: 'postgres', JWT_SECRET: SECRETO })
  corre('mc-mail', IMG.mail, [`${PUERTOS.mail}:8025`], {})
  di('· base de datos arrancando…')
  for (let i = 0; ; i++) {
    const r = psql('select 1')
    if (r.status === 0) break
    if (i > 90) throw new Error('la base no arrancó: ' + r.stderr)
    await ESPERA(1000)
  }
  // los roles internos solo los toca el superusuario de la imagen
  const roles = psql(`alter role authenticator with password 'postgres'; alter role supabase_auth_admin with password 'postgres';`, 'supabase_admin')
  if (roles.status !== 0) throw new Error(roles.stderr)

  corre('mc-auth', IMG.auth, [`${PUERTOS.auth}:9999`], {
    GOTRUE_API_HOST: '0.0.0.0', PORT: '9999', API_EXTERNAL_URL: `http://localhost:${PUERTOS.app}`,
    GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: 'postgres://supabase_auth_admin:postgres@mc-db:5432/postgres',
    GOTRUE_SITE_URL: `http://localhost:${PUERTOS.app}/`, GOTRUE_URI_ALLOW_LIST: `http://localhost:${PUERTOS.app}/**`,
    GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_SECRET: SECRETO,
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'false', GOTRUE_MAILER_OTP_EXP: '3600',
    GOTRUE_SMTP_ADMIN_EMAIL: 'maraton@prueba.local', GOTRUE_SMTP_HOST: 'mc-mail', GOTRUE_SMTP_PORT: '1025',
    GOTRUE_SMTP_SENDER_NAME: 'Maratón Marvel', GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000', GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
    GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
  })
  di('· cuentas (GoTrue) arrancando…')
  for (let i = 0; ; i++) {
    try { const r = await fetch(`http://${LOOP}:${PUERTOS.auth}/health`); if (r.ok) break } catch {}
    if (i > 60) throw new Error('GoTrue no arrancó: ' + docker('logs', 'mc-auth').stderr.slice(-800))
    await ESPERA(1000)
  }

  di('· migración y catálogo…')
  for (const f of readdirSync(join(RAIZ, 'supabase/migrations')).sort()) {
    const r = psql(readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8'))
    if (r.status !== 0) throw new Error(`${f}: ${r.stderr}`)
  }
  const cat = psql(readFileSync(join(RAIZ, 'supabase/catalogo.sql'), 'utf8'))
  if (cat.status !== 0) throw new Error('catálogo: ' + cat.stderr)

  corre('mc-rest', IMG.rest, [`${PUERTOS.rest}:3000`], {
    PGRST_DB_URI: 'postgres://authenticator:postgres@mc-db:5432/postgres', PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: SECRETO, PGRST_DB_USE_LEGACY_GUCS: 'false',
  })
  di('· API REST (PostgREST) arrancando…')
  for (let i = 0; ; i++) {
    try { const r = await fetch(`http://${LOOP}:${PUERTOS.rest}/catalogo?select=id&limit=1`, { headers: { apikey: CLAVES.anon, Authorization: `Bearer ${CLAVES.anon}` } }); if (r.ok) break } catch {}
    if (i > 60) throw new Error('PostgREST no arrancó: ' + docker('logs', 'mc-rest').stderr.slice(-800))
    await ESPERA(1000)
  }
  di(`✓ Supabase local listo · app en http://localhost:${PUERTOS.app} · correo en ${MAILPIT}`)
  return { url: `http://localhost:${PUERTOS.app}`, anon: CLAVES.anon }
}

// el último correo enviado a una dirección (Mailpit)
export async function ultimoCorreo(para) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + para)}`).then(x => x.json()).catch(() => null)
    const m = r && r.messages && r.messages[0]
    if (m) return fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then(x => x.json())
    await ESPERA(500)
  }
  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const orden = process.argv[2] || 'arranca'
  if (orden === 'para') { await para(); console.log('Supabase local quitado') }
  else await arranca().catch(async e => { console.error('✗', e.message); process.exitCode = 1 })
}
