-- Cierra el acceso desde el navegador: ni `anon` ni `authenticated` pueden tocar nada.
-- El Worker entra con el service role, que es el único con permisos.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant all     on all tables    in schema public to service_role;
grant all     on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lo mismo para lo que se cree en migraciones futuras.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
