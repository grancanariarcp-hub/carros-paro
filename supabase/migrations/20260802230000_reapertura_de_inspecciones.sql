-- ============================================================================
-- Reapertura controlada de inspecciones firmadas
-- ============================================================================
-- Hasta ahora una inspección firmada era inmutable, punto. Eso protege la
-- trazabilidad pero deja sin salida el caso real: el auditor se dio cuenta al
-- día siguiente de que faltaba anotar un material.
--
-- La alternativa —permitir editar sin más— vacía la firma de contenido. Así
-- que se hace lo que hacen los sistemas regulados con un documento firmado: no
-- se edita, se ENMIENDA. La reapertura es explícita, la pide alguien con
-- autoridad, exige un motivo, y queda registrada.
--
-- Lo que NO cambia nunca:
--   fecha, firmado_en, firmante_nombre, firmante_cargo, firma_url
--   La inspección firmada el 12/03 seguirá diciendo que se firmó el 12/03.
--
-- Lo que se añade al enmendarla:
--   modificado_en / modificado_por → "modificado el 15/03 por Fulano"
--   veces_reabierta                → cuántas veces se ha tocado
--
-- Autoridad: solo administrador y calidad, y solo de su propio hospital.
-- Reabrir es una enmienda a un documento firmado; quien se equivoca lo pide y
-- otra persona lo autoriza. Es la separación habitual en sistemas regulados.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Campos de reapertura
-- ---------------------------------------------------------------------------
alter table public.inspecciones
  add column if not exists reabierta_en      timestamptz,
  add column if not exists reabierta_por     uuid references public.perfiles(id),
  add column if not exists motivo_reapertura text,
  add column if not exists modificado_en     timestamptz,
  add column if not exists modificado_por    uuid references public.perfiles(id),
  add column if not exists veces_reabierta   integer not null default 0;

comment on column public.inspecciones.reabierta_en is
  'Si no es null, la inspección está ABIERTA y admite cambios. Al cerrarla vuelve a null.';
comment on column public.inspecciones.modificado_en is
  'Última vez que se enmendó tras la firma original. Se muestra como "modificado el ..." junto a la fecha de firma, que nunca cambia.';

create index if not exists idx_inspecciones_reabiertas
  on public.inspecciones (reabierta_en) where reabierta_en is not null;

-- ---------------------------------------------------------------------------
-- 2) La cabecera: bloquear salvo que esté reabierta
-- ---------------------------------------------------------------------------
create or replace function public.bloquear_inspeccion_firmada()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and OLD.firmado_en is not null then

    -- La firma original es intocable SIEMPRE, incluso con la inspección
    -- reabierta. Si se pudiera mover la fecha de firma o borrarla, toda la
    -- trazabilidad se vendría abajo: bastaría con "desfirmar" para editar.
    if NEW.firmado_en   is distinct from OLD.firmado_en
       or NEW.firma_url is distinct from OLD.firma_url
       or NEW.firmante_nombre is distinct from OLD.firmante_nombre
       or NEW.firmante_cargo  is distinct from OLD.firmante_cargo
       or NEW.fecha           is distinct from OLD.fecha
    then
      raise exception 'La firma de la inspección % no puede alterarse (ISO 13485).', OLD.id;
    end if;

    -- El contenido sí, pero solo con la inspección reabierta.
    if OLD.reabierta_en is null then
      if NEW.resultado is distinct from OLD.resultado
         or NEW.observaciones     is distinct from OLD.observaciones
         or NEW.precinto_retirado is distinct from OLD.precinto_retirado
         or NEW.precinto_colocado is distinct from OLD.precinto_colocado
      then
        raise exception 'Inspección % está firmada y no puede modificarse (ISO 13485). Reábrela primero.', OLD.id;
      end if;
    end if;
  end if;

  if TG_OP = 'DELETE' and OLD.firmado_en is not null then
    raise exception 'Inspección % está firmada y no puede borrarse (ISO 13485).', OLD.id;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) El detalle: mismo criterio
-- ---------------------------------------------------------------------------
create or replace function public.bloquear_items_de_inspeccion_firmada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspeccion uuid;
  v_firmado    timestamptz;
  v_reabierta  timestamptz;
begin
  v_inspeccion := coalesce(NEW.inspeccion_id, OLD.inspeccion_id);

  select firmado_en, reabierta_en into v_firmado, v_reabierta
  from public.inspecciones
  where id = v_inspeccion;

  if v_firmado is not null and v_reabierta is null then
    raise exception
      'La inspección % está firmada: su detalle no puede modificarse (ISO 13485). Reábrela primero.',
      v_inspeccion;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Reabrir
-- ---------------------------------------------------------------------------
create or replace function public.reabrir_inspeccion(
  p_inspeccion_id uuid,
  p_motivo        text
)
returns public.inspecciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol         text;
  v_hospital    uuid;
  v_insp        public.inspecciones;
  v_hosp_carro  uuid;
begin
  select rol, hospital_id into v_rol, v_hospital
  from public.perfiles where id = auth.uid() and activo = true;

  if v_rol is null then
    raise exception 'Tu cuenta no está activa.';
  end if;

  if v_rol not in ('superadmin', 'administrador', 'calidad') then
    raise exception 'Solo administración o calidad pueden reabrir una inspección firmada.';
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Indica el motivo de la reapertura (mínimo 10 caracteres). Queda registrado en la auditoría.';
  end if;

  -- Dos consultas y no un join con INTO doble: plpgsql no admite una variable
  -- de tipo registro junto a otras en la misma lista de INTO.
  select * into v_insp from public.inspecciones where id = p_inspeccion_id;
  select hospital_id into v_hosp_carro from public.carros where id = v_insp.carro_id;

  if v_insp.id is null then
    raise exception 'Inspección no encontrada.';
  end if;

  if v_rol <> 'superadmin' and v_hosp_carro is distinct from v_hospital then
    raise exception 'Esa inspección pertenece a otro hospital.';
  end if;

  if v_insp.firmado_en is null then
    raise exception 'Esa inspección no está firmada: se puede editar directamente.';
  end if;

  if v_insp.reabierta_en is not null then
    raise exception 'Esa inspección ya está reabierta.';
  end if;

  update public.inspecciones set
    reabierta_en      = now(),
    reabierta_por     = auth.uid(),
    motivo_reapertura = trim(p_motivo),
    veces_reabierta   = veces_reabierta + 1
  where id = p_inspeccion_id
  returning * into v_insp;

  insert into public.log_auditoria
    (usuario_id, accion, tabla_afectada, registro_id, hospital_id, resultado, detalle)
  values
    (auth.uid(), 'inspeccion_reabierta', 'inspecciones', p_inspeccion_id, v_hosp_carro, 'exito',
     jsonb_build_object('motivo', trim(p_motivo), 'veces_reabierta', v_insp.veces_reabierta));

  return v_insp;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Cerrar
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_inspeccion(p_inspeccion_id uuid)
returns public.inspecciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol        text;
  v_hospital   uuid;
  v_insp       public.inspecciones;
  v_hosp_carro uuid;
begin
  select rol, hospital_id into v_rol, v_hospital
  from public.perfiles where id = auth.uid() and activo = true;

  if v_rol not in ('superadmin', 'administrador', 'calidad') then
    raise exception 'Solo administración o calidad pueden cerrar una inspección reabierta.';
  end if;

  -- Dos consultas y no un join con INTO doble: plpgsql no admite una variable
  -- de tipo registro junto a otras en la misma lista de INTO.
  select * into v_insp from public.inspecciones where id = p_inspeccion_id;
  select hospital_id into v_hosp_carro from public.carros where id = v_insp.carro_id;

  if v_insp.id is null then
    raise exception 'Inspección no encontrada.';
  end if;

  if v_rol <> 'superadmin' and v_hosp_carro is distinct from v_hospital then
    raise exception 'Esa inspección pertenece a otro hospital.';
  end if;

  if v_insp.reabierta_en is null then
    raise exception 'Esa inspección no está reabierta.';
  end if;

  -- Se sella la enmienda. `firmado_en` no se toca: la inspección seguirá
  -- diciendo que se firmó cuando se firmó, y además que se modificó ahora.
  update public.inspecciones set
    reabierta_en   = null,
    modificado_en  = now(),
    modificado_por = auth.uid()
  where id = p_inspeccion_id
  returning * into v_insp;

  insert into public.log_auditoria
    (usuario_id, accion, tabla_afectada, registro_id, hospital_id, resultado, detalle)
  values
    (auth.uid(), 'inspeccion_cerrada', 'inspecciones', p_inspeccion_id, v_hosp_carro, 'exito',
     jsonb_build_object('veces_reabierta', v_insp.veces_reabierta));

  return v_insp;
end;
$$;

revoke execute on function public.reabrir_inspeccion(uuid, text) from public, anon;
revoke execute on function public.cerrar_inspeccion(uuid)        from public, anon;
grant  execute on function public.reabrir_inspeccion(uuid, text) to authenticated;
grant  execute on function public.cerrar_inspeccion(uuid)        to authenticated;
