-- ============================================================================
-- ÁSTOR — BASELINE FUNCIONES (2/5)
-- ============================================================================
-- Funciones plpgsql + triggers reutilizables. Sin RLS aún (eso va en 3/5).
--
-- Ámbitos cubiertos:
--   A) Helpers genéricos          (set_updated_at, audit_log_change)
--   B) Reglas de plan SaaS        (puede_crear_*, estado_plan)
--   C) Alertas + notificaciones   (crear_alerta_con_notificaciones,
--                                  generar_alertas_mantenimiento — AMPLIADA)
--   D) Email asíncrono            (notificar_alerta_por_email — parametrizada)
--   E) Numeración ISO             (generar_codigo_informe)
--   F) Plantillas + versionado    (crear_version_plantilla, copiar_plantilla)
--   G) Inmutabilidad ISO          (bloquear_inspeccion_firmada, log_auditoria_inmutable)
--   H) Lookup cross-servicio      (obtener_recurso_por_codigo_barras)
-- ============================================================================


-- ============================================================================
-- A) HELPERS GENÉRICOS
-- ============================================================================

-- A.1  set_updated_at — trigger genérico para mantener updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- updated_by se rellena desde el cliente (no hay manera fiable de inferir
  -- auth.uid() en un trigger que también dispare desde cron)
  return new;
end;
$$;

-- A.2  audit_log_change — trigger genérico que escribe en log_auditoria
-- Captura INSERT / UPDATE / DELETE con los valores antes/después en jsonb.
-- IMPORTANTE: SECURITY DEFINER porque escribe en log_auditoria, que tiene RLS.
create or replace function public.audit_log_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hospital_id uuid;
  v_registro_id uuid;
  v_antes  jsonb;
  v_despues jsonb;
begin
  -- Detectar hospital_id si la tabla lo tiene (cualquiera de los dos lados)
  if TG_OP = 'DELETE' then
    v_antes   := to_jsonb(OLD);
    v_despues := null;
    v_registro_id := (OLD).id;
    v_hospital_id := (v_antes->>'hospital_id')::uuid;
  elsif TG_OP = 'UPDATE' then
    v_antes   := to_jsonb(OLD);
    v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_hospital_id := coalesce((v_despues->>'hospital_id')::uuid,
                              (v_antes->>'hospital_id')::uuid);
  else  -- INSERT
    v_antes   := null;
    v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_hospital_id := (v_despues->>'hospital_id')::uuid;
  end if;

  insert into public.log_auditoria (
    hospital_id, usuario_id, accion, tabla_afectada, registro_id,
    valores_antes, valores_despues
  ) values (
    v_hospital_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id,
    v_antes, v_despues
  );

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;


-- ============================================================================
-- B) REGLAS DE PLAN SAAS
-- ============================================================================

-- B.1  puede_crear_carro — verifica límite del plan
create or replace function public.puede_crear_carro(p_hospital_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_max int;
  v_actual int;
begin
  select max_carros into v_max from public.hospitales where id = p_hospital_id;
  select count(*) into v_actual
  from public.carros
  where hospital_id = p_hospital_id and activo = true and deleted_at is null;
  return v_actual < v_max;
end;
$$;

-- B.2  puede_crear_usuario
create or replace function public.puede_crear_usuario(p_hospital_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_max int;
  v_actual int;
begin
  select max_usuarios into v_max from public.hospitales where id = p_hospital_id;
  select count(*) into v_actual
  from public.perfiles
  where hospital_id = p_hospital_id and activo = true and deleted_at is null;
  return v_actual < v_max;
end;
$$;

-- B.3  estado_plan — devuelve cupos y disponibilidad (consumido por el frontend)
create or replace function public.estado_plan(p_hospital_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_h public.hospitales%rowtype;
  v_carros int;
  v_usuarios int;
begin
  select * into v_h from public.hospitales where id = p_hospital_id;

  select count(*) into v_carros
  from public.carros
  where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  select count(*) into v_usuarios
  from public.perfiles
  where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  return jsonb_build_object(
    'plan',                 v_h.plan,
    'max_carros',           v_h.max_carros,
    'carros_usados',        v_carros,
    'carros_disponibles',   v_h.max_carros - v_carros,
    'puede_crear_carro',    v_carros   < v_h.max_carros,
    'max_usuarios',         v_h.max_usuarios,
    'usuarios_usados',      v_usuarios,
    'usuarios_disponibles', v_h.max_usuarios - v_usuarios,
    'puede_crear_usuario',  v_usuarios < v_h.max_usuarios
  );
end;
$$;


-- ============================================================================
-- C) ALERTAS + NOTIFICACIONES
-- ============================================================================

-- C.1  crear_alerta_con_notificaciones
-- Inserta una alerta y crea notificaciones in-app para:
--   - administradores del hospital
--   - calidad del hospital
--   - supervisores del servicio (con prefijo "(tu servicio)")
--   - resto de supervisores del hospital
--   - superadmins (solo si severidad alta o critica)
-- Devuelve el uuid de la alerta creada.
create or replace function public.crear_alerta_con_notificaciones(
  p_hospital_id uuid,
  p_tipo        text,
  p_severidad   text,
  p_titulo      text,
  p_mensaje     text,
  p_carro_id    uuid default null,
  p_servicio_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alerta_id uuid;
  v_url_base  text;
begin
  if p_hospital_id is null then
    raise exception 'hospital_id es obligatorio';
  end if;
  if p_tipo is null or length(trim(p_tipo)) = 0 then
    raise exception 'tipo es obligatorio';
  end if;
  if p_severidad not in ('baja','media','alta','critica') then
    raise exception 'severidad inválida: %', p_severidad;
  end if;

  v_url_base := case
    when p_carro_id    is not null then '/carro/'    || p_carro_id::text
    when p_servicio_id is not null then '/servicio/' || p_servicio_id::text
    else null
  end;

  -- 1) la alerta
  insert into public.alertas (
    hospital_id, tipo, severidad, titulo, mensaje,
    carro_id, servicio_id, resuelta
  ) values (
    p_hospital_id, p_tipo, p_severidad, p_titulo, p_mensaje,
    p_carro_id, p_servicio_id, false
  )
  returning id into v_alerta_id;

  -- 2) administradores del hospital
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id
    and pf.rol = 'administrador'
    and pf.activo = true
    and pf.recibir_alertas = true;

  -- 3) calidad del hospital (mismo nivel de visibilidad que admin)
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id
    and pf.rol = 'calidad'
    and pf.activo = true
    and pf.recibir_alertas = true;

  -- 4) supervisores del servicio afectado (prioridad alta)
  if p_servicio_id is not null then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo, p_titulo || ' (tu servicio)', p_mensaje,
           case when v_url_base is null then null else '/supervisor' || v_url_base end
    from public.perfiles pf
    where pf.hospital_id = p_hospital_id
      and pf.rol = 'supervisor'
      and pf.servicio_id = p_servicio_id
      and pf.activo = true
      and pf.recibir_alertas = true;
  end if;

  -- 5) supervisores de OTROS servicios del hospital (informativo)
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/supervisor' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id
    and pf.rol = 'supervisor'
    and pf.activo = true
    and pf.recibir_alertas = true
    and (p_servicio_id is null
         or pf.servicio_id is null
         or pf.servicio_id <> p_servicio_id);

  -- 6) superadmins (solo severidades altas)
  if p_severidad in ('alta','critica') then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo,
           '[' || upper(p_severidad) || '] ' || p_titulo, p_mensaje,
           '/superadmin/hospitales/' || p_hospital_id::text
    from public.perfiles pf
    where pf.rol = 'superadmin'
      and pf.activo = true
      and pf.recibir_alertas = true;
  end if;

  return v_alerta_id;
end;
$$;


-- C.2  generar_alertas_mantenimiento — AMPLIADA
-- Escanea TODA la flota del hospital y crea alertas idempotentemente:
--   1) equipos con mantenimiento vencido
--   2) equipos con mantenimiento próximo (<= 30 días)
--   3) equipos con calibración vencida
--   4) equipos con garantía recientemente vencida
--   5) materiales caducados
--   6) materiales con vencimiento próximo (<= alertas_vencimiento_dias)
--   7) carros marcados no_operativo sin alerta activa
--   8) carros con control vencido
--
-- Idempotente: usa client_uuid sintético (= md5 de tipo+ref) para no duplicar.
create or replace function public.generar_alertas_mantenimiento()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_dias_aviso int;
begin
  ---------------------------------------------------------------------------
  -- 1) Equipos con MANTENIMIENTO VENCIDO
  ---------------------------------------------------------------------------
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proximo_mantenimiento) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento < current_date
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = e.hospital_id
          and a.tipo = 'equipo_mantenimiento_vencido'
          and a.resuelta = false
          and a.mensaje like '%[equipo:' || e.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'equipo_mantenimiento_vencido',
      p_severidad   => case when r.dias_vencido > 90 then 'critica'
                            when r.dias_vencido > 30 then 'alta'
                            else 'media' end,
      p_titulo      => 'Mantenimiento vencido: ' || r.nombre,
      p_mensaje     => 'El equipo "' || r.nombre || '"' ||
                       coalesce(' (censo ' || r.numero_censo || ')', '') ||
                       ' lleva ' || r.dias_vencido || ' día(s) sin mantenimiento. [equipo:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 2) Equipos con MANTENIMIENTO PRÓXIMO (próximos 30 días)
  ---------------------------------------------------------------------------
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           e.fecha_proximo_mantenimiento,
           (e.fecha_proximo_mantenimiento - current_date) as dias_restantes
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento between current_date and current_date + interval '30 days'
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = e.hospital_id
          and a.tipo = 'vencimiento_proximo'
          and a.resuelta = false
          and a.mensaje like '%[equipo:' || e.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'vencimiento_proximo',
      p_severidad   => case when r.dias_restantes <=  7 then 'alta'
                            when r.dias_restantes <= 15 then 'media'
                            else 'baja' end,
      p_titulo      => 'Mantenimiento próximo: ' || r.nombre,
      p_mensaje     => 'El equipo "' || r.nombre || '"' ||
                       coalesce(' (censo ' || r.numero_censo || ')', '') ||
                       ' tiene mantenimiento en ' || r.dias_restantes || ' día(s) (' ||
                       to_char(r.fecha_proximo_mantenimiento, 'DD/MM/YYYY') || '). [equipo:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 3) Equipos con CALIBRACIÓN VENCIDA
  ---------------------------------------------------------------------------
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proxima_calibracion) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proxima_calibracion is not null
      and e.fecha_proxima_calibracion < current_date
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = e.hospital_id
          and a.tipo = 'equipo_calibracion_vencida'
          and a.resuelta = false
          and a.mensaje like '%[equipo:' || e.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'equipo_calibracion_vencida',
      p_severidad   => case when r.dias_vencido > 60 then 'alta' else 'media' end,
      p_titulo      => 'Calibración vencida: ' || r.nombre,
      p_mensaje     => 'El equipo "' || r.nombre || '"' ||
                       coalesce(' (censo ' || r.numero_censo || ')', '') ||
                       ' tiene la calibración vencida hace ' || r.dias_vencido || ' día(s). [equipo:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 4) Equipos con GARANTÍA recientemente vencida (avisar solo la primera semana)
  ---------------------------------------------------------------------------
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           e.fecha_garantia_hasta
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_garantia_hasta is not null
      and e.fecha_garantia_hasta < current_date
      and e.fecha_garantia_hasta >= current_date - interval '7 days'
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = e.hospital_id
          and a.tipo = 'equipo_garantia_vencida'
          and a.resuelta = false
          and a.mensaje like '%[equipo:' || e.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'equipo_garantia_vencida',
      p_severidad   => 'baja',
      p_titulo      => 'Garantía vencida: ' || r.nombre,
      p_mensaje     => 'La garantía del equipo "' || r.nombre || '"' ||
                       coalesce(' (censo ' || r.numero_censo || ')', '') ||
                       ' venció el ' || to_char(r.fecha_garantia_hasta, 'DD/MM/YYYY') ||
                       '. [equipo:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 5) Materiales CADUCADOS (fecha_vencimiento < hoy)
  ---------------------------------------------------------------------------
  for r in
    select m.id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento,
           (current_date - m.fecha_vencimiento) as dias_caducado
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true
      and m.fecha_vencimiento is not null
      and m.fecha_vencimiento < current_date
      and c.activo = true and c.deleted_at is null
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = c.hospital_id
          and a.tipo = 'material_caducado'
          and a.resuelta = false
          and a.mensaje like '%[material:' || m.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'material_caducado',
      p_severidad   => 'alta',
      p_titulo      => 'Material caducado: ' || r.nombre,
      p_mensaje     => 'El material "' || r.nombre || '" caducó el ' ||
                       to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
                       ' (' || r.dias_caducado || ' día(s) caducado). [material:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 6) Materiales con VENCIMIENTO PRÓXIMO (configurable por hospital)
  ---------------------------------------------------------------------------
  for r in
    select m.id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento,
           (m.fecha_vencimiento - current_date) as dias_restantes,
           coalesce(hc.alertas_vencimiento_dias, 7) as dias_aviso
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    left join public.hospital_config hc on hc.hospital_id = c.hospital_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true
      and m.fecha_vencimiento is not null
      and m.fecha_vencimiento >= current_date
      and m.fecha_vencimiento <= current_date + (coalesce(hc.alertas_vencimiento_dias, 7) || ' days')::interval
      and c.activo = true and c.deleted_at is null
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = c.hospital_id
          and a.tipo = 'material_vencimiento_proximo'
          and a.resuelta = false
          and a.mensaje like '%[material:' || m.id::text || ']%'
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'material_vencimiento_proximo',
      p_severidad   => case when r.dias_restantes <= 3 then 'alta' else 'media' end,
      p_titulo      => 'Vencimiento próximo: ' || r.nombre,
      p_mensaje     => 'El material "' || r.nombre || '" vence el ' ||
                       to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
                       ' (' || r.dias_restantes || ' día(s)). [material:' || r.id::text || ']',
      p_carro_id    => r.carro_id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 7) Carros marcados NO OPERATIVO sin alerta activa
  ---------------------------------------------------------------------------
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id
    from public.carros c
    where c.activo = true and c.deleted_at is null
      and c.estado = 'no_operativo'
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = c.hospital_id
          and a.tipo = 'carro_no_operativo'
          and a.resuelta = false
          and a.carro_id = c.id
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'carro_no_operativo',
      p_severidad   => 'critica',
      p_titulo      => 'Carro NO OPERATIVO: ' || r.codigo,
      p_mensaje     => 'El carro ' || r.codigo || ' (' || r.nombre || ') está marcado como NO OPERATIVO.',
      p_carro_id    => r.id,
      p_servicio_id => r.servicio_id
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 8) Carros con CONTROL VENCIDO (proximo_control < hoy)
  ---------------------------------------------------------------------------
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id, c.proximo_control,
           (current_date - c.proximo_control) as dias_retraso
    from public.carros c
    where c.activo = true and c.deleted_at is null
      and c.proximo_control is not null
      and c.proximo_control < current_date
      and not exists (
        select 1 from public.alertas a
        where a.hospital_id = c.hospital_id
          and a.tipo = 'control_vencido'
          and a.resuelta = false
          and a.carro_id = c.id
      )
  loop
    perform public.crear_alerta_con_notificaciones(
      p_hospital_id => r.hospital_id,
      p_tipo        => 'control_vencido',
      p_severidad   => case when r.dias_retraso > 14 then 'alta'
                            when r.dias_retraso >  7 then 'media'
                            else 'baja' end,
      p_titulo      => 'Control vencido: carro ' || r.codigo,
      p_mensaje     => 'El carro ' || r.codigo || ' (' || r.nombre || ') tenía control programado para el ' ||
                       to_char(r.proximo_control, 'DD/MM/YYYY') ||
                       '. Han pasado ' || r.dias_retraso || ' día(s).',
      p_carro_id    => r.id,
      p_servicio_id => r.servicio_id
    );
  end loop;
end;
$$;


-- ============================================================================
-- D) EMAIL ASÍNCRONO — trigger que llama a la edge function
-- ============================================================================
-- Parametrizada con custom GUC `app.functions_url` para que DEV y PROD
-- apunten a su propia edge function. Setear con:
--   alter database postgres set app.functions_url = 'https://<ref>.supabase.co/functions/v1';
-- ============================================================================

create or replace function public.notificar_alerta_por_email()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url_base text;
  v_url      text;
begin
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Solo enviar email para tipos críticos o severidades altas/críticas
  if NEW.tipo not in (
       'carro_no_operativo','equipo_mantenimiento_vencido','equipo_calibracion_vencida',
       'vencimiento_proximo','material_caducado','material_vencimiento_proximo',
       'control_vencido'
     )
     and NEW.severidad not in ('critica','alta')
  then
    return NEW;
  end if;

  v_url_base := current_setting('app.functions_url', true);
  if v_url_base is null or length(v_url_base) = 0 then
    -- No configurado en este entorno: registramos pero no rompemos
    raise warning 'app.functions_url no configurado; email omitido para alerta %', NEW.id;
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

create trigger trigger_alerta_email
  after insert on public.alertas
  for each row execute function public.notificar_alerta_por_email();


-- ============================================================================
-- E) NUMERACIÓN ISO DE INFORMES
-- ============================================================================

create or replace function public.generar_codigo_informe(tipo_inf text)
returns text
language plpgsql
as $$
declare
  v_anio    text := extract(year from now())::text;
  v_seq     int;
  v_prefijo text;
begin
  case tipo_inf
    when 'controles_vencidos'    then v_prefijo := 'INF-CTRL'; v_seq := nextval('seq_inf_ctrl');
    when 'no_operativos'         then v_prefijo := 'INF-NOP';  v_seq := nextval('seq_inf_nop');
    when 'vencimientos'          then v_prefijo := 'INF-VTO';  v_seq := nextval('seq_inf_vto');
    when 'historial_auditorias'  then v_prefijo := 'INF-HIST'; v_seq := nextval('seq_inf_hist');
    when 'control_realizado'     then v_prefijo := 'INF-CON';  v_seq := nextval('seq_inf_con');
    else                              v_prefijo := 'INF';      v_seq := 1;
  end case;
  return v_prefijo || '-' || v_anio || '-' || lpad(v_seq::text, 3, '0');
end;
$$;


-- ============================================================================
-- F) PLANTILLAS — versionado y copia
-- ============================================================================

-- F.1  crear_version_plantilla — toma snapshot inmutable de una plantilla
-- Se llama desde el frontend (o trigger) cada vez que se "publica" una versión.
-- Cierra la versión anterior (vigente_hasta = now) y abre la nueva.
create or replace function public.crear_version_plantilla(p_plantilla_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nueva_version int;
  v_snapshot      jsonb;
  v_id            uuid;
begin
  -- snapshot completo: secciones + items
  select jsonb_build_object(
    'plantilla_id', p_plantilla_id,
    'snapshot_at',  now(),
    'secciones', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',         ps.id,
          'nombre',     ps.nombre,
          'tipo',       ps.tipo,
          'orden',      ps.orden,
          'obligatoria', ps.obligatoria,
          'items', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id',                pi.id,
              'nombre',            pi.nombre,
              'orden',             pi.orden,
              'tipo_campo',        pi.tipo_campo,
              'requerido',         pi.requerido,
              'cantidad_esperada', pi.cantidad_esperada,
              'tiene_vencimiento', pi.tiene_vencimiento,
              'unidad',            pi.unidad,
              'tipos_incidencia',  pi.tipos_incidencia
            ) order by pi.orden), '[]'::jsonb)
            from public.plantilla_items pi
            where pi.seccion_id = ps.id and pi.activo = true
          )
        ) order by ps.orden
      ), '[]'::jsonb)
      from public.plantilla_secciones ps
      where ps.plantilla_id = p_plantilla_id and ps.activo = true
    )
  ) into v_snapshot;

  -- siguiente número de versión
  select coalesce(max(version), 0) + 1
    into v_nueva_version
  from public.plantilla_versiones
  where plantilla_id = p_plantilla_id;

  -- cerrar versión anterior
  update public.plantilla_versiones
     set vigente_hasta = now()
   where plantilla_id = p_plantilla_id and vigente_hasta is null;

  -- crear nueva
  insert into public.plantilla_versiones (plantilla_id, version, snapshot, creado_por)
  values (p_plantilla_id, v_nueva_version, v_snapshot, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;


-- F.2  copiar_plantilla_a_carro — clona la plantilla "es_base = true" del
-- hospital sobre un carro nuevo (evita el "PLANTILLA-01" mágico anterior).
create or replace function public.copiar_plantilla_a_carro(
  p_carro_id     uuid,
  p_plantilla_id uuid default null   -- si null, usa la plantilla base del hospital
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hospital_id uuid;
  v_plantilla   uuid;
  v_seccion     record;
  v_nuevo_cajon uuid;
begin
  select hospital_id into v_hospital_id from public.carros where id = p_carro_id;
  if v_hospital_id is null then
    raise exception 'Carro no encontrado';
  end if;

  v_plantilla := coalesce(
    p_plantilla_id,
    (select id from public.plantillas
      where hospital_id = v_hospital_id and es_base = true and activo = true
      limit 1)
  );

  if v_plantilla is null then
    return; -- no hay plantilla para clonar; sale silenciosamente
  end if;

  -- Por cada sección de tipo "materiales" creamos un cajón con sus items
  for v_seccion in
    select * from public.plantilla_secciones
    where plantilla_id = v_plantilla and tipo = 'materiales' and activo = true
    order by orden
  loop
    insert into public.cajones (carro_id, nombre, orden, activo)
    values (p_carro_id, v_seccion.nombre, v_seccion.orden, true)
    returning id into v_nuevo_cajon;

    insert into public.materiales (cajon_id, nombre, cantidad_requerida, orden, tiene_vencimiento, activo)
    select v_nuevo_cajon, pi.nombre, coalesce(pi.cantidad_esperada, 1),
           pi.orden, coalesce(pi.tiene_vencimiento, true), true
    from public.plantilla_items pi
    where pi.seccion_id = v_seccion.id and pi.activo = true
    order by pi.orden;
  end loop;

  -- vincular el carro a la plantilla
  update public.carros set plantilla_id = v_plantilla where id = p_carro_id;
end;
$$;


-- ============================================================================
-- G) INMUTABILIDAD ISO
-- ============================================================================

-- G.1  bloquear_inspeccion_firmada — una inspección con firmado_en NO se edita ni borra
create or replace function public.bloquear_inspeccion_firmada()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and OLD.firmado_en is not null then
    -- Solo permitimos cambiar campos no estructurales (deleted_at, alerta_enviada).
    -- Cualquier cambio en datos firmados se rechaza.
    if NEW.resultado is distinct from OLD.resultado
       or NEW.observaciones is distinct from OLD.observaciones
       or NEW.precinto_retirado is distinct from OLD.precinto_retirado
       or NEW.precinto_colocado is distinct from OLD.precinto_colocado
       or NEW.firma_url is distinct from OLD.firma_url
       or NEW.firmante_nombre is distinct from OLD.firmante_nombre
       or NEW.firmante_cargo is distinct from OLD.firmante_cargo
    then
      raise exception 'Inspección % está firmada y no puede modificarse (ISO 13485).', OLD.id;
    end if;
  end if;
  if TG_OP = 'DELETE' and OLD.firmado_en is not null then
    raise exception 'Inspección % está firmada y no puede eliminarse.', OLD.id;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create trigger trg_inspecciones_inmutables
  before update or delete on public.inspecciones
  for each row execute function public.bloquear_inspeccion_firmada();


-- G.2  log_auditoria_inmutable — el log no se modifica ni borra
create or replace function public.bloquear_modif_log()
returns trigger
language plpgsql
as $$
begin
  raise exception 'log_auditoria es inmutable (ISO).';
  return null;
end;
$$;

create trigger trg_log_auditoria_inmutable
  before update or delete on public.log_auditoria
  for each row execute function public.bloquear_modif_log();


-- ============================================================================
-- H) LOOKUP CROSS-SERVICIO (escaneo de código de barras por supervisor)
-- ============================================================================
-- Un supervisor solo ve carros/equipos de su servicio en listados, pero al
-- escanear cualquier código del HOSPITAL debe poder ver la ficha. Esta función
-- usa SECURITY DEFINER para hacer el bypass controlado de RLS, pero filtra
-- estrictamente por hospital_id del usuario que llama.
-- ============================================================================

create or replace function public.lookup_codigo_barras(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hospital_id uuid;
  v_resultado   jsonb;
begin
  -- hospital del usuario que llama
  select hospital_id into v_hospital_id
  from public.perfiles where id = auth.uid();

  if v_hospital_id is null then
    return null;
  end if;

  -- 1) ¿Es un carro?
  select jsonb_build_object(
    'tipo', 'carro',
    'id',   c.id,
    'codigo', c.codigo,
    'nombre', c.nombre,
    'estado', c.estado,
    'servicio_id', c.servicio_id
  ) into v_resultado
  from public.carros c
  where c.hospital_id = v_hospital_id
    and (c.codigo = p_codigo or c.codigo_barras_censo = p_codigo)
    and c.activo = true and c.deleted_at is null
  limit 1;
  if v_resultado is not null then return v_resultado; end if;

  -- 2) ¿Es un equipo?
  select jsonb_build_object(
    'tipo', 'equipo',
    'id',   e.id,
    'nombre', e.nombre,
    'numero_censo', e.numero_censo,
    'numero_serie', e.numero_serie,
    'estado', e.estado,
    'servicio_id', e.servicio_id,
    'carro_id',    e.carro_id
  ) into v_resultado
  from public.equipos e
  where e.hospital_id = v_hospital_id
    and (e.codigo_barras = p_codigo or e.numero_censo = p_codigo or e.numero_serie = p_codigo)
    and e.activo = true and e.deleted_at is null
  limit 1;
  if v_resultado is not null then return v_resultado; end if;

  -- 3) ¿Es un material? (a través del cajón → carro → hospital_id)
  select jsonb_build_object(
    'tipo', 'material',
    'id',   m.id,
    'nombre', m.nombre,
    'carro_id', c.id,
    'cajon_id', m.cajon_id,
    'servicio_id', c.servicio_id
  ) into v_resultado
  from public.materiales m
  join public.cajones caj on caj.id = m.cajon_id
  join public.carros  c   on c.id   = caj.carro_id
  where c.hospital_id = v_hospital_id
    and m.codigo_barras = p_codigo
    and m.activo = true and m.deleted_at is null
  limit 1;

  return v_resultado;  -- puede ser null si no se encontró
end;
$$;


-- ============================================================================
-- TRIGGERS DE updated_at  (auto-mantenimiento del campo)
-- ============================================================================

create trigger trg_hospitales_updated   before update on public.hospitales   for each row execute function public.set_updated_at();
create trigger trg_servicios_updated    before update on public.servicios    for each row execute function public.set_updated_at();
create trigger trg_perfiles_updated     before update on public.perfiles     for each row execute function public.set_updated_at();
create trigger trg_carros_updated       before update on public.carros       for each row execute function public.set_updated_at();
create trigger trg_materiales_updated   before update on public.materiales   for each row execute function public.set_updated_at();
create trigger trg_equipos_updated      before update on public.equipos      for each row execute function public.set_updated_at();
create trigger trg_plantillas_updated   before update on public.plantillas   for each row execute function public.set_updated_at();


-- ============================================================================
-- TRIGGERS DE AUDIT LOG  (capturan todo INSERT/UPDATE/DELETE en tablas críticas)
-- ============================================================================

create trigger trg_audit_carros        after insert or update or delete on public.carros        for each row execute function public.audit_log_change();
create trigger trg_audit_equipos       after insert or update or delete on public.equipos       for each row execute function public.audit_log_change();
create trigger trg_audit_inspecciones  after insert or update or delete on public.inspecciones  for each row execute function public.audit_log_change();
create trigger trg_audit_perfiles      after insert or update or delete on public.perfiles      for each row execute function public.audit_log_change();
create trigger trg_audit_plantillas    after insert or update or delete on public.plantillas    for each row execute function public.audit_log_change();
create trigger trg_audit_alertas       after insert or update or delete on public.alertas       for each row execute function public.audit_log_change();
create trigger trg_audit_historial     after insert or update or delete on public.historial_mantenimientos for each row execute function public.audit_log_change();


-- ============================================================================
-- FIN BASELINE 2/5 — Funciones y triggers
--
-- Siguiente: 3/5 baseline_rls.sql — políticas RLS correctas
-- (admin, calidad, supervisor con servicio, escaneo cross-servicio).
-- ============================================================================
