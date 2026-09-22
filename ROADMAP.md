# Hoja de ruta — Maratón Marvel & X-Men

Plan de nuevas funcionalidades y vistas para [ssebv.github.io/maraton-marvel](https://ssebv.github.io/maraton-marvel/).
Ordenado por fases según valor para el usuario y esfuerzo de desarrollo. Actualizado: agosto de 2026.

**🎉 Las 5 fases están completas.** La rutina mensual en la nube mantiene los datos al día.

## ✅ Ya construido

Cronología completa (X-Men + UCM + cómics) · vista por estreno · episodios marcables · fichas con reparto fotografiado · estadísticas por fase · mapa de progreso · cuenta atrás de estrenos · buscador · ruta express · modo compacto · valoraciones y notas personales · compartir progreso como imagen · calendario de actividad con racha · logros/insignias · vista Galería · guía del multiverso con Tierras enterables · PWA instalable · plan de sesión · objetivo Doomsday con ritmo · orden por nota · listas propias · línea temporal del universo · modo cine · sistema solar del multiverso con órbitas propias por Tierra · perfil compartible de solo lectura · sincronización entre dispositivos (Firebase) · código de progreso portable · actualización mensual automática de estrenos (rutina en la nube) · diseño "edición de coleccionista" · catálogo extendido según foros (X-Men: La serie animada, Legion, The Gifted, I Am Groot, Your Friendly Neighborhood Spider-Man, The Punisher: One Last Kill) · auditoría de accesibilidad HIG (zonas táctiles 44pt, contrastes AA, safe areas del notch) · pestaña La bóveda de animación (17 series animadas verificadas en Disney+ España) · temas de acento por universo · diario del maratón · copia de seguridad a archivo · duelo y club en vivo.

---

## Fase 1 — Victorias rápidas (1 sesión cada una)

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| ~~**Insignias y logros**~~ ✅ | Hecho: vitrina de 10 logros en Estadísticas | — |
| ~~**Historial con fechas**~~ ✅ | Hecho: cada marca guarda fecha; calendario de 20 semanas con racha en Estadísticas | — |
| ~~**Ordenar por nota**~~ ✅ | Hecho: chip que alterna cronológico ↔ IMDb ↔ tu nota | — |
| ~~**Vista galería**~~ ✅ | Hecho: pestaña Galería con la pared de pósters | — |
| ~~**PWA instalable**~~ ✅ | Hecho: manifest, icono propio y service worker con caché offline | — |

## Fase 6 — Tras la hoja de ruta (septiembre 2026)

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| ~~**Tema elegible**~~ ✅ | Hecho: Ajustes › Tema (sistema / claro / oscuro), sin destello al cargar, barra del navegador acorde | — |
| ~~**Modo sin spoilers**~~ ✅ | Hecho: sinopsis, post-créditos y títulos de episodio ocultos hasta marcar visto; «Mostrar de todos modos» en la ficha | — |
| ~~**Gama de color medida**~~ ✅ | Hecho: una regla OKLCH por tema y `scripts/gama.mjs` en cada build | — |
| **Calendario en la portada** (15 sep 2026) | Pedido por Sebastián: ver al entrar qué días viste qué y las reseñas y estrellas que pusiste | Medio |
| **Pendiente: el progreso de los amigos** (15 sep 2026) | Pedido por Sebastián, para más adelante: ver cómo van sus amigos con el maratón y cómo valoraron lo que vieron, en sus perfiles. Hay piezas: perfil compartible por enlace (bits de lo visto), modo duelo y club (Firebase). Falta: que el perfil lleve fechas y notas/reseñas (hoy solo bits), una vista «Amigos» con varios perfiles guardados y, para verlo en vivo, la cuenta de Google encendida (`src/nube.js`, `NUBE = null`: Sebastián tiene que crear el proyecto Firebase) | Alto |

## Fase 8 — Mejoras, optimización y funcionalidades (plan del 21 sep 2026)

Pedido por Sebastián: «crea un plan de mejoras y optimización y funcionalidades, continúa con cada etapa».

| Etapa | Qué entra | Estado |
|---|---|---|
| 1 · Revisión | code-review de los commits del 21 sep: 3 hallazgos (aviso de logro con lo sincronizado, un fotograma del segundo aviso, planeta que se quedaba en hover), los 3 arreglados | ✅ |
| 2 · Optimización del arranque | Medido: el JS solo gasta 150 ms de CPU y lo caro es la red (HTML 306 kB gzip, react-dom el 29 %); los datos como JSON no compensaban (2,5 kB gzip las plataformas). Hecho: Preact 10 con preact/compat en lugar de React → 259 kB gzip, usable 2,04 → 1,73 s y LCP 2,55 → 2,22 s (A/B alterno, 4G lenta, CPU ×4). De paso, arreglado un fallo real de los enlaces #c/ y #u/ con Perfil abierto | ✅ |
| 3 · Resumen del mes | Hecho: «Tu mes» en Perfil (horas, títulos, episodios, días activos y racha; la saga que más viste y la diferencia con el mes anterior; tu favorito del mes con su carátula; meses anteriores con ‹ ›) y «Compartir mi mes» como imagen 1080×1350 | ✅ |
| 4 · Comunidades, fase 5 | Hecho: cola de reportes (en la comunidad para quien modera, en Comunidades para la administración: ver, ocultar y resolver, descartar), bloquear y reportar desde el perfil público (migración 20260921120000: el perfil de alguien bloqueado ya no desaparece), editar hilo y respuesta propios en 24 h. Sonda `moderacion` (15) contra el Supabase local | ✅ |
| 5 · Multiverso reinventado (22 sep) | Pedido por Sebastián con captura: planetas cuadrados en el iPhone (Safari no recortaba la textura animada con overflow+radio: ahora clip-path) y textura sin la franja de la Antártida. El Sistema se mide con el ancho (fuera el scale(.48)), cuatro anillos con sentido (Rumbo a Doomsday, Tierras arácnidas, Otras ramas, Fuera del tiempo), arco de progreso en cada planeta, resumen «X % del multiverso · N de 11 Tierras», índice por anillo y tarjetas con su barra. Textos revisados con el video de StickVengadores y fuentes (616 por el libro oficial de 2023, Sony = Tierra-688, Zombies = Tierra-89521, Black Bolt y Mordo en la 838, Cassandra Nova en el Vacío) y «Rumbo a Doomsday» en cuatro Tierras | ✅ |
| 6 · Multiverso, segunda vuelta (22 sep) | Pedido por Sebastián: «en Sony solo veo una película», los 4 Fantásticos antiguos como opcional y algo para saber qué planeta es. Hecho: el lote «sony» se parte en 11 películas (Raimi 1–3, Amazing 1–2, Venom 1–3, Morbius, Madame Web, Kraven) y «fox4f» en 3, con carátula, títulos ES/MX/EN y plataformas por país; las marcas y listas del lote pasan a cada película con su fecha. Tierra-121698 (4F de Fox) nueva y opcional (pista punteada, fuera del total). Preselección en el Sistema: el primer toque enseña nombre y ficha y para el giro, el segundo entra. En cada Tierra: «Siguiente», «Se cruza con», «Solo lo que falta» y cabecera compacta en el móvil. Mapa a 800 de alto con Venom 2, Spider-Man 2, Amazing 2 y los 4F de 2005; panel y ayuda ya no se salen por la derecha | ✅ |

## Fase 7 — Comunidades (plan del 16 sep 2026; decidido «como recomiendas» y TODO GRATIS)

**Estado:** fases 1 y 2 hechas y probadas contra un Supabase local (`npm run comunidad:sonda`: reglas 69/69 y cuenta de punta a punta). La cuenta está en la app, apagada: se enciende pegando Project URL + anon key en `src/nube.js` tras crear el proyecto (supabase/LEEME.md). Perfil público `#u/…`, seguir, buscar por @ y «Sigues a…» también hechos (fase 2 completa). Fase 3 en marcha: comunidades (crear, descubrir, unirse, invitar con #i/, ranking 7/30 días) hechas. Retos con fecha y muro con aplausos también hechos: fase 3 completa. Fase 4 hecha: foros por título y por comunidad, hilos con velo según tu progreso, spoilers en línea, menciones, votos, respuestas anidadas, reportes, avisos y moderación. Siguiente: fase 5 (cola de reportes para moderar dentro de la app, bloquear desde el perfil, editar en 24 h).

Pedido por Sebastián: cuentas y comunidades «como Strava y Reddit» para discutir. Plan completo en https://claude.ai/artifact/UmawtDJQyyyoTF2z8qm7qc. Recomendado: Supabase (Postgres + RLS + Auth Google/correo + Realtime) en vez del Firebase apagado de `src/nube.js`; edad mínima 14 (Ley 21.719); solo votos a favor al principio; muro de actividad opcional.

| Fase | Qué entra | Esfuerzo |
|---|---|---|
| 1 · Cimientos y normas | Proyecto Supabase, tablas y reglas por fila en migraciones, normas y privacidad, sondas de acceso | 1 jornada |
| 2 · Cuenta y perfil público | Google + correo, @nombre, progreso en la nube, perfil `#u/…` con privacidad, seguir personas (cubre «el progreso de los amigos»), borrar y descargar datos | 2 jornadas |
| 3 · Comunidades (Strava) | Públicas/privadas/invitación, papeles, ranking semanal, retos con fecha, muro opt-in, migrar clubes viejos | 2–3 jornadas |
| 4 · Discusiones (Reddit) | Hilos por comunidad y por título/episodio, etiquetas, votos, respuestas anidadas, **velo anti-spoilers según tu progreso**, menciones y avisos | 3 jornadas |
| 5 · Moderación | Reportes y cola, ocultar/expulsar/bloquear/suspender, límites por hora en la base, filtro de enlaces pirata, registro | 2 jornadas |

## Fase 2 — Planificación del maratón

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| ~~**Plan de sesión**~~ ✅ | Hecho: modal 🍿 con horas disponibles y propuesta en orden (películas completas + capítulos sueltos) | — |
| ~~**Objetivo Doomsday**~~ ✅ | Hecho: ritmo necesario vs. tu ritmo real de 2 semanas, con semáforo en la cuenta atrás | — |
| ~~**Recordatorios de estreno**~~ ✅ | Hecho: aviso "desde tu última visita" al abrir + notificaciones del sistema con la PWA instalada (botón 🔔 en la cuenta atrás) | — |
| ~~**Escenas post-créditos**~~ ✅ | Hecho: cada ficha de película dice cuántas escenas hay en los créditos y avisa de las imprescindibles | — |
| ~~**Listas propias**~~ ✅ | Hecho: pestaña Listas con progreso independiente, buscador para añadir y chips en cada ficha; sincronizadas | — |

## Fase 3 — Contenido enriquecido (TMDB) ✅ COMPLETA

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| ~~**Fotogramas por episodio**~~ ✅ | Hecho: imagen real de cada capítulo en las fichas, desde TMDB con caché de 7 días | — |
| ~~**Tráilers integrados**~~ ✅ | Hecho: reproductor de YouTube dentro de la ficha (con enlace externo de respaldo) | — |
| ~~**Sinopsis por episodio**~~ ✅ | Hecho: botón ⓘ por episodio; si no lo has visto, sale desenfocada hasta que pulses | — |
| ~~**Dónde ver actualizado**~~ ✅ | Hecho: "Hoy en España" en cada ficha con las plataformas al día | — |

## Fase 4 — Vistas nuevas ✅ COMPLETA

| Vista | Qué es | Esfuerzo |
|---|---|---|
| ~~**Línea temporal del universo**~~ ✅ | Hecho: pestaña con eje central 1845→∞, X-Men/UCM a cada lado y saltos de décadas señalados | — |
| ~~**Mapa del multiverso**~~ ✅ | Hecho: modo 🕸️ Mapa en Multiverso — 19 títulos y 17 conexiones canónicas explicadas; pulsa un nodo para iluminar sus vínculos y saltar de ficha en ficha | — |
| ~~**Modo cine (TV)**~~ ✅ | Hecho: pantalla completa con pósters gigantes, ←/→/Enter/Esc y marcar vista sin salir | — |
| ~~**Perfil compartible**~~ ✅ | Hecho: botón 👤 genera un enlace corto de solo lectura (progreso, valoraciones y logros codificados en la propia URL, sin servidor) | — |

## Fase 5 — Social ✅ COMPLETA

- ~~**Modo duelo**~~ ✅: pega el enlace de perfil de otra persona y compara maratones — barras, quién va delante, títulos en común y los que te faltan.
- ~~**Multi-perfil en vivo**~~ ✅: el duelo también acepta el código de sincronización ☁️ del rival y se actualiza solo desde su Firebase (insignia EN VIVO, refresco cada minuto y al volver a la pestaña).
- ~~**Club de maratón**~~ ✅: sala compartida en Firebase para 2+ personas — ranking en vivo con medallas y media del club, cada miembro publica su avance al marcar, y comentarios por título en cada ficha (velados hasta que hayas visto ese título).

---

### Criterio de priorización

1. **Fase 1 primero**: máximo valor visible con mínimo riesgo; ninguna depende de servicios externos.
2. La **Fase 3** entera se desbloquea con una sola cosa: crear una cuenta gratuita en [themoviedb.org](https://www.themoviedb.org/) y pasar la clave de API.
3. Las vistas de **Fase 4** son las más vistosas pero conviene hacerlas cuando el contenido (Fase 3) ya esté enriquecido.
4. La rutina mensual de estrenos ya mantiene los datos al día en todas las fases.
