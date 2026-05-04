-- ============================================================================
-- ÁSTOR — BASELINE RLS (3/5)
-- ============================================================================
-- Modelo de roles:
--   superadmin     : ve y gestiona TODO el sistema (cross-hospital)
--   administrador  : ve y gestiona TODO su hospital, incluido usuarios
--   calidad        : ve TODO su hospital + crea plantillas globales y audita,
--                    pero NO gestiona usuarios ni configuración del hospital
--   supervisor     : ve solo SU servicio (servicio_id), pero al escanear código
--                    de barras puede ver fichas cross-servicio (vía función
--                    SECURITY DEFINER lookup_codigo_barras)
--   auditor        : ve carros del hospital y crea inspecciones
--   tecnico        : ve equipos del hospital y registra mantenimientos
--   readonly       : ve todo el hospital, no escribe
--
-- Reglas transversales:
--   - Todas las queries filtran por hospital_id == perfiles.hospital_id del
--     usuario autenticado (excepto superadmin)
--   - Las filas con deleted_at IS NOT NULL no se devuelven en SELECT salvo
--     que el rol pueda restaurar (admin/superadmin)
-- ============================================================================


-- ============================================================================
-- 0) FUNCIONES HELPER PARA POLÍTICAS  (evitan repetir subqueries en cada policy)
-- ============================================================================

-- Estas funciones se usan dentro de policies. SECURITY DEFINER + STABLE para
-- que el optimizador las cachee dentro de la query. Devuelven NULL si el
-- usuario no está autenticado.

create or replace function public.auth_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select hospital_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.auth_servicio_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select servicio_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.auth_rol()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select rol from public.perfiles where id = auth.uid() and activo = true
$$;

create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'superadmin' and activo = true
  )
$$;

-- Roles que ven TODO el hospital (admin + calidad + readonly)
create or replace function public.es_admin_o_calidad()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and rol in ('administrador','calidad')
      and activo = true
  )
$$;

create or replace function public.ve_todo_el_hospital()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and rol in ('administrador','calidad','auditor','tecnico','readonly')
      and activo = true
  )
$$;


-- ============================================================================
-- 1) HOSPITALES
-- ============================================================================
-- Solo superadmin gestiona hospitales. Cualquier autenticado puede leer SU
-- hospital (necesario para login por slug, theming, etc.).
-- ============================================================================

create policy hospitales_select_propio on public.hospitales
  for select to authenticated
  using ( id = public.auth_hospital_id() or public.es_superadmin() );

create policy hospitales_select_publico_login on public.hospitales
  for select to anon
  using ( activo = true );  -- solo hospitales activos visibles públicamente (para slug en login)

create policy hospitales_all_superadmin on public.hospitales
  for all to authenticated
  using ( public.es_superadmin() )
  with check ( public.es_superadmin() );


-- ============================================================================
-- 2) SERVICIOS
-- ============================================================================

create policy servicios_select_hospital on public.servicios
  for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
  );

create policy servicios_modify_admin_calidad on public.servicios
  for all to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );


-- ============================================================================
-- 3) PERFILES — la fuga más grave detectada
-- ============================================================================
-- SELECT: lees tu propio perfil + perfiles del MISMO hospital
-- INSERT/UPDATE: solo admin/superadmin + el dueño puede actualizar sus propios
--                campos (recibir_alertas, email_alertas, etc.)
-- DELETE: solo superadmin (preferimos soft-delete)
-- ============================================================================

create policy perfiles_select_self on public.perfiles
  for select to authenticated
  using (
    id = auth.uid()
    or hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
  );

-- self-update: el usuario actualiza su propio perfil pero NO puede cambiar rol,
-- hospital_id, servicio_id, activo, codigo_empleado, aprobado_por
create policy perfiles_update_self on public.perfiles
  for update to authenticated
  using ( id = auth.uid() )
  with check (
    id = auth.uid()
    -- estos campos solo los puede tocar admin (chequear vía trigger BEFORE UPDATE
    -- en una migración posterior; aquí permitimos pero la app debe respetarlo)
  );

create policy perfiles_admin_all on public.perfiles
  for all to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and public.auth_rol() = 'administrador'
    )
  )
  with check (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and public.auth_rol() = 'administrador'
    )
  );


-- ============================================================================
-- 4) HOSPITAL_CONFIG
-- ============================================================================

create policy hospital_config_select on public.hospital_config
  for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
  );

create policy hospital_config_modify_admin on public.hospital_config
  for all to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador')
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador')
  );


-- ============================================================================
-- 5) UBICACIONES
-- ============================================================================

create policy ubicaciones_select on public.ubicaciones
  for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
  );

create policy ubicaciones_modify on public.ubicaciones
  for all to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );


-- ============================================================================
-- 6) CATEGORÍAS DE EQUIPO + pivote
-- ============================================================================

-- Las categorías globales (es_global=true, hospital_id NULL) se ven por todos.
-- Las del hospital, solo por gente de ese hospital.
create policy cat_equipo_select on public.categorias_equipo
  for select to authenticated
  using (
    activo = true
    and (
      hospital_id is null  -- categorías globales
      or hospital_id = public.auth_hospital_id()
      or public.es_superadmin()
    )
  );

-- Crear/editar/borrar: superadmin (globales o cualquiera) o admin/calidad del hospital
create policy cat_equipo_modify on public.categorias_equipo
  for all to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );

create policy cat_hospital_all on public.categorias_equipo_hospital
  for all to authenticated
  using (
    public.es_superadmin()
    or hospital_id = public.auth_hospital_id()
  )
  with check (
    public.es_superadmin()
    or hospital_id = public.auth_hospital_id()
  );


-- ============================================================================
-- 7) PLANTILLAS — controles configurables por hospital y/o servicio
-- ============================================================================

-- SELECT: cualquier usuario activo del hospital ve plantillas de su hospital;
--         si la plantilla tiene servicio_id, supervisores solo ven las de su servicio.
create policy plantillas_select on public.plantillas
  for select to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        servicio_id is null                       -- plantilla global del hospital
        or public.auth_rol() in ('administrador','calidad','readonly')
        or servicio_id = public.auth_servicio_id() -- supervisor: la de su servicio
      )
    )
  );

-- INSERT/UPDATE/DELETE: admin y calidad pueden crear globales y por servicio.
-- Supervisor SOLO puede crear/editar plantillas de SU servicio.
create policy plantillas_modify on public.plantillas
  for all to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  )
  with check (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  );

-- versiones inmutables (snapshot): se leen igual que la plantilla, no se modifican
create policy plantilla_versiones_select on public.plantilla_versiones
  for select to authenticated
  using (
    public.es_superadmin()
    or exists (
      select 1 from public.plantillas p
      where p.id = plantilla_versiones.plantilla_id
        and p.hospital_id = public.auth_hospital_id()
    )
  );

create policy plantilla_versiones_insert on public.plantilla_versiones
  for insert to authenticated
  with check (
    public.es_superadmin()
    or exists (
      select 1 from public.plantillas p
      where p.id = plantilla_versiones.plantilla_id
        and p.hospital_id = public.auth_hospital_id()
        and (
          public.es_admin_o_calidad()
          or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id())
        )
    )
  );

-- secciones e ítems: heredan permisos de la plantilla raíz
create policy plantilla_secciones_select on public.plantilla_secciones
  for select to authenticated
  using ( exists (
    select 1 from public.plantillas p where p.id = plantilla_secciones.plantilla_id
  ));

create policy plantilla_secciones_modify on public.plantilla_secciones
  for all to authenticated
  using ( exists (
    select 1 from public.plantillas p
    where p.id = plantilla_secciones.plantilla_id
      and (
        public.es_superadmin()
        or (p.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id())))
      )
  ))
  with check ( exists (
    select 1 from public.plantillas p
    where p.id = plantilla_secciones.plantilla_id
      and (
        public.es_superadmin()
        or (p.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id())))
      )
  ));

create policy plantilla_items_select on public.plantilla_items
  for select to authenticated
  using ( exists (
    select 1 from public.plantilla_secciones ps where ps.id = plantilla_items.seccion_id
  ));

create policy plantilla_items_modify on public.plantilla_items
  for all to authenticated
  using ( exists (
    select 1
    from public.plantilla_secciones ps
    join public.plantillas p on p.id = ps.plantilla_id
    where ps.id = plantilla_items.seccion_id
      and (
        public.es_superadmin()
        or (p.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id())))
      )
  ))
  with check ( exists (
    select 1
    from public.plantilla_secciones ps
    join public.plantillas p on p.id = ps.plantilla_id
    where ps.id = plantilla_items.seccion_id
      and (
        public.es_superadmin()
        or (p.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id())))
      )
  ));

-- plantilla_informes (config visual del PDF) y plantillas_informe (hospital-level)
create policy plantilla_informes_all on public.plantilla_informes
  for all to authenticated
  using ( exists (
    select 1 from public.plantillas p
    where p.id = plantilla_informes.plantilla_id
      and (public.es_superadmin()
           or (p.hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  ))
  with check ( exists (
    select 1 from public.plantillas p
    where p.id = plantilla_informes.plantilla_id
      and (public.es_superadmin()
           or (p.hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  ));

create policy plantillas_informe_all on public.plantillas_informe
  for all to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );


-- ============================================================================
-- 8) CARROS  (uno de los puntos donde había fuga lectura_publica_carros)
-- ============================================================================

-- SELECT: del hospital. Supervisor restringe a su servicio (en listados).
-- Para el escaneo cross-servicio, la app llama lookup_codigo_barras().
create policy carros_select on public.carros
  for select to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and deleted_at is null
      and (
        public.ve_todo_el_hospital()
        or (public.auth_rol() = 'supervisor' and (
              servicio_id = public.auth_servicio_id()
              or servicio_id is null
            ))
      )
    )
  );

-- INSERT/UPDATE/DELETE: admin y calidad sobre todos los del hospital;
-- supervisor solo sobre los de su servicio.
create policy carros_modify on public.carros
  for all to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  )
  with check (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  );


-- ============================================================================
-- 9) CAJONES, MATERIALES, DESFIBRILADORES (heredan visibilidad del carro)
-- ============================================================================

create policy cajones_all on public.cajones
  for all to authenticated
  using ( exists (
    select 1 from public.carros c
    where c.id = cajones.carro_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and c.deleted_at is null
            and (public.ve_todo_el_hospital()
                 or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null))))
      )
  ))
  with check ( exists (
    select 1 from public.carros c
    where c.id = cajones.carro_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id())))
      )
  ));

create policy materiales_all on public.materiales
  for all to authenticated
  using ( exists (
    select 1 from public.cajones caj
    join public.carros c on c.id = caj.carro_id
    where caj.id = materiales.cajon_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and c.deleted_at is null
            and (public.ve_todo_el_hospital()
                 or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null))))
      )
  ))
  with check ( exists (
    select 1 from public.cajones caj
    join public.carros c on c.id = caj.carro_id
    where caj.id = materiales.cajon_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id())))
      )
  ));

create policy desfibriladores_all on public.desfibriladores
  for all to authenticated
  using ( exists (
    select 1 from public.carros c
    where c.id = desfibriladores.carro_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and (public.ve_todo_el_hospital()
                 or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null))))
      )
  ))
  with check ( exists (
    select 1 from public.carros c
    where c.id = desfibriladores.carro_id
      and (
        public.es_superadmin()
        or (c.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad()
                 or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id())))
      )
  ));


-- ============================================================================
-- 10) EQUIPOS — lectura amplia para mantenimiento; modifica admin/calidad/tecnico
-- ============================================================================

create policy equipos_select on public.equipos
  for select to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and deleted_at is null
      and (
        public.ve_todo_el_hospital()
        or (public.auth_rol() = 'supervisor' and (
              servicio_id = public.auth_servicio_id() or servicio_id is null
            ))
      )
    )
  );

create policy equipos_modify on public.equipos
  for all to authenticated
  using (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or public.auth_rol() = 'tecnico'
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  )
  with check (
    public.es_superadmin()
    or (
      hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or public.auth_rol() = 'tecnico'
        or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
      )
    )
  );

create policy historial_mant_select on public.historial_mantenimientos
  for select to authenticated
  using ( exists (
    select 1 from public.equipos e
    where e.id = historial_mantenimientos.equipo_id
      and (public.es_superadmin() or e.hospital_id = public.auth_hospital_id())
  ));

create policy historial_mant_insert on public.historial_mantenimientos
  for insert to authenticated
  with check ( exists (
    select 1 from public.equipos e
    where e.id = historial_mantenimientos.equipo_id
      and (
        public.es_superadmin()
        or (e.hospital_id = public.auth_hospital_id()
            and (public.es_admin_o_calidad() or public.auth_rol() = 'tecnico'))
      )
  ));

-- las entradas de historial NO se modifican una vez creadas (auditable);
-- solo superadmin puede UPDATE (excepción justificada)
create policy historial_mant_update_super on public.historial_mantenimientos
  for update to authenticated
  using ( public.es_superadmin() )
  with check ( public.es_superadmin() );


-- ============================================================================
-- 11) INSPECCIONES e ITEMS  (la firma garantiza inmutabilidad vía trigger)
-- ============================================================================

create policy inspecciones_select on public.inspecciones
  for select to authenticated
  using (
    public.es_superadmin()
    or exists (
      select 1 from public.carros c
      where c.id = inspecciones.carro_id
        and c.hospital_id = public.auth_hospital_id()
        and (
          public.ve_todo_el_hospital()
          or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null))
        )
    )
  );

create policy inspecciones_insert on public.inspecciones
  for insert to authenticated
  with check ( exists (
    select 1 from public.carros c
    where c.id = inspecciones.carro_id
      and c.hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or public.auth_rol() in ('auditor','supervisor','tecnico')
      )
  ));

create policy inspecciones_update on public.inspecciones
  for update to authenticated
  using ( exists (
    select 1 from public.carros c
    where c.id = inspecciones.carro_id
      and c.hospital_id = public.auth_hospital_id()
      and (
        public.es_admin_o_calidad()
        or auditor_id = auth.uid()
      )
  ))
  with check ( exists (
    select 1 from public.carros c
    where c.id = inspecciones.carro_id
      and c.hospital_id = public.auth_hospital_id()
  ));

-- borrado: solo superadmin (y el trigger bloquea inspecciones firmadas)
create policy inspecciones_delete_super on public.inspecciones
  for delete to authenticated
  using ( public.es_superadmin() );

create policy items_inspeccion_all on public.items_inspeccion
  for all to authenticated
  using ( exists (
    select 1 from public.inspecciones i
    join public.carros c on c.id = i.carro_id
    where i.id = items_inspeccion.inspeccion_id
      and c.hospital_id = public.auth_hospital_id()
  ))
  with check ( exists (
    select 1 from public.inspecciones i
    join public.carros c on c.id = i.carro_id
    where i.id = items_inspeccion.inspeccion_id
      and c.hospital_id = public.auth_hospital_id()
  ));


-- ============================================================================
-- 12) ALERTAS y ALERTAS_EMAIL
-- ============================================================================

create policy alertas_select on public.alertas
  for select to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id()
        and (
          public.ve_todo_el_hospital()
          or (public.auth_rol() = 'supervisor' and (
                servicio_id = public.auth_servicio_id()
                or servicio_id is null
              ))
        ))
  );

-- INSERT lo hace el cron (vía SECURITY DEFINER de las funciones generar_*),
-- pero permitimos que admin/calidad creen manualmente
create policy alertas_insert on public.alertas
  for insert to authenticated
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );

-- "resolver" alerta: admin, calidad, supervisor de su servicio
create policy alertas_update_resolver on public.alertas
  for update to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id()
        and (
          public.es_admin_o_calidad()
          or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id())
        ))
  )
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id())
  );

create policy alertas_email_super on public.alertas_email
  for all to authenticated
  using ( public.es_superadmin() )
  with check ( public.es_superadmin() );


-- ============================================================================
-- 13) INFORMES
-- ============================================================================

create policy informes_select on public.informes
  for select to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.ve_todo_el_hospital())
  );

create policy informes_insert on public.informes
  for insert to authenticated
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id()
        and (public.es_admin_o_calidad() or public.auth_rol() = 'auditor'))
  );

-- los informes generados son auditables: solo superadmin los borra
create policy informes_delete_super on public.informes
  for delete to authenticated
  using ( public.es_superadmin() );


-- ============================================================================
-- 14) NOTIFICACIONES — usuario ve las suyas; admin del hospital ve todas
-- ============================================================================

create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );

-- INSERT: lo hacen las funciones SECURITY DEFINER (crear_alerta_con_notificaciones)
-- pero permitimos a admin enviar notificaciones manuales.
create policy notificaciones_insert on public.notificaciones
  for insert to authenticated
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );

-- marcar como leída: el dueño
create policy notificaciones_update_propias on public.notificaciones
  for update to authenticated
  using ( usuario_id = auth.uid() )
  with check ( usuario_id = auth.uid() );


-- ============================================================================
-- 15) LOG_AUDITORIA — INMUTABLE
-- ============================================================================
-- Lectura: admin/calidad del hospital + superadmin
-- Insert : cualquier autenticado del hospital (los triggers lo necesitan)
-- Update / Delete: NUNCA (bloqueado por trigger bloquear_modif_log)
-- ============================================================================

create policy log_auditoria_select on public.log_auditoria
  for select to authenticated
  using (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad())
  );

create policy log_auditoria_insert on public.log_auditoria
  for insert to authenticated
  with check (
    hospital_id is null  -- entradas globales (login, etc.)
    or hospital_id = public.auth_hospital_id()
    or public.es_superadmin()
  );


-- ============================================================================
-- 16) EVIDENCIAS — metadatos firmados
-- ============================================================================

create policy evidencias_select on public.evidencias
  for select to authenticated
  using (
    public.es_superadmin()
    or hospital_id = public.auth_hospital_id()
  );

create policy evidencias_insert on public.evidencias
  for insert to authenticated
  with check (
    public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and subido_por = auth.uid())
  );

-- Las evidencias NO se modifican (cadena de custodia). Solo superadmin las borra.
create policy evidencias_delete_super on public.evidencias
  for delete to authenticated
  using ( public.es_superadmin() );


-- ============================================================================
-- 17) SOLICITUDES_REGISTRO — formulario público (anti-spam vía edge function)
-- ============================================================================

-- INSERT desde el formulario público (anon) — sin filtro
create policy solicitudes_insert_public on public.solicitudes_registro
  for insert to anon
  with check ( true );

-- También insert desde authenticated (usuario logueado solicitando otra cuenta)
create policy solicitudes_insert_auth on public.solicitudes_registro
  for insert to authenticated
  with check ( true );

-- SELECT/UPDATE: solo superadmin y administradores
create policy solicitudes_admin_select on public.solicitudes_registro
  for select to authenticated
  using ( public.es_superadmin() or public.auth_rol() = 'administrador' );

create policy solicitudes_admin_update on public.solicitudes_registro
  for update to authenticated
  using ( public.es_superadmin() or public.auth_rol() = 'administrador' )
  with check ( public.es_superadmin() or public.auth_rol() = 'administrador' );


-- ============================================================================
-- 18) PRIVILEGIOS PARA FUNCIONES PÚBLICAS  (para que el frontend pueda llamarlas)
-- ============================================================================

grant execute on function public.estado_plan(uuid)             to authenticated;
grant execute on function public.puede_crear_carro(uuid)       to authenticated;
grant execute on function public.puede_crear_usuario(uuid)     to authenticated;
grant execute on function public.lookup_codigo_barras(text)    to authenticated;
grant execute on function public.crear_version_plantilla(uuid) to authenticated;
grant execute on function public.copiar_plantilla_a_carro(uuid, uuid) to authenticated;


-- ============================================================================
-- FIN BASELINE 3/5 — Políticas RLS
--
-- Siguiente: 4/5 baseline_cron.sql — schedules de pg_cron (alertas + informes).
-- ============================================================================
