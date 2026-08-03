-- ============================================================================
-- Añadir Calidad y las direcciones al catálogo de servicios
-- ============================================================================
-- El catálogo tenía los servicios asistenciales (Urgencias, UMI, Quirófano…)
-- pero ninguno de los transversales. Y hacen falta: los perfiles de calidad y
-- de dirección también necesitan servicio asignado si son supervisores, y hoy
-- no había ninguno que les encajara — habría que meterlos en "Urgencias" o
-- similar, que falsea los informes agrupados por servicio.
--
-- Se añaden al catálogo, no a un hospital concreto: cada centro decide si los
-- adopta, igual que con los demás.
-- ============================================================================

insert into public.servicios (nombre, descripcion, activo, es_plantilla, hospital_id)
select v.nombre, v.descripcion, true, true, null
from (values
  ('Calidad',               'Unidad de calidad asistencial'),
  ('Dirección Enfermería',  'Dirección de enfermería del centro'),
  ('Dirección Médica',      'Dirección médica del centro')
) as v(nombre, descripcion)
where not exists (
  select 1 from public.servicios s
  where s.es_plantilla = true
    and lower(trim(s.nombre)) = lower(trim(v.nombre))
);
