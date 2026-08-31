// ── La cuenta de la comunidad: un proyecto Firebase central ──
//
// Con NUBE en null la app no enseña nada de cuentas y funciona como siempre
// (todo local, más la sincronización con base propia de Ajustes). Para
// encender el acceso con Google hay que crear el proyecto UNA vez (5 min):
//
//  1. console.firebase.google.com → «Añadir proyecto» (el nombre da igual).
//  2. Authentication → Sign-in method → Google → Habilitar (guardar el
//     «Web client ID» que enseña ahí, en Configuración del SDK web).
//     En Authentication → Settings → Authorized domains: añadir ssebv.github.io.
//  3. Realtime Database → Crear (Bélgica/europe-west1 vale) → pestaña Reglas:
//     {
//       "rules": {
//         "usuarios": {
//           "$uid": {
//             ".read": "auth !== null && auth.uid === $uid",
//             ".write": "auth !== null && auth.uid === $uid"
//           }
//         }
//       }
//     }
//  4. Rueda dentada → Configuración del proyecto → General → «Tus apps» →
//     añadir app web (sin hosting) → copiar apiKey.
//  5. Rellenar NUBE aquí abajo con apiKey, la URL de la base y el client ID,
//     y desplegar. Nada más: el resto de la app ya sabe usarlo.
//
// La clave apiKey de Firebase no es un secreto (identifica el proyecto; el
// acceso lo mandan las reglas y los dominios autorizados de arriba).
export const NUBE = null
// export const NUBE = {
//   apiKey: 'AIza…',
//   db: 'https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app',
//   clientId: '1234567890-abc.apps.googleusercontent.com',
// }

// El script oficial de Google Identity Services, cargado una sola vez y solo
// cuando hace falta (al abrir Ajustes sin sesión): pinta el botón «Acceder
// con Google» y devuelve el carné (un JWT) al pulsarlo.
let gisPromesa = null
export function cargaGis() {
  if (window.google && window.google.accounts) return Promise.resolve()
  if (gisPromesa) return gisPromesa
  gisPromesa = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = res
    s.onerror = () => { gisPromesa = null; rej(new Error('gis')) }
    document.head.appendChild(s)
  })
  return gisPromesa
}

const pideJson = async (url, cuerpo, forma) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': forma ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: forma ? new URLSearchParams(cuerpo).toString() : JSON.stringify(cuerpo),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error((j && j.error && j.error.message) || String(r.status))
    // 4xx de auth = la sesión no vale (revocada, caducada): hay que salir,
    // no reintentar. Un fallo de red se queda en error normal y se reintenta.
    e.auth = r.status === 400 || r.status === 401 || r.status === 403
    throw e
  }
  return j
}

// Cambia el carné de Google (el JWT de GIS) por una sesión de Firebase Auth.
export async function entraConGoogle(credencial) {
  const j = await pideJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${NUBE.apiKey}`, {
    postBody: `id_token=${credencial}&providerId=google.com`,
    requestUri: window.location.origin,
    returnSecureToken: true,
  })
  // todo lo que viene de fuera se valida por tipo, aunque venga de Google
  if (typeof j.localId !== 'string' || !j.localId || typeof j.refreshToken !== 'string' || typeof j.idToken !== 'string') throw new Error('respuesta')
  return {
    uid: j.localId,
    rt: j.refreshToken,
    token: j.idToken,
    dura: Number(j.expiresIn) || 3600,
    nombre: typeof j.displayName === 'string' ? j.displayName.slice(0, 80) : '',
    email: typeof j.email === 'string' ? j.email.slice(0, 120) : '',
    foto: typeof j.photoUrl === 'string' && j.photoUrl.startsWith('https://') ? j.photoUrl : '',
  }
}

// La sesión dura una hora; esto la renueva con el token de refresco guardado.
// Este endpoint de Google pide el cuerpo como formulario, no como JSON.
export async function refrescaToken(rt) {
  const j = await pideJson(`https://securetoken.googleapis.com/v1/token?key=${NUBE.apiKey}`,
    { grant_type: 'refresh_token', refresh_token: rt }, true)
  if (typeof j.id_token !== 'string' || !j.id_token) { const e = new Error('respuesta'); e.auth = true; throw e }
  return { token: j.id_token, dura: Number(j.expires_in) || 3600, rt: typeof j.refresh_token === 'string' ? j.refresh_token : rt }
}
