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
| 7 · Revisión y rasgos (22 sep) | code-review high de los dos commits del Multiverso: 3 hallazgos, los 3 arreglados (nombres invisibles que robaban el toque al planeta vecino, el reinicio de 2015 contado sin decirlo, estrellas y notas de los lotes partidos que se perdían: pasan a la primera película). Rasgos propios para reconocer los planetas sin nombre: anillo de escombros en el Vacío, trama de cómic en la 616 de papel, luna en la 828 y negro de simbionte en Sony | ✅ |
| 8 · Conexiones y teclado (22 sep) | «Cómo se conecta» en cada Tierra (los cruces del Mapa que tocan sus títulos; tocar abre la ficha del otro), flechas del teclado de planeta en planeta (del centro hacia fuera), Esc y clic en el vacío quitan la preselección, rasgos para What If (órbitas cruzadas de sus ramas) y Zombies (manchas de la plaga); revisado en tema claro | ✅ |
| 9 · Inicio estilo Netflix (22 sep) | Pedido por Sebastián: «mejorar cómo el usuario va viendo las películas, más estilo Netflix». Pestaña Inicio, primera del Maratón y la que abre sin hash: cartelera con el fotograma del siguiente título (puesto en el maratón, nota, año, duración, episodio por el que vas, sinopsis si no hay modo sin spoilers) y «Marcar vista» / «Más información»; filas deslizables: Continuar viendo (series empezadas con barra y episodio), A continuación, Rumbo a Doomsday, Top 10 con números en contorno, Visto hace poco, Tus favoritas y una fila por era. El panel grande arranca plegado (se recuerda si lo abres). Sonda `inicio` (14) | ✅ |
| 10 · Inicio, segunda vuelta (22 sep) | La cartelera entra entera en la primera pantalla del móvil (el calendario baja a Inicio, bajo la cartelera), fila «Próximamente» con los estrenos y su fecha (los del catálogo abren su ficha), una fila por cada lista tuya con su propio progreso, y en escritorio título, año, nota y duración al pasar el ratón por una carátula | ✅ |
| 11 · Rendimiento de Inicio (22 sep) | Medido A/B alterno (4G lenta, CPU ×4): Inicio había subido el LCP de 2,3 a 4,8 s (la foto de TMDB de la cartelera) sin cambiar el «usable» (~1,95 s). Hecho: la carátula local difuminada se pinta al instante bajo la cartelera y la foto se funde encima (a ~3 s ya hay imagen donde antes había negro hasta ~4,9 s; el LCP sigue marcando la llegada de la foto, ~4,6 s, porque es un poco mayor); filas con content-visibility (1.005 → 770 kB en la primera carga: las filas fuera de pantalla no bajan sus carátulas); Inicio memorizado (solo se repinta si cambian sus datos); prioridad alta a la foto y baja a las carátulas de las filas (bloqueo del hilo 321 → 125 ms, usable −170 ms). La sonda de arranque mide la entrada real (Inicio) y exige que lo usable se vea. Descartado: separar el inglés del HTML (−39 kB gzip, ~0,2 s solo en la primera carga, y el buscador usa esos títulos también en español) | ✅ |
| 12 · Inicio con movimiento y detalles (22 sep) | La cartelera entra escalonada (etiqueta, título, datos, botones) y la foto se asienta con un zoom leve; al marcar vista, la del siguiente título entra con la misma animación (se nota que avanzaste); parallax al bajar; las filas suben al entrar en pantalla, las carátulas se funden al cargar y los carriles se desvanecen por el borde que sigue; sombra al pasar el ratón en escritorio; la etiqueta dice la era con su color y cada fila de era lleva su barrita de progreso. Todo con transform/opacity y quieto con «reducir movimiento». Medido: sin coste en el toque ni en el desplazamiento (5+3 rondas A/B, 0 fotogramas lentos) | ✅ |
| 13 · Inicio: tráiler y ajustes visuales (22 sep) | Botón «Tráiler» en la cartelera (el mismo de la ficha, TMDB con caché): se reproduce dentro de la cartelera, arriba, con el texto debajo; en el móvil «Más información» queda en su icono para que quepan los tres botones. «Continuar viendo» dice cuántos episodios quedan. Lo visto solo se atenúa en las filas de era (en «Visto hace poco» y «Tus favoritas» todo se veía lavado). La nota vuelve al punto decimal (6.5) como en tarjetas y ficha | ✅ |
| 14 · Revisión de Inicio (22 sep) | code-review high de 064566d..HEAD: 1 hallazgo (medio), arreglado: buscando en Inicio la cartelera seguía con el siguiente global, decía «0 / 3» y «A continuación» se comía el primer resultado; ahora el siguiente sale de la misma lista filtrada, y sin pendientes distingue «Nada coincide», «Ya viste todo lo que coincide» y «Lo viste todo». En el móvil, en Inicio el titular va en una línea y sin la etiqueta roja: la cartelera empieza a ~250 px y sus botones acaban a ~665 (antes ~415 / ~830) | ✅ |
| 15 · Marca rápida y «Ver todo» (22 sep) | Cada carátula de Inicio (salvo tus listas y Próximamente) lleva un círculo que marca o desmarca sin abrir la ficha, con Deshacer al desmarcar: marcar lo ya visto al empezar deja de ser abrir 30 fichas. «Ver todo ›» en cada fila de era lleva a esa era en Cronológico (desplegada y con su cabecera arriba). Arreglada una regresión del 12: las carátulas de Próximamente salían invisibles (el fundido de las filas las dejaba en opacidad 0) | ✅ |
| 16 · Guía para quien empieza y revisión (22 sep) | Con 0–2 títulos marcados, Inicio explica bajo la cartelera que se puede marcar de un toque lo ya visto (se cierra una vez y no vuelve). Filas anunciadas por su título a lectores de pantalla. code-review medium de 7e82d90..HEAD: 3 hallazgos, los 3 arreglados («Ver todo» con «Solo pendientes» caía arriba de la lista: cada era lleva su id y, si está entera escondida, se quita ese filtro; el salto reintenta hasta que la lista está pintada; «Solo pendientes» ya no cuenta como filtro en la cartelera vacía) | ✅ |
| 17 · Inicio en escritorio (22 sep) | Las dos cajas de cifras de la cabecera (repetían el «5 / 111» de la cartelera) se cambian en Inicio por la línea de progreso compacta; cartelera algo más baja: a 1280×800 sus botones quedan a la vista (acababan en 843 px, ahora en 766); carátulas de las filas más grandes (a 1280 px entraban siete y pico) | ✅ |
| 18 · Inicio sin conexión (22 sep) | El service worker guarda las fotos de TMDB (caché primero, caché propia permanente con tope de 80: son respuestas opacas) y, si una foto no llega, la carátula local ocupa su sitio en las filas anchas y la cartelera se queda con la suya: sin conexión Inicio sale completo y en las visitas siguientes la foto de la cartelera sale de la caché | ✅ |
| 19 · Precarga de la cartelera (22 sep) | Mientras miras la cartelera se bajan en un momento libre la foto y la carátula de los dos títulos siguientes: al marcar vista, la foto nueva aparece en ~50 ms en vez de ~400–570 (4G lenta, A/B). La etiqueta dice «Siguiente con tus filtros» cuando hay búsqueda o filtros | ✅ |
| 20 · Barra ordenada (22 sep) | La barra mezclaba 6 filtros, 4 acciones y el buscador en un carril que había que deslizar: ahora Buscar, Filtros (con cuántos hay puestos) y Más caben sin deslizar en el móvil. Los filtros pasan a una hoja con su nombre y qué hace cada uno; Plan de sesión, Horario, Modo cine y Sorpréndeme, a la hoja «Más» | ✅ |
| 21 · Revisión de la barra (22 sep) | code-review medium: 5 hallazgos, los 5 atendidos. Alto: las hojas nuevas no llamaban a `useVolverCierra` (atrás sacaba de la vista con la hoja abierta). De paso, una carrera vieja de `conciliaAtras`: cerrar una capa y abrir otra antes de que llegara el popstate dejaba la nueva sin su paso atrás; ahora el consumo se aplaza 120 ms y se cancela si vuelve a haber capas. Medio: «Quitar todos» se desmontaba bajo el foco (ahora queda deshabilitado). Bajos: `aria-haspopup="dialog"` en vez de `aria-pressed`, condicional vacío y separador muertos, y la sonda preguntaba por la hoja que salía | ✅ |

## Fase 9 — Jornada del 23 sep 2026: documentación, estilo Norte, escritorio, Inicio e iOS

32 commits. Todo en producción y con las sondas en verde.

| Bloque | Qué entra | Estado |
|---|---|---|
| Documentación para usuarios | README para quien usa la app (lo técnico pasa a DESARROLLO.md, sin «hecho con Claude Code») con capturas en español y del teléfono (`npm run capturas`); README.en, PREGUNTAS-FRECUENTES / FAQ, NOVEDADES / WHATS-NEW, TRANSLATING; cinco formularios de aviso bilingües; Discusiones abiertas con plantillas y bienvenida | ✅ |
| Inglés | Nombres de Tierras, cuándo ocurre cada título y autores en inglés; `npm test` avisa de textos sin traducir; sonda `ingles`; carátulas en inglés de TMDB (`npm run posters-en`) | ✅ |
| Estilo Norte | La forma de la app de ahorro (Norte) con los colores de Marvel: letra del sistema, superficies con filo y brillo, píldoras, dock con halo, odómetro en las cifras, foco que sigue al ratón, selectores segmentados, logros en burbuja | ✅ |
| Vistas previas | Desfile de fotogramas de TMDB en la cartelera y tarjeta que crece sobre una carátula (ratón) o al mantener el dedo; el tráiler mudo de YouTube se descartó (pinta sus controles) | ✅ |
| iOS (avisos) | Sin servidor de push: «Estrenos en mi calendario» (webcal a `estrenos.ics`, generado al compilar, con aviso a las 10:00), avisos en los .ics sueltos, guía de instalación en Safari, persistencia pedida al instalar | ✅ |
| Escritorio: barra lateral | Desde 1100 px, lateral traslúcida de 304 px (marca, búsqueda, Filtros y Más, vistas, Noticias / Visto hace poco, cuenta atrás, cuenta) que se aprieta sola para no desplazarse; el contenido a todo el ancho; el panel de mapa, estrenos y cuenta atrás solo como panel vertical («Tu maratón», sin desplazar); vistas que usan el ancho | ✅ |
| Inicio | Selector X-Men / UCM encima de la cartelera y filas «Sigue en…»; eras agrupadas por universo con las completas en una línea; cartelera con el color de su universo y, a la derecha, carátula, dónde verla y lo que sigue; «Tu semana» con carátulas, racha, descanso y «Hoy toca» | ✅ |
| Noticias | `scripts/noticias.mjs` (RSS de Espinof, Cinemascomics, IGN, SuperHeroHype; Google Noticias no, por sus condiciones), imágenes servidas desde la app, tarea diaria `.github/workflows/noticias.yml` que hace commit en main | ✅ |
| Rendimiento | LCP de Inicio 6,5 → 2,3–2,7 s (precarga desde index.html, sin fundido, `nfLazy` en vez de loading=lazy); 1.191 → 800 kB; filas de Inicio en dos tiempos, sin precargar Archivo, navegación del service worker con 2,5 s de paciencia; sonda `safari` (WebKit) | ✅ |

### 24 sep 2026 — Auditoría iOS

| Qué | Estado |
|---|---|
| Ningún hover se queda pegado tras tocar (63 reglas dentro de `(hover:hover)`; «Sin spoilers» apagado ya no parece encendido) | ✅ |
| Sin zoom al enfocar «Reportar» ni el buscador de la lateral en iPad | ✅ |
| Ficha y plan con `dvh`: no se meten bajo la barra de Safari | ✅ |
| Pantalla de arranque del iPhone Air (vertical y horizontal, claro y oscuro) | ✅ |
| Panel lateral en el móvil: sale con un botón o arrastrando desde el borde (instalada), sigue al dedo, y atrás o tocar fuera lo cierran | ✅ |
| Auditoría por dispositivos (SE, 17, Pro Max, horizontal, iPad): cabecera compacta en horizontal, «Marcar» ya no pisa el título, segmentados y atajos de 44 px en iPad | ✅ |
| Modo compacto con la misma línea de tiempo y miniaturas; el idioma del documento sigue al de la app (VoiceOver con la voz correcta) | ✅ |
| Línea de tiempo con el año bajo cada nodo y «Siguiente» destacado; deslizar entre vistas con la rayita que sigue al dedo y una píldora con el destino | ✅ |
| Cronológico en el móvil rediseñado como línea de tiempo: nodo = casilla, tramo visto en verde, tarjetas un 27 % más bajas (también en Cómics y Animación) | ✅ |
| Foro tipo Reddit preparado (oculto hasta encender la nube): sección «Comunidad» con portada En alza / Nuevos / Top semana, filtros y publicar eligiendo título; `npm run nube:encender` lo enciende todo tras `npx supabase login` | ✅ |
| Scroll más fluido: cartelera fija (no cambia sola), animaciones decorativas en pausa al desplazar, filas con su altura real (sin saltos en Safari) | ✅ |
| Deslizar: a la derecha en Inicio abre el panel desde cualquier punto; a los lados cambia de vista (Cronológico, Por estreno…) | ✅ |
| Sin panel en la página: el mapa, los estrenos y la cuenta atrás se abren dentro del panel lateral («Tu maratón») | ✅ |
| Que se vea el panel: pestaña fija en el borde izquierdo y una pista la primera vez | ✅ |
| Inicio: cabeceras de fila con el nombre en una línea y los datos debajo, «Tu semana» a todo el ancho, medalla al completar un universo | ✅ |

### Pendiente (siguientes jornadas)

- **Login y datos en la nube** (desde el 24 sep: `npx supabase login` + `npm run nube:encender`): el código de la cuenta (Google o enlace por correo) y las comunidades está hecho y apagado (`src/nube.js`). Falta que Sebastián entre a Supabase (`! npx supabase login`) para crear el proyecto gratis (São Paulo), aplicar las migraciones y encenderlo; Google pide un paso suyo en su consola (supabase/LEEME.md). Con eso, también push de verdad en iOS.
- **A mano en GitHub**: fijar la bienvenida de Discusiones y subir `docs/social.jpg` en Settings › Social preview.
- Tarjetas de cómics más compactas (texto corto junto a una carátula alta).
- Probar en un iPhone real: suscripción al calendario, vibración al mantener una carátula y la apertura sin señal.

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
