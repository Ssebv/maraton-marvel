# Hoja de ruta — Maratón Marvel & X-Men

Plan de nuevas funcionalidades y vistas para [ssebv.github.io/maraton-marvel](https://ssebv.github.io/maraton-marvel/).
Ordenado por fases según valor para el usuario y esfuerzo de desarrollo. Actualizado: agosto de 2026.

## ✅ Ya construido

Cronología completa (X-Men + UCM + cómics) · vista por estreno · episodios marcables · fichas con reparto fotografiado · estadísticas por fase · mapa de progreso · cuenta atrás de estrenos · buscador · ruta express · modo compacto · valoraciones y notas personales · compartir progreso como imagen · calendario de actividad con racha · logros/insignias · vista Galería · guía del multiverso con Tierras enterables · PWA instalable · plan de sesión · objetivo Doomsday con ritmo · orden por nota · listas propias · línea temporal del universo · modo cine · sistema solar del multiverso con órbitas propias por Tierra · perfil compartible de solo lectura · sincronización entre dispositivos (Firebase) · código de progreso portable · actualización mensual automática de estrenos (rutina en la nube) · diseño "edición de coleccionista" · catálogo extendido según foros (X-Men: La serie animada, Legion, The Gifted, I Am Groot, Your Friendly Neighborhood Spider-Man, The Punisher: One Last Kill) · auditoría de accesibilidad HIG (zonas táctiles 44pt, contrastes AA, safe areas del notch).

---

## Fase 1 — Victorias rápidas (1 sesión cada una)

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| ~~**Insignias y logros**~~ ✅ | Hecho: vitrina de 10 logros en Estadísticas | — |
| ~~**Historial con fechas**~~ ✅ | Hecho: cada marca guarda fecha; calendario de 20 semanas con racha en Estadísticas | — |
| ~~**Ordenar por nota**~~ ✅ | Hecho: chip que alterna cronológico ↔ IMDb ↔ tu nota | — |
| ~~**Vista galería**~~ ✅ | Hecho: pestaña Galería con la pared de pósters | — |
| ~~**PWA instalable**~~ ✅ | Hecho: manifest, icono propio y service worker con caché offline | — |

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

## Fase 5 — Social (el salto grande)

- ~~**Modo duelo**~~ ✅: pega el enlace de perfil de otra persona y compara maratones — barras, quién va delante, títulos en común y los que te faltan.
- ~~**Multi-perfil en vivo**~~ ✅: el duelo también acepta el código de sincronización ☁️ del rival y se actualiza solo desde su Firebase (insignia EN VIVO, refresco cada minuto y al volver a la pestaña).
- **Club de maratón**: progreso medio del grupo, quién va más adelantado, comentarios por episodio con anti-spoilers.

---

### Criterio de priorización

1. **Fase 1 primero**: máximo valor visible con mínimo riesgo; ninguna depende de servicios externos.
2. La **Fase 3** entera se desbloquea con una sola cosa: crear una cuenta gratuita en [themoviedb.org](https://www.themoviedb.org/) y pasar la clave de API.
3. Las vistas de **Fase 4** son las más vistosas pero conviene hacerlas cuando el contenido (Fase 3) ya esté enriquecido.
4. La rutina mensual de estrenos ya mantiene los datos al día en todas las fases.
