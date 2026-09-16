-- ════════════════════════════════════════════════════════════════════════
-- Comunidades · fase 3, parte 2 (16 sep 2026): retos y muro.
-- Dos funciones de lectura que la base calcula para una comunidad concreta:
--  · progreso_reto: cuántos títulos del reto lleva cada miembro (solo quien
--    aparece en el ranking, que es su forma de decir «cuéntenme»)
--  · muro: la actividad de los miembros que activaron el muro EN ESTA
--    comunidad (la regla general de actividad deja ver la de quien comparte
--    cualquier comunidad contigo; el muro de una comunidad es más estricto)
-- Probado con scripts/comunidad/rls.mjs y scripts/sondas/muro.mjs.
-- ════════════════════════════════════════════════════════════════════════

create function public.progreso_reto(reto_in bigint)
returns table (usuario uuid, nombre text, avatar text, hechos int, total int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.avatar,
         (select count(*) from unnest(r.titulos) t(id)
          where coalesce(pr.vistas ->> t.id, '') ~ '^[0-9]{12,14}$')::int,
         cardinality(r.titulos)
  from public.retos r
  join public.membresias m on m.comunidad = r.comunidad and m.en_ranking
  join public.perfiles p on p.id = m.usuario
  left join public.progreso pr on pr.usuario = m.usuario
  where r.id = reto_in
    and public.ve_comunidad(r.comunidad)
    and not public.bloqueado_por_mi(m.usuario)
  order by 4 desc, 2
  limit 200
$$;

create function public.muro(comunidad_in uuid, antes_in timestamptz default null)
returns table (id bigint, usuario uuid, nombre text, avatar text, tipo text, ref text, estrellas smallint, aplausos int, aplaudido boolean, creado timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, p.id, p.nombre, p.avatar, a.tipo, a.ref, a.estrellas, a.aplausos,
         exists (select 1 from public.aplausos x where x.actividad = a.id and x.usuario = auth.uid()),
         a.creado
  from public.actividad a
  join public.membresias m on m.usuario = a.usuario and m.comunidad = comunidad_in and m.muro_activo
  join public.perfiles p on p.id = a.usuario
  -- el muro es para quien está dentro, aunque la comunidad sea pública
  where public.papel_en(comunidad_in) is not null
    and not public.bloqueado_por_mi(a.usuario)
    and (antes_in is null or a.creado < antes_in)
  order by a.creado desc
  limit 40
$$;

-- publicar actividad: como mucho 60 por hora (marcar una temporada entera no
-- debe inundar el muro ni el plan gratuito)
create function public.antes_de_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.suspendido(auth.uid()) then raise exception 'cuenta suspendida' using errcode = 'P0001'; end if;
  if (select count(*) from public.actividad where usuario = auth.uid() and creado > now() - interval '1 hour') >= 60 then
    raise exception 'límite de publicación: espera un rato' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger actividad_antes before insert on public.actividad
  for each row execute function public.antes_de_actividad();

revoke execute on function public.progreso_reto(bigint), public.muro(uuid, timestamptz), public.antes_de_actividad() from public, anon, authenticated;
grant execute on function public.progreso_reto(bigint) to anon, authenticated;
grant execute on function public.muro(uuid, timestamptz) to authenticated;
