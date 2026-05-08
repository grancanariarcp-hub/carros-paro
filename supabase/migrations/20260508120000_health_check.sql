-- ============================================================================
-- Health-check de configuración de notificaciones
-- ============================================================================
-- Comprueba que `private.app_secrets.functions_url` apunta al proyecto en el
-- que se está ejecutando esta función. Esto lo verificamos comparando el
-- project_ref leyendo `current_setting('supabase.project_ref', true)` (lo
-- expone Supabase en cada base de datos managed).
--
-- Cómo usar:
--   select * from public.fn_health_notif();
--
-- Devuelve filas tipo (componente, ok, valor_actual, esperado, observacion).
-- ============================================================================

create or replace function public.fn_health_notif()
returns table(
  componente text,
  ok        boolean,
  valor_actual text,
  observacion text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url      text;
  v_proj_ref text;
  v_vapid    int;
begin
  -- 1) functions_url
  select value into v_url from private.app_secrets where key = 'functions_url';
  v_proj_ref := coalesce(
    current_setting('supabase.project_ref', true),
    current_setting('supabase.tenant_id', true),
    ''
  );

  componente   := 'functions_url';
  valor_actual := v_url;
  if v_url is null then
    ok := false;
    observacion := 'falta entrada functions_url en private.app_secrets';
  elsif v_proj_ref <> '' and v_url not like '%' || v_proj_ref || '%' then
    ok := false;
    observacion := 'NO contiene project_ref ' || v_proj_ref || ' — apunta al proyecto equivocado';
  else
    ok := true;
    observacion := 'parece correcto';
  end if;
  return next;

  -- 2) VAPID keys
  select count(*) into v_vapid from private.app_secrets
   where key in ('vapid_public_key','vapid_private_key','vapid_subject');
  componente   := 'vapid_keys';
  valor_actual := v_vapid::text || '/3';
  ok           := v_vapid = 3;
  observacion  := case when v_vapid = 3 then 'completas'
                       else 'faltan claves VAPID en private.app_secrets' end;
  return next;

  -- 3) Triggers en alertas
  componente := 'triggers_alertas';
  perform 1 from pg_trigger
    where tgrelid = 'public.alertas'::regclass
      and not tgisinternal
      and tgname in ('trigger_alerta_email','trigger_alerta_push');
  if (select count(*) from pg_trigger
       where tgrelid = 'public.alertas'::regclass
         and not tgisinternal
         and tgname in ('trigger_alerta_email','trigger_alerta_push')) = 2 then
    ok := true;
    valor_actual := '2/2';
    observacion := 'ambos triggers presentes';
  else
    ok := false;
    valor_actual := (select count(*)::text from pg_trigger
                     where tgrelid = 'public.alertas'::regclass
                       and not tgisinternal
                       and tgname in ('trigger_alerta_email','trigger_alerta_push')) || '/2';
    observacion := 'falta trigger_alerta_email y/o trigger_alerta_push';
  end if;
  return next;

  return;
end;
$$;

revoke execute on function public.fn_health_notif() from public, anon, authenticated;
grant execute on function public.fn_health_notif() to service_role;
