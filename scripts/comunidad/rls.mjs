#!/usr/bin/env node
// Sonda de las reglas de la comunidad: levanta un PostgreSQL local y temporal
// (sin red: socket en una carpeta temporal), le pone lo que Supabase trae de
// serie (supabase/pruebas/supabase-local.sql), aplica la migración y el
// catálogo, y prueba cada regla con cuentas de prueba, como lo haría la app
// con la clave pública. Gratis y sin crear nada en internet.
// Uso: npm run comunidad:rls   (necesita PostgreSQL 16+: brew install postgresql@16)
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { raiz } from '../contrato.mjs'

const BIN = ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@16/bin']
  .find(d => existsSync(join(d, 'initdb'))) || ''
const bin = n => (BIN ? join(BIN, n) : n)
const dir = mkdtempSync(join(tmpdir(), 'comunidad-pg-'))
const datos = join(dir, 'datos')
const corre = (cmd, args, input) => spawnSync(cmd, args, { input, encoding: 'utf8' })

let inicio = corre(bin('initdb'), ['-D', datos, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
if (inicio.status !== 0) { console.error(inicio.stderr); process.exit(1) }
inicio = corre(bin('pg_ctl'), ['-D', datos, '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
if (inicio.status !== 0) { console.error(inicio.stderr, readFileSync(join(dir, 'log'), 'utf8')); process.exit(1) }

const psql = sql => corre(bin('psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-U', 'postgres', '-d', 'postgres'], sql)
const admin = sql => { const r = psql(sql); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim() }

const U = { ana: '11111111-1111-1111-1111-111111111111', beto: '22222222-2222-2222-2222-222222222222',
  carla: '33333333-3333-3333-3333-333333333333', admin: '44444444-4444-4444-4444-444444444444' }
// una petición como la de la app: rol y JWT de la persona (o anónima)
const como = (quien, sql) => {
  const claims = quien === 'anon' ? '' : `set local "request.jwt.claims" to '{"sub":"${U[quien]}","role":"authenticated"}';`
  const r = psql(`begin; set local role ${quien === 'anon' ? 'anon' : 'authenticated'}; ${claims}\n${sql};\ncommit;`)
  return { ok: r.status === 0, out: r.stdout.trim(), err: (r.stderr.match(/ERROR:\s+(.*)/) || [])[1] || r.stderr.trim() }
}

const filas = []
const prueba = (ok, texto) => filas.push([!!ok, texto])
try {
  admin(readFileSync(join(raiz, 'supabase/pruebas/supabase-local.sql'), 'utf8'))
  for (const f of readdirSync(join(raiz, 'supabase/migrations')).sort()) admin(readFileSync(join(raiz, 'supabase/migrations', f), 'utf8'))
  admin(readFileSync(join(raiz, 'supabase/catalogo.sql'), 'utf8'))
  prueba(true, 'migración y catálogo aplicados sobre un PostgreSQL con los permisos de Supabase')
  admin(Object.entries(U).map(([n, id]) => `insert into auth.users (id, email) values ('${id}', '${n}@prueba.cl');`).join('\n'))

  // ── perfiles ──
  let r = como('anon', `insert into perfiles (id, nombre, edad_confirmada_en) values ('${U.ana}', 'ana', now())`)
  prueba(!r.ok, `anónimo no crea perfiles (${r.err})`)
  r = como('beto', `insert into perfiles (id, nombre, edad_confirmada_en) values ('${U.ana}', 'suplanta', now())`)
  prueba(!r.ok, `beto no crea un perfil con el id de ana (${r.err})`)
  for (const n of ['ana', 'beto', 'carla', 'admin']) {
    r = como(n, `insert into perfiles (id, nombre, edad_confirmada_en) values ('${U[n]}', '${n === 'admin' ? 'moderacion' : n}', now())`)
    if (!r.ok) throw new Error(`perfil ${n}: ${r.err}`)
  }
  // ana, beto y admin llevan días; carla es nueva
  admin(`update perfiles set creado = now() - interval '10 days' where nombre in ('ana', 'beto', 'moderacion'); insert into admins values ('${U.admin}');`)
  r = como('ana', `insert into admins values ('${U.ana}')`)
  prueba(!r.ok, `nadie se hace administrador por la API (${r.err})`)
  r = como('beto', `update perfiles set bio = 'hackeado' where id = '${U.ana}' returning id`)
  prueba(r.ok && r.out === '', 'beto no edita el perfil de ana (0 filas)')
  r = como('anon', `select nombre from perfiles order by nombre`)
  prueba(r.ok && r.out.split('\n').length === 4, `los perfiles se leen sin sesión (${r.out.replace(/\n/g, ', ')})`)
  r = como('anon', `select edad_confirmada_en from perfiles`)
  prueba(!r.ok, `la fecha de confirmación de edad no se lee (${r.err})`)
  r = como('ana', `insert into perfiles (id, nombre, edad_confirmada_en) values ('${U.ana}', 'ana2', now() + interval '1 day')`)
  prueba(!r.ok && /check constraint|duplicate/.test(r.err), `no se confirma la edad con una fecha futura (${r.err})`)

  // ── progreso y privacidad ──
  const ts = d => Date.now() - d * 864e5
  r = como('ana', `insert into progreso (usuario, vistas, eps, notas) values ('${U.ana}',
    '{"first-class": ${ts(1)}, "logan": ${ts(2)}, "deadpool1": ${ts(30)}}', '{"loki2:2:6": ${ts(1)}}', '{"logan": {"p": 5, "txt": "obra maestra"}}')`)
  prueba(r.ok, `ana guarda su progreso ${r.ok ? '' : r.err}`)
  // la forma exacta del upsert de PostgREST (on_conflict + merge-duplicates):
  // se cazó contra el Supabase real, no contra esta imitación
  r = como('ana', `insert into progreso (usuario, vistas, actualizado) values ('${U.ana}', '{"logan": ${ts(2)}, "first-class": ${ts(1)}, "deadpool1": ${ts(30)}}', now())
    on conflict (usuario) do update set usuario = excluded.usuario, vistas = excluded.vistas, actualizado = excluded.actualizado`)
  prueba(r.ok, `ana actualiza su progreso con upsert ${r.ok ? '' : r.err}`)
  r = como('beto', `insert into progreso (usuario, vistas) values ('${U.ana}', '{}') on conflict (usuario) do update set usuario = excluded.usuario, vistas = excluded.vistas`)
  prueba(!r.ok && /row-level security/.test(r.err), `beto no pisa el progreso de ana con upsert (${r.err})`)
  r = como('beto', `insert into progreso (usuario) values ('${U.beto}')`)
  r = como('beto', `select count(*) from progreso where usuario = '${U.ana}'`)
  prueba(r.ok && r.out === '0', 'beto no lee el progreso de ana')
  r = como('beto', `select perfil_publico('ana') ->> 'vistas'`)
  prueba(r.ok && r.out === '', 'perfil de ana con progreso privado: sin vistas para beto')
  como('ana', `update perfiles set priv_progreso = 'seguidores' where id = '${U.ana}'`)
  r = como('beto', `select perfil_publico('ana') ->> 'vistas'`)
  prueba(r.ok && r.out === '', 'progreso «solo seguidores»: beto aún no sigue a ana, no lo ve')
  como('beto', `insert into seguimientos (seguidor, seguido) values ('${U.beto}', '${U.ana}')`)
  r = como('beto', `select (perfil_publico('ana') -> 'vistas') ? 'logan', perfil_publico('ana') ->> 'notas'`)
  prueba(r.ok && r.out === 't|', `al seguirla ve sus vistas y no sus reseñas, que siguen privadas (${r.out})`)
  r = como('beto', `insert into seguimientos (seguidor, seguido) values ('${U.ana}', '${U.carla}')`)
  prueba(!r.ok && /row-level security/.test(r.err), 'beto no hace que ana siga a nadie')
  r = como('ana', `insert into progreso (usuario, vistas) values ('${U.ana}', '[]')`)
  prueba(!r.ok && /check constraint|duplicate/.test(r.err), `progreso con forma equivocada rechazado (${r.err})`)

  // ── comunidades ──
  r = como('ana', `insert into comunidades (direccion, nombre, tipo, dueno) values ('los-del-multiverso', 'Los del Multiverso', 'privada', '${U.ana}') returning id`)
  const privada = r.out
  prueba(r.ok && /^[0-9a-f-]{36}$/.test(privada), `ana crea una comunidad privada ${r.ok ? '' : r.err}`)
  r = como('ana', `select papel from membresias where comunidad = '${privada}' and usuario = '${U.ana}'`)
  prueba(r.out === 'dueno', `ana queda como dueña (${r.out})`)
  r = como('beto', `select count(*) from comunidades where id = '${privada}'`)
  prueba(r.out === '0', 'la privada no la ve quien no es miembro')
  r = como('beto', `insert into membresias (comunidad, usuario) values ('${privada}', '${U.beto}')`)
  prueba(!r.ok && /row-level security/.test(r.err), `beto no entra solo en una privada (${r.err})`)
  r = como('beto', `insert into comunidades (direccion, nombre, dueno) values ('robada', 'Robada', '${U.ana}')`)
  prueba(!r.ok && /row-level security/.test(r.err), `beto no crea comunidades a nombre de ana (${r.err})`)
  r = como('ana', `insert into invitaciones (comunidad, creada_por) values ('${privada}', '${U.ana}') returning codigo`)
  const codigo = r.out
  r = como('beto', `select unirse_con_codigo('no-existe')`)
  prueba(!r.ok, `código inventado rechazado (${r.err})`)
  r = como('beto', `select unirse_con_codigo('${codigo}')`)
  prueba(r.ok && r.out === privada, 'beto entra con el código de invitación')
  r = como('beto', `select miembros from comunidades where id = '${privada}'`)
  prueba(r.out === '2', `contador de miembros: ${r.out}`)
  r = como('beto', `update membresias set papel = 'dueno' where comunidad = '${privada}' and usuario = '${U.beto}'`)
  prueba(!r.ok && /permission denied/.test(r.err), `beto no se asciende a dueño (${r.err})`)
  r = como('beto', `update comunidades set miembros = 999 where id = '${privada}'`)
  prueba(!r.ok && /permission denied/.test(r.err), 'nadie toca el contador de miembros')
  r = como('carla', `insert into comunidades (direccion, nombre, dueno) values ('carla-1', 'Primera de Carla', '${U.carla}')`)
  r = como('carla', `insert into comunidades (direccion, nombre, dueno) values ('carla-2', 'Segunda de Carla', '${U.carla}')`)
  prueba(!r.ok, `una cuenta nueva crea como mucho 1 comunidad (${r.err})`)

  // ── hilos, respuestas y votos ──
  r = como('carla', `insert into hilos (comunidad, titulo_ref, autor, titulo) values ('${privada}', 'logan', '${U.carla}', 'Entro sin ser miembro')`)
  prueba(!r.ok && /row-level security/.test(r.err), `quien no es miembro no publica en la privada (${r.err})`)
  r = como('beto', `insert into hilos (comunidad, titulo_ref, episodio_ref, autor, etiqueta, titulo, cuerpo) values ('${privada}', 'loki2', 'loki2:2:6', '${U.beto}', 'teoria', 'Lo que hace Loki al final', 'Si sostiene las ramas…') returning id`)
  const hilo = r.out
  prueba(r.ok && +hilo > 0, `beto publica un hilo en la privada ${r.ok ? '' : r.err}`)
  r = como('carla', `select count(*) from hilos where id = ${hilo || 0}`)
  prueba(+hilo > 0 && r.out === '0', 'los hilos de la privada no los lee quien no es miembro')
  r = como('anon', `select count(*) from hilos where id = ${hilo || 0}`)
  prueba(+hilo > 0 && r.out === '0', 'ni sin sesión')
  r = como('beto', `insert into hilos (comunidad, titulo_ref, autor, titulo, cuerpo) values ('${privada}', 'logan', '${U.beto}', 'Dónde verla', 'en cuevana está gratis')`)
  prueba(!r.ok && /enlace no permitido/.test(r.err), `enlace a sitio pirata bloqueado (${r.err})`)
  r = como('ana', `insert into votos_hilos (usuario, hilo) values ('${U.ana}', ${hilo})`)
  r = como('ana', `insert into votos_hilos (usuario, hilo) values ('${U.ana}', ${hilo})`)
  prueba(!r.ok && /duplicate key/.test(r.err), `un voto por persona (${r.err})`)
  r = como('beto', `update hilos set votos = 1000 where id = ${hilo}`)
  prueba(!r.ok && /permission denied/.test(r.err), `nadie se pone votos a mano (${r.err})`)
  r = como('beto', `select votos from hilos where id = ${hilo}`)
  prueba(r.out === '1', `el contador de votos lo lleva la base: ${r.out}`)
  r = como('ana', `update hilos set titulo = 'Cambiado por ana' where id = ${hilo} returning id`)
  prueba(r.ok && r.out === '', 'ana no edita el hilo de beto')
  r = como('beto', `update hilos set titulo = 'Lo que hace Loki al final (editado)' where id = ${hilo} returning editado is not null`)
  prueba(r.out === 't', 'beto edita su hilo y queda marcado como editado')
  r = como('ana', `insert into respuestas (hilo, autor, cuerpo) values (${hilo}, '${U.ana}', 'Totalmente, y @beto lo explica bien') returning id`)
  const r1 = r.out
  r = como('beto', `insert into respuestas (hilo, padre, autor, cuerpo) values (${hilo}, ${r1}, '${U.beto}', 'nivel 1') returning id`)
  const r2 = r.out
  r = como('ana', `insert into respuestas (hilo, padre, autor, cuerpo) values (${hilo}, ${r2}, '${U.ana}', 'nivel 2') returning id`)
  const r3 = r.out
  r = como('beto', `insert into respuestas (hilo, padre, autor, cuerpo) values (${hilo}, ${r3}, '${U.beto}', 'nivel 3')`)
  prueba(r1 && r2 && r3 && !r.ok, `respuestas hasta 3 niveles, la cuarta no (${r.err})`)
  r = como('beto', `select respuestas from hilos where id = ${hilo}`)
  prueba(r.out === '3', `contador de respuestas: ${r.out}`)
  r = como('beto', `select tipo from avisos order by id`)
  prueba(r.out.split('\n').join(',') === 'respuesta,respuesta', `avisos de beto: su hilo y su respuesta respondidos (${r.out.replace(/\n/g, ',')})`)
  r = como('ana', `select tipo from avisos`)
  prueba(r.out === 'respuesta', `aviso de ana por la respuesta a su respuesta (${r.out})`)
  r = como('ana', `select count(*) from avisos where para = '${U.beto}'`)
  prueba(r.ok && r.out === '0', 'ana no lee los avisos de beto')
  r = como('beto', `delete from hilos where id = ${hilo} returning id`)
  prueba(r.ok && r.out === '', 'un hilo con respuestas no se borra (se edita)')

  // ── foro abierto del título y cuentas nuevas ──
  r = como('carla', `insert into hilos (titulo_ref, autor, titulo) values ('logan', '${U.carla}', 'Primera vez aquí')`)
  prueba(!r.ok && /24 h/.test(r.err), `cuenta de menos de 24 h no abre hilos en el foro del título (${r.err})`)
  admin(`update perfiles set creado = now() - interval '2 days' where nombre = 'carla'`)
  let publicados = 0
  for (let i = 0; i < 8; i++) {
    r = como('carla', `insert into hilos (titulo_ref, autor, titulo) values ('logan', '${U.carla}', 'Hilo de prueba ${i}')`)
    if (r.ok) publicados++
  }
  prueba(publicados === 6 && /límite/.test(r.err), `límite por hora: ${publicados} de 8 hilos (${r.err})`)
  r = como('anon', `select count(*) from hilos where comunidad is null`)
  prueba(r.out === '6', `el foro abierto se lee sin sesión: ${r.out}`)
  como('ana', `insert into bloqueos (quien, a_quien) values ('${U.ana}', '${U.carla}')`)
  r = como('ana', `select count(*) from hilos where comunidad is null`)
  prueba(r.out === '0', `ana bloqueó a carla y no ve sus hilos (${r.out})`)
  r = como('beto', `select count(*) from hilos where comunidad is null`)
  prueba(r.out === '6', 'el bloqueo de ana no afecta a beto')

  // ── moderación ──
  const hiloCarla = como('beto', `select min(id) from hilos where comunidad is null`).out
  r = como('beto', `select moderar('hilo', ${hiloCarla}, 'ocultar')`)
  prueba(!r.ok && /no moderas/.test(r.err), `un miembro no modera el foro abierto (${r.err})`)
  r = como('beto', `insert into reportes (reportante, tipo, ref, motivo) values ('${U.beto}', 'hilo', '${hiloCarla}', 'spam') returning id`)
  const reporte = r.out
  prueba(r.ok && +reporte > 0, 'beto reporta un hilo')
  r = como('carla', `select count(*) from reportes`)
  prueba(r.out === '0', 'la persona reportada no ve el reporte')
  r = como('admin', `select moderar('hilo', ${hiloCarla}, 'ocultar', 'spam repetido'); select resolver_reporte(${reporte}, 'resuelto')`)
  prueba(r.ok, `la administradora oculta el hilo y resuelve el reporte ${r.ok ? '' : r.err}`)
  r = como('beto', `select count(*) from hilos where id = ${hiloCarla}`)
  prueba(r.out === '0', 'el hilo oculto ya no se ve')
  r = como('carla', `select oculto from hilos where id = ${hiloCarla}`)
  prueba(r.out === 't', 'su autora sí lo ve, marcado como oculto')
  r = como('admin', `select accion from registro_moderacion order by id`)
  prueba(r.out.includes('ocultar') && r.out.includes('reporte:resuelto'), 'queda en el registro de moderación')
  r = como('ana', `select expulsar('${privada}', '${U.beto}', 'prueba')`)
  r = como('beto', `select unirse_con_codigo('${codigo}')`)
  prueba(!r.ok && /expulsaron/.test(r.err), `expulsado no vuelve con el código (${r.err})`)
  r = como('admin', `select suspender('${U.carla}', now() + interval '7 days', 'spam')`)
  r = como('carla', `insert into respuestas (hilo, autor, cuerpo) select min(id), '${U.carla}', 'sigo aquí' from hilos where comunidad is null and not oculto`)
  prueba(!r.ok && /suspendida/.test(r.err), `cuenta suspendida no publica (${r.err})`)
  r = como('carla', `select suspender('${U.ana}', now() + interval '7 days', 'venganza')`)
  prueba(!r.ok && /solo administración/.test(r.err), 'solo la administración suspende')

  // ── ranking, muro, datos y borrado ──
  r = como('ana', `insert into comunidades (direccion, nombre, tipo, dueno) values ('maraton-chile', 'Maratón Chile', 'publica', '${U.ana}') returning id`)
  const publica = r.out
  como('beto', `insert into membresias (comunidad, usuario) values ('${publica}', '${U.beto}')`)
  como('beto', `update progreso set vistas = '{"deadpool2": ${ts(3)}}' where usuario = '${U.beto}'`)
  r = como('anon', `select nombre || ':' || minutos || ':' || titulos from ranking('${publica}') order by minutos desc`)
  const minLogan = +admin(`select minutos from catalogo where id = 'logan'`), minFc = +admin(`select minutos from catalogo where id = 'first-class'`), minDp = +admin(`select minutos from catalogo where id = 'deadpool2'`)
  const loki = admin(`select round(minutos::numeric / episodios) from catalogo where id = 'loki2'`)
  const esperaAna = minLogan + minFc + +loki
  // puertas con valores reales: un id que no existe daba 0 = 0 y pasaba
  if (!(minLogan > 0 && minFc > 0 && minDp > 0 && +loki > 0)) throw new Error('catálogo sin minutos para los títulos de la prueba')
  prueba(r.ok && r.out.split('\n')[0] === `ana:${esperaAna}:2` && r.out.includes(`beto:${minDp}:1`),
    `ranking de 7 días con horas del catálogo (${r.out.replace(/\n/g, ' · ')}; ana esperaba ${esperaAna})`)
  como('beto', `update membresias set en_ranking = false where comunidad = '${publica}' and usuario = '${U.beto}'`)
  r = como('anon', `select count(*) from ranking('${publica}')`)
  prueba(r.out === '1', 'quien sale del ranking no aparece')
  como('ana', `insert into actividad (usuario, tipo, ref, estrellas) values ('${U.ana}', 'titulo', 'logan', 5)`)
  r = como('beto', `select count(*) from actividad`)
  prueba(r.out === '0', 'el muro de ana no se ve si ella no lo activó')
  como('ana', `update membresias set muro_activo = true where comunidad = '${publica}' and usuario = '${U.ana}'`)
  r = como('beto', `select count(*) from actividad`)
  prueba(r.out === '1', 'con el muro activo, beto ve su actividad')
  r = como('beto', `insert into aplausos (usuario, actividad) select '${U.beto}', id from actividad`)
  r = como('ana', `select aplausos from actividad`)
  prueba(r.out === '1', `aplausos contados: ${r.out}`)
  r = como('ana', `select jsonb_typeof(mis_datos() -> 'progreso') || ':' || jsonb_array_length(mis_datos() -> 'respuestas')`)
  prueba(r.out === 'object:2', `descargar mis datos: ${r.out}`)
  r = como('anon', `select (mantenimiento() ->> 'bytes')::bigint > 0`)
  prueba(r.out === 't', 'mantenimiento semanal ejecutable con la clave pública')
  r = como('anon', `select borrar_mi_cuenta()`)
  prueba(!r.ok, 'borrar cuenta exige sesión')
  r = como('beto', `select borrar_mi_cuenta()`)
  const quedan = admin(`select (select count(*) from perfiles where id = '${U.beto}') + (select count(*) from progreso where usuario = '${U.beto}') + (select count(*) from respuestas where autor = '${U.beto}') + (select count(*) from seguimientos where seguidor = '${U.beto}')`)
  prueba(r.ok && quedan === '0', `beto borra su cuenta y no queda nada suyo (${quedan} filas)`)
  r = como('ana', `select respuestas from hilos where comunidad = '${privada}'`)
  prueba(r.out === '', 'su hilo se fue con él (cascada)')
} catch (e) {
  prueba(false, 'la sonda se cayó: ' + e.message.split('\n')[0])
} finally {
  corre(bin('pg_ctl'), ['-D', datos, '-m', 'immediate', 'stop'])
  rmSync(dir, { recursive: true, force: true })
}
console.log('\n── reglas de la comunidad (PostgreSQL local imitando a Supabase) ──')
let malas = 0
for (const [ok, t] of filas) { console.log(`${ok ? '  ✓' : '  ✗'} ${t}`); if (!ok) malas++ }
console.log(malas ? `\n✗ ${malas} de ${filas.length} fallan` : `\n✓ ${filas.length} comprobaciones en verde`)
process.exitCode = malas ? 1 : 0
