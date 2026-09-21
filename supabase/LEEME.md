# Comunidades del Maratón: poner en marcha la base (gratis)

Todo esto usa **solo planes gratuitos**, sin tarjeta: Supabase (plan Free),
Google Cloud (pantalla de consentimiento y cliente OAuth, sin coste) y GitHub
Actions (gratis en repositorios públicos). Tiempo: unos 15–20 minutos.

La app no enseña nada de cuentas hasta que se peguen las claves en `src/nube.js`. Lo que hay en
esta carpeta ya está probado en local: `npm run comunidad:rls` levanta un
PostgreSQL temporal que imita a Supabase y comprueba 67 reglas.

## 1 · Proyecto en Supabase (5 min)

1. Entra en <https://supabase.com> con tu cuenta de GitHub → **New project**.
2. Organización personal, plan **Free**. Nombre: `maraton-marvel`.
   Región: **São Paulo (sa-east-1)**, la más cercana a Chile.
   Contraseña de la base: genera una y guárdala en tu gestor (no se pega en la app).
3. Cuando termine: **Project Settings → API** y copia dos cosas:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (empieza por `eyJ…`). Es pública, como la de TMDB:
     lo que protege los datos son las reglas de la base, no la clave.
   - La **service_role key NO** se copia en ningún sitio.

## 2 · Crear las tablas (2 min)

1. **SQL Editor → New query**.
2. Pega el contenido de `supabase/migrations/20260916120000_comunidades.sql` y pulsa **Run**.
   Luego, en otra consulta, `supabase/migrations/20260916180000_retos_y_muro.sql` → **Run**
   después `supabase/migrations/20260916200000_privacidad_ranking.sql` → **Run**
   y `supabase/migrations/20260921120000_perfil_bloqueado.sql` → **Run**
   (las migraciones van en orden de nombre; cada una nueva se aplica igual).
3. Nueva consulta con el contenido de `supabase/catalogo.sql` → **Run**
   (los 143 títulos con sus minutos; se repite cuando entre un título nuevo:
   `npm run comunidad:catalogo` lo regenera).

## 3 · Entrar con Google (8 min)

1. <https://console.cloud.google.com> → crea un proyecto `maraton-marvel`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth** → Externo.
   Nombre de la app: Maratón Marvel & X-Men. Correo de asistencia: el tuyo.
   Permisos: solo `email`, `profile`, `openid` (no piden verificación de Google).
   Al terminar, **Publicar app** (estado «En producción»; con esos permisos es gratis y sin revisión).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth** → Aplicación web.
   - Orígenes autorizados: `https://ssebv.github.io`
   - URI de redireccionamiento autorizados: `https://xxxx.supabase.co/auth/v1/callback`
     (tu Project URL + `/auth/v1/callback`)
4. Copia el **ID de cliente** y el **secreto del cliente**.
5. En Supabase: **Authentication → Sign In / Providers → Google** → activar,
   pegar ID y secreto → Save.
6. **Authentication → URL Configuration**:
   - Site URL: `https://ssebv.github.io/maraton-marvel/`
   - Redirect URLs: `https://ssebv.github.io/maraton-marvel/**` y `http://localhost:5173/**`

### Entrar con enlace por correo (opcional, también gratis)

El correo que trae Supabase de serie solo manda unos pocos mensajes por hora y
es para pruebas. Para usarlo de verdad sin pagar: una cuenta gratuita de
**Brevo** (unos 300 correos al día) → SMTP y clave → en Supabase
**Authentication → Emails → SMTP Settings**. Se puede dejar para después: con
Google basta para empezar.

## 4 · Conectar la app (1 min)

En `src/nube.js` cambia `export const NUBE_PRODUCCION = null` por
```js
export const NUBE_PRODUCCION = { url: 'https://xxxx.supabase.co', anon: 'eyJ…' }
```
(Project URL y anon public key), y `npm run desplegar`. La app ya sabe entrar
con Google y con enlace por correo, crear el perfil, subir y bajar el
progreso, la privacidad, descargar los datos y borrar la cuenta: está probado
de punta a punta contra un Supabase local (`npm run comunidad:sonda`).

> Si aplicaste la migración antes del 16 de septiembre por la tarde, ejecuta
> también en el SQL Editor:
> `grant update (usuario, vistas, eps, notas, listas, lecturas, horario, actualizado) on public.progreso to authenticated;`
> (sin ella, guardar el progreso da «permission denied»).

## 5 · Hacerte administrador (1 min)

1. Entra en la app con tu Google (Ajustes › Cuenta) y elige tu `@nombre`.
2. En el **SQL Editor**:
   ```sql
   insert into public.admins (usuario) select id from public.perfiles where nombre = 'tu_nombre';
   ```

## 6 · Mantener vivo el proyecto (2 min)

El plan gratuito **pausa** un proyecto tras una semana sin actividad. La tarea
`.github/workflows/comunidad-viva.yml` lo evita llamando cada 3 días a
`mantenimiento()`, que también poda lo viejo.

1. En GitHub: repositorio → **Settings → Secrets and variables → Actions → Variables**.
2. Crea `SUPABASE_URL` (Project URL) y `SUPABASE_ANON_KEY` (anon public key).
3. Pestaña **Actions → Comunidad viva → Run workflow** para probarla: debe
   terminar en verde y enseñar `{"actividad": 0, …}`.

## Límites del plan gratuito y cómo no llegar

Confírmalos en <https://supabase.com/pricing> el día que crees el proyecto:
cambian. A septiembre de 2026 rondan: base de 500 MB, 50.000 usuarios activos
al mes, 5 GB de transferencia, 2 proyectos gratis.

| Límite | Qué hace el diseño |
|---|---|
| 500 MB de base | Sin imágenes subidas (avatares de galería, portadas del catálogo); progreso con tope de 400 kB por persona; actividad podada a 90 días y avisos a 30/180; la tarea avisa al 70 % |
| Pausa por inactividad | Tarea de GitHub cada 3 días |
| Transferencia | La app pide solo lo que enseña (hilos paginados); las carátulas siguen saliendo de GitHub Pages |
| Correo | Google primero; enlace por correo con SMTP gratuito |
| Sin Cloud Functions | Contadores, límites y moderación con disparadores y funciones SQL dentro de la base |

## Probar en local, sin internet (para desarrollar)

`npm run comunidad:local` levanta en Docker un Supabase de verdad (Postgres de
Supabase, GoTrue, PostgREST y un buzón Mailpit, con las versiones de la CLI) y
le aplica la migración y el catálogo; `node scripts/comunidad/local.mjs para`
lo quita. Se hace sin `supabase start` porque la CLI conecta a 127.0.0.1 fijo
y el Mac de desarrollo no lo tiene en el loopback. `npm run comunidad:sonda`
pasa las reglas (PostgreSQL local) y la cuenta de punta a punta en el
navegador (entrar por correo, crear el perfil, fundir dos dispositivos, marcar
en uno y verlo en otro, renovar la sesión, privacidad, borrar la cuenta).
