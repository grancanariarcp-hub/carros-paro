-- Índices en las claves foráneas que no los tenían.
--
-- Postgres indexa sola la columna a la que APUNTA una clave foránea, pero no
-- la que apunta. Sin ese índice pasan dos cosas, y las dos escalan mal:
--
--   · Cada join o filtro por esa columna recorre la tabla entera. Hoy no se
--     nota —la mayor tiene 71 filas— pero las inspecciones y sus ítems crecen
--     con cada control, para siempre.
--   · Al borrar o desactivar una fila, Postgres tiene que comprobar que nadie
--     la referencia, y sin índice eso es un recorrido completo de CADA tabla
--     que la referencie. Borrar un usuario recorre nueve tablas enteras.
--
-- Se añaden ahora, con las tablas pequeñas, porque crearlos aquí es
-- instantáneo y sobre una tabla llena bloquea escrituras. El coste es un poco
-- más de trabajo en cada inserción, imperceptible a esta escala y muy inferior
-- a lo que ahorran cuando la aplicación lleve unos años funcionando.
--
-- Generados a partir de la propia base, no a mano: así no falta ninguno.

create index if not exists idx_alertas_carro_id
  on alertas (carro_id);
create index if not exists idx_alertas_resuelta_por
  on alertas (resuelta_por);
create index if not exists idx_cajones_carro_id
  on cajones (carro_id);
create index if not exists idx_carros_creado_por
  on carros (creado_por);
create index if not exists idx_carros_plantilla_id
  on carros (plantilla_id);
create index if not exists idx_carros_ubicacion_id
  on carros (ubicacion_id);
create index if not exists idx_categorias_equipo_creado_por
  on categorias_equipo (creado_por);
create index if not exists idx_categorias_equipo_hospital_categoria_id
  on categorias_equipo_hospital (categoria_id);
create index if not exists idx_desfibriladores_carro_id
  on desfibriladores (carro_id);
create index if not exists idx_equipos_creado_por
  on equipos (creado_por);
create index if not exists idx_equipos_ubicacion_id
  on equipos (ubicacion_id);
create index if not exists idx_evidencias_equipo_id
  on evidencias (equipo_id);
create index if not exists idx_evidencias_hospital_id
  on evidencias (hospital_id);
create index if not exists idx_evidencias_inspeccion_id
  on evidencias (inspeccion_id);
create index if not exists idx_evidencias_item_inspeccion_id
  on evidencias (item_inspeccion_id);
create index if not exists idx_evidencias_mantenimiento_id
  on evidencias (mantenimiento_id);
create index if not exists idx_evidencias_subido_por
  on evidencias (subido_por);
create index if not exists idx_historial_mantenimientos_creado_por
  on historial_mantenimientos (creado_por);
create index if not exists idx_historial_mantenimientos_equipo_id
  on historial_mantenimientos (equipo_id);
create index if not exists idx_informes_generado_por
  on informes (generado_por);
create index if not exists idx_inspecciones_auditor_id
  on inspecciones (auditor_id);
create index if not exists idx_inspecciones_firmante_usuario_id
  on inspecciones (firmante_usuario_id);
create index if not exists idx_inspecciones_modificado_por
  on inspecciones (modificado_por);
create index if not exists idx_inspecciones_plantilla_version_id
  on inspecciones (plantilla_version_id);
create index if not exists idx_inspecciones_reabierta_por
  on inspecciones (reabierta_por);
create index if not exists idx_items_inspeccion_material_id
  on items_inspeccion (material_id);
create index if not exists idx_items_inspeccion_plantilla_item_id
  on items_inspeccion (plantilla_item_id);
create index if not exists idx_log_auditoria_usuario_id
  on log_auditoria (usuario_id);
create index if not exists idx_materiales_cajon_id
  on materiales (cajon_id);
create index if not exists idx_notificaciones_hospital_id
  on notificaciones (hospital_id);
create index if not exists idx_perfiles_aprobado_por
  on perfiles (aprobado_por);
create index if not exists idx_plantilla_items_seccion_id
  on plantilla_items (seccion_id);
create index if not exists idx_plantilla_secciones_plantilla_id
  on plantilla_secciones (plantilla_id);
create index if not exists idx_plantilla_versiones_creado_por
  on plantilla_versiones (creado_por);
create index if not exists idx_plantillas_creado_por
  on plantillas (creado_por);
create index if not exists idx_plantillas_dispositivo_categoria_id
  on plantillas_dispositivo (categoria_id);
create index if not exists idx_plantillas_dispositivo_creado_por
  on plantillas_dispositivo (creado_por);
create index if not exists idx_plantillas_dispositivo_deleted_by
  on plantillas_dispositivo (deleted_by);
create index if not exists idx_plantillas_dispositivo_hospital_adoptada_por
  on plantillas_dispositivo_hospital (adoptada_por);
create index if not exists idx_plantillas_dispositivo_hospital_plantilla_id
  on plantillas_dispositivo_hospital (plantilla_id);
create index if not exists idx_plantillas_dispositivo_updated_by
  on plantillas_dispositivo (updated_by);
create index if not exists idx_secciones_creado_por
  on secciones (creado_por);
create index if not exists idx_solicitudes_registro_gestionado_por
  on solicitudes_registro (gestionado_por);
create index if not exists idx_solicitudes_registro_servicio_id
  on solicitudes_registro (servicio_id);
