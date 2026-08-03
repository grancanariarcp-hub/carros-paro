-- ============================================================================
-- Catálogo de servicios: plantillas de las que cada hospital toma su copia
-- ============================================================================
-- Situación encontrada el 2026-08-03: 30 servicios (Urgencias, UMI, Quirófano,
-- Neonatología…) existían con hospital_id NULL. La política de lectura es
-- `hospital_id = auth_hospital_id()`, así que NADIE salvo el superadmin los
-- veía, y H.U. Gran Canaria Doctor Negrín figuraba con cero servicios.
--
-- Eso encadenaba dos problemas:
--   - No se podía asignar servicio a un supervisor, porque no había ninguno
--     disponible para su hospital. Y la restricción perfiles_servicio_coherente
--     exige que un supervisor lo tenga, así que cualquier edición de esas
--     fichas fallaba — incluido activar sus notificaciones.
--   - Sin servicio, un supervisor apenas ve carros: la política de carros es
--     `servicio_id = auth_servicio_id()`.
--
-- MODELO
--
-- Los servicios sin hospital pasan a ser PLANTILLAS: un catálogo del que cada
-- centro toma los que necesite. Al adoptarlos se crea una COPIA propia del
-- hospital, no se comparte la fila.
--
-- Copiar y no compartir es deliberado. Toda la app se apoya en el aislamiento
-- entre hospitales: si dos centros apuntaran al mismo servicio, sus carros y
-- supervisores compartirían fila y cualquier informe agrupado por servicio
-- mezclaría datos de ambos. Además cada hospital querrá renombrar o desactivar
-- los suyos sin afectar a los demás.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Marcar el catálogo
-- ---------------------------------------------------------------------------
alter table public.servicios
  add column if not exists es_plantilla boolean not null default false;

comment on column public.servicios.es_plantilla is
  'Servicio del catálogo global, sin hospital. Sirve de plantilla: los hospitales toman copias con copiar_servicios_a_hospital().';

-- Los que ya existían sin hospital son justamente eso.
update public.servicios
   set es_plantilla = true
 where hospital_id is null and es_plantilla = false;

create index if not exists idx_servicios_plantilla
  on public.servicios (es_plantilla) where es_plantilla = true;

-- ---------------------------------------------------------------------------
-- 2) Que los administradores puedan VER el catálogo
--    Sin esto no hay forma de elegir de una lista que no se ve.
-- ---------------------------------------------------------------------------
drop policy if exists servicios_select_hospital on public.servicios;
create policy servicios_select_hospital on public.servicios
  for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
    -- El catálogo es visible para todos: son nombres genéricos de servicios
    -- hospitalarios, no datos de ningún centro.
    or es_plantilla = true
  );

-- ---------------------------------------------------------------------------
-- 3) Adoptar servicios del catálogo
-- ---------------------------------------------------------------------------
create or replace function public.copiar_servicios_a_hospital(
  p_hospital_id  uuid,
  p_servicio_ids uuid[] default null   -- null = todo el catálogo
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol      text;
  v_hospital uuid;
  v_creados  integer := 0;
  v_fila     record;
begin
  select rol, hospital_id into v_rol, v_hospital
  from public.perfiles where id = auth.uid() and activo = true;

  if v_rol not in ('superadmin', 'administrador', 'calidad') then
    raise exception 'Solo administración o calidad pueden añadir servicios.';
  end if;

  if v_rol <> 'superadmin' and p_hospital_id is distinct from v_hospital then
    raise exception 'Solo puedes añadir servicios a tu propio hospital.';
  end if;

  for v_fila in
    select s.id, s.nombre, s.descripcion, s.color
    from public.servicios s
    where s.es_plantilla = true
      and s.activo = true
      and (p_servicio_ids is null or s.id = any(p_servicio_ids))
  loop
    -- Se salta lo que el hospital ya tenga con ese nombre: adoptar dos veces
    -- el mismo servicio dejaría duplicados imposibles de distinguir en los
    -- desplegables.
    if exists (
      select 1 from public.servicios
      where hospital_id = p_hospital_id
        and lower(trim(nombre)) = lower(trim(v_fila.nombre))
        and deleted_at is null
    ) then
      continue;
    end if;

    insert into public.servicios (nombre, descripcion, color, hospital_id, activo, es_plantilla)
    values (v_fila.nombre, v_fila.descripcion, v_fila.color, p_hospital_id, true, false);

    v_creados := v_creados + 1;
  end loop;

  return v_creados;
end;
$$;

comment on function public.copiar_servicios_a_hospital(uuid, uuid[]) is
  'Copia servicios del catálogo a un hospital. Sin lista, copia todos. Omite los que el hospital ya tenga con el mismo nombre.';

revoke execute on function public.copiar_servicios_a_hospital(uuid, uuid[]) from public, anon;
grant  execute on function public.copiar_servicios_a_hospital(uuid, uuid[]) to authenticated;
