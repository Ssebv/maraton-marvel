# 🍿 Maratón Marvel & X-Men

Guía interactiva para ver **todo Marvel y X-Men en orden cronológico de la historia**, marcando lo visto episodio a episodio. Pensada para llegar a *Vengadores: Doomsday* (18-12-2026) con los deberes hechos.

**➡️ [ssebv.github.io/maraton-marvel](https://ssebv.github.io/maraton-marvel/)** — instalable como app (PWA) desde el móvil.

## Qué hace

- **134 títulos**: el maratón (17 saga X-Men de Fox, 74 UCM y adyacentes, 26 cómics esenciales) más **La bóveda de animación** — 17 series animadas de Marvel verificadas en el catálogo de Disney+ España vía TMDB — en orden cronológico validado con la comunidad, con notas IMDb, duración, plataforma, reparto con foto y escenas post-créditos.
- **+700 episodios marcables** con fotograma real, fecha y sinopsis anti-spoiler (desenfocada hasta que la pides).
- **Tráilers embebidos y "dónde verla hoy en España"** vía TMDB, con caché de 7 días.
- **Planificación**: cuenta atrás de Doomsday con tu ritmo real, ruta express, plan de sesión según tus horas libres, recordatorios de estreno (aviso al abrir + notificaciones con la PWA instalada).
- **Vistas**: cronológica a dos columnas, por estreno, cómics, listas propias, galería de pósters, línea temporal 1845→∞, modo cine para la tele, y el **multiverso** en tres modos (sistema solar animado, mapa de conexiones canónicas y tarjetas con Tierras enterables).
- **Social sin backend propio**: perfil compartible de solo lectura (todo va codificado en la URL), modo duelo (foto fija o EN VIVO), y club de maratón con ranking, medallas y comentarios por título — sobre una base de Firebase RTDB propia.
- **Sincronización entre dispositivos** (Firebase REST) y estadísticas con logros, racha y mapa de calor.

## Estructura

| Ruta | Qué es |
|---|---|
| `src/data.js` | El dataset: sagas → eras → items, universos del multiverso y calendario `ESTRENOS` |
| `src/episodes.js` | Episodios por serie (extraídos de Wikipedia) |
| `src/posters.js` / `public/posters/` | Índice y archivos de carátulas (pósters oficiales de TMDB en español) |
| `src/people.js` / `public/people/` | Fotos de reparto y dirección |
| `src/tmdb.js` | Mapeo id → TMDB (tráilers, fotogramas, sinopsis, proveedores) |
| `src/App.jsx` / `src/styles.css` | Toda la aplicación (React 19, un solo componente raíz) |
| `public/sw.js` | Service worker: offline + notificaciones periódicas de estreno |
| `scripts/` | Utilidades de datos (episodios y `gen-novedades.mjs`, que alimenta los avisos) |

## Desarrollo

```bash
npm install
npm run build   # genera novedades.json y compila con Vite a dist/ (un solo HTML)
```

**Despliegue**: GitHub Pages sirve la carpeta `docs/` de `main` — tras compilar: `rm -rf docs && cp -R dist docs`, commit y push. El `.nojekyll` es necesario (sin él, Jekyll rompe el build).

**Mantenimiento automático**: una rutina mensual en la nube (Claude Code) investiga estrenos nuevos, actualiza datos/notas/carátulas/episodios, recompila y publica.

---

Hecho con [Claude Code](https://claude.com/claude-code). Datos de episodios de Wikipedia; carátulas, fotogramas y metadatos de [TMDB](https://www.themoviedb.org/) (este producto usa la API de TMDB pero no está avalado ni certificado por TMDB).
