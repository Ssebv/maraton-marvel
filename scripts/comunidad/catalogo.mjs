#!/usr/bin/env node
// Genera supabase/catalogo.sql desde data.js y episodes.js: id, saga, minutos
// y episodios de cada título. La base calcula con esto las horas del ranking
// (no se fía del teléfono). Solo añade o actualiza: nunca borra un id, porque
// hilos y portadas lo referencian. Uso: npm run comunidad:catalogo
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { raiz, cargaFuentes } from '../contrato.mjs'

const { DATA, EPISODES } = await cargaFuentes()
const filas = []
for (const saga of DATA) for (const era of saga.eras) for (const it of era.items) {
  const eps = (EPISODES[it.id] || []).length
  filas.push(`  ('${it.id}', '${saga.saga}', ${Math.round(it.d || 0)}, ${eps})`)
}
const sql = `-- GENERADO por scripts/comunidad/catalogo.mjs (npm run comunidad:catalogo). No editar a mano.
-- ${filas.length} títulos. Se aplica DESPUÉS de la migración y cada vez que entre un título nuevo.
insert into public.catalogo (id, saga, minutos, episodios) values
${filas.join(',\n')}
on conflict (id) do update set saga = excluded.saga, minutos = excluded.minutos, episodios = excluded.episodios;
`
writeFileSync(join(raiz, 'supabase', 'catalogo.sql'), sql)
console.log(`supabase/catalogo.sql: ${filas.length} títulos`)
