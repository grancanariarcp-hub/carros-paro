-- ============================================================================
-- Encabezado oficial de informes (B): logos por hospital + textos editables
-- ============================================================================
-- Cada hospital sube sus propios logos institucionales (Storage bucket 'logos')
-- y configura los textos del encabezado:
--   - informe_unidad      → "UNIDAD DE PLANIFICACIÓN..." o equivalente
--   - informe_comision    → "COMISIÓN DE..." o equivalente
--   - informe_logo_principal_url   → primer logo (ej. SCS, sistema autonómico)
--   - informe_logo_secundario_url  → segundo logo (ej. Gobierno, fundación)
-- Los códigos por tipo de informe siguen estando en plantillas_informe (que ya
-- existe con codigo_prefijo, titulo_personalizado, membrete_linea1/2, pie_pagina).
-- ============================================================================


-- 1) Columnas nuevas en hospital_config
alter table public.hospital_config add column if not exists informe_unidad text;
alter table public.hospital_config add column if not exists informe_comision text;
alter table public.hospital_config add column if not exists informe_logo_principal_url text;
alter table public.hospital_config add column if not exists informe_logo_secundario_url text;


-- 2) Bucket de Storage para logos institucionales (público, 2MB máx)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2000000,
  array['image/png','image/jpeg','image/jpg','image/svg+xml','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 3) Políticas RLS para storage.objects en bucket 'logos'
--    SELECT: público (los logos se sirven en el cliente sin auth para PDFs).
--    INSERT/UPDATE/DELETE: solo superadmin (única persona que sube logos por hospital).

drop policy if exists logos_select_publico    on storage.objects;
drop policy if exists logos_insert_superadmin on storage.objects;
drop policy if exists logos_update_superadmin on storage.objects;
drop policy if exists logos_delete_superadmin on storage.objects;

create policy logos_select_publico on storage.objects
  for select to public
  using ( bucket_id = 'logos' );

create policy logos_insert_superadmin on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'logos' and public.es_superadmin() );

create policy logos_update_superadmin on storage.objects
  for update to authenticated
  using ( bucket_id = 'logos' and public.es_superadmin() )
  with check ( bucket_id = 'logos' and public.es_superadmin() );

create policy logos_delete_superadmin on storage.objects
  for delete to authenticated
  using ( bucket_id = 'logos' and public.es_superadmin() );


-- 4) Backfill: para hospitales existentes con datos de prueba, dejar el campo
--    informe_unidad / informe_comision por defecto si están vacíos. Se podrán
--    editar después desde /admin/configuracion/hospital.
update public.hospital_config
   set informe_unidad   = coalesce(informe_unidad,   'UNIDAD DE GESTIÓN HOSPITALARIA'),
       informe_comision = coalesce(informe_comision, 'COMITÉ DE CALIDAD Y SEGURIDAD CLÍNICA')
 where informe_unidad is null or informe_comision is null;
