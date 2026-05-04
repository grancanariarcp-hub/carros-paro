-- ============================================================================
-- alertas.equipo_id: referencia explícita al equipo (en lugar de embeber el
-- UUID dentro del texto del mensaje con [equipo:...]).
-- ============================================================================
-- Bug: el botón "Ver equipo" del panel admin busca el UUID en el mensaje
-- con regex. Las alertas pre-sync no tenían ese sufijo, así que el botón
-- queda inerte. Solución correcta: columna explícita.
--
-- 1) Añade alertas.equipo_id (FK a equipos)
-- 2) Backfill: extrae UUIDs del texto si están, o busca el equipo por
--    nombre+hospital cuando no aparecen.
-- 3) Reescribe crear_alerta_con_notificaciones y generar_alertas_mantenimiento
--    para pasar/poblar equipo_id directamente; los mensajes ya no llevan
--    el sufijo [equipo:...] (más limpios).
-- ============================================================================


-- 1) Columna nueva
alter table public.alertas add column if not exists equipo_id uuid references public.equipos(id) on delete set null;
create index if not exists idx_alertas_equipo_id on public.alertas(equipo_id) where equipo_id is not null;


-- 2) Backfill — primero alertas que ya tienen [equipo:UUID] en el mensaje
update public.alertas a
   set equipo_id = sub.uuid
  from (
    select id,
           (regexp_match(mensaje, '\[equipo:([0-9a-f-]{36})\]'))[1]::uuid as uuid
      from public.alertas
     where mensaje ~ '\[equipo:[0-9a-f-]{36}\]'
       and equipo_id is null
  ) sub
 where a.id = sub.id and a.equipo_id is null;

-- 3) Backfill por nombre del equipo (heurística para alertas pre-sync que NO
--    incluían el sufijo [equipo:UUID]). Patron del mensaje:
--    'El equipo "<nombre>" (censo CEN-XXXX-XXXX) lleva ...'
update public.alertas a
   set equipo_id = e.id
  from public.equipos e
 where a.equipo_id is null
   and a.hospital_id = e.hospital_id
   and a.tipo in ('equipo_mantenimiento_vencido','equipo_calibracion_vencida',
                  'equipo_garantia_vencida','vencimiento_proximo')
   and (
     a.mensaje like 'El equipo "' || e.nombre || '"%' or
     a.mensaje like '%(censo ' || e.numero_censo || ')%'
   );


-- 4) Reescribir crear_alerta_con_notificaciones aceptando p_equipo_id
create or replace function public.crear_alerta_con_notificaciones(
  p_hospital_id uuid,
  p_tipo        text,
  p_severidad   text,
  p_titulo      text,
  p_mensaje     text,
  p_carro_id    uuid default null,
  p_servicio_id uuid default null,
  p_equipo_id   uuid default null
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
  if p_hospital_id is null then raise exception 'hospital_id es obligatorio'; end if;
  if p_tipo is null or length(trim(p_tipo)) = 0 then raise exception 'tipo es obligatorio'; end if;
  if p_severidad not in ('baja','media','alta','critica') then raise exception 'severidad inválida: %', p_severidad; end if;

  v_url_base := case
    when p_carro_id    is not null then '/carro/'    || p_carro_id::text
    when p_equipo_id   is not null then '/admin/equipos/' || p_equipo_id::text
    when p_servicio_id is not null then '/servicio/' || p_servicio_id::text
    else null
  end;

  insert into public.alertas (
    hospital_id, tipo, severidad, titulo, mensaje,
    carro_id, servicio_id, equipo_id, resuelta
  ) values (
    p_hospital_id, p_tipo, p_severidad, p_titulo, p_mensaje,
    p_carro_id, p_servicio_id, p_equipo_id, false
  )
  returning id into v_alerta_id;

  -- administradores
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'administrador'
    and pf.activo = true and pf.recibir_alertas = true;

  -- calidad
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'calidad'
    and pf.activo = true and pf.recibir_alertas = true;

  -- supervisores del servicio afectado
  if p_servicio_id is not null then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo, p_titulo || ' (tu servicio)', p_mensaje,
           case when v_url_base is null then null else '/supervisor' || v_url_base end
    from public.perfiles pf
    where pf.hospital_id = p_hospital_id and pf.rol = 'supervisor'
      and pf.servicio_id = p_servicio_id and pf.activo = true and pf.recibir_alertas = true;
  end if;

  -- supervisores del resto de servicios del hospital
  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/supervisor' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'supervisor'
    and pf.activo = true and pf.recibir_alertas = true
    and (p_servicio_id is null or pf.servicio_id is null or pf.servicio_id <> p_servicio_id);

  -- superadmins solo si severidad alta o critica
  if p_severidad in ('alta','critica') then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo, '[' || upper(p_severidad) || '] ' || p_titulo, p_mensaje,
           '/superadmin/hospitales/' || p_hospital_id::text
    from public.perfiles pf
    where pf.rol = 'superadmin' and pf.activo = true and pf.recibir_alertas = true;
  end if;

  return v_alerta_id;
end;
$$;

grant execute on function public.crear_alerta_con_notificaciones(uuid, text, text, text, text, uuid, uuid, uuid)
  to authenticated;


-- 5) Reescribir generar_alertas_mantenimiento para pasar equipo_id (sin sufijo [equipo:..])
create or replace function public.generar_alertas_mantenimiento()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  -- 1) Equipos con MANTENIMIENTO VENCIDO
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proximo_mantenimiento) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento < current_date
      and not exists (select 1 from public.alertas a
        where a.equipo_id = e.id and a.tipo = 'equipo_mantenimiento_vencido' and a.resuelta = false)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_mantenimiento_vencido',
      case when r.dias_vencido > 90 then 'critica'
           when r.dias_vencido > 30 then 'alta' else 'media' end,
      'Mantenimiento vencido: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' lleva ' || r.dias_vencido || ' día(s) sin mantenimiento.',
      r.carro_id, r.servicio_id, r.id
    );
  end loop;

  -- 2) Equipos con MANTENIMIENTO PRÓXIMO
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           e.fecha_proximo_mantenimiento,
           (e.fecha_proximo_mantenimiento - current_date) as dias_restantes
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento between current_date and current_date + interval '30 days'
      and not exists (select 1 from public.alertas a
        where a.equipo_id = e.id and a.tipo = 'vencimiento_proximo' and a.resuelta = false)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'vencimiento_proximo',
      case when r.dias_restantes <=  7 then 'alta'
           when r.dias_restantes <= 15 then 'media' else 'baja' end,
      'Mantenimiento próximo: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' tiene mantenimiento en ' || r.dias_restantes || ' día(s) (' ||
      to_char(r.fecha_proximo_mantenimiento, 'DD/MM/YYYY') || ').',
      r.carro_id, r.servicio_id, r.id
    );
  end loop;

  -- 3) CALIBRACIÓN VENCIDA
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proxima_calibracion) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proxima_calibracion is not null
      and e.fecha_proxima_calibracion < current_date
      and not exists (select 1 from public.alertas a
        where a.equipo_id = e.id and a.tipo = 'equipo_calibracion_vencida' and a.resuelta = false)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_calibracion_vencida',
      case when r.dias_vencido > 60 then 'alta' else 'media' end,
      'Calibración vencida: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' tiene la calibración vencida hace ' || r.dias_vencido || ' día(s).',
      r.carro_id, r.servicio_id, r.id
    );
  end loop;

  -- 4) GARANTÍA recientemente vencida (ventana de 7 días)
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id, e.fecha_garantia_hasta
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_garantia_hasta is not null
      and e.fecha_garantia_hasta < current_date
      and e.fecha_garantia_hasta >= current_date - interval '7 days'
      and not exists (select 1 from public.alertas a
        where a.equipo_id = e.id and a.tipo = 'equipo_garantia_vencida' and a.resuelta = false)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_garantia_vencida', 'baja',
      'Garantía vencida: ' || r.nombre,
      'La garantía del equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' venció el ' || to_char(r.fecha_garantia_hasta, 'DD/MM/YYYY') || '.',
      r.carro_id, r.servicio_id, r.id
    );
  end loop;

  -- 5) Materiales CADUCADOS
  for r in
    select m.id as material_id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento, (current_date - m.fecha_vencimiento) as dias_caducado
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true and m.fecha_vencimiento is not null
      and m.fecha_vencimiento < current_date
      and c.activo = true and c.deleted_at is null
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'material_caducado'
          and a.resuelta = false and a.mensaje like '%[material:' || m.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'material_caducado', 'alta',
      'Material caducado: ' || r.nombre,
      'El material "' || r.nombre || '" caducó el ' ||
      to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
      ' (' || r.dias_caducado || ' día(s) caducado). [material:' || r.material_id::text || ']',
      r.carro_id, r.servicio_id
    );
  end loop;

  -- 6) Materiales con vencimiento próximo
  for r in
    select m.id as material_id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento, (m.fecha_vencimiento - current_date) as dias_restantes,
           coalesce(hc.alertas_vencimiento_dias, 7) as dias_aviso
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    left join public.hospital_config hc on hc.hospital_id = c.hospital_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true and m.fecha_vencimiento is not null
      and m.fecha_vencimiento >= current_date
      and m.fecha_vencimiento <= current_date + (coalesce(hc.alertas_vencimiento_dias, 7) || ' days')::interval
      and c.activo = true and c.deleted_at is null
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'material_vencimiento_proximo'
          and a.resuelta = false and a.mensaje like '%[material:' || m.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'material_vencimiento_proximo',
      case when r.dias_restantes <= 3 then 'alta' else 'media' end,
      'Vencimiento próximo: ' || r.nombre,
      'El material "' || r.nombre || '" vence el ' ||
      to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
      ' (' || r.dias_restantes || ' día(s)). [material:' || r.material_id::text || ']',
      r.carro_id, r.servicio_id
    );
  end loop;

  -- 7) Carros NO operativos
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id
    from public.carros c
    where c.activo = true and c.deleted_at is null and c.estado = 'no_operativo'
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'carro_no_operativo'
          and a.resuelta = false and a.carro_id = c.id)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'carro_no_operativo', 'critica',
      'Carro NO OPERATIVO: ' || r.codigo,
      'El carro ' || r.codigo || ' (' || r.nombre || ') está marcado como NO OPERATIVO.',
      r.id, r.servicio_id
    );
  end loop;

  -- 8) Carros con CONTROL VENCIDO
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id, c.proximo_control,
           (current_date - c.proximo_control) as dias_retraso
    from public.carros c
    where c.activo = true and c.deleted_at is null
      and c.proximo_control is not null and c.proximo_control < current_date
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'control_vencido'
          and a.resuelta = false and a.carro_id = c.id)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'control_vencido',
      case when r.dias_retraso > 14 then 'alta'
           when r.dias_retraso >  7 then 'media' else 'baja' end,
      'Control vencido: carro ' || r.codigo,
      'El carro ' || r.codigo || ' (' || r.nombre || ') tenía control programado para el ' ||
      to_char(r.proximo_control, 'DD/MM/YYYY') ||
      '. Han pasado ' || r.dias_retraso || ' día(s).',
      r.id, r.servicio_id
    );
  end loop;
end;
$$;
