-- Catálogo compartido de plantillas de carro.
--
-- Montar la lista de comprobación de un carro de parada desde cero son
-- decenas de ítems, y hacerlo mal se paga en una parada. Hasta ahora cada
-- hospital empezaba con una hoja en blanco. Con el catálogo, el superadmin
-- prepara plantillas revisadas y cada centro parte de una.
--
-- Aquí SÍ se copia al adoptar, al revés que con los modelos de dispositivo.
-- La diferencia está en el uso: un hospital ajusta su lista (cambia
-- cantidades, añade una sección propia), y las inspecciones firmadas guardan
-- la versión de la plantilla con la que se hicieron por trazabilidad ISO
-- 13485. Si la plantilla fuera compartida, tocarla cambiaría bajo los pies el
-- historial de todos los centros.

-- 1) Sitio para el catálogo dentro de la propia tabla ------------------------
-- Mismo criterio que en servicios: hospital_id vacío = plantilla del catálogo.
alter table plantillas alter column hospital_id drop not null;

alter table plantillas
  add column if not exists es_plantilla boolean not null default false;

comment on column plantillas.es_plantilla is
  'Plantilla del catálogo compartido, sin hospital. Los centros toman copias con copiar_plantilla_a_hospital().';

-- Las dos cosas van siempre juntas; separadas dejarían filas que no son ni
-- del catálogo ni de nadie.
alter table plantillas drop constraint if exists plantillas_catalogo_coherente;
alter table plantillas add constraint plantillas_catalogo_coherente check (
  (es_plantilla = true  and hospital_id is null) or
  (es_plantilla = false and hospital_id is not null)
);

create index if not exists idx_plantillas_catalogo
  on plantillas (es_plantilla) where es_plantilla = true;

-- De qué plantilla del catálogo salió esta copia. Sin esto, saber si un
-- hospital ya adoptó una plantilla habría que adivinarlo comparando nombres, y
-- basta con que alguien la renombre —que puede— para que deje de funcionar.
alter table plantillas
  add column if not exists origen_plantilla_id uuid references plantillas(id);

create index if not exists idx_plantillas_origen
  on plantillas (origen_plantilla_id) where origen_plantilla_id is not null;

-- 2) Que se pueda ver el catálogo -------------------------------------------
-- Sin esto no hay de dónde elegir: una lista invisible no sirve de nada.
-- Escribir en él sigue siendo solo del superadmin, porque la política de
-- escritura exige hospital_id = auth_hospital_id(), y en el catálogo va vacío.
drop policy if exists plantillas_select on plantillas;
create policy plantillas_select on plantillas
  for select using (
    es_superadmin()
    or es_plantilla = true
    or (
      hospital_id = auth_hospital_id()
      and (
        servicio_id is null
        or auth_rol() = any (array['administrador', 'calidad', 'readonly'])
        or servicio_id = auth_servicio_id()
      )
    )
  );

-- 3) Adoptar una plantilla del catálogo --------------------------------------
create or replace function copiar_plantilla_a_hospital(
  p_hospital_id  uuid,
  p_plantilla_id uuid,
  p_nombre       text default null   -- null = conservar el nombre del catálogo
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol      text;
  v_hospital uuid;
  v_origen   record;
  v_nueva    uuid;
  v_seccion  record;
  v_nueva_seccion uuid;
  v_nombre   text;
begin
  select rol, hospital_id into v_rol, v_hospital
  from perfiles where id = auth.uid() and activo = true;

  if v_rol is null then
    raise exception 'Tu cuenta no esta activa.';
  end if;

  if v_rol not in ('superadmin', 'administrador', 'calidad') then
    raise exception 'Solo administracion o calidad pueden adoptar plantillas.';
  end if;

  if v_rol <> 'superadmin' and p_hospital_id is distinct from v_hospital then
    raise exception 'Solo puedes adoptar plantillas para tu propio hospital.';
  end if;

  select * into v_origen from plantillas
  where id = p_plantilla_id and es_plantilla = true and deleted_at is null;

  if not found then
    raise exception 'Esa plantilla no esta en el catalogo.';
  end if;

  v_nombre := coalesce(nullif(trim(p_nombre), ''), v_origen.nombre);

  -- Adoptar dos veces la misma plantilla dejaría dos listas idénticas en el
  -- desplegable y nadie sabría cuál usar. Se mira el nombre y también la
  -- procedencia: adoptarla de nuevo con otro nombre es el mismo problema.
  if exists (
    select 1 from plantillas
    where hospital_id = p_hospital_id
      and lower(trim(nombre)) = lower(trim(v_nombre))
      and deleted_at is null
  ) then
    raise exception 'Este hospital ya tiene una plantilla llamada "%".', v_nombre;
  end if;

  if exists (
    select 1 from plantillas
    where hospital_id = p_hospital_id
      and origen_plantilla_id = p_plantilla_id
      and deleted_at is null
  ) then
    raise exception 'Este hospital ya adopto esa plantilla del catalogo.';
  end if;

  insert into plantillas (hospital_id, nombre, descripcion, tipo_carro,
                          es_base, es_plantilla, activo, creado_por,
                          origen_plantilla_id)
  -- es_base = false a propósito: cuál es la plantilla por defecto lo decide
  -- cada hospital, no el catálogo.
  values (p_hospital_id, v_nombre, v_origen.descripcion, v_origen.tipo_carro,
          false, false, true, auth.uid(), p_plantilla_id)
  returning id into v_nueva;

  for v_seccion in
    select * from plantilla_secciones
    where plantilla_id = p_plantilla_id and coalesce(activo, true)
    order by orden
  loop
    insert into plantilla_secciones (plantilla_id, nombre, descripcion_ayuda,
                                     tipo, icono, orden, obligatoria, activo)
    values (v_nueva, v_seccion.nombre, v_seccion.descripcion_ayuda,
            v_seccion.tipo, v_seccion.icono, v_seccion.orden,
            v_seccion.obligatoria, true)
    returning id into v_nueva_seccion;

    insert into plantilla_items (seccion_id, nombre, descripcion, orden,
                                 tipo_campo, requerido, cantidad_esperada,
                                 tiene_vencimiento, unidad, tipos_incidencia, activo)
    select v_nueva_seccion, i.nombre, i.descripcion, i.orden,
           i.tipo_campo, i.requerido, i.cantidad_esperada,
           i.tiene_vencimiento, i.unidad, i.tipos_incidencia, true
    from plantilla_items i
    where i.seccion_id = v_seccion.id and coalesce(i.activo, true)
    order by i.orden;
  end loop;

  return v_nueva;
end $$;

revoke all on function copiar_plantilla_a_hospital(uuid, uuid, text) from public;
grant execute on function copiar_plantilla_a_hospital(uuid, uuid, text) to authenticated;

-- 4) Semilla -----------------------------------------------------------------
-- Se sube al catálogo la plantilla base que ya venía con la aplicación, con
-- sus secciones e ítems. Es contenido ya revisado y en uso; inventar una lista
-- de comprobación de un carro de parada sin verificar seria imprudente.
do $$
declare
  v_origen  uuid;
  v_nueva   uuid;
  v_seccion record;
  v_nueva_seccion uuid;
begin
  if exists (select 1 from plantillas where es_plantilla = true) then
    return;   -- el catálogo ya tiene algo; no duplicar al reaplicar
  end if;

  select id into v_origen from plantillas
  where es_base = true and deleted_at is null
  order by creado_en limit 1;

  if v_origen is null then
    return;
  end if;

  insert into plantillas (hospital_id, nombre, descripcion, tipo_carro,
                          es_base, es_plantilla, activo)
  select null, nombre, descripcion, tipo_carro, false, true, true
  from plantillas where id = v_origen
  returning id into v_nueva;

  for v_seccion in
    select * from plantilla_secciones where plantilla_id = v_origen order by orden
  loop
    insert into plantilla_secciones (plantilla_id, nombre, descripcion_ayuda,
                                     tipo, icono, orden, obligatoria, activo)
    values (v_nueva, v_seccion.nombre, v_seccion.descripcion_ayuda,
            v_seccion.tipo, v_seccion.icono, v_seccion.orden,
            v_seccion.obligatoria, true)
    returning id into v_nueva_seccion;

    insert into plantilla_items (seccion_id, nombre, descripcion, orden,
                                 tipo_campo, requerido, cantidad_esperada,
                                 tiene_vencimiento, unidad, tipos_incidencia, activo)
    select v_nueva_seccion, i.nombre, i.descripcion, i.orden,
           i.tipo_campo, i.requerido, i.cantidad_esperada,
           i.tiene_vencimiento, i.unidad, i.tipos_incidencia, true
    from plantilla_items i where i.seccion_id = v_seccion.id order by i.orden;
  end loop;
end $$;
