-- Un aparato solo puede salir de un modelo que su hospital pueda usar.
--
-- La clave foránea comprueba que la plantilla existe, no de quién es. Sin esto,
-- un equipo del hospital A podría quedar apuntando a una plantilla privada del
-- hospital B: al mirar el aparato, su modelo saldría vacío (RLS oculta la
-- plantilla ajena) y el inventario por modelo contaría unidades en un centro
-- que no las tiene. El aislamiento entre hospitales es la regla que sostiene
-- toda la aplicación, y aquí no la cubría nada.
--
-- Vale el catálogo compartido (hospital_id null) y las plantillas propias del
-- hospital. Las adoptadas son del catálogo, así que ya entran por la primera
-- vía: no se comprueba la adopción porque retirar un modelo del catálogo no
-- debe invalidar los aparatos ya dados de alta con él.

create or replace function comprobar_plantilla_del_hospital()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hospital_plantilla uuid;
  v_existe boolean;
begin
  if new.plantilla_id is null then
    return new;
  end if;

  select hospital_id, true into v_hospital_plantilla, v_existe
  from plantillas_dispositivo where id = new.plantilla_id;

  if not coalesce(v_existe, false) then
    raise exception 'El modelo indicado no existe.';
  end if;

  if v_hospital_plantilla is not null and v_hospital_plantilla <> new.hospital_id then
    raise exception 'Ese modelo pertenece a otro hospital.';
  end if;

  return new;
end $$;

drop trigger if exists trg_equipo_plantilla_del_hospital on equipos;
create trigger trg_equipo_plantilla_del_hospital
  before insert or update of plantilla_id, hospital_id on equipos
  for each row execute function comprobar_plantilla_del_hospital();
