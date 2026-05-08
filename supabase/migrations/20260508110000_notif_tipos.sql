-- ============================================================================
-- Preferencias granulares de notificaciones por usuario
-- ============================================================================
-- Cada usuario puede ajustar qué tipos de alerta recibir y por qué canal
-- (email / push). Si para un tipo no se ha configurado nada, el default es
-- que SÍ recibe (true), siempre y cuando el toggle global del canal esté on:
--   - email: recibir_alertas = true
--   - push:  tener una subscripción activa en web_push_subscriptions
--
-- Estructura de notif_tipos (jsonb, default '{}'):
--   {
--     "carro_no_operativo":         {"push": true,  "email": true},
--     "equipo_mantenimiento_vencido":{"push": true, "email": false},
--     ...
--   }
-- ============================================================================

alter table public.perfiles
  add column if not exists notif_tipos jsonb not null default '{}'::jsonb;

comment on column public.perfiles.notif_tipos is
  'Preferencias granulares por tipo de alerta y canal. Si un tipo no aparece, el default es true (recibe). Override per-tipo: {"tipo": {"push": bool, "email": bool}}';
