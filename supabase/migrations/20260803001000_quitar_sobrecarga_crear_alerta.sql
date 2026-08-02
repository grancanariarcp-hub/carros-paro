-- ============================================================================
-- Eliminar la versión obsoleta de crear_alerta_con_notificaciones
-- ============================================================================
-- Existían DOS versiones de la misma función:
--
--   (hospital, tipo, severidad, titulo, mensaje, carro, servicio)
--   (hospital, tipo, severidad, titulo, mensaje, carro, servicio, equipo)
--
-- La segunda añadió p_equipo_id y la primera se quedó ahí. Con las dos
-- presentes, PostgREST no puede decidir cuál invocar y devuelve:
--
--   "Could not choose the best candidate function between: ..."
--
-- Es decir: TODA llamada desde la app fallaba. Y como en los dos sitios donde
-- se llama no se comprobaba el error del RPC, fallaba en silencio:
--
--   app/carro/[id]/control/[tipo]/page.tsx   → alerta de carro no operativo
--   app/admin/carro/[id]/materiales/page.tsx → equipo indispensable movido
--
-- Las llamadas desde dentro de la base de datos (generar_alertas_mantenimiento)
-- no se veían afectadas: allí PostgreSQL resuelve por número de argumentos.
-- Por eso las alertas del cron diario sí funcionaban y las de la app no, algo
-- que desde fuera parecía inexplicable.
--
-- Se elimina la de 7 argumentos. La de 8 tiene p_equipo_id con DEFAULT NULL,
-- así que las llamadas existentes con 7 parámetros siguen funcionando igual —
-- no hay que tocar ningún sitio de los que la usan.
-- ============================================================================

drop function if exists public.crear_alerta_con_notificaciones(
  uuid, text, text, text, text, uuid, uuid
);

do $$
declare
  v_versiones integer;
begin
  select count(*) into v_versiones
  from pg_proc where proname = 'crear_alerta_con_notificaciones';

  if v_versiones <> 1 then
    raise exception
      'Deberia quedar exactamente 1 version de crear_alerta_con_notificaciones, hay %.',
      v_versiones;
  end if;
end $$;
