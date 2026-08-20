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

## Criterios de diseño

La hoja de estilos tiene reglas fijas. Se revisaron en agosto de 2026 para que la interfaz no arrastrase los tics que delatan una plantilla generada:

- **Radios**: solo cuatro tokens — `--r-s: 4px`, `--r-m: 10px`, `--r-l: 16px`, `--r-pill: 999px`. No se escriben valores sueltos en `border-radius` (antes había 17 distintos).
- **Tipografía**: siete pasos — `--t-xs: 11px`, `--t-s: 12px`, `--t-m: 13px`, `--t-b: 15px` (base), `--t-l: 19px`, `--t-xl: 24px`, `--t-xxl: 40px`. Antes había 25 tamaños distintos, nueve de ellos entre 9,5 y 13,5 px, que el ojo no distingue pero impiden que dos bloques se alineen. La única excepción permitida es el `clamp()` del titular del hero, que es fluido.
- **Espacio**: ritmo de 4/8 en nueve pasos — `--e-1: 2px` (detalle fino), `--e-2: 4px`, `--e-3: 8px`, `--e-4: 12px`, `--e-5: 16px`, `--e-6: 24px`, `--e-7: 32px`, `--e-8: 48px`, `--e-9: 64px`. Se aplican a `padding`, `margin` y `gap` (antes: 31 rellenos y 19 separaciones distintos). Quedan fuera a propósito los valores de composición que reservan sitio a un elemento concreto — el hueco de los planetas (82/88/210 px), la escala del sistema solar (−180 px) y los `calc()` con `env(safe-area-inset-*)`.
  Un negativo se escribe `calc(-1 * var(--e-N))`, y **un margen negativo y su relleno pareja deben usar el mismo token** o el carril se descuadra (`.proximos` y `.controles` dependen de ello).
- **Emoji**: nunca en controles (botones, pestañas, chips) ni en los textos que los nombran; un control debe explicarse con palabras. Sí donde son contenido: logros y medallas, estrellas de nota (★), marcas de verificación (✓) y cierres (✕).
- **Prohibidos**: resplandores (`box-shadow: 0 0 Npx <acento>`), cristal esmerilado (`backdrop-filter` como superficie — solo se admite en el velo del modal), degradado sobre texto (`background-clip: text`), halos radiales o tramas de puntos de fondo, y barras de acento a la izquierda de una tarjeta.
- **Identidad, no se toca**: Archivo Black como tipografía de titular, la paleta pergamino/tinta del modo claro, el sello VISTA, los degradados rojo→dorado de las barras de progreso y la sombra sólida desplazada (`5px 6px 0`) del hover de tarjeta.
- **Contraste**: todo texto pequeño llega a 4,5:1 contra la superficie **más exigente** en la que se apoya, no contra el panel de ejemplo. En claro esa superficie es `--panel2` (#EAE2CC), en oscuro también `--panel2` (#1C2133). Por eso `--ink3` es #6A6554 / #898793 y no un gris más suave: bajar de ahí incumple en las fechas de episodio, el diario y los comentarios del club, que van sobre `panel2`. Para el dorado hay un alias `--gold-texto` (#885C08 en claro, igual que `--gold` en oscuro): `--gold` se queda para titulares de saga y barras, donde el tamaño ya da el mínimo de 3:1.
- **Zonas táctiles**: 44 px como mínimo, con el patrón de `.checkbox` — el elemento conserva su tamaño visual y un `::after` con `inset` negativo agranda solo el área. Así están `.cerrar` (34 visibles / 44 táctiles), `.ep-sin-btn` (28 / 44), `.estrella` y `.nav-ficha` (44 reales). **Excepción consciente: los puntos del mapa de progreso.** Con 134 puntos, un área de 44 px se solaparía tres veces con sus vecinos y el dedo abriría el título equivocado — que es justo lo que pasaba con el `inset: -6px` anterior sobre un paso de 16 px. Ahora cada zona ocupa exactamente su paso (`inset: -2px`), sin solape ni hueco muerto. El mapa es una vista de conjunto con atajo, no el camino principal: cada título se abre desde la lista, donde sí hay 44 px.
- **Bloques de aviso**: una sola caja `.aviso` con tres intenciones — neutro (no hay nada), `.info` dorado (algo que conviene saber) y `.peligro` rojo (vas a destruir algo). El rojo, solo para lo destructivo.
- **Movimiento**: tres curvas y cuatro duraciones. `--curva` para casi todo, `--curva-rebote` solo para la confirmación de la casilla y `--curva-hoja` (la de iOS) para la hoja móvil; `--dur-corta/media/larga` más `--dur-barra`. Ninguna transición incluye `color` ni `border-color`: bajo `color-scheme: light dark` congela el valor al cambiar de tema. Nada de `transition: all`.
- **Movimiento con criterio**: una interacción anima **una cosa**, no cuatro a la vez —el hover de tarjeta se repite 134 veces por pantalla, así que ahí el listón es más alto que en un diálogo. Nada por encima de 300 ms en interfaz (las barras de progreso son la excepción: recorren mucha distancia). Solo se animan `transform` y `opacity`; `width`, `letter-spacing` y compañía recalculan la maquetación en cada fotograma.
- **Movimiento y accesibilidad**: con `prefers-reduced-motion: reduce` se quita el movimiento, **no la información**. Apagar todo con `*{animation:none; transition:none}` se lleva por delante la confirmación de la casilla, el relleno de las barras y el sello — que son justo lo que explica qué acaba de pasar. Lo que se quita son desplazamientos, giros y bucles infinitos. Y el movimiento de `:hover` va detrás de `@media (hover: none), (pointer: coarse)`: en táctil un toque deja el elemento levantado hasta que tocas otra cosa.
- **Datos de fuera**: todo lo que llega de la URL, de Firebase o de TMDB se valida por tipo antes de usarse, no solo con `try/catch`. `src/main.jsx` envuelve la app en un error boundary que, ante un fallo, ofrece descargar una copia del progreso.
- **Responsive**: se verifica inyectando un `<iframe>` de 390 px en la propia página — redimensionar la ventana del navegador no dispara bien las media queries si hay zoom de página. Todo elemento con `overflow-x` necesita `min-width: 0` en sus contenedores, y con `scroll-snap`, `scroll-padding-inline` para que el carril no arranque desplazado.

## Desarrollo

```bash
npm install
npm run build   # genera novedades.json y compila con Vite a dist/ (un solo HTML)
```

**Despliegue**: GitHub Pages sirve la carpeta `docs/` de `main` — tras compilar: `rm -rf docs && cp -R dist docs`, commit y push. El `.nojekyll` es necesario (sin él, Jekyll rompe el build).

**Mantenimiento automático**: una rutina mensual en la nube (Claude Code) investiga estrenos nuevos, actualiza datos/notas/carátulas/episodios, recompila y publica.

---

Hecho con [Claude Code](https://claude.com/claude-code). Datos de episodios de Wikipedia; carátulas, fotogramas, reparto y metadatos de [TMDB](https://www.themoviedb.org/) (este producto usa la API de TMDB pero no está avalado ni certificado por TMDB). La disponibilidad por plataforma y los logos de cada servicio vienen de [JustWatch](https://www.justwatch.com/) a través de TMDB — **los logos de marca no se dibujan a mano ni se guardan en el repo**: se sirven desde `image.tmdb.org`, que es el canal previsto para ello.
