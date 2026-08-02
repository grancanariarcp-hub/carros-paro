-- ============================================================================
-- Autenticar las llamadas internas a las Edge Functions
-- ============================================================================
-- Las Edge Functions `alerta-email`, `send-push` e `informe-mensual` están
-- desplegadas con verify_jwt=false, porque pg_net las llama sin sesión de
-- usuario. Eso significa que Supabase no filtra nada por ellas, y ninguna
-- comprobaba la autorización por su cuenta. Resultado: cualquiera que
-- conociese la URL del proyecto podía invocarlas, y esa URL es pública —
-- viaja en el bundle del navegador. Comprobado el 2026-08-02:
--
--   curl -X POST .../functions/v1/alerta-email -d '{}'   →  400 "alerta_id requerido"
--
-- Ese 400 es la validación de la propia función: se ejecutó sin credenciales.
-- `informe-mensual` era el caso peor porque no recibe ningún parámetro:
-- bastaba con hacer POST a la URL para disparar el envío de informes por
-- correo a todos los hospitales activos.
--
-- El arreglo tiene dos mitades y ESTA es la primera: aquí los llamadores
-- empiezan a enviar la cabecera `X-Astor-Secret`. Después las funciones pasan
-- a exigirla. En este orden nunca hay una ventana en la que las alertas dejen
-- de notificarse.
--
-- Se usa un secreto propio y no SUPABASE_SERVICE_ROLE_KEY porque el formato de
-- esa variable depende de la antigüedad del proyecto: en producción llega como
-- JWT legacy (219 caracteres) y en astor-dev como formato nuevo (41,
-- "sb_secret_..."). Atarse a ella rompería al migrar de proyecto. Además así
-- la clave maestra no viaja en cada notificación y se puede rotar aparte.
--
-- El secreto se genera aquí si no existe, de modo que un entorno nuevo quede
-- funcionando sin pasos manuales. Solo hay que replicarlo del lado de las
-- funciones:
--
--   select value from private.app_secrets where key = 'edge_shared_secret';
--   npx supabase secrets set ASTOR_EDGE_SECRET='<valor>' --project-ref <ref>
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Secreto compartido. Se genera una sola vez por entorno; si ya existe no
--    se toca, para no invalidar el que tengan configuradas las funciones.
-- ---------------------------------------------------------------------------
insert into private.app_secrets (key, value, description)
select 'edge_shared_secret',
       encode(extensions.gen_random_bytes(32), 'base64'),
       'Secreto compartido BD → Edge Functions (cabecera X-Astor-Secret)'
where not exists (
  select 1 from private.app_secrets where key = 'edge_shared_secret'
);

-- ---------------------------------------------------------------------------
-- 1) Trigger de alertas → send-push
-- ---------------------------------------------------------------------------
create or replace function public.notificar_alerta_por_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_url_base text;
  v_secreto  text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;
  if NEW.severidad not in ('alta','critica')
     and NEW.tipo not in ('carro_no_operativo','equipo_mantenimiento_vencido',
                          'equipo_calibracion_vencida','material_caducado',
                          'control_vencido')
  then return NEW; end if;

  select value into v_url_base from private.app_secrets where key = 'functions_url';
  if v_url_base is null then return NEW; end if;

  select value into v_secreto from private.app_secrets where key = 'edge_shared_secret';
  if v_secreto is null then
    -- Sin el secreto la función rechazaría la llamada. Avisamos en el log en
    -- vez de hacer una petición que sabemos que va a fallar: si las
    -- notificaciones push dejan de llegar, esto explica por qué.
    raise warning 'notificar_alerta_por_push: falta private.app_secrets.edge_shared_secret; no se envía push';
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url_base || '/send-push',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'X-Astor-Secret', v_secreto),
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );
  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Trigger de alertas → alerta-email
-- ---------------------------------------------------------------------------
create or replace function public.notificar_alerta_por_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_url_base text;
  v_secreto  text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;
  if NEW.severidad not in ('alta','critica')
     and NEW.tipo not in ('carro_no_operativo','equipo_mantenimiento_vencido',
                          'equipo_calibracion_vencida','material_caducado',
                          'control_vencido')
  then return NEW; end if;

  select value into v_url_base from private.app_secrets where key = 'functions_url';
  if v_url_base is null then return NEW; end if;

  select value into v_secreto from private.app_secrets where key = 'edge_shared_secret';
  if v_secreto is null then
    raise warning 'notificar_alerta_por_email: falta private.app_secrets.edge_shared_secret; no se envía email';
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url_base || '/alerta-email',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'X-Astor-Secret', v_secreto),
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );
  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Cron mensual → informe-mensual
--    Enviaba `Authorization: Bearer service_role_key`, que ni coincidía con lo
--    que ve la función ni se comprobaba en ninguna parte.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'informe-mensual-dia-1') then
    perform cron.unschedule('informe-mensual-dia-1');
  end if;

  perform cron.schedule(
    'informe-mensual-dia-1',
    '0 8 1 * *',
    $cron$
    select net.http_post(
      url     := private.get_secret('functions_url') || '/informe-mensual',
      headers := jsonb_build_object(
                   'Content-Type',   'application/json',
                   'X-Astor-Secret', private.get_secret('edge_shared_secret')),
      body    := '{}'::jsonb
    );
    $cron$
  );
end $$;
