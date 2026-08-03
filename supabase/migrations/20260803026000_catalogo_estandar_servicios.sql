-- ============================================================================
-- Catálogo estándar de servicios hospitalarios
-- ============================================================================
-- Estas plantillas existían solo como datos en producción, así que un entorno
-- reconstruido desde las migraciones se quedaba con el catálogo vacío — y sin
-- catálogo no hay de dónde elegir al dar de alta un hospital.
--
-- Es contenido del producto, no datos de un cliente: la lista de servicios de
-- un hospital español es la misma en cualquier centro. Cada uno adopta los que
-- necesite con copiar_servicios_a_hospital().
--
-- Idempotente: no duplica lo que ya exista con el mismo nombre.
-- ============================================================================

insert into public.servicios (nombre, descripcion, activo, es_plantilla, hospital_id)
select v.nombre, v.descripcion, true, true, null
from (values
  ('Alergia', null),
  ('Anestesia REA', null),
  ('Calidad', 'Unidad de calidad asistencial'),
  ('Cardiología', null),
  ('Cirugía Cardiaca', null),
  ('Cirugía General', null),
  ('Cirugía Torácica', null),
  ('Cirugía Vascular', null),
  ('Digestivo', null),
  ('Direcci�n Enfermer�a', 'Direcci�n de enfermer�a del centro'),
  ('Direcci�n M�dica', 'Direcci�n m�dica del centro'),
  ('Guardia central', null),
  ('Hematología', null),
  ('Medicina Interna', null),
  ('Nefrología', null),
  ('Neonatología', null),
  ('Neumología', null),
  ('Neurología', null),
  ('Oncología Médica', null),
  ('Oncología Radioterápica', null),
  ('Pediatría', null),
  ('Psiquiatría', null),
  ('Quirófano', null),
  ('Radiodiagnóstico', null),
  ('Rehabilitación', null),
  ('Traumatología', null),
  ('UMI Cardio-CCV', null),
  ('UMI Coronario-Polivalente', null),
  ('UMI Neuro-Trauma', null),
  ('UMI Polivalente', null),
  ('Urgencias', null),
  ('UTI', null)
) as v(nombre, descripcion)
where not exists (
  select 1 from public.servicios s
  where s.es_plantilla = true
    and lower(trim(s.nombre)) = lower(trim(v.nombre))
);
