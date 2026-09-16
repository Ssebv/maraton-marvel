-- Imita lo que Supabase trae de serie, para probar la migración en un
-- PostgreSQL local (scripts/comunidad/rls.mjs). NO se aplica en Supabase.
--  · roles anon / authenticated / service_role
--  · auth.users y auth.uid() leyendo el JWT de la petición, como PostgREST
--  · los permisos por defecto de Supabase: TODO para anon y authenticated en
--    public (por eso la migración los quita y los devuelve por columna)
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
