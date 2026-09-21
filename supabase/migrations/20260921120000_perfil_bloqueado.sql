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
