-- Las evidencias dejan de ser públicas.
--
-- El almacén `evidencias` estaba marcado como público, y un almacén público se
-- salta las políticas de acceso: daba igual lo que dijeran, cualquiera con la
-- URL descargaba el archivo sin cuenta y sin dejar rastro. Dentro están los
-- PNG de las firmas manuscritas de cada inspección, que identifican por nombre
-- y cargo a personal sanitario concreto. Eso es dato personal, no un detalle
-- de configuración.
--
-- Comprobado antes de escribir esto: se descargó la firma de una inspección
-- real, 18.632 bytes, sin cabecera de sesión ninguna.
--
-- Cerrar el almacén se hace aparte (es una propiedad del bucket, no SQL). Aquí
-- se aprieta lo que ya había: la política dejaba ver CUALQUIER evidencia a
-- cualquier usuario con cuenta activa, incluida la de otro hospital. Ahora
-- cada centro ve las suyas.
--
-- La ruta lleva dentro a quién pertenece el archivo:
--     firmas/{carro}/...        precintos/{carro}/...      equipos/{equipo}/...
-- así que se sube por ella hasta el hospital.

create or replace function evidencia_es_de_mi_hospital(ruta text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_carpetas text[] := storage.foldername(ruta);
  v_id       uuid;
begin
  if public.es_superadmin() then
    return true;
  end if;

  -- El segundo tramo es el identificador. Si no es un uuid, no se reconoce el
  -- archivo y se deniega: es más seguro que dejar pasar lo que no se entiende.
  begin
    v_id := v_carpetas[2]::uuid;
  exception when others then
    return false;
  end;

  if v_carpetas[1] in ('firmas', 'precintos') then
    return exists (
      select 1 from carros c
      where c.id = v_id and c.hospital_id = public.auth_hospital_id()
    );
  elsif v_carpetas[1] = 'equipos' then
    return exists (
      select 1 from equipos e
      where e.id = v_id and e.hospital_id = public.auth_hospital_id()
    );
  end if;

  return false;
end $$;

revoke all on function evidencia_es_de_mi_hospital(text) from public;
grant execute on function evidencia_es_de_mi_hospital(text) to authenticated;

-- Lectura: solo usuarios con sesión activa, y solo lo de su hospital.
drop policy if exists evidencias_lectura on storage.objects;
create policy evidencias_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.activo = true)
    and public.evidencia_es_de_mi_hospital(name)
  );

-- Subida: misma regla. Sin esto, alguien podría dejar archivos colgando de la
-- carpeta de un carro ajeno, y esos archivos se muestran dentro de sus
-- informes firmados.
drop policy if exists evidencias_subida on storage.objects;
create policy evidencias_subida on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.activo = true)
    and public.evidencia_es_de_mi_hospital(name)
  );

-- Las fotos de incidencia viven en otro almacén, ese sí privado desde el
-- principio. Su política solo miraba que hubiera sesión, sin importar el
-- centro; se iguala al criterio de arriba. La ruta aquí es {carro}/archivo,
-- sin carpeta que la preceda.
drop policy if exists fotos_autenticados on storage.objects;
create policy fotos_fallos_de_mi_hospital on storage.objects
  for all to authenticated
  using (
    bucket_id = 'fotos-fallos'
    and (
      public.es_superadmin()
      or exists (
        select 1 from carros c
        where c.id::text = (storage.foldername(name))[1]
          and c.hospital_id = public.auth_hospital_id()
      )
    )
  )
  with check (
    bucket_id = 'fotos-fallos'
    and (
      public.es_superadmin()
      or exists (
        select 1 from carros c
        where c.id::text = (storage.foldername(name))[1]
          and c.hospital_id = public.auth_hospital_id()
      )
    )
  );
