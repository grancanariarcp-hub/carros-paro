-- ============================================================================
-- ÁSTOR — BASELINE CRON (4/5)
-- ============================================================================
-- Schedules de pg_cron. Mismo patrón que en PROD pero:
--   - URL de la edge function parametrizada via app.functions_url GUC
--   - service_role key vía app.service_role_key GUC
--
-- Antes de aplicar este archivo en un proyecto nuevo, hay que setear:
--   alter database postgres set app.functions_url     = 'https://<ref>.supabase.co/functions/v1';
--   alter database postgres set app.service_role_key  = '<sb_secret_...>';
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Alertas diarias — cada día a las 08:00 UTC
-- ----------------------------------------------------------------------------
-- Si ya existe (por reaplicación), lo desprogramamos primero. cron.schedule
-- es UPSERT por nombre desde pg_cron 1.4+; usamos unschedule para idempotencia.

select cron.unschedule('generar-alertas-mantenimiento-diario')
  where exists (select 1 from cron.job where jobname = 'generar-alertas-mantenimiento-diario');

select cron.schedule(
  'generar-alertas-mantenimiento-diario',
  '0 8 * * *',
  $$ select public.generar_alertas_mantenimiento(); $$
);


-- ----------------------------------------------------------------------------
-- 2) Informe mensual — día 1 de cada mes a las 08:00 UTC
-- ----------------------------------------------------------------------------

select cron.unschedule('informe-mensual-dia-1')
  where exists (select 1 from cron.job where jobname = 'informe-mensual-dia-1');

select cron.schedule(
  'informe-mensual-dia-1',
  '0 8 1 * *',
  $$
  select net.http_post(
    url := current_setting('app.functions_url', true) || '/informe-mensual',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ============================================================================
-- FIN BASELINE 4/5 — Cron
--
-- Siguiente: 5/5 baseline_seed.sql — datos demo mínimos para arrancar DEV
-- (un hospital de prueba, un servicio, un superadmin para que puedas loguear).
-- ============================================================================
