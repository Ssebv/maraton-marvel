-- ════════════════════════════════════════════════════════════════════════
-- Comunidades del Maratón · fase 1 (16 sep 2026)
-- Cuentas, perfil público, comunidades (Strava), discusiones (Reddit) y
-- moderación, sobre el plan GRATUITO de Supabase: sin Cloud Functions, sin
-- subida de imágenes y con poda de lo viejo para no acercarse a los 500 MB.
--
-- Todo lo que protege va AQUÍ, en la base: reglas por fila (RLS), permisos por
-- columna, límites de publicación y contadores. La app (GitHub Pages) es
-- pública y cualquiera puede llamar a la API con la clave anónima; nada de lo
-- que decide la app es de fiar.
--
-- Probado en local con scripts/comunidad/rls.mjs (PostgreSQL 16 imitando a
-- Supabase). Para aplicarlo: supabase/LEEME.md.
-- ════════════════════════════════════════════════════════════════════════

-- ── Catálogo (generado desde data.js: supabase/catalogo.sql) ──────────────
-- Para calcular horas en la base: el ranking no se fía del teléfono.
create table public.catalogo (
  id text primary key,
  saga text not null check (saga in ('xmen', 'ucm', 'comics', 'animacion')),
  minutos int not null default 0 check (minutos >= 0),
  episodios int not null default 0 check (episodios >= 0)
);

-- ── Personas ──────────────────────────────────────────────────────────────
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null unique check (nombre ~ '^[a-z0-9_]{3,20}$'),
  nombre_visible text check (char_length(nombre_visible) between 1 and 40),
  -- los avatares son personajes de una galería de la app: no se suben fotos,
  -- así no hay imágenes que moderar ni almacenamiento que pagar
  avatar text not null default 'mutante' check (avatar ~ '^[a-z0-9-]{1,40}$'),
  bio text check (char_length(bio) <= 280),
  saga_favorita text check (saga_favorita in ('xmen', 'ucm', 'comics', 'animacion')),
  -- privacidad por bloque, cerrada por defecto
  priv_progreso text not null default 'privado' check (priv_progreso in ('publico', 'seguidores', 'privado')),
  priv_resenas text not null default 'privado' check (priv_resenas in ('publico', 'seguidores', 'privado')),
  priv_logros text not null default 'seguidores' check (priv_logros in ('publico', 'seguidores', 'privado')),
  -- 14+ (Ley 21.719): se guarda cuándo lo confirmó, no la fecha de nacimiento
  edad_confirmada_en timestamptz not null check (edad_confirmada_en <= now() + interval '1 minute'),
  creado timestamptz not null default now()
);

-- lo que hoy vive en localStorage; solo lo lee su dueño (lo público sale por
-- perfil_publico() y ranking(), que respetan la privacidad)
create table public.progreso (
  usuario uuid primary key references public.perfiles (id) on delete cascade,
  vistas jsonb not null default '{}' check (jsonb_typeof(vistas) = 'object'),
  eps jsonb not null default '{}' check (jsonb_typeof(eps) = 'object'),
  notas jsonb not null default '{}' check (jsonb_typeof(notas) = 'object'),
  listas jsonb not null default '[]' check (jsonb_typeof(listas) = 'array'),
  lecturas jsonb not null default '{}' check (jsonb_typeof(lecturas) = 'object'),
  horario jsonb,
  -- tope por persona: un maratón entero con reseñas ocupa ~60 kB
  check (pg_column_size(vistas) + pg_column_size(eps) + pg_column_size(notas)
       + pg_column_size(listas) + pg_column_size(lecturas) + coalesce(pg_column_size(horario), 0) < 400000),
  actualizado timestamptz not null default now()
);

create table public.seguimientos (
  seguidor uuid not null references public.perfiles (id) on delete cascade,
  seguido uuid not null references public.perfiles (id) on delete cascade,
  desde timestamptz not null default now(),
  primary key (seguidor, seguido),
  check (seguidor <> seguido)
);

create table public.bloqueos (
  quien uuid not null references public.perfiles (id) on delete cascade,
  a_quien uuid not null references public.perfiles (id) on delete cascade,
  desde timestamptz not null default now(),
  primary key (quien, a_quien),
  check (quien <> a_quien)
);

-- sin políticas: nadie las lee ni escribe por la API (solo el editor SQL)
create table public.admins (usuario uuid primary key references public.perfiles (id) on delete cascade);
create table public.suspensiones (
  usuario uuid primary key references public.perfiles (id) on delete cascade,
  hasta timestamptz not null,
  motivo text not null check (char_length(motivo) <= 500),
  por uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now()
);

-- ── Comunidades (Strava) ──────────────────────────────────────────────────
create table public.comunidades (
  id uuid primary key default gen_random_uuid(),
  direccion text not null unique check (direccion ~ '^[a-z0-9-]{3,30}$'),
  nombre text not null check (char_length(nombre) between 3 and 60),
  descripcion text check (char_length(descripcion) <= 500),
  -- la portada es un título del catálogo (su carátula), no una imagen subida
  portada text references public.catalogo (id) on delete set null,
  tipo text not null default 'publica' check (tipo in ('publica', 'invitacion', 'privada')),
  dueno uuid not null references public.perfiles (id) on delete cascade,
  miembros int not null default 0,
  oculta boolean not null default false,
  creado timestamptz not null default now()
);

create table public.membresias (
  comunidad uuid not null references public.comunidades (id) on delete cascade,
  usuario uuid not null references public.perfiles (id) on delete cascade,
  papel text not null default 'miembro' check (papel in ('dueno', 'moderador', 'miembro')),
  muro_activo boolean not null default false,   -- su actividad sale en el muro: se activa a mano
  en_ranking boolean not null default true,
  desde timestamptz not null default now(),
  primary key (comunidad, usuario)
);

create table public.expulsiones (
  comunidad uuid not null references public.comunidades (id) on delete cascade,
  usuario uuid not null references public.perfiles (id) on delete cascade,
  por uuid references public.perfiles (id) on delete set null,
  nota text check (char_length(nota) <= 500),
  creado timestamptz not null default now(),
  primary key (comunidad, usuario)
);

create table public.invitaciones (
  codigo text primary key default replace(gen_random_uuid()::text, '-', ''),
  comunidad uuid not null references public.comunidades (id) on delete cascade,
  creada_por uuid not null references public.perfiles (id) on delete cascade,
  caduca timestamptz not null default now() + interval '14 days',
  usos_max int not null default 25 check (usos_max between 1 and 200),
  usos int not null default 0
);

create table public.retos (
  id bigint generated always as identity primary key,
  comunidad uuid not null references public.comunidades (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 80),
  titulos text[] not null check (cardinality(titulos) between 1 and 200),
  hasta date not null,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now()
);

-- ── Discusiones (Reddit) ──────────────────────────────────────────────────
create table public.hilos (
  id bigint generated always as identity primary key,
  -- sin comunidad = foro abierto del título
  comunidad uuid references public.comunidades (id) on delete cascade,
  titulo_ref text references public.catalogo (id) on delete set null,
  -- «loki2:2:6»: la app vela el hilo hasta que marques ese episodio
  episodio_ref text check (episodio_ref ~ '^[a-z0-9-]+:[0-9]{1,2}:[0-9]{1,3}$'),
  autor uuid not null references public.perfiles (id) on delete cascade,
  etiqueta text not null default 'charla' check (etiqueta in ('teoria', 'resena', 'pregunta', 'noticia', 'meme', 'charla')),
  titulo text not null check (char_length(titulo) between 3 and 140),
  cuerpo text not null default '' check (char_length(cuerpo) <= 10000),
  votos int not null default 0,
  respuestas int not null default 0,
  fijado boolean not null default false,
  oculto boolean not null default false,
  creado timestamptz not null default now(),
  editado timestamptz,
  check (comunidad is not null or titulo_ref is not null)
);
create index hilos_comunidad on public.hilos (comunidad, creado desc);
create index hilos_titulo on public.hilos (titulo_ref, creado desc) where comunidad is null;

create table public.respuestas (
  id bigint generated always as identity primary key,
  hilo bigint not null references public.hilos (id) on delete cascade,
  padre bigint references public.respuestas (id) on delete cascade,
  profundidad smallint not null default 0,
  autor uuid not null references public.perfiles (id) on delete cascade,
  cuerpo text not null check (char_length(cuerpo) between 1 and 5000),
  votos int not null default 0,
  hijos int not null default 0,
  oculto boolean not null default false,
  creado timestamptz not null default now(),
  editado timestamptz
);
create index respuestas_hilo on public.respuestas (hilo, creado);

-- solo votos a favor (decidido el 16 sep 2026): votar = que exista la fila
create table public.votos_hilos (
  usuario uuid not null references public.perfiles (id) on delete cascade,
  hilo bigint not null references public.hilos (id) on delete cascade,
  primary key (usuario, hilo)
);
create table public.votos_respuestas (
  usuario uuid not null references public.perfiles (id) on delete cascade,
  respuesta bigint not null references public.respuestas (id) on delete cascade,
  primary key (usuario, respuesta)
);

-- ── Muro, avisos, reportes ────────────────────────────────────────────────
create table public.actividad (
  id bigint generated always as identity primary key,
  usuario uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('titulo', 'episodio', 'resena', 'logro', 'reto')),
  ref text not null check (char_length(ref) <= 80),
  estrellas smallint check (estrellas between 1 and 5),
  aplausos int not null default 0,
  creado timestamptz not null default now()
);
create index actividad_usuario on public.actividad (usuario, creado desc);

create table public.aplausos (
  usuario uuid not null references public.perfiles (id) on delete cascade,
  actividad bigint not null references public.actividad (id) on delete cascade,
  primary key (usuario, actividad)
);

create table public.avisos (
  id bigint generated always as identity primary key,
  para uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('respuesta', 'mencion', 'reto', 'moderacion')),
  de uuid references public.perfiles (id) on delete cascade,
  hilo bigint references public.hilos (id) on delete cascade,
  respuesta bigint references public.respuestas (id) on delete cascade,
  leido boolean not null default false,
  creado timestamptz not null default now()
);
create index avisos_para on public.avisos (para, creado desc);

create table public.reportes (
  id bigint generated always as identity primary key,
  reportante uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('hilo', 'respuesta', 'perfil', 'comunidad')),
  ref text not null check (char_length(ref) <= 60),
  comunidad uuid references public.comunidades (id) on delete cascade,
  motivo text not null check (motivo in ('spoiler', 'acoso', 'odio', 'spam', 'pirateria', 'sexual', 'datos', 'otro')),
  detalle text check (char_length(detalle) <= 500),
  estado text not null default 'abierto' check (estado in ('abierto', 'resuelto', 'descartado')),
  resuelto_por uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now(),
  resuelto timestamptz
);

create table public.registro_moderacion (
  id bigint generated always as identity primary key,
  moderador uuid references public.perfiles (id) on delete set null,
  comunidad uuid references public.comunidades (id) on delete cascade,
  accion text not null,
  tipo text not null,
  ref text not null,
  nota text check (char_length(nota) <= 500),
  creado timestamptz not null default now()
);

-- dominios y palabras que no se pueden publicar (se gestionan en el editor SQL)
create table public.filtros (
  patron text primary key check (patron = lower(patron) and char_length(patron) between 3 and 60),
  tipo text not null check (tipo in ('dominio', 'palabra'))
);
insert into public.filtros (patron, tipo) values
  ('cuevana', 'dominio'), ('pelisplus', 'dominio'), ('repelis', 'dominio'),
  ('readcomiconline', 'dominio'), ('getcomics', 'dominio'), ('comicextra', 'dominio'),
  ('fmovies', 'dominio'), ('123movies', 'dominio'), ('gnula', 'dominio'), ('pelispedia', 'dominio');

-- ════════════════════════════════════════════════════════════════════════
-- Funciones de ayuda (security definer: consultan sin pasar por RLS, para que
-- las políticas no se llamen a sí mismas en bucle)
-- ════════════════════════════════════════════════════════════════════════
create function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where usuario = auth.uid())
$$;

create function public.suspendido(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suspensiones where usuario = u and hasta > now())
$$;

create function public.papel_en(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select papel from public.membresias where comunidad = c and usuario = auth.uid()
$$;

create function public.modera(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or coalesce(public.papel_en(c) in ('dueno', 'moderador'), false)
$$;

create function public.ve_comunidad(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.comunidades k
    -- el dueño también: al crearla, su membresía aún no existe (la pone un
    -- disparador al final) y el «returning» de la app no la vería
    where k.id = c and (k.dueno = auth.uid() or (not k.oculta and (k.tipo <> 'privada' or public.papel_en(c) is not null)))
  )
$$;

create function public.bloqueado_por_mi(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bloqueos where quien = auth.uid() and a_quien = u)
$$;

create function public.ve_bloque(dueno uuid, nivel text) returns boolean
language sql stable security definer set search_path = public as $$
  select dueno = auth.uid()
      or nivel = 'publico'
      or (nivel = 'seguidores' and exists (select 1 from public.seguimientos where seguidor = auth.uid() and seguido = dueno))
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Disparadores: límites, filtros, contadores y avisos
-- ════════════════════════════════════════════════════════════════════════

-- publicar: cuenta suspendida no; límites por hora, más bajos las primeras
-- 24 h; enlaces a sitios pirata y palabras filtradas no
create function public.antes_de_publicar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  yo uuid := auth.uid();
  nueva boolean;
  hechos int;
  tope int;
  texto text;
  f record;
begin
  if yo is null then return new; end if;   -- editor SQL / service_role
  if public.suspendido(yo) then raise exception 'cuenta suspendida' using errcode = 'P0001'; end if;
  select creado > now() - interval '24 hours' into nueva from public.perfiles where id = yo;
  if tg_op = 'INSERT' then
    if tg_table_name = 'hilos' then
      select count(*) into hechos from public.hilos where autor = yo and creado > now() - interval '1 hour';
      tope := case when nueva then 2 else 6 end;
    elsif tg_table_name = 'respuestas' then
      select count(*) into hechos from public.respuestas where autor = yo and creado > now() - interval '1 hour';
      tope := case when nueva then 10 else 40 end;
    elsif tg_table_name = 'reportes' then
      select count(*) into hechos from public.reportes where reportante = yo and creado > now() - interval '1 hour';
      tope := 10;
    elsif tg_table_name = 'comunidades' then
      select count(*) into hechos from public.comunidades where dueno = yo;
      tope := case when nueva then 1 else 5 end;
    end if;
    if hechos >= tope then raise exception 'límite de publicación: espera un rato' using errcode = 'P0001'; end if;
  end if;
  if tg_table_name in ('hilos', 'respuestas') then
    -- por jsonb: las respuestas no tienen título y new.titulo fallaría
    texto := lower(coalesce(to_jsonb(new) ->> 'titulo', '') || ' ' || coalesce(to_jsonb(new) ->> 'cuerpo', ''));
    for f in select patron, tipo from public.filtros loop
      if position(f.patron in texto) > 0 then
        raise exception '%', case when f.tipo = 'dominio' then 'enlace no permitido' else 'texto no permitido' end using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return new;
end $$;

create trigger hilos_antes before insert or update of titulo, cuerpo on public.hilos
  for each row execute function public.antes_de_publicar();
create trigger respuestas_antes before insert or update of cuerpo on public.respuestas
  for each row execute function public.antes_de_publicar();
create trigger reportes_antes before insert on public.reportes
  for each row execute function public.antes_de_publicar();
create trigger comunidades_antes before insert on public.comunidades
  for each row execute function public.antes_de_publicar();

-- el foro abierto de un título, solo con cuentas de más de 24 h
create function public.hilo_valida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.comunidad is null
     and exists (select 1 from public.perfiles where id = auth.uid() and creado > now() - interval '24 hours') then
    raise exception 'los foros abiertos se abren a las 24 h de crear la cuenta' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.editado := now(); end if;
  return new;
end $$;
create trigger hilos_valida before insert or update of titulo, cuerpo, etiqueta on public.hilos
  for each row execute function public.hilo_valida();

-- respuestas: hasta 3 niveles, el padre en el mismo hilo, contadores
create function public.respuesta_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if tg_op = 'UPDATE' then new.editado := now(); return new; end if;
  if new.padre is not null then
    select hilo, profundidad into p from public.respuestas where id = new.padre;
    if p.hilo is distinct from new.hilo then raise exception 'respuesta a otro hilo' using errcode = 'P0001'; end if;
    if p.profundidad >= 2 then raise exception 'demasiados niveles de respuesta' using errcode = 'P0001'; end if;
    new.profundidad := p.profundidad + 1;
  else
    new.profundidad := 0;
  end if;
  return new;
end $$;
create trigger respuestas_valida before insert or update of cuerpo on public.respuestas
  for each row execute function public.respuesta_valida();

create function public.cuenta_respuestas() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end; r record;
begin
  r := case when tg_op = 'INSERT' then new else old end;
  update public.hilos set respuestas = greatest(0, respuestas + d) where id = r.hilo;
  if r.padre is not null then update public.respuestas set hijos = greatest(0, hijos + d) where id = r.padre; end if;
  return null;
end $$;
create trigger respuestas_cuenta after insert or delete on public.respuestas
  for each row execute function public.cuenta_respuestas();

create function public.cuenta_votos() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'votos_hilos' then
    update public.hilos set votos = greatest(0, votos + d) where id = coalesce(new.hilo, old.hilo);
  else
    update public.respuestas set votos = greatest(0, votos + d) where id = coalesce(new.respuesta, old.respuesta);
  end if;
  return null;
end $$;
create trigger votos_hilos_cuenta after insert or delete on public.votos_hilos
  for each row execute function public.cuenta_votos();
create trigger votos_respuestas_cuenta after insert or delete on public.votos_respuestas
  for each row execute function public.cuenta_votos();

create function public.cuenta_aplausos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.actividad set aplausos = greatest(0, aplausos + case when tg_op = 'INSERT' then 1 else -1 end)
  where id = coalesce(new.actividad, old.actividad);
  return null;
end $$;
create trigger aplausos_cuenta after insert or delete on public.aplausos
  for each row execute function public.cuenta_aplausos();

create function public.cuenta_miembros() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.comunidades set miembros = greatest(0, miembros + case when tg_op = 'INSERT' then 1 else -1 end)
  where id = coalesce(new.comunidad, old.comunidad);
  return null;
end $$;
create trigger membresias_cuenta after insert or delete on public.membresias
  for each row execute function public.cuenta_miembros();

-- quien crea una comunidad es su dueño y su primer miembro
create function public.comunidad_creada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.membresias (comunidad, usuario, papel) values (new.id, new.dueno, 'dueno');
  return null;
end $$;
create trigger comunidades_dueno after insert on public.comunidades
  for each row execute function public.comunidad_creada();

-- entrar directo solo en públicas, nunca como moderador, nunca si te expulsaron
create function public.membresia_valida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('maraton.via_rpc', true) = '1' then return new; end if;
  if exists (select 1 from public.expulsiones where comunidad = new.comunidad and usuario = new.usuario) then
    raise exception 'te expulsaron de esta comunidad' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and new.papel <> 'miembro' then
    -- la fila del dueño la crea comunidad_creada(), que sí puede
    if not exists (select 1 from public.comunidades where id = new.comunidad and dueno = new.usuario) then
      raise exception 'papel no permitido' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger membresias_valida before insert on public.membresias
  for each row execute function public.membresia_valida();

-- avisos: al autor del hilo o de la respuesta, y a los @mencionados (máx. 5),
-- nunca a uno mismo ni a quien te bloqueó
create function public.avisa_respuesta() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  destino uuid;
  m text;
  n int := 0;
begin
  if new.padre is not null then
    select autor into destino from public.respuestas where id = new.padre;
  else
    select autor into destino from public.hilos where id = new.hilo;
  end if;
  if destino is not null and destino <> new.autor
     and not exists (select 1 from public.bloqueos where quien = destino and a_quien = new.autor) then
    insert into public.avisos (para, tipo, de, hilo, respuesta) values (destino, 'respuesta', new.autor, new.hilo, new.id);
  end if;
  for m in select distinct (regexp_matches(new.cuerpo, '@([a-z0-9_]{3,20})', 'g'))[1] loop
    exit when n >= 5;
    insert into public.avisos (para, tipo, de, hilo, respuesta)
    select p.id, 'mencion', new.autor, new.hilo, new.id from public.perfiles p
    where p.nombre = m and p.id <> new.autor and p.id is distinct from destino
      and not exists (select 1 from public.bloqueos where quien = p.id and a_quien = new.autor);
    n := n + 1;
  end loop;
  return null;
end $$;
create trigger respuestas_avisa after insert on public.respuestas
  for each row execute function public.avisa_respuesta();

-- ════════════════════════════════════════════════════════════════════════
-- Reglas por fila
-- ════════════════════════════════════════════════════════════════════════
alter table public.catalogo enable row level security;
alter table public.perfiles enable row level security;
alter table public.progreso enable row level security;
alter table public.seguimientos enable row level security;
alter table public.bloqueos enable row level security;
alter table public.admins enable row level security;
alter table public.suspensiones enable row level security;
alter table public.comunidades enable row level security;
alter table public.membresias enable row level security;
alter table public.expulsiones enable row level security;
alter table public.invitaciones enable row level security;
alter table public.retos enable row level security;
alter table public.hilos enable row level security;
alter table public.respuestas enable row level security;
alter table public.votos_hilos enable row level security;
alter table public.votos_respuestas enable row level security;
alter table public.actividad enable row level security;
alter table public.aplausos enable row level security;
alter table public.avisos enable row level security;
alter table public.reportes enable row level security;
alter table public.registro_moderacion enable row level security;
alter table public.filtros enable row level security;

create policy "catálogo público" on public.catalogo for select using (true);

create policy "perfiles visibles" on public.perfiles for select using (true);
create policy "crear el propio perfil" on public.perfiles for insert to authenticated with check (id = auth.uid());
create policy "editar el propio perfil" on public.perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "progreso propio" on public.progreso for select to authenticated using (usuario = auth.uid());
create policy "guardar progreso propio" on public.progreso for insert to authenticated with check (usuario = auth.uid());
create policy "actualizar progreso propio" on public.progreso for update to authenticated using (usuario = auth.uid()) with check (usuario = auth.uid());

create policy "seguimientos visibles" on public.seguimientos for select to authenticated using (true);
create policy "seguir" on public.seguimientos for insert to authenticated
  with check (seguidor = auth.uid() and not exists (select 1 from public.bloqueos b where b.quien = seguido and b.a_quien = auth.uid()));
create policy "dejar de seguir" on public.seguimientos for delete to authenticated using (seguidor = auth.uid());

create policy "mis bloqueos" on public.bloqueos for select to authenticated using (quien = auth.uid());
create policy "bloquear" on public.bloqueos for insert to authenticated with check (quien = auth.uid());
create policy "desbloquear" on public.bloqueos for delete to authenticated using (quien = auth.uid());

create policy "mi suspensión" on public.suspensiones for select to authenticated using (usuario = auth.uid() or public.es_admin());

-- «dueno = auth.uid()» va en la fila misma: al crearla, el «returning» se
-- comprueba antes de que la fila exista para una consulta (ve_comunidad no la ve)
create policy "comunidades visibles" on public.comunidades for select using (dueno = auth.uid() or public.ve_comunidad(id));
create policy "crear comunidad" on public.comunidades for insert to authenticated
  with check (dueno = auth.uid() and not public.suspendido());
create policy "el dueño edita" on public.comunidades for update to authenticated
  using (public.papel_en(id) = 'dueno' or public.es_admin()) with check (public.papel_en(id) = 'dueno' or public.es_admin());
create policy "el dueño borra" on public.comunidades for delete to authenticated
  using (dueno = auth.uid() or public.es_admin());

create policy "miembros visibles" on public.membresias for select using (public.ve_comunidad(comunidad));
create policy "entrar en una pública" on public.membresias for insert to authenticated
  with check (usuario = auth.uid() and not public.suspendido() and (
    exists (select 1 from public.comunidades k where k.id = comunidad and k.tipo = 'publica' and not k.oculta)
    or exists (select 1 from public.comunidades k where k.id = comunidad and k.dueno = auth.uid())));
create policy "mis preferencias de miembro" on public.membresias for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
create policy "salir" on public.membresias for delete to authenticated using (usuario = auth.uid() and papel <> 'dueno');

create policy "expulsiones para moderar" on public.expulsiones for select to authenticated using (public.modera(comunidad));

create policy "invitaciones para moderar" on public.invitaciones for select to authenticated using (public.modera(comunidad));
create policy "crear invitación" on public.invitaciones for insert to authenticated
  with check (creada_por = auth.uid() and public.modera(comunidad));
create policy "borrar invitación" on public.invitaciones for delete to authenticated using (public.modera(comunidad));

create policy "retos visibles" on public.retos for select using (public.ve_comunidad(comunidad));
create policy "crear reto" on public.retos for insert to authenticated with check (creado_por = auth.uid() and public.modera(comunidad));
create policy "borrar reto" on public.retos for delete to authenticated using (public.modera(comunidad));

create policy "hilos visibles" on public.hilos for select using (
  (comunidad is null or public.ve_comunidad(comunidad))
  and (not oculto or autor = auth.uid() or (comunidad is not null and public.modera(comunidad)) or public.es_admin())
  and not public.bloqueado_por_mi(autor));
create policy "publicar hilo" on public.hilos for insert to authenticated with check (
  autor = auth.uid() and not public.suspendido()
  and (comunidad is null or public.papel_en(comunidad) is not null));
create policy "editar hilo propio 24 h" on public.hilos for update to authenticated
  using (autor = auth.uid() and creado > now() - interval '24 hours')
  with check (autor = auth.uid());
create policy "borrar hilo propio sin respuestas" on public.hilos for delete to authenticated
  using (autor = auth.uid() and respuestas = 0);

create policy "respuestas visibles" on public.respuestas for select using (
  exists (select 1 from public.hilos h where h.id = hilo)   -- con las reglas del hilo
  and (not oculto or autor = auth.uid() or public.es_admin()
       or exists (select 1 from public.hilos h where h.id = hilo and h.comunidad is not null and public.modera(h.comunidad)))
  and not public.bloqueado_por_mi(autor));
create policy "responder" on public.respuestas for insert to authenticated with check (
  autor = auth.uid() and not public.suspendido()
  and exists (select 1 from public.hilos h where h.id = hilo and not h.oculto
              and (h.comunidad is null or public.papel_en(h.comunidad) is not null)));
create policy "editar respuesta propia 24 h" on public.respuestas for update to authenticated
  using (autor = auth.uid() and creado > now() - interval '24 hours') with check (autor = auth.uid());
create policy "borrar respuesta propia sin hijos" on public.respuestas for delete to authenticated
  using (autor = auth.uid() and hijos = 0);

create policy "mis votos de hilos" on public.votos_hilos for select to authenticated using (usuario = auth.uid());
create policy "votar hilo" on public.votos_hilos for insert to authenticated
  with check (usuario = auth.uid() and exists (select 1 from public.hilos h where h.id = hilo));
create policy "quitar voto de hilo" on public.votos_hilos for delete to authenticated using (usuario = auth.uid());
create policy "mis votos de respuestas" on public.votos_respuestas for select to authenticated using (usuario = auth.uid());
create policy "votar respuesta" on public.votos_respuestas for insert to authenticated
  with check (usuario = auth.uid() and exists (select 1 from public.respuestas r where r.id = respuesta));
create policy "quitar voto de respuesta" on public.votos_respuestas for delete to authenticated using (usuario = auth.uid());

-- el muro: lo tuyo, y lo de quien comparte comunidad contigo Y activó su muro ahí
create policy "muro visible" on public.actividad for select to authenticated using (
  usuario = auth.uid() or (
    not public.bloqueado_por_mi(usuario) and exists (
      select 1 from public.membresias suyo join public.membresias mio on mio.comunidad = suyo.comunidad
      where suyo.usuario = actividad.usuario and suyo.muro_activo and mio.usuario = auth.uid())));
create policy "publicar mi actividad" on public.actividad for insert to authenticated with check (usuario = auth.uid());
create policy "borrar mi actividad" on public.actividad for delete to authenticated using (usuario = auth.uid());

create policy "aplausos visibles" on public.aplausos for select to authenticated
  using (exists (select 1 from public.actividad a where a.id = actividad));
create policy "aplaudir" on public.aplausos for insert to authenticated
  with check (usuario = auth.uid() and exists (select 1 from public.actividad a where a.id = actividad and a.usuario <> auth.uid()));
create policy "quitar aplauso" on public.aplausos for delete to authenticated using (usuario = auth.uid());

create policy "mis avisos" on public.avisos for select to authenticated using (para = auth.uid());
create policy "marcar aviso leído" on public.avisos for update to authenticated using (para = auth.uid()) with check (para = auth.uid());
create policy "borrar mis avisos" on public.avisos for delete to authenticated using (para = auth.uid());

create policy "reportes: los míos y los que modero" on public.reportes for select to authenticated
  using (reportante = auth.uid() or public.es_admin() or (comunidad is not null and public.modera(comunidad)));
create policy "reportar" on public.reportes for insert to authenticated
  with check (reportante = auth.uid() and estado = 'abierto' and resuelto_por is null);

create policy "registro para moderar" on public.registro_moderacion for select to authenticated
  using (public.es_admin() or (comunidad is not null and public.modera(comunidad)));

-- ════════════════════════════════════════════════════════════════════════
-- Permisos por columna. Supabase da TODO a anon y authenticated en public:
-- se quita y se devuelve solo lo que cada uno puede tocar, así nadie se pone
-- votos, se hace dueño ni se quita una suspensión desde la consola.
-- ════════════════════════════════════════════════════════════════════════
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke select on public.admins, public.suspensiones, public.filtros from anon;
-- de los perfiles se lee todo menos cuándo se confirmó la edad
revoke select on public.perfiles from anon, authenticated;
grant select (id, nombre, nombre_visible, avatar, bio, saga_favorita, priv_progreso, priv_resenas, priv_logros, creado)
  on public.perfiles to anon, authenticated;

grant insert (id, nombre, nombre_visible, avatar, bio, saga_favorita, priv_progreso, priv_resenas, priv_logros, edad_confirmada_en)
  on public.perfiles to authenticated;
grant update (nombre, nombre_visible, avatar, bio, saga_favorita, priv_progreso, priv_resenas, priv_logros)
  on public.perfiles to authenticated;
grant insert (usuario, vistas, eps, notas, listas, lecturas, horario, actualizado) on public.progreso to authenticated;
grant update (vistas, eps, notas, listas, lecturas, horario, actualizado) on public.progreso to authenticated;
grant insert, delete on public.seguimientos, public.bloqueos to authenticated;
grant insert (direccion, nombre, descripcion, portada, tipo, dueno) on public.comunidades to authenticated;
grant update (nombre, descripcion, portada, tipo) on public.comunidades to authenticated;
grant delete on public.comunidades to authenticated;
grant insert (comunidad, usuario) on public.membresias to authenticated;
grant update (muro_activo, en_ranking) on public.membresias to authenticated;
grant delete on public.membresias to authenticated;
grant insert (comunidad, creada_por, caduca, usos_max) on public.invitaciones to authenticated;
grant delete on public.invitaciones to authenticated;
grant insert (comunidad, nombre, titulos, hasta, creado_por) on public.retos to authenticated;
grant delete on public.retos to authenticated;
grant insert (comunidad, titulo_ref, episodio_ref, autor, etiqueta, titulo, cuerpo) on public.hilos to authenticated;
grant update (etiqueta, titulo, cuerpo) on public.hilos to authenticated;
grant delete on public.hilos to authenticated;
grant insert (hilo, padre, autor, cuerpo) on public.respuestas to authenticated;
grant update (cuerpo) on public.respuestas to authenticated;
grant delete on public.respuestas to authenticated;
grant insert, delete on public.votos_hilos, public.votos_respuestas, public.aplausos to authenticated;
grant insert (usuario, tipo, ref, estrellas) on public.actividad to authenticated;
grant delete on public.actividad to authenticated;
grant update (leido) on public.avisos to authenticated;
grant delete on public.avisos to authenticated;
grant insert (reportante, tipo, ref, comunidad, motivo, detalle) on public.reportes to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Funciones que llama la app (RPC)
-- ════════════════════════════════════════════════════════════════════════

-- entrar con un código de invitación (comunidades por invitación y privadas)
create function public.unirse_con_codigo(codigo_in text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  if auth.uid() is null then raise exception 'sin sesión' using errcode = 'P0001'; end if;
  if public.suspendido() then raise exception 'cuenta suspendida' using errcode = 'P0001'; end if;
  select * into inv from public.invitaciones where codigo = codigo_in for update;
  if inv is null or inv.caduca < now() or inv.usos >= inv.usos_max then
    raise exception 'invitación no válida' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.expulsiones where comunidad = inv.comunidad and usuario = auth.uid()) then
    raise exception 'te expulsaron de esta comunidad' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membresias where comunidad = inv.comunidad and usuario = auth.uid()) then
    perform set_config('maraton.via_rpc', '1', true);
    insert into public.membresias (comunidad, usuario) values (inv.comunidad, auth.uid());
    perform set_config('maraton.via_rpc', '0', true);
    update public.invitaciones set usos = usos + 1 where codigo = codigo_in;
  end if;
  return inv.comunidad;
end $$;

-- ocultar / mostrar / fijar / desfijar un hilo o una respuesta
create function public.moderar(tipo_in text, id_in bigint, accion_in text, nota_in text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if tipo_in = 'hilo' then select comunidad into c from public.hilos where id = id_in;
  elsif tipo_in = 'respuesta' then select h.comunidad into c from public.respuestas r join public.hilos h on h.id = r.hilo where r.id = id_in;
  else raise exception 'tipo no válido' using errcode = 'P0001'; end if;
  -- en los foros abiertos de título solo modera el administrador
  if not (public.es_admin() or (c is not null and public.modera(c))) then
    raise exception 'no moderas aquí' using errcode = 'P0001';
  end if;
  if accion_in in ('ocultar', 'mostrar') then
    if tipo_in = 'hilo' then update public.hilos set oculto = (accion_in = 'ocultar') where id = id_in;
    else update public.respuestas set oculto = (accion_in = 'ocultar') where id = id_in; end if;
  elsif accion_in in ('fijar', 'desfijar') and tipo_in = 'hilo' then
    update public.hilos set fijado = (accion_in = 'fijar') where id = id_in;
  else
    raise exception 'acción no válida' using errcode = 'P0001';
  end if;
  insert into public.registro_moderacion (moderador, comunidad, accion, tipo, ref, nota)
  values (auth.uid(), c, accion_in, tipo_in, id_in::text, nota_in);
end $$;

create function public.expulsar(comunidad_in uuid, usuario_in uuid, nota_in text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.modera(comunidad_in) then raise exception 'no moderas aquí' using errcode = 'P0001'; end if;
  if exists (select 1 from public.membresias where comunidad = comunidad_in and usuario = usuario_in and papel = 'dueno') then
    raise exception 'no se puede expulsar al dueño' using errcode = 'P0001';
  end if;
  if public.papel_en(comunidad_in) = 'moderador' and exists (
      select 1 from public.membresias where comunidad = comunidad_in and usuario = usuario_in and papel = 'moderador') then
    raise exception 'un moderador no expulsa a otro' using errcode = 'P0001';
  end if;
  delete from public.membresias where comunidad = comunidad_in and usuario = usuario_in;
  insert into public.expulsiones (comunidad, usuario, por, nota) values (comunidad_in, usuario_in, auth.uid(), nota_in)
  on conflict (comunidad, usuario) do update set por = excluded.por, nota = excluded.nota, creado = now();
  insert into public.registro_moderacion (moderador, comunidad, accion, tipo, ref, nota)
  values (auth.uid(), comunidad_in, 'expulsar', 'perfil', usuario_in::text, nota_in);
end $$;

create function public.cambiar_papel(comunidad_in uuid, usuario_in uuid, papel_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.papel_en(comunidad_in) is distinct from 'dueno' and not public.es_admin() then
    raise exception 'solo el dueño cambia papeles' using errcode = 'P0001';
  end if;
  if papel_in not in ('moderador', 'miembro') then raise exception 'papel no válido' using errcode = 'P0001'; end if;
  update public.membresias set papel = papel_in
  where comunidad = comunidad_in and usuario = usuario_in and papel <> 'dueno';
  insert into public.registro_moderacion (moderador, comunidad, accion, tipo, ref)
  values (auth.uid(), comunidad_in, 'papel:' || papel_in, 'perfil', usuario_in::text);
end $$;

create function public.resolver_reporte(id_in bigint, estado_in text, nota_in text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.reportes where id = id_in;
  if r is null or not (public.es_admin() or (r.comunidad is not null and public.modera(r.comunidad))) then
    raise exception 'no puedes resolver este reporte' using errcode = 'P0001';
  end if;
  if estado_in not in ('resuelto', 'descartado') then raise exception 'estado no válido' using errcode = 'P0001'; end if;
  update public.reportes set estado = estado_in, resuelto_por = auth.uid(), resuelto = now() where id = id_in;
  insert into public.registro_moderacion (moderador, comunidad, accion, tipo, ref, nota)
  values (auth.uid(), r.comunidad, 'reporte:' || estado_in, 'reporte', id_in::text, nota_in);
end $$;

create function public.suspender(usuario_in uuid, hasta_in timestamptz, motivo_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'solo administración' using errcode = 'P0001'; end if;
  insert into public.suspensiones (usuario, hasta, motivo, por) values (usuario_in, hasta_in, motivo_in, auth.uid())
  on conflict (usuario) do update set hasta = excluded.hasta, motivo = excluded.motivo, por = excluded.por, creado = now();
  insert into public.registro_moderacion (moderador, accion, tipo, ref, nota)
  values (auth.uid(), 'suspender', 'perfil', usuario_in::text, motivo_in);
end $$;

-- minutos vistos entre dos fechas, calculados con el catálogo: un título
-- marcado cuenta entero; un episodio suelto, su parte (si el título entero se
-- marcó en la misma ventana, sus episodios no suman otra vez)
create function public.minutos_en(p public.progreso, desde_in timestamptz, hasta_in timestamptz) returns int
language sql stable security definer set search_path = public as $$
  with titulos as (
    select e.key as id from jsonb_each_text(p.vistas) e
    where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between desde_in and hasta_in
  ), episodios as (
    select split_part(e.key, ':', 1) as id from jsonb_each_text(p.eps) e
    where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between desde_in and hasta_in
  )
  select coalesce((select sum(c.minutos) from titulos t join public.catalogo c on c.id = t.id and c.saga in ('xmen', 'ucm', 'animacion')), 0)::int
       + coalesce((select sum(c.minutos::numeric / nullif(c.episodios, 0)) from episodios x
                   join public.catalogo c on c.id = x.id and c.saga in ('xmen', 'ucm', 'animacion')
                   where x.id not in (select id from titulos)), 0)::int
$$;

-- ranking de una comunidad: sus miembros con en_ranking, sin bloqueados.
-- Parámetros con «_in»: «desde» a secas era la columna membresias.desde (en
-- una función SQL la columna gana) y el ranking salía a cero
create function public.ranking(comunidad_in uuid, desde_in timestamptz default now() - interval '7 days', hasta_in timestamptz default now())
returns table (usuario uuid, nombre text, avatar text, minutos int, titulos int, episodios int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.avatar,
         public.minutos_en(pr, desde_in, hasta_in),
         (select count(*) from jsonb_each_text(pr.vistas) e where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between desde_in and hasta_in)::int,
         (select count(*) from jsonb_each_text(pr.eps) e where e.value ~ '^[0-9]{12,14}$' and to_timestamp(e.value::bigint / 1000.0) between desde_in and hasta_in)::int
  from public.membresias m
  join public.perfiles p on p.id = m.usuario
  join public.progreso pr on pr.usuario = m.usuario
  where m.comunidad = comunidad_in and m.en_ranking
    and public.ve_comunidad(comunidad_in)
    and not public.bloqueado_por_mi(m.usuario)
  order by 4 desc, 2
  limit 100
$$;

-- el perfil que ve otra persona: cada bloque según su privacidad
create function public.perfil_publico(nombre_in text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.perfiles; pr public.progreso;
begin
  select * into p from public.perfiles where nombre = nombre_in;
  if p is null or public.bloqueado_por_mi(p.id) then return null; end if;
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
    'logros_visibles', public.ve_bloque(p.id, p.priv_logros)
  );
end $$;

-- derecho de acceso (Ley 21.719): todo lo tuyo en un JSON
create function public.mis_datos() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'perfil', (select to_jsonb(p) from public.perfiles p where p.id = auth.uid()),
    'progreso', (select to_jsonb(pr) from public.progreso pr where pr.usuario = auth.uid()),
    'seguimientos', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.seguimientos s where s.seguidor = auth.uid()),
    'bloqueos', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.bloqueos b where b.quien = auth.uid()),
    'membresias', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.membresias m where m.usuario = auth.uid()),
    'hilos', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from public.hilos h where h.autor = auth.uid()),
    'respuestas', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.respuestas r where r.autor = auth.uid()),
    'actividad', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.actividad a where a.usuario = auth.uid()),
    'reportes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.reportes x where x.reportante = auth.uid())
  )
$$;

-- derecho de supresión: borra la cuenta y, en cascada, todo lo suyo
create function public.borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'sin sesión' using errcode = 'P0001'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Mantenimiento: lo llama cada semana la Action gratuita de GitHub
-- (.github/workflows/comunidad-viva.yml). Sirve para dos cosas: que el plan
-- gratuito no pause el proyecto por inactividad y podar lo viejo para no
-- acercarse al límite de 500 MB.
create function public.mantenimiento() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from public.actividad where creado < now() - interval '90 days';
  get diagnostics a = row_count;
  delete from public.avisos where (leido and creado < now() - interval '30 days') or creado < now() - interval '180 days';
  get diagnostics b = row_count;
  delete from public.invitaciones where caduca < now() - interval '30 days';
  get diagnostics c = row_count;
  return jsonb_build_object('actividad', a, 'avisos', b, 'invitaciones', c, 'bytes', pg_database_size(current_database()));
end $$;

-- las funciones de Postgres se pueden ejecutar por defecto desde PUBLIC: se
-- cierran todas y se abren una a una
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.es_admin(), public.suspendido(uuid), public.papel_en(uuid), public.modera(uuid),
  public.ve_comunidad(uuid), public.bloqueado_por_mi(uuid), public.ve_bloque(uuid, text) to anon, authenticated;
grant execute on function public.unirse_con_codigo(text), public.moderar(text, bigint, text, text),
  public.expulsar(uuid, uuid, text), public.cambiar_papel(uuid, uuid, text), public.resolver_reporte(bigint, text, text),
  public.suspender(uuid, timestamptz, text), public.mis_datos(), public.borrar_mi_cuenta() to authenticated;
grant execute on function public.ranking(uuid, timestamptz, timestamptz), public.perfil_publico(text) to anon, authenticated;
grant execute on function public.mantenimiento() to anon, authenticated;
