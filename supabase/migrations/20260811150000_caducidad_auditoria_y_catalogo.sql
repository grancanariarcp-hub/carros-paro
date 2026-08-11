-- Dos cosas pequeñas que evitan problemas grandes más adelante.

-- ---------------------------------------------------------------------------
-- 1) El registro de auditoría no puede crecer para siempre
-- ---------------------------------------------------------------------------
-- Cada cambio en ocho tablas deja un asiento con la fila ENTERA antes y
-- después, en JSON. Con cien carros y control mensual eso crece rápido, y
-- nunca se poda: hoy son 51 filas, pero la curva es la que es y el plan
-- gratuito son 500 MB para todo.
--
-- Se conservan cinco años. No es una cifra inventada: la trazabilidad de un
-- producto sanitario tiene que aguantar auditorías de acreditación, que miran
-- varios ciclos atrás. Antes que borrar de menos, se borra de más tarde.
--
-- Lo que NO cambia es que el registro sea inmutable. Un disparador impide
-- modificarlo o borrarlo —hoy me impidió a mí reescribir asientos antiguos, y
-- hacía bien—. La poda es la única excepción, y queda escrita aquí en vez de
-- repartida por el código: se marca la sesión mientras poda y el disparador
-- solo deja pasar el borrado con esa marca puesta.

create or replace function bloquear_modif_log()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'DELETE'
     and current_setting('astor.podando_auditoria', true) = 'si' then
    return OLD;
  end if;

  raise exception 'log_auditoria es inmutable (ISO).';
end $$;

create or replace function podar_auditoria_antigua(p_anios integer default 5)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  -- El tercer argumento en true la hace local a la transacción: al terminar se
  -- desactiva sola, incluso si algo falla a mitad.
  perform set_config('astor.podando_auditoria', 'si', true);

  delete from log_auditoria
  where fecha < now() - make_interval(years => p_anios);

  get diagnostics v_borradas = row_count;

  perform set_config('astor.podando_auditoria', 'no', true);
  return v_borradas;
end $$;

revoke all on function podar_auditoria_antigua(integer) from public;

comment on function podar_auditoria_antigua is
  'Retira asientos de auditoria de mas de N anios (5 por defecto). La ejecuta pg_cron; nadie mas necesita permiso.';

-- Una vez al mes basta: no hay prisa por retirar algo de hace cinco años.
select cron.unschedule('podar-auditoria')
 where exists (select 1 from cron.job where jobname = 'podar-auditoria');

select cron.schedule(
  'podar-auditoria',
  '0 4 1 * *',
  $cron$ select public.podar_auditoria_antigua(5) $cron$
);

-- ---------------------------------------------------------------------------
-- 2) El catálogo compartido, solo para quien tenga cuenta
-- ---------------------------------------------------------------------------
-- Las plantillas de carro y los modelos de dispositivo se leían sin iniciar
-- sesión. Comprobado: lo propio de cada hospital NO se filtraba, solo el
-- catálogo común, que es contenido genérico. Aun así sobra: las políticas no
-- decían para quién eran, así que valían para todo el mundo —incluido `anon`—
-- y quedaban a una migración de distancia de publicar algo que sí importa.
drop policy if exists plantillas_select on plantillas;
create policy plantillas_select on plantillas
  for select to authenticated
  using (
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

drop policy if exists plantillas_disp_select on plantillas_dispositivo;
create policy plantillas_disp_select on plantillas_dispositivo
  for select to authenticated
  using (
    hospital_id is null            -- el catalogo compartido
    or hospital_id = auth_hospital_id()
    or es_superadmin()
  );

drop policy if exists plantillas_disp_modify on plantillas_dispositivo;
create policy plantillas_disp_modify on plantillas_dispositivo
  for all to authenticated
  using (
    es_superadmin()
    or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  )
  with check (
    es_superadmin()
    or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  );
