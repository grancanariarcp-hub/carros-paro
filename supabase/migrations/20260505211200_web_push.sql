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

  v_url := v_url_base || '/send-push';
  perform net.http_post(
    url     := v_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('alerta_id', NEW.id::text)
  );

  return NEW;
end;
$$;

drop trigger if exists trigger_alerta_push on public.alertas;
create trigger trigger_alerta_push
  after insert on public.alertas
  for each row execute function public.notificar_alerta_por_push();
