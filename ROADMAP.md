# Hoja de ruta — Maratón Marvel & X-Men

Plan de nuevas funcionalidades y vistas para [ssebv.github.io/maraton-marvel](https://ssebv.github.io/maraton-marvel/).
Ordenado por fases según valor para el usuario y esfuerzo de desarrollo. Actualizado: agosto de 2026.

## ✅ Ya construido

Cronología completa (X-Men + UCM + cómics) · vista por estreno · episodios marcables · fichas con reparto fotografiado · estadísticas por fase · mapa de progreso · cuenta atrás de estrenos · buscador · ruta express · modo compacto · valoraciones y notas personales · compartir progreso como imagen · calendario de actividad con racha · logros/insignias · vista Galería · guía del multiverso con Tierras enterables · PWA instalable · plan de sesión · objetivo Doomsday con ritmo · orden por nota · listas propias · línea temporal del universo · modo cine · sistema solar del multiverso · sincronización entre dispositivos (Firebase) · código de progreso portable · actualización mensual automática de estrenos (rutina en la nube) · diseño "edición de coleccionista".

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
| **Recordatorios de estreno** | Notificación (PWA) cuando salga un episodio nuevo de una serie en emisión que sigues | Medio |
| ~~**Listas propias**~~ ✅ | Hecho: pestaña Listas con progreso independiente, buscador para añadir y chips en cada ficha; sincronizadas | — |

## Fase 3 — Contenido enriquecido (requiere clave gratuita de TMDB)

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| **Fotogramas por episodio** | Imagen real de cada capítulo en las fichas (lo que Wikipedia no ofrece) | Medio |
| **Tráilers integrados** | Reproductor de YouTube dentro de la ficha en vez de enlace externo | Bajo |
| **Sinopsis por episodio** | Resumen de cada capítulo con aviso anti-spoiler (desenfocado hasta pulsar) | Medio |
| **Dónde ver actualizado** | Plataformas de streaming al día por país vía TMDB providers | Medio |

## Fase 4 — Vistas nuevas

| Vista | Qué es | Esfuerzo |
|---|---|---|
| ~~**Línea temporal del universo**~~ ✅ | Hecho: pestaña con eje central 1845→∞, X-Men/UCM a cada lado y saltos de décadas señalados | — |
| **Mapa del multiverso** | Grafo de conexiones entre títulos (el sistema solar ya cubre la navegación entre universos; esto añadiría conexiones título a título) | Alto |
| ~~**Modo cine (TV)**~~ ✅ | Hecho: pantalla completa con pósters gigantes, ←/→/Enter/Esc y marcar vista sin salir | — |
| **Perfil compartible** | Página pública de solo lectura con tu progreso y valoraciones, para enseñar sin dar acceso de edición | Alto |

## Fase 5 — Social (el salto grande)

- **Multi-perfil**: varios usuarios sobre la misma base de Firebase (cada uno su progreso, vista comparada "yo vs. mi pareja").
- **Club de maratón**: progreso medio del grupo, quién va más adelantado, comentarios por episodio con anti-spoilers.

---

### Criterio de priorización

1. **Fase 1 primero**: máximo valor visible con mínimo riesgo; ninguna depende de servicios externos.
2. La **Fase 3** entera se desbloquea con una sola cosa: crear una cuenta gratuita en [themoviedb.org](https://www.themoviedb.org/) y pasar la clave de API.
3. Las vistas de **Fase 4** son las más vistosas pero conviene hacerlas cuando el contenido (Fase 3) ya esté enriquecido.
4. La rutina mensual de estrenos ya mantiene los datos al día en todas las fases.
