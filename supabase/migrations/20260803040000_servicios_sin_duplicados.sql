-- Un servicio, un nombre: sin duplicados dentro de un mismo hospital ni en el
-- catálogo.
--
-- Hasta ahora nada lo impedía. copiar_servicios_a_hospital comprueba por su
-- cuenta antes de copiar, pero cualquier alta manual podía crear un segundo
-- "Urgencias" en el mismo centro. Con el desplegable duplicado nadie sabe cuál
-- elegir, y los informes agrupados por servicio se parten en dos trozos que no
-- suman. Al abrir el alta de servicios al superadmin y a los administradores,
-- esa puerta hay que cerrarla antes, no después.
--
-- La comparación ignora mayúsculas y espacios sobrantes: "UCI", "uci" y
-- "UCI " son el mismo servicio para quien lo lee en una lista.

-- Limpieza previa: en producción quedaron dos "Cardiología" en el catálogo.
-- Solo se borra el sobrante si NADA lo referencia; si alguien ya lo estaba
-- usando, la creación del índice fallará y habrá que fusionarlos a mano, que
-- es justo lo que debe pasar (borrar un servicio en uso dejaría carros e
-- inspecciones colgando).
with duplicados as (
  select id,
         row_number() over (
           partition by hospital_id, lower(trim(nombre))
           order by id
         ) as n
  from servicios
  where deleted_at is null
)
delete from servicios s
using duplicados d
where s.id = d.id
  and d.n > 1
  and not exists (select 1 from carros     where servicio_id = s.id)
  and not exists (select 1 from equipos    where servicio_id = s.id)
  and not exists (select 1 from alertas    where servicio_id = s.id)
  and not exists (select 1 from perfiles   where servicio_id = s.id)
  and not exists (select 1 from plantillas where servicio_id = s.id)
  and not exists (select 1 from secciones  where servicio_id = s.id);

-- Servicios de un hospital. Los borrados quedan fuera para poder volver a dar
-- de alta un nombre que se retiró en su día.
create unique index if not exists servicios_unicos_por_hospital
  on servicios (hospital_id, lower(trim(nombre)))
  where deleted_at is null and es_plantilla = false;

-- Catálogo compartido. hospital_id siempre es null aquí, así que el índice
-- anterior no lo cubre.
create unique index if not exists servicios_plantilla_unica
  on servicios (lower(trim(nombre)))
  where deleted_at is null and es_plantilla = true;
