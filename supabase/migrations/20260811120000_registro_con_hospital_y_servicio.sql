-- Que al pedir acceso se elija el centro de una lista, no se escriba a mano.
--
-- Hasta ahora la solicitud guardaba el hospital como texto libre ("Hospital
-- Negrin"). Con eso no se puede asignar a nadie a ninguna parte, así que quien
-- aprobaba tenía que adivinar el centro y elegirlo otra vez. Ahora se elige de
-- un desplegable y la solicitud viaja con el identificador real.
--
-- De paso se cierran dos cosas que aparecieron al mirar esto de cerca.

-- ---------------------------------------------------------------------------
-- 1) FUGA: la tabla hospitales entera era legible sin iniciar sesión
-- ---------------------------------------------------------------------------
-- La política dejaba a cualquiera con la clave anónima —que va dentro del
-- JavaScript público, o sea, cualquiera— leer TODAS las columnas de los
-- hospitales activos: email_admin (direcciones personales reales), plan,
-- límites de contratación y teléfono.
--
-- RLS filtra filas, no columnas, así que no basta con retocar la política: hay
-- que dejar de dar acceso a la tabla y exponer solo lo imprescindible.
-- Comprobado antes de quitarla: ninguna pantalla lee hospitales sin sesión
-- —todas parten del hospital del perfil—, así que no rompe nada.
drop policy if exists hospitales_select_publico_login on hospitales;

-- Lo único que necesita el desplegable de registro. La vista NO lleva
-- security_invoker a propósito: tiene que saltarse RLS para que un visitante
-- sin cuenta pueda ver la lista. Por eso selecciona dos columnas y nada más;
-- si algún día se le añaden campos, se vuelve a publicar lo que se acaba de
-- cerrar.
create or replace view hospitales_para_registro as
  select id, nombre
  from hospitales
  where activo = true and deleted_at is null;

comment on view hospitales_para_registro is
  'Solo id y nombre de los hospitales activos, para el desplegable de solicitud de acceso. Deliberadamente sin security_invoker: la ve quien aun no tiene cuenta. NO anadir columnas.';

grant select on hospitales_para_registro to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Los servicios de un hospital, para el segundo desplegable
-- ---------------------------------------------------------------------------
-- Como función y no como vista: así hay que indicar de qué hospital, y no se
-- puede pedir el mapa de servicios de todos los centros de una vez.
create or replace function servicios_para_registro(p_hospital_id uuid)
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.nombre
  from servicios s
  where s.hospital_id = p_hospital_id
    and s.activo = true
    and s.deleted_at is null
    and s.es_plantilla = false
  order by s.nombre
$$;

revoke all on function servicios_para_registro(uuid) from public;
grant execute on function servicios_para_registro(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) La solicitud guarda a qué hospital y servicio se refiere
-- ---------------------------------------------------------------------------
-- hospital_nombre se conserva: las solicitudes antiguas solo tienen eso, y
-- borrarlo dejaría sin contexto a quien las revise.
alter table solicitudes_registro
  add column if not exists hospital_id uuid references hospitales(id),
  add column if not exists servicio_id uuid references servicios(id);

create index if not exists idx_solicitudes_hospital
  on solicitudes_registro (hospital_id) where hospital_id is not null;

-- El nombre del centro es obligatorio y se sigue usando para mostrar la
-- solicitud. Lo rellena la base a partir del identificador en vez de fiarse de
-- que el navegador lo mande: son el mismo dato, y si llegaran distintos la
-- solicitud diría un centro y apuntaría a otro.
create or replace function completar_centro_de_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.hospital_id is not null then
    select nombre into NEW.hospital_nombre from hospitales where id = NEW.hospital_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_completar_centro_solicitud on solicitudes_registro;
create trigger trg_completar_centro_solicitud
  before insert on solicitudes_registro
  for each row execute function completar_centro_de_solicitud();

-- ---------------------------------------------------------------------------
-- 4) Que alguien se entere de que hay una solicitud nueva
-- ---------------------------------------------------------------------------
-- El formulario intentaba avisar a los superadmin buscándolos en `perfiles`,
-- pero lo hace un visitante sin sesión y RLS no le deja ver ningún perfil: la
-- consulta devolvía cero filas y no se creaba ningún aviso. Nunca. Las
-- solicitudes solo se veían si alguien entraba a mirar la pestaña por su
-- cuenta, que es justo como se detectó este fallo.
--
-- Desde un disparador sí se puede, porque corre con privilegios y no depende
-- de quién esté delante.
create or replace function avisar_solicitud_de_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro text;
begin
  select coalesce(h.nombre, NEW.hospital_nombre, 'centro sin indicar')
    into v_centro
  from hospitales h where h.id = NEW.hospital_id;

  v_centro := coalesce(v_centro, NEW.hospital_nombre, 'centro sin indicar');

  -- Al superadmin siempre: es quien gestiona las altas de cualquier centro.
  -- Y al administrador del hospital elegido, si la solicitud dice cual, para
  -- que no dependa de una sola persona.
  insert into notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, leida, accion_url)
  select p.hospital_id, p.id, 'usuario_creado',
         'Solicitud de acceso: ' || NEW.nombre,
         NEW.nombre || ' (' || NEW.email || ') pide acceso como ' ||
           coalesce(NEW.rol_solicitado, 'usuario') || ' en ' || v_centro || '.',
         false,
         case when p.rol = 'superadmin' then '/superadmin' else '/admin/usuarios' end
  from perfiles p
  where p.activo = true
    and (
      p.rol = 'superadmin'
      or (NEW.hospital_id is not null
          and p.hospital_id = NEW.hospital_id
          and p.rol in ('administrador', 'calidad'))
    );

  return NEW;
end $$;

drop trigger if exists trg_avisar_solicitud on solicitudes_registro;
create trigger trg_avisar_solicitud
  after insert on solicitudes_registro
  for each row execute function avisar_solicitud_de_registro();
