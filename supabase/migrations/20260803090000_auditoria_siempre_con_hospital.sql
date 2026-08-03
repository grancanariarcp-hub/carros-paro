-- Toda entrada de auditoría debe saber a qué hospital pertenece.
--
-- El disparador genérico toma hospital_id de la propia fila que cambió. Tres
-- de las ocho tablas auditadas no tienen esa columna —inspecciones,
-- historial_mantenimientos y secciones— porque cuelgan de otra que sí la
-- tiene. En esas, la entrada se guardaba con el hospital vacío.
--
-- La consecuencia se ve en la pantalla de auditoría: al filtrar por centro,
-- esas entradas no salen. Y son justo las que más importan —cada control
-- firmado genera una—, así que el registro parecía tener huecos. En una
-- herramienta que existe para dejar trazabilidad, un asiento invisible es
-- peor que no tenerlo, porque nadie sabe que falta.
--
-- Se resuelve el hospital subiendo por la relación que ya existe.
--
-- Lo que NO se hace es rellenar hacia atrás las entradas que ya quedaron sin
-- él. El primer intento fue justamente ese, y lo rechazó el disparador que
-- hace inmutable log_auditoria. Hace bien: reescribir asientos de auditoría es
-- exactamente lo que ese disparador existe para impedir, y la regla no deja de
-- valer porque quien reescribe tenga buena intención. Las diez entradas
-- antiguas se quedan como están; solo se filtrarán bien las nuevas.

create or replace function audit_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_id uuid;
  v_registro_id uuid;
  v_antes   jsonb;
  v_despues jsonb;
  v_fila    jsonb;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD); v_despues := null;
    v_registro_id := (OLD).id;
    v_fila := v_antes;
  elsif TG_OP = 'UPDATE' then
    v_antes := to_jsonb(OLD); v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_fila := v_despues;
  else
    v_antes := null; v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_fila := v_despues;
  end if;

  v_hospital_id := coalesce(
    (v_fila ->> 'hospital_id')::uuid,
    (v_antes ->> 'hospital_id')::uuid
  );

  -- Las que no llevan hospital propio: se sube por su relación. Nunca deja
  -- caer la entrada si no se encuentra; una auditoría incompleta es preferible
  -- a un cambio que se pierde por un fallo al registrarlo.
  if v_hospital_id is null then
    begin
      if TG_TABLE_NAME = 'inspecciones' then
        select c.hospital_id into v_hospital_id
        from carros c where c.id = (v_fila ->> 'carro_id')::uuid;

      elsif TG_TABLE_NAME = 'historial_mantenimientos' then
        select e.hospital_id into v_hospital_id
        from equipos e where e.id = (v_fila ->> 'equipo_id')::uuid;

      elsif TG_TABLE_NAME = 'secciones' then
        select s.hospital_id into v_hospital_id
        from servicios s where s.id = (v_fila ->> 'servicio_id')::uuid;
      end if;
    exception when others then
      v_hospital_id := null;
    end;
  end if;

  insert into log_auditoria (
    hospital_id, usuario_id, accion, tabla_afectada, registro_id,
    valores_antes, valores_despues
  ) values (
    v_hospital_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id,
    v_antes, v_despues
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;
