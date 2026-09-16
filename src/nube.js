// ── La cuenta de la comunidad: un proyecto Supabase (plan gratuito) ──
//
// Con NUBE en null la app no enseña nada de cuentas y funciona como siempre
// (todo local, más la sincronización con base propia de Ajustes). Para
// encenderla: supabase/LEEME.md (crear el proyecto, aplicar la migración,
// Google) y pegar aquí la Project URL y la anon public key.
//
// La anon key NO es un secreto: va en la app a propósito, como la de TMDB. Lo
// que protege los datos son las reglas por fila de la base
// (supabase/migrations). La service_role key no se pega nunca aquí.
//
// Sin SDK: unas pocas llamadas REST, como la app ya hacía con Firebase. El
// acceso usa PKCE (el código que vuelve en la URL solo sirve junto al
// verificador guardado en ESTE navegador): con Google por redirección y con
// enlace por correo, los dos por el mismo camino.
export const NUBE_PRODUCCION = null
// export const NUBE_PRODUCCION = { url: 'https://xxxx.supabase.co', anon: 'eyJ…' }

// Las sondas (scripts/sondas/cuenta.mjs) apuntan la app a un Supabase local
// con esta clave de localStorage. Solo se lee en localhost: en producción
// nadie puede redirigir la cuenta de otro a un servidor ajeno.
const KEY_NUBE_PRUEBAS = 'maraton-marvel-nube-pruebas-v1'
const dePruebas = () => {
  try {
    if (!/^(localhost|\[::1\])$/.test(window.location.hostname)) return null
    const c = JSON.parse(localStorage.getItem(KEY_NUBE_PRUEBAS))
    return c && typeof c.url === 'string' && /^http:\/\/localhost:\d+$/.test(c.url) && typeof c.anon === 'string' ? c : null
  } catch { return null }
}
export const NUBE = NUBE_PRODUCCION || dePruebas()

const KEY_VERIFICADOR = 'maraton-marvel-pkce-v1'
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
// vuelta a la app sin nada detrás: el código llega como ?code=
const vuelta = () => window.location.origin + window.location.pathname

async function retoPkce() {
  const verificador = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const reto = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)))
  // localStorage y no sessionStorage: el enlace por correo puede abrirse en
  // otra pestaña del mismo navegador
  localStorage.setItem(KEY_VERIFICADOR, JSON.stringify({ v: verificador, t: Date.now() }))
  return reto
}

async function pide(ruta, { method = 'GET', body, token, prefer } = {}) {
  const r = await fetch(NUBE.url + ruta, {
    method,
    headers: {
      apikey: NUBE.anon,
      Authorization: `Bearer ${token || NUBE.anon}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const texto = await r.text()
  let j = null
  try { j = texto ? JSON.parse(texto) : null } catch {}
  if (!r.ok) {
    const e = new Error((j && (j.msg || j.message || j.error_description || j.error)) || String(r.status))
    e.status = r.status
    e.codigo = j && (j.code || j.error_code)
    // sesión que ya no vale: hay que salir, no reintentar. En /auth un 400/401
    // (token de refresco revocado); en la API un 401 (JWT caducado o falso).
    // Un 403 de la API es una regla de la base, no la sesión.
    e.auth = ruta.startsWith('/auth/') ? (r.status === 400 || r.status === 401 || r.status === 403) : r.status === 401
    throw e
  }
  return j
}

const sesion = j => {
  // todo lo que viene de fuera se valida por tipo
  const u = j && j.user
  if (!u || typeof u.id !== 'string' || typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') throw new Error('respuesta')
  const meta = u.user_metadata && typeof u.user_metadata === 'object' ? u.user_metadata : {}
  const texto = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '')
  return {
    uid: u.id,
    rt: j.refresh_token,
    token: j.access_token,
    dura: Number(j.expires_in) || 3600,
    email: texto(u.email, 120),
    nombre: texto(meta.full_name || meta.name, 80),
    foto: typeof meta.avatar_url === 'string' && meta.avatar_url.startsWith('https://') ? meta.avatar_url : '',
  }
}

// A dónde mandar a la persona para entrar con Google (vuelve con ?code=)
export async function urlGoogle() {
  const reto = await retoPkce()
  return `${NUBE.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(vuelta())}` +
    `&code_challenge=${reto}&code_challenge_method=s256`
}

// Enlace de acceso por correo (el mismo ?code= al abrirlo)
export async function enviaEnlace(email) {
  const reto = await retoPkce()
  await pide(`/auth/v1/otp?redirect_to=${encodeURIComponent(vuelta())}`, {
    method: 'POST', body: { email, create_user: true, code_challenge: reto, code_challenge_method: 's256' },
  })
}

// El código de la URL por una sesión. Sin verificador en este navegador (el
// enlace se abrió en otro) no se puede: se dice en vez de fallar callado.
export async function canjeaCodigo(codigo) {
  let guardado = null
  try { guardado = JSON.parse(localStorage.getItem(KEY_VERIFICADOR)) } catch {}
  if (!guardado || typeof guardado.v !== 'string') { const e = new Error('otro-navegador'); e.otroNavegador = true; throw e }
  const j = await pide('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: codigo, code_verifier: guardado.v } })
  try { localStorage.removeItem(KEY_VERIFICADOR) } catch {}
  return sesion(j)
}

// La sesión dura una hora; esto la renueva (Supabase rota el token de refresco)
export async function refrescaToken(rt) {
  return sesion(await pide('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } }))
}

export async function salirNube(token) {
  // scope=local: sale en ESTE dispositivo; sin él Supabase cierra la sesión en todos (code-review)
  try { await pide('/auth/v1/logout?scope=local', { method: 'POST', token }) } catch {}
}

// La API REST (PostgREST): `ruta` sin /rest/v1, p. ej. «perfiles?id=eq.…»
export const rest = (token, ruta, opciones = {}) => pide('/rest/v1/' + ruta, { ...opciones, token })
