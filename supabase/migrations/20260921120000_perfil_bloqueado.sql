-- (y, más abajo, resolver_reporte sin autorresolución)
-- Perfil de alguien que bloqueaste (fase 5, moderación; 21 sep 2026).
-- Antes perfil_publico devolvía null y la app decía «No hay nadie con el
-- nombre @…»: justo tras bloquear, desaparecía el botón para desbloquear y no
-- había forma de deshacerlo. Ahora devuelve lo mínimo para reconocerlo y
-- desbloquear (id, @nombre y avatar, que ya son públicos en perfiles) con
-- bloqueado = true, y nada de su progreso, reseñas, logros ni contadores.
create or replace function public.perfil_publico(nombre_in text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.perfiles; pr public.progreso;
begin
  select * into p from public.perfiles where nombre = nombre_in;
  if p is null then return null; end if;
  if public.bloqueado_por_mi(p.id) then
    return jsonb_build_object('id', p.id, 'nombre', p.nombre, 'avatar', p.avatar, 'bloqueado', true);
  end if;
  select * into pr from public.progreso where usuario = p.id;
  return jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'nombre_visible', p.nombre_visible, 'avatar', p.avatar,
    'bio', p.bio, 'saga_favorita', p.saga_favorita, 'creado', p.creado,
    'seguidores', (select count(*) from public.seguimientos where seguido = p.id),
    'siguiendo', (select count(*) from public.seguimientos where seguidor = p.id),
    'lo_sigo', exists (select 1 from public.seguimientos where seguidor = auth.uid() and seguido = p.id),
    'vistas', case when public.ve_bloque(p.id, p.priv_progreso) then coalesce(pr.vistas, '{}') end,
    'eps', case when public.ve_bloque(p.id, p.priv_progreso) then coalesce(pr.eps, '{}') end,
    'notas', case when public.ve_bloque(p.id, p.priv_resenas) then coalesce(pr.notas, '{}') end,
    'logros_visibles', public.ve_bloque(p.id, p.priv_logros),
    'bloqueado', false
  );
end $$;

-- Quien modera no resuelve reportes de SU contenido (code-review del 21 sep):
-- podía descartar el reporte de un hilo suyo y la administración, que solo
-- carga los abiertos, no llegaba a verlo. La administración sí puede.
create or replace function public.resolver_reporte(id_in bigint, estado_in text, nota_in text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record; autor uuid;
begin
  select * into r from public.reportes where id = id_in;
  if r is null or not (public.es_admin() or (r.comunidad is not null and public.modera(r.comunidad))) then
    raise exception 'no puedes resolver este reporte' using errcode = 'P0001';
  end if;
  if not public.es_admin() then
    if r.tipo = 'hilo' then select h.autor into autor from public.hilos h where h.id = r.ref::bigint;
    elsif r.tipo = 'respuesta' then select x.autor into autor from public.respuestas x where x.id = r.ref::bigint;
    elsif r.tipo = 'perfil' then autor := r.ref::uuid;
    end if;
    if autor = auth.uid() then raise exception 'es contenido tuyo: lo revisa la administración' using errcode = 'P0001'; end if;
  end if;
  if estado_in not in ('resuelto', 'descartado') then raise exception 'estado no válido' using errcode = 'P0001'; end if;
  update public.reportes set estado = estado_in, resuelto_por = auth.uid(), resuelto = now() where id = id_in;
  insert into public.registro_moderacion (moderador, comunidad, accion, tipo, ref, nota)
  values (auth.uid(), r.comunidad, 'reporte:' || estado_in, 'reporte', id_in::text, nota_in);
end $$;
