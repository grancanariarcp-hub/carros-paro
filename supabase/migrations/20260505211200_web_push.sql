-- ============================================================================
-- Web Push: notificaciones del navegador aunque la app esté cerrada
-- ============================================================================
-- Cada usuario puede registrar 1+ subscripciones (una por dispositivo /
-- navegador). El trigger de inserción en `alertas` despachará un push a
-- los destinatarios relevantes (igual que ya hace con email).
--
-- VAPID keys: se generan UNA vez por proyecto y se guardan en
-- private.app_secrets como 'vapid_public_key' y 'vapid_private_key'.
-- ============================================================================


-- 1) Tabla de suscripciones
create table if not exists public.web_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles(id) on delete cascade,
  endpoint     text not null,                -- URL única del navegador
  p256dh       text not null,                -- clave pública del cliente
  auth         text not null,                -- secreto de auth
  user_agent   text,                          -- info del dispositivo (debug)
  creado_en    timestamptz not null default now(),
  ultima_uso   timestamptz,                   -- para limpieza de subs muertas
  -- Una misma suscripción no se duplica
  unique (usuario_id, endpoint)
);

create index if not exists idx_wps_usuario on public.web_push_subscriptions(usuario_id);

grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
grant all on public.web_push_subscriptions to service_role;


-- 2) RLS — el usuario solo gestiona sus propias subscripciones
alter table public.web_push_subscriptions enable row level security;

drop policy if exists wps_select_propias on public.web_push_subscriptions;
drop policy if exists wps_modify_propias on public.web_push_subscriptions;

create policy wps_select_propias on public.web_push_subscriptions
  for select to authenticated
  using ( usuario_id = auth.uid() or public.es_superadmin() );

create policy wps_modify_propias on public.web_push_subscriptions
  for all to authenticated
  using ( usuario_id = auth.uid() or public.es_superadmin() )
  with check ( usuario_id = auth.uid() );


-- 2b) RPC para que la edge function send-push lea las VAPID keys.
--     El schema private no está expuesto vía PostgREST por seguridad.
create or replace function public.get_vapid_secrets()
returns table(out_key text, out_value text)
language sql
security definer
set search_path = public, private
as $$
  select key as out_key, value as out_value
  from private.app_secrets
  where key in ('vapid_public_key', 'vapid_private_key', 'vapid_subject');
$$;

revoke execute on function public.get_vapid_secrets from public, anon, authenticated;
grant execute on function public.get_vapid_secrets to service_role;


-- 3) Trigger en alertas: cuando se crea una alerta crítica/alta, llama a
--    la edge function send-push para enviar a los destinatarios correspondientes.
create or replace function public.notificar_alerta_por_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url_base text;
  v_url      text;
  v_key      text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;

  -- Solo severidades altas/críticas o tipos críticos
  if NEW.severidad not in ('alta','critica')
     and NEW.tipo not in ('carro_no_operativo','equipo_mantenimiento_vencido',
                          'equipo_calibracion_vencida','material_caducado',
                          'control_vencido')
  then
    return NEW;
  end if;

  v_url_base := private.get_secret('functions_url');
  if v_url_base is null then return NEW; end if;

  -- Service role key como Bearer: garantiza acceso aunque la edge function
  -- requiera JWT (Supabase resetea --no-verify-jwt en restarts del proyecto).
  v_key := private.get_secret('service_role_key');

  v_url := v_url_base || '/send-push';
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );

  return NEW;
end;
$$;

drop trigger if exists trigger_alerta_push on public.alertas;
create trigger trigger_alerta_push
  after insert on public.alertas
  for each row execute function public.notificar_alerta_por_push();


-- 4) Igualar trigger de email para que también mande Authorization
--    (tras restart Supabase puede resetear --no-verify-jwt y los triggers
--     que llamen sin Bearer fallarían).
create or replace function public.notificar_alerta_por_email()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url_base text;
  v_url      text;
  v_key      text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;

  if NEW.severidad not in ('alta','critica')
     and NEW.tipo not in ('carro_no_operativo','equipo_mantenimiento_vencido',
                          'equipo_calibracion_vencida','material_caducado',
                          'control_vencido')
  then
    return NEW;
  end if;

  select value into v_url_base from private.app_secrets where key='functions_url';
  if v_url_base is null then return NEW; end if;
  select value into v_key from private.app_secrets where key='service_role_key';

  v_url := v_url_base || '/alerta-email';
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(v_key, '')
    ),
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );

  return NEW;
end;
$$;
