-- ============================================================================
-- FIX: GRANT INSERT en solicitudes_registro a anon y authenticated
-- ============================================================================
-- En Supabase, RLS se aplica DESPUÉS de los privilegios SQL básicos.
-- Una política RLS `for insert to anon with check (true)` no funciona si
-- el rol anon no tiene `GRANT INSERT` sobre la tabla.
--
-- Por defecto Supabase concede ciertos grants a anon/authenticated, pero
-- en tablas creadas via migración custom no siempre se aplican. Lo dejamos
-- explícito.
-- ============================================================================

grant insert on public.solicitudes_registro to anon, authenticated;
grant select on public.solicitudes_registro to authenticated;
grant update on public.solicitudes_registro to authenticated;

-- También para hospitales (anon necesita SELECT para login por slug)
grant select on public.hospitales to anon, authenticated;
