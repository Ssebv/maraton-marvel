# Hoja de ruta — Maratón Marvel & X-Men

Plan de nuevas funcionalidades y vistas para [ssebv.github.io/maraton-marvel](https://ssebv.github.io/maraton-marvel/).
Ordenado por fases según valor para el usuario y esfuerzo de desarrollo. Actualizado: agosto de 2026.

## ✅ Ya construido

Cronología completa (X-Men + UCM + cómics) · vista por estreno · episodios marcables · fichas con reparto fotografiado · estadísticas por fase · mapa de progreso · cuenta atrás de estrenos · buscador · ruta express · modo compacto · valoraciones y notas personales · compartir progreso como imagen · sincronización entre dispositivos (Firebase) · código de progreso portable · actualización mensual automática de estrenos (rutina en la nube) · diseño "edición de coleccionista".

---

## Fase 1 — Victorias rápidas (1 sesión cada una)

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| **Insignias y logros** | Medallas al completar hitos: una fase entera, la trilogía del Capi, todo X-Men, 100 h vistas… con vitrina en Estadísticas | Bajo |
| **Historial con fechas** | Guardar *cuándo* marcas cada título para pintar un calendario de actividad tipo GitHub (racha de días de maratón incluida) | Bajo |
| **Ordenar por nota** | En cada era, alternar orden cronológico ↔ por nota IMDb ↔ por tu nota personal | Bajo |
| **Vista galería** | Cuadrícula de solo pósters (sin texto), como estantería de coleccionista; clic abre la ficha | Bajo |
| **PWA instalable** | Manifest + service worker: icono en el móvil, apertura a pantalla completa y funcionamiento offline (los pósters ya son locales) | Medio |

## Fase 2 — Planificación del maratón

| Funcionalidad | Qué aporta | Esfuerzo |
|---|---|---|
| **Plan de sesión** | "Tengo 3 horas esta noche" → propone qué ver hoy respetando el orden (p. ej. *Iron Man 2* + 2 capítulos de *Loki*) | Medio |
| **Objetivo Doomsday** | Calcula el ritmo necesario ("2,1 h/día") para terminar la ruta express antes del estreno, con indicador de si vas al día | Medio |
| **Recordatorios de estreno** | Notificación (PWA) cuando salga un episodio nuevo de una serie en emisión que sigues | Medio |
| **Listas propias** | Crear rutas personalizadas ("maratón con mi pareja", "solo lo cósmico") con su propio progreso | Medio |

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
| **Línea temporal del universo** | Eje visual 1943→2027 con las tarjetas colocadas donde *ocurren*, mostrando saltos y solapamientos (Endgame tocando 1970, 2012, 2014…) | Alto |
| **Mapa del multiverso** | Grafo interactivo de conexiones: qué películas comparten personajes, qué series desembocan en qué película | Alto |
| **Modo cine (TV)** | Vista a pantalla completa para elegir "qué toca hoy" desde el sofá, con pósters gigantes y navegación por teclado/mando | Medio |
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
