# Maratón Marvel & X-Men

Guía interactiva para ver todo Marvel y X-Men en orden cronológico (y por año de estreno), marcando el progreso título a título. Incluye la saga X-Men de Fox, el UCM completo (películas, series y especiales hasta *Vengadores: Doomsday*), y una sección de cómics esenciales.

**Página:** https://ssebv.github.io/maraton-marvel/

## Funciones

- Orden cronológico de la historia y vista por año de estreno
- Carátulas generadas, resúmenes sin spoilers, director y reparto (con enlaces a filmografías)
- Nota de IMDb, duración, plataforma, universo y horas restantes de maratón
- Filtros combinables: ⚡ Ruta express a *Doomsday*, ocultar series/opcionales/completados, solo joyas ★7,5+
- El progreso se guarda en el navegador (localStorage)

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/index.html (archivo único)
```

Hecho con React + Vite. Los datos viven en `src/data.js`.
