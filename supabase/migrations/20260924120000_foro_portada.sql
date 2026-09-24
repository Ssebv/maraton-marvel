-- Portada del foro (24 sep 2026, Sebastián: «un apartado de foro y discusión
-- tipo Reddit»). Hasta ahora cada foro abierto vivía dentro de la ficha de su
-- título; esto junta todos los hilos abiertos (sin comunidad) en una portada
-- con tres órdenes:
--   · alza   — votos y respuestas que pierden peso con las horas, como la
--              portada de Reddit: (votos + respuestas/2 + 1) / (horas + 2)^1,5
--   · nuevos — lo último primero
--   · semana — los más votados de los últimos 7 días
-- y dos filtros opcionales: la saga del título (catalogo.saga) y la etiqueta.
--
-- SECURITY INVOKER: corre con los permisos de quien pregunta, así que las
-- reglas por fila de hilos (bloqueos, ocultos) siguen mandando. Devuelve filas
-- de hilos: PostgREST deja incrustar el autor igual que en /hilos
-- (rpc/foro_portada?select=…,autor:perfiles!hilos_autor_fkey(…)).
create or replace function public.foro_portada(
  orden text default 'alza',
  saga_in text default null,
  etiqueta_in text default null,
  desde int default 0
) returns setof public.hilos
language sql stable security invoker set search_path = public as $$
  select h.*
  from public.hilos h
  left join public.catalogo c on c.id = h.titulo_ref
  where h.comunidad is null
    and not h.oculto
    and (saga_in is null or c.saga = saga_in)
    and (etiqueta_in is null or h.etiqueta = etiqueta_in)
    and (orden <> 'semana' or h.creado > now() - interval '7 days')
  order by
    case when orden = 'alza'
      then (h.votos + h.respuestas * 0.5 + 1) / power(extract(epoch from (now() - h.creado)) / 3600.0 + 2, 1.5)
    end desc nulls last,
    case when orden = 'semana' then h.votos end desc nulls last,
    h.creado desc
  limit 30 offset greatest(coalesce(desde, 0), 0)
$$;

grant execute on function public.foro_portada(text, text, text, int) to anon, authenticated;

-- la portada ordena por fecha sobre los hilos abiertos: índice parcial
create index if not exists hilos_abiertos_creado on public.hilos (creado desc) where comunidad is null and not oculto;
