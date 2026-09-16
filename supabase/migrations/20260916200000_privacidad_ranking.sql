-- ════════════════════════════════════════════════════════════════════════
-- Privacidad del ranking y de los retos (revisión de seguridad, 16 sep 2026).
-- Antes: ranking() y progreso_reto() eran SECURITY DEFINER, abiertas a anon,
-- con la ventana de fechas elegida por quien llamaba y sin mirar la privacidad
-- del progreso. Cualquiera, sin cuenta, podía sacar de una comunidad pública
-- las horas de sus miembros y, estrechando las fechas, cuándo vio cada título,
-- aunque tuvieran el progreso en «Solo yo».
-- Ahora:
--  · aparecer en el ranking es OPT-IN (en_ranking por defecto false) y la app
--    explica qué se comparte antes de activarlo;
--  · solo los miembros de la comunidad (con sesión) ven ranking y retos;
--  · la ventana la fija el servidor: '7d' o '30d' hasta ahora mismo.
-- ════════════════════════════════════════════════════════════════════════

alter table public.membresias alter column en_ranking set default false;
-- quien ya estaba dentro sin haberlo elegido sale del ranking
update public.membresias set en_ranking = false;

drop function if exists public.ranking(uuid, timestamptz, timestamptz);
create function public.ranking(comunidad_in uuid, ventana_in text default '7d')
returns table (usuario uuid, nombre text, avatar text, minutos int, titulos int, episodios int)
language sql stable security definer set search_path = public as $$
  with v as (select now() - case when ventana_in = '30d' then interval '30 days' else interval '7 days' end as desde, now() as hasta)
  select p.id, p.nombre, p.avatar,
         public.minutos_en(pr, v.desde, v.hasta),
         (select count(*) from jsonb_each_text(pr.vistas) e where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between v.desde and v.hasta)::int,
         (select count(*) from jsonb_each_text(pr.eps) e where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between v.desde and v.hasta)::int
  from v, public.membresias m
  join public.perfiles p on p.id = m.usuario
  join public.progreso pr on pr.usuario = m.usuario
  where m.comunidad = comunidad_in and m.en_ranking
    and public.papel_en(comunidad_in) is not null
    and not public.bloqueado_por_mi(m.usuario)
  order by 4 desc, 2
  limit 100
$$;

-- progreso de un reto: solo para miembros, solo de quien aparece en el
-- ranking; cuenta también las marcas antiguas guardadas como 1 (sin fecha)
create or replace function public.progreso_reto(reto_in bigint)
returns table (usuario uuid, nombre text, avatar text, hechos int, total int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.avatar,
         (select count(*) from unnest(r.titulos) t(id) where coalesce(pr.vistas, '{}'::jsonb) ? t.id)::int,
         cardinality(r.titulos)
  from public.retos r
  join public.membresias m on m.comunidad = r.comunidad and m.en_ranking
  join public.perfiles p on p.id = m.usuario
  left join public.progreso pr on pr.usuario = m.usuario
  where r.id = reto_in
    and public.papel_en(r.comunidad) is not null
    and not public.bloqueado_por_mi(m.usuario)
  order by 4 desc, 2
  limit 200
$$;

revoke execute on function public.ranking(uuid, text), public.progreso_reto(bigint) from public, anon, authenticated;
grant execute on function public.ranking(uuid, text), public.progreso_reto(bigint) to authenticated;
