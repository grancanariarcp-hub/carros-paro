-- ============================================================================
-- ÁSTOR — SECRETS INFRA (sin Vault, compatible Supabase managed)
-- ============================================================================
-- Sustituye el GUC `app.functions_url` y `app.service_role_key` por una
-- tabla privada accesible solo al rol postgres y vía función SECURITY DEFINER.
--
-- Tras aplicar esta migración hay que ejecutar (UNA vez por entorno) los
-- INSERT correspondientes para poblar los secretos:
--   - DEV : ver supabase/setup_secrets_dev.sql.local (en .gitignore)
--   - PROD: hacer otro local equivalente con la URL y key de PROD
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Schema privado, sin acceso público
-- ----------------------------------------------------------------------------
create schema if not exists private;

-- Cerrar puertas: nadie excepto postgres tiene nada en este schema
revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2) Tabla de secretos
-- ----------------------------------------------------------------------------
create table if not exists private.app_secrets (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz default now()
);

revoke all on private.app_secrets from public;
revoke all on private.app_secrets from anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3) Función accessor — único punto de acceso a los secretos
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + search_path fijo + grant solo al rol postgres
create or replace function private.get_secret(p_key text)
returns text
language sql
stable
security definer
set search_path = private
as $$
  select value from private.app_secrets where key = p_key;
$$;

-- bloquear ejecución desde clientes; solo internamente desde funciones
-- security definer del esquema public puede llamarla
revoke all on function private.get_secret(text) from public;
revoke all on function private.get_secret(text) from anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4) Reescribir notificar_alerta_por_email para usar el accessor en lugar
--    del GUC current_setting('app.functions_url')
-- ----------------------------------------------------------------------------
create or replace function public.notificar_alerta_por_email()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url_base text;
  v_url      text;
begin
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  if NEW.tipo not in (
       'carro_no_operativo','equipo_mantenimiento_vencido','equipo_calibracion_vencida',
       'vencimiento_proximo','material_caducado','material_vencimiento_proximo',
       'control_vencido'
     )
     and NEW.severidad not in ('critica','alta')
  then
    return NEW;
  end if;

  v_url_base := private.get_secret('functions_url');

  if v_url_base is null or length(v_url_base) = 0 then
    raise warning 'private.app_secrets.functions_url no configurado; email omitido para alerta %', NEW.id;
    return NEW;
  end if;

  v_url := v_url_base || '/alerta-email';

  perform net.http_post(
    url     := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );

  return NEW;
end;
$$;


-- ----------------------------------------------------------------------------
-- 5) Reprogramar el cron del informe mensual leyendo del accessor
-- ----------------------------------------------------------------------------
-- Reemplazamos el job creado en 4/5 que usaba current_setting()
select cron.unschedule('informe-mensual-dia-1')
  where exists (select 1 from cron.job where jobname = 'informe-mensual-dia-1');

select cron.schedule(
  'informe-mensual-dia-1',
  '0 8 1 * *',
  $$
  select net.http_post(
    url := private.get_secret('functions_url') || '/informe-mensual',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ============================================================================
-- FIN — Secrets infra
--
-- Ahora hay que poblar los secretos. Ejecutar en SQL Editor del PROYECTO
-- correspondiente (DEV o PROD), nunca commitear los valores reales:
--
-- insert into private.app_secrets (key, value, description) values
--   ('functions_url',    'https://<ref>.supabase.co/functions/v1', 'URL base edge functions'),
--   ('service_role_key', 'sb_secret_...', 'Service role key (cron interno)')
-- on conflict (key) do update set value = excluded.value, updated_at = now();
-- ============================================================================
