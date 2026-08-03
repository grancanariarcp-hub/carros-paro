-- ============================================================================
-- Avisar de inspecciones que llevan días reabiertas
-- ============================================================================
-- Reabrir una inspección la deja editable. Es lo que se busca al corregir un
-- error, pero si nadie la cierra se queda editable indefinidamente y la firma
-- deja de garantizar nada — justo lo contrario de para lo que se creó el
-- mecanismo de reapertura.
--
-- Nadie lo notaría: la inspección se ve normal en los listados, y quien la
-- reabrió puede perfectamente olvidarse. Por eso hace falta que el sistema
-- avise en vez de esperar a que alguien se acuerde.
--
-- Se engancha al cron diario que ya existe (8:00) en lugar de crear otro:
-- menos piezas que mantener y un único sitio donde mirar si algo no corre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Nuevo tipo de alerta
-- ---------------------------------------------------------------------------
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.alertas'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%carro_no_operativo%';

  if v_constraint is not null then
    execute format('alter table public.alertas drop constraint %I', v_constraint);
  end if;

  alter table public.alertas add constraint alertas_tipo_check check (tipo = any (array[
    'carro_no_operativo', 'vencimiento_proximo', 'control_vencido',
    'usuario_creado', 'usuario_aprobado', 'carro_creado', 'informe_generado',
    'sistema', 'equipo_creado', 'equipo_movido', 'equipo_indispensable_movido',
    'equipo_mantenimiento_vencido', 'equipo_calibracion_vencida',
    'equipo_garantia_vencida', 'inspeccion_completada', 'firma_pendiente',
    'material_vencimiento_proximo', 'material_caducado',
    'inspeccion_reabierta_olvidada'
  ]));
end $$;

-- ---------------------------------------------------------------------------
-- 2) Generador de avisos
-- ---------------------------------------------------------------------------
create or replace function public.alertar_inspecciones_reabiertas(p_dias integer default 2)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila    record;
  v_creadas integer := 0;
begin
  for v_fila in
    select i.id, i.reabierta_en, i.motivo_reapertura,
           c.id as carro_id, c.codigo as carro_codigo, c.hospital_id, c.servicio_id,
           p.nombre as reabierta_por_nombre
    from public.inspecciones i
    join public.carros c on c.id = i.carro_id
    left join public.perfiles p on p.id = i.reabierta_por
    where i.reabierta_en is not null
      and i.reabierta_en < now() - make_interval(days => p_dias)
    order by i.reabierta_en
  loop
    -- La comprobación de duplicados va AQUÍ y no en la consulta de arriba: esa
    -- se evalúa una sola vez al abrir el cursor, así que dos inspecciones
    -- reabiertas del mismo carro pasaban ambas el filtro y generaban dos
    -- avisos en la misma ejecución. Dentro del bucle ve las que acaba de crear.
    --
    -- Sin esto el aviso además se repetiría cada mañana hasta que alguien
    -- cierre la inspección, y el ruido diario acaba haciendo que se ignore —
    -- y con él los avisos que sí importan.
    if exists (
      select 1 from public.alertas a
      where a.carro_id = v_fila.carro_id
        and a.tipo = 'inspeccion_reabierta_olvidada'
        and a.resuelta = false
    ) then
      continue;
    end if;

    perform public.crear_alerta_con_notificaciones(
      v_fila.hospital_id,
      'inspeccion_reabierta_olvidada',
      'alta',
      format('Inspección del carro %s lleva %s días reabierta',
             coalesce(v_fila.carro_codigo, '—'),
             extract(day from now() - v_fila.reabierta_en)::integer),
      format('La reabrió %s el %s. Motivo: "%s". Mientras siga abierta puede modificarse, así que conviene cerrarla.',
             coalesce(v_fila.reabierta_por_nombre, 'un administrador'),
             to_char(v_fila.reabierta_en, 'DD/MM/YYYY'),
             coalesce(v_fila.motivo_reapertura, 'sin especificar')),
      v_fila.carro_id,
      v_fila.servicio_id
    );
    v_creadas := v_creadas + 1;
  end loop;

  return v_creadas;
end;
$$;

comment on function public.alertar_inspecciones_reabiertas(integer) is
  'Avisa de inspecciones firmadas que llevan más de N días reabiertas. Una alerta por carro mientras no se resuelva la anterior. La ejecuta el cron diario.';

revoke execute on function public.alertar_inspecciones_reabiertas(integer) from public, anon;

-- ---------------------------------------------------------------------------
-- 3) Engancharlo al cron diario existente
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'generar-alertas-mantenimiento-diario') then
    perform cron.unschedule('generar-alertas-mantenimiento-diario');
  end if;

  perform cron.schedule(
    'generar-alertas-mantenimiento-diario',
    '0 8 * * *',
    $cron$
    select public.generar_alertas_mantenimiento();
    select public.alertar_inspecciones_reabiertas(2);
    $cron$
  );
end $$;
