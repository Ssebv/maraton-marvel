# Maratón Marvel & X-Men

PWA en Preact + Vite que se publica en GitHub Pages desde `docs/` (rama `main`). Detalle técnico en
`DESARROLLO.md`, plan en `ROADMAP.md`.

## Instalar y probar
- `npm install`, luego `npx vite` para desarrollo.
- `npm test`: comprobaciones de datos y gama de color. `npm run sonda`: sondas de navegador (CDP).
- `npm run desplegar`: build + copia a `docs/` (eso es lo que sale a producción al hacer push a `main`).
- iOS (`ios/`, Fase 10): `npm run ios:datos` exporta los datos de `src/` a JSON y `npm run ios:test` corre
  las pruebas de `ios/MaratonKit` (funciona solo con Command Line Tools; la app SwiftUI necesita Xcode).

## Qué no tocar
- `src/orden.js` es GENERADO (`npm run contrato`) y solo crece por el final: los bits de los perfiles dependen de él.
- `docs/` no se edita a mano: lo genera `npm run desplegar`.
- `ios/MaratonKit/Sources/MaratonKit/Recursos/` se regenera; los datos se cambian en `src/`.

## Ojo
- La tarea diaria de noticias (`.github/workflows/noticias.yml`) commitea en `main`: `git pull --rebase` antes de push.
- Trabajo largo en una rama (la app de iOS vive en `swift`).
