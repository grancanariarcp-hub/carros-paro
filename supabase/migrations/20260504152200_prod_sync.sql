-- ============================================================================
-- ÁSTOR — SYNC PROD (sobre BD ya existente, idempotente)
-- ============================================================================
-- Esta migración aplica sobre PROD (agpawdoibqdptgdkcktv) lo equivalente al
-- baseline de DEV (1/5..5/5 + secrets_infra), pero en forma de DIFFs sobre
-- el estado existente. Es 100% idempotente: si una columna/policy/función
-- ya está, no rompe.
--
-- Cubre:
--   1) Cierre de fugas RLS (lectura_publica_*, acceso_autenticado débil)
--   2) Rol nuevo: 'calidad'
--   3) Nuevas tablas ISO: ubicaciones, plantilla_versiones, evidencias
--   4) Soft-delete y client_uuid en tablas críticas
--   5) Helpers RLS y políticas correctas
--   6) Audit log con valores_antes / valores_despues
--   7) Triggers de inmutabilidad ISO (inspecciones firmadas, log_auditoria)
--   8) Función generar_alertas_mantenimiento ampliada (cubre materiales/carros)
--   9) Schema private + función get_secret (sustituye GUC)
--  10) Reescritura del trigger notificar_alerta_por_email para usar private
--  11) Reprogramación del cron informe-mensual con private.get_secret
-- ============================================================================


-- ============================================================================
-- 1) SCHEMA PRIVATE + SECRETS  (sustituye GUC current_setting)
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;

create table if not exists private.app_secrets (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz default now()
);
revoke all on private.app_secrets from public;
revoke all on private.app_secrets from anon, authenticated, service_role;

create or replace function private.get_secret(p_key text)
returns text
language sql
stable
security definer
set search_path = private
as $$
  select value from private.app_secrets where key = p_key;
$$;
revoke all on function private.get_secret(text) from public;
revoke all on function private.get_secret(text) from anon, authenticated, service_role;


-- ============================================================================
-- 2) DROP POLÍTICAS CON FUGA
-- ============================================================================

drop policy if exists lectura_publica_carros          on public.carros;
drop policy if exists lectura_publica_cajones         on public.cajones;
drop policy if exists lectura_publica_materiales      on public.materiales;
drop policy if exists lectura_publica_desfibriladores on public.desfibriladores;
drop policy if exists lectura_publica_servicios       on public.servicios;
drop policy if exists lectura_publica_hospitales      on public.hospitales;

drop policy if exists acceso_autenticado on public.alertas;
drop policy if exists acceso_autenticado on public.alertas_email;
drop policy if exists acceso_autenticado on public.cajones;
drop policy if exists acceso_autenticado on public.carros;
drop policy if exists acceso_autenticado on public.desfibriladores;
drop policy if exists acceso_autenticado on public.hospitales;
drop policy if exists acceso_autenticado on public.hospital_config;
drop policy if exists acceso_autenticado on public.informes;
drop policy if exists acceso_autenticado on public.inspecciones;
drop policy if exists acceso_autenticado on public.items_inspeccion;
drop policy if exists acceso_autenticado on public.log_auditoria;
drop policy if exists acceso_autenticado on public.materiales;
drop policy if exists acceso_autenticado on public.perfiles;
drop policy if exists acceso_autenticado on public.servicios;

-- la política perfiles_acceso de PROD permitía SELECT con qual=true → fuga
drop policy if exists perfiles_acceso on public.perfiles;

-- las políticas existentes "buenas" las reemplazamos también para alinear con DEV
drop policy if exists acceso_carros        on public.carros;
drop policy if exists acceso_inspecciones  on public.inspecciones;
drop policy if exists acceso_notificaciones on public.notificaciones;
drop policy if exists acceso_logs          on public.log_auditoria;
drop policy if exists acceso_config        on public.hospital_config;
drop policy if exists gestion_superadmin   on public.hospitales;
drop policy if exists equipos_hospital     on public.equipos;
drop policy if exists historial_hospital   on public.historial_mantenimientos;

drop policy if exists "usuarios del hospital pueden ver plantillas" on public.plantillas;
drop policy if exists "admins pueden gestionar plantillas"          on public.plantillas;
drop policy if exists "ver secciones de plantillas del hospital"    on public.plantilla_secciones;
drop policy if exists "admins pueden gestionar secciones"           on public.plantilla_secciones;
drop policy if exists "ver items de secciones del hospital"         on public.plantilla_items;
drop policy if exists "admins pueden gestionar items"               on public.plantilla_items;
drop policy if exists "ver configuracion informes"                  on public.plantilla_informes;
drop policy if exists "admins pueden gestionar configuracion informes" on public.plantilla_informes;
drop policy if exists acceso_plantillas_informe on public.plantillas_informe;

drop policy if exists "cualquiera puede insertar solicitudes"           on public.solicitudes_registro;
drop policy if exists "superadmins y admins pueden ver solicitudes"     on public.solicitudes_registro;
drop policy if exists "superadmins y admins pueden actualizar solicitudes" on public.solicitudes_registro;

drop policy if exists cat_equipo_select       on public.categorias_equipo;
drop policy if exists cat_equipo_insert_global on public.categorias_equipo;
drop policy if exists cat_equipo_update       on public.categorias_equipo;
drop policy if exists cat_equipo_delete       on public.categorias_equipo;
drop policy if exists cat_hosp_all            on public.categorias_equipo_hospital;


-- ============================================================================
-- 3) ROL 'calidad' EN PERFILES
-- ============================================================================

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('superadmin','administrador','calidad','supervisor','auditor','tecnico','readonly'));

-- supervisor → siempre con servicio_id
alter table public.perfiles drop constraint if exists perfiles_servicio_coherente;
alter table public.perfiles add constraint perfiles_servicio_coherente
  check ((rol = 'supervisor' and servicio_id is not null) or (rol <> 'supervisor'))
  not valid;
-- not valid → no chequea filas existentes (puede haber supervisores sin servicio_id);
-- Federico: limpia esos antes de hacerla VALID.


-- ============================================================================
-- 4) AÑADIR COLUMNAS A TABLAS EXISTENTES
-- ============================================================================

-- soft-delete + audit
alter table public.hospitales       add column if not exists deleted_at timestamptz;
alter table public.hospitales       add column if not exists deleted_by uuid;
alter table public.hospitales       add column if not exists deleted_reason text;
alter table public.hospitales       add column if not exists updated_at timestamptz default now();
alter table public.hospitales       add column if not exists updated_by uuid;

alter table public.servicios        add column if not exists deleted_at timestamptz;
alter table public.servicios        add column if not exists deleted_by uuid;
alter table public.servicios        add column if not exists updated_at timestamptz default now();
alter table public.servicios        add column if not exists updated_by uuid;

alter table public.perfiles         add column if not exists deleted_at timestamptz;
alter table public.perfiles         add column if not exists deleted_by uuid;
alter table public.perfiles         add column if not exists deleted_reason text;
alter table public.perfiles         add column if not exists updated_at timestamptz default now();
alter table public.perfiles         add column if not exists updated_by uuid;

alter table public.carros           add column if not exists deleted_at timestamptz;
alter table public.carros           add column if not exists deleted_by uuid;
alter table public.carros           add column if not exists deleted_reason text;
alter table public.carros           add column if not exists updated_at timestamptz default now();
alter table public.carros           add column if not exists updated_by uuid;
alter table public.carros           add column if not exists last_seen_at timestamptz;

alter table public.materiales       add column if not exists deleted_at timestamptz;
alter table public.materiales       add column if not exists deleted_by uuid;
alter table public.materiales       add column if not exists updated_at timestamptz default now();
alter table public.materiales       add column if not exists updated_by uuid;

alter table public.equipos          add column if not exists deleted_at timestamptz;
alter table public.equipos          add column if not exists deleted_by uuid;
alter table public.equipos          add column if not exists deleted_reason text;
alter table public.equipos          add column if not exists updated_at timestamptz default now();
alter table public.equipos          add column if not exists updated_by uuid;
alter table public.equipos          add column if not exists last_seen_at timestamptz;

alter table public.plantillas       add column if not exists deleted_at timestamptz;
alter table public.plantillas       add column if not exists deleted_by uuid;
alter table public.plantillas       add column if not exists updated_at timestamptz default now();
alter table public.plantillas       add column if not exists updated_by uuid;
alter table public.plantillas       add column if not exists servicio_id uuid references public.servicios(id) on delete cascade;

alter table public.inspecciones     add column if not exists client_uuid uuid;
alter table public.inspecciones     add column if not exists plantilla_version_id uuid;
alter table public.inspecciones     add column if not exists deleted_at timestamptz;
alter table public.inspecciones     add column if not exists deleted_by uuid;
alter table public.inspecciones     add column if not exists deleted_reason text;

alter table public.alertas          add column if not exists client_uuid uuid;
alter table public.alertas          add column if not exists resuelta_en timestamptz;
alter table public.alertas          add column if not exists resuelta_por uuid references public.perfiles(id) on delete set null;

alter table public.historial_mantenimientos add column if not exists client_uuid uuid;

alter table public.log_auditoria    add column if not exists valores_antes   jsonb;
alter table public.log_auditoria    add column if not exists valores_despues jsonb;

alter table public.solicitudes_registro add column if not exists ip_address text;
alter table public.solicitudes_registro add column if not exists user_agent text;

-- informes en PROD no tenía hospital_id; lo añadimos para que RLS filtre
alter table public.informes add column if not exists hospital_id uuid references public.hospitales(id) on delete cascade;
-- backfill: si hay informes huérfanos, intentar deducir hospital del usuario que los generó
update public.informes i
   set hospital_id = (select p.hospital_id from public.perfiles p where p.id = i.generado_por)
 where i.hospital_id is null and i.generado_por is not null;
create index if not exists idx_informes_hospital_id on public.informes(hospital_id);

alter table public.hospital_config  add column if not exists retencion_inspecciones_anos     int default 10;
alter table public.hospital_config  add column if not exists retencion_log_auditoria_anos    int default 10;
alter table public.hospital_config  add column if not exists retencion_alertas_anos          int default 5;
alter table public.hospital_config  add column if not exists retencion_notificaciones_meses  int default 12;

-- unicidad de client_uuid (idempotencia)
do $$ begin
  if not exists (
    select 1 from pg_indexes
    where indexname = 'inspecciones_client_uuid_key' and schemaname='public'
  ) then
    create unique index inspecciones_client_uuid_key on public.inspecciones(client_uuid)
      where client_uuid is not null;
  end if;
  if not exists (
    select 1 from pg_indexes
    where indexname = 'alertas_client_uuid_key' and schemaname='public'
  ) then
    create unique index alertas_client_uuid_key on public.alertas(client_uuid)
      where client_uuid is not null;
  end if;
  if not exists (
    select 1 from pg_indexes
    where indexname = 'historial_client_uuid_key' and schemaname='public'
  ) then
    create unique index historial_client_uuid_key on public.historial_mantenimientos(client_uuid)
      where client_uuid is not null;
  end if;
end $$;


-- ============================================================================
-- 5) ACTUALIZAR CHECK CONSTRAINTS DE TIPOS  (añadir nuevos valores)
-- ============================================================================

-- alertas.tipo: añadir material_vencimiento_proximo y material_caducado
alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in (
    'carro_no_operativo','vencimiento_proximo','control_vencido',
    'usuario_creado','usuario_aprobado','carro_creado',
    'informe_generado','sistema','equipo_creado','equipo_movido',
    'equipo_indispensable_movido','equipo_mantenimiento_vencido',
    'equipo_calibracion_vencida','equipo_garantia_vencida',
    'inspeccion_completada','firma_pendiente',
    'material_vencimiento_proximo','material_caducado'
  ));

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'carro_no_operativo','vencimiento_proximo','control_vencido',
    'usuario_creado','usuario_aprobado','carro_creado',
    'informe_generado','sistema','equipo_creado','equipo_movido',
    'equipo_indispensable_movido','equipo_mantenimiento_vencido',
    'equipo_calibracion_vencida','equipo_garantia_vencida',
    'inspeccion_completada','firma_pendiente',
    'material_vencimiento_proximo','material_caducado'
  ));

-- inspecciones.tipo: añadir 'quincenal' (faltaba en PROD)
alter table public.inspecciones drop constraint if exists inspecciones_tipo_check;
alter table public.inspecciones add constraint inspecciones_tipo_check
  check (tipo in ('mensual','semanal','quincenal','post_uso','extra'));


-- ============================================================================
-- 6) NUEVAS TABLAS  (ubicaciones, plantilla_versiones, evidencias)
-- ============================================================================

create table if not exists public.ubicaciones (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitales(id) on delete cascade,
  planta        text,
  ala           text,
  sala          text,
  descripcion   text,
  lat           double precision,
  lng           double precision,
  provider      text default 'manual'
                check (provider in ('manual','uwb_sewio','uwb_quuppa','uwb_pozyx',
                                    'uwb_ubisense','uwb_zebra','ble','gps','otro')),
  external_id   text,
  zone_id       text,
  activo        boolean default true,
  creado_en     timestamptz default now(),
  unique (hospital_id, provider, external_id)
);
alter table public.ubicaciones enable row level security;

create table if not exists public.plantilla_versiones (
  id             uuid primary key default gen_random_uuid(),
  plantilla_id   uuid not null references public.plantillas(id) on delete cascade,
  version        int  not null,
  snapshot       jsonb not null,
  vigente_desde  timestamptz not null default now(),
  vigente_hasta  timestamptz,
  creado_por     uuid references public.perfiles(id) on delete set null,
  unique (plantilla_id, version)
);
alter table public.plantilla_versiones enable row level security;

create table if not exists public.evidencias (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitales(id) on delete cascade,
  bucket          text not null,
  path            text not null,
  tipo            text not null
                  check (tipo in ('foto_inspeccion','foto_precinto','firma_inspeccion',
                                  'foto_equipo','foto_falla','foto_mantenimiento','otro')),
  inspeccion_id      uuid references public.inspecciones(id) on delete set null,
  item_inspeccion_id uuid references public.items_inspeccion(id) on delete set null,
  equipo_id          uuid references public.equipos(id) on delete set null,
  mantenimiento_id   uuid references public.historial_mantenimientos(id) on delete set null,
  hash_sha256     text not null,
  mime_type       text,
  size_bytes      bigint,
  subido_por      uuid references public.perfiles(id) on delete set null,
  subido_en       timestamptz default now(),
  unique (bucket, path)
);
alter table public.evidencias enable row level security;


-- FK opcional inspecciones.plantilla_version_id (la añadimos solo si no existe)
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'inspecciones'
      and constraint_name = 'inspecciones_plantilla_version_fkey'
  ) then
    alter table public.inspecciones
      add constraint inspecciones_plantilla_version_fkey
      foreign key (plantilla_version_id)
      references public.plantilla_versiones(id);
  end if;
end $$;


-- carros + equipos: FK opcional a ubicaciones
alter table public.carros  add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete set null;
alter table public.equipos add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete set null;


-- ============================================================================
-- 7) ÍNDICES NUEVOS
-- ============================================================================

create index if not exists idx_carros_hospital_id  on public.carros(hospital_id);
create index if not exists idx_carros_servicio_id  on public.carros(servicio_id) where servicio_id is not null;
create index if not exists idx_inspecciones_carro  on public.inspecciones(carro_id);
create index if not exists idx_inspecciones_fecha  on public.inspecciones(fecha desc);
create index if not exists idx_items_inspeccion_inspid on public.items_inspeccion(inspeccion_id);
create index if not exists idx_alertas_tipo        on public.alertas(tipo);
create index if not exists idx_log_auditoria_hospital on public.log_auditoria(hospital_id);
create index if not exists idx_log_auditoria_fecha on public.log_auditoria(fecha desc);
create index if not exists idx_log_auditoria_tabla on public.log_auditoria(tabla_afectada, registro_id);
create index if not exists idx_notificaciones_usuario on public.notificaciones(usuario_id, leida) where leida = false;
create index if not exists idx_servicios_hospital  on public.servicios(hospital_id);
create index if not exists idx_plantillas_servicio on public.plantillas(servicio_id) where servicio_id is not null;


-- ============================================================================
-- 8) HELPERS RLS
-- ============================================================================

create or replace function public.auth_hospital_id()
returns uuid language sql stable security definer
set search_path = public, auth as $$
  select hospital_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.auth_servicio_id()
returns uuid language sql stable security definer
set search_path = public, auth as $$
  select servicio_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.auth_rol()
returns text language sql stable security definer
set search_path = public, auth as $$
  select rol from public.perfiles where id = auth.uid() and activo = true
$$;

create or replace function public.es_superadmin()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (select 1 from public.perfiles
    where id = auth.uid() and rol = 'superadmin' and activo = true)
$$;

create or replace function public.es_admin_o_calidad()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (select 1 from public.perfiles
    where id = auth.uid()
      and rol in ('administrador','calidad')
      and activo = true)
$$;

create or replace function public.ve_todo_el_hospital()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (select 1 from public.perfiles
    where id = auth.uid()
      and rol in ('administrador','calidad','auditor','tecnico','readonly')
      and activo = true)
$$;


-- ============================================================================
-- 9) FUNCIONES DE NEGOCIO  (CREATE OR REPLACE — sustituyen las antiguas)
-- ============================================================================

-- 9.1 set_updated_at + audit_log_change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function public.audit_log_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_hospital_id uuid;
  v_registro_id uuid;
  v_antes  jsonb;
  v_despues jsonb;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD); v_despues := null;
    v_registro_id := (OLD).id;
    v_hospital_id := (v_antes->>'hospital_id')::uuid;
  elsif TG_OP = 'UPDATE' then
    v_antes := to_jsonb(OLD); v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_hospital_id := coalesce((v_despues->>'hospital_id')::uuid, (v_antes->>'hospital_id')::uuid);
  else
    v_antes := null; v_despues := to_jsonb(NEW);
    v_registro_id := (NEW).id;
    v_hospital_id := (v_despues->>'hospital_id')::uuid;
  end if;

  insert into public.log_auditoria (
    hospital_id, usuario_id, accion, tabla_afectada, registro_id,
    valores_antes, valores_despues
  ) values (
    v_hospital_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id,
    v_antes, v_despues
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- 9.2 puede_crear_*, estado_plan
create or replace function public.puede_crear_carro(p_hospital_id uuid)
returns boolean language plpgsql security definer as $$
declare v_max int; v_actual int;
begin
  select max_carros into v_max from public.hospitales where id = p_hospital_id;
  select count(*) into v_actual from public.carros
    where hospital_id = p_hospital_id and activo = true and deleted_at is null;
  return v_actual < v_max;
end;
$$;

create or replace function public.puede_crear_usuario(p_hospital_id uuid)
returns boolean language plpgsql security definer as $$
declare v_max int; v_actual int;
begin
  select max_usuarios into v_max from public.hospitales where id = p_hospital_id;
  select count(*) into v_actual from public.perfiles
    where hospital_id = p_hospital_id and activo = true and deleted_at is null;
  return v_actual < v_max;
end;
$$;

create or replace function public.estado_plan(p_hospital_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_h public.hospitales%rowtype; v_c int; v_u int;
begin
  select * into v_h from public.hospitales where id = p_hospital_id;
  select count(*) into v_c from public.carros where hospital_id=p_hospital_id and activo=true and deleted_at is null;
  select count(*) into v_u from public.perfiles where hospital_id=p_hospital_id and activo=true and deleted_at is null;
  return jsonb_build_object(
    'plan', v_h.plan,
    'max_carros', v_h.max_carros, 'carros_usados', v_c, 'carros_disponibles', v_h.max_carros - v_c,
    'puede_crear_carro', v_c < v_h.max_carros,
    'max_usuarios', v_h.max_usuarios, 'usuarios_usados', v_u, 'usuarios_disponibles', v_h.max_usuarios - v_u,
    'puede_crear_usuario', v_u < v_h.max_usuarios
  );
end;
$$;

-- 9.3 crear_alerta_con_notificaciones (incluye rol calidad)
create or replace function public.crear_alerta_con_notificaciones(
  p_hospital_id uuid, p_tipo text, p_severidad text, p_titulo text, p_mensaje text,
  p_carro_id uuid default null, p_servicio_id uuid default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_alerta_id uuid; v_url_base text;
begin
  if p_hospital_id is null then raise exception 'hospital_id es obligatorio'; end if;
  if p_tipo is null or length(trim(p_tipo)) = 0 then raise exception 'tipo es obligatorio'; end if;
  if p_severidad not in ('baja','media','alta','critica') then raise exception 'severidad inválida: %', p_severidad; end if;

  v_url_base := case
    when p_carro_id    is not null then '/carro/'    || p_carro_id::text
    when p_servicio_id is not null then '/servicio/' || p_servicio_id::text
    else null end;

  insert into public.alertas (hospital_id, tipo, severidad, titulo, mensaje, carro_id, servicio_id, resuelta)
  values (p_hospital_id, p_tipo, p_severidad, p_titulo, p_mensaje, p_carro_id, p_servicio_id, false)
  returning id into v_alerta_id;

  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'administrador'
    and pf.activo = true and pf.recibir_alertas = true;

  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/admin' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'calidad'
    and pf.activo = true and pf.recibir_alertas = true;

  if p_servicio_id is not null then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo, p_titulo || ' (tu servicio)', p_mensaje,
           case when v_url_base is null then null else '/supervisor' || v_url_base end
    from public.perfiles pf
    where pf.hospital_id = p_hospital_id and pf.rol = 'supervisor'
      and pf.servicio_id = p_servicio_id and pf.activo = true and pf.recibir_alertas = true;
  end if;

  insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
  select p_hospital_id, pf.id, p_tipo, p_titulo, p_mensaje,
         case when v_url_base is null then null else '/supervisor' || v_url_base end
  from public.perfiles pf
  where pf.hospital_id = p_hospital_id and pf.rol = 'supervisor'
    and pf.activo = true and pf.recibir_alertas = true
    and (p_servicio_id is null or pf.servicio_id is null or pf.servicio_id <> p_servicio_id);

  if p_severidad in ('alta','critica') then
    insert into public.notificaciones (hospital_id, usuario_id, tipo, titulo, mensaje, accion_url)
    select p_hospital_id, pf.id, p_tipo, '[' || upper(p_severidad) || '] ' || p_titulo, p_mensaje,
           '/superadmin/hospitales/' || p_hospital_id::text
    from public.perfiles pf
    where pf.rol = 'superadmin' and pf.activo = true and pf.recibir_alertas = true;
  end if;

  return v_alerta_id;
end;
$$;

-- 9.4 generar_alertas_mantenimiento AMPLIADA
-- (cubre equipos + materiales caducados + materiales próximos + carros no operativos + controles vencidos)
create or replace function public.generar_alertas_mantenimiento()
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proximo_mantenimiento) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento < current_date
      and not exists (select 1 from public.alertas a
        where a.hospital_id = e.hospital_id and a.tipo = 'equipo_mantenimiento_vencido'
          and a.resuelta = false and a.mensaje like '%[equipo:' || e.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_mantenimiento_vencido',
      case when r.dias_vencido > 90 then 'critica'
           when r.dias_vencido > 30 then 'alta' else 'media' end,
      'Mantenimiento vencido: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' lleva ' || r.dias_vencido || ' día(s) sin mantenimiento. [equipo:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           e.fecha_proximo_mantenimiento,
           (e.fecha_proximo_mantenimiento - current_date) as dias_restantes
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proximo_mantenimiento between current_date and current_date + interval '30 days'
      and not exists (select 1 from public.alertas a
        where a.hospital_id = e.hospital_id and a.tipo = 'vencimiento_proximo'
          and a.resuelta = false and a.mensaje like '%[equipo:' || e.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'vencimiento_proximo',
      case when r.dias_restantes <=  7 then 'alta'
           when r.dias_restantes <= 15 then 'media' else 'baja' end,
      'Mantenimiento próximo: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' tiene mantenimiento en ' || r.dias_restantes || ' día(s) (' ||
      to_char(r.fecha_proximo_mantenimiento, 'DD/MM/YYYY') || '). [equipo:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id,
           (current_date - e.fecha_proxima_calibracion) as dias_vencido
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_proxima_calibracion is not null
      and e.fecha_proxima_calibracion < current_date
      and not exists (select 1 from public.alertas a
        where a.hospital_id = e.hospital_id and a.tipo = 'equipo_calibracion_vencida'
          and a.resuelta = false and a.mensaje like '%[equipo:' || e.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_calibracion_vencida',
      case when r.dias_vencido > 60 then 'alta' else 'media' end,
      'Calibración vencida: ' || r.nombre,
      'El equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' tiene la calibración vencida hace ' || r.dias_vencido || ' día(s). [equipo:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  for r in
    select e.id, e.hospital_id, e.nombre, e.numero_censo, e.servicio_id, e.carro_id, e.fecha_garantia_hasta
    from public.equipos e
    where e.activo = true and e.deleted_at is null
      and e.fecha_garantia_hasta is not null
      and e.fecha_garantia_hasta < current_date
      and e.fecha_garantia_hasta >= current_date - interval '7 days'
      and not exists (select 1 from public.alertas a
        where a.hospital_id = e.hospital_id and a.tipo = 'equipo_garantia_vencida'
          and a.resuelta = false and a.mensaje like '%[equipo:' || e.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'equipo_garantia_vencida', 'baja',
      'Garantía vencida: ' || r.nombre,
      'La garantía del equipo "' || r.nombre || '"' || coalesce(' (censo ' || r.numero_censo || ')', '') ||
      ' venció el ' || to_char(r.fecha_garantia_hasta, 'DD/MM/YYYY') || '. [equipo:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  -- materiales CADUCADOS
  for r in
    select m.id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento, (current_date - m.fecha_vencimiento) as dias_caducado
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true and m.fecha_vencimiento is not null
      and m.fecha_vencimiento < current_date
      and c.activo = true and c.deleted_at is null
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'material_caducado'
          and a.resuelta = false and a.mensaje like '%[material:' || m.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'material_caducado', 'alta',
      'Material caducado: ' || r.nombre,
      'El material "' || r.nombre || '" caducó el ' ||
      to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
      ' (' || r.dias_caducado || ' día(s) caducado). [material:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  -- materiales con vencimiento próximo (config por hospital)
  for r in
    select m.id, c.hospital_id, m.nombre, c.id as carro_id, c.servicio_id,
           m.fecha_vencimiento, (m.fecha_vencimiento - current_date) as dias_restantes,
           coalesce(hc.alertas_vencimiento_dias, 7) as dias_aviso
    from public.materiales m
    join public.cajones caj on caj.id = m.cajon_id
    join public.carros  c   on c.id   = caj.carro_id
    left join public.hospital_config hc on hc.hospital_id = c.hospital_id
    where m.activo = true and m.deleted_at is null
      and m.tiene_vencimiento = true and m.fecha_vencimiento is not null
      and m.fecha_vencimiento >= current_date
      and m.fecha_vencimiento <= current_date + (coalesce(hc.alertas_vencimiento_dias, 7) || ' days')::interval
      and c.activo = true and c.deleted_at is null
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'material_vencimiento_proximo'
          and a.resuelta = false and a.mensaje like '%[material:' || m.id::text || ']%')
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'material_vencimiento_proximo',
      case when r.dias_restantes <= 3 then 'alta' else 'media' end,
      'Vencimiento próximo: ' || r.nombre,
      'El material "' || r.nombre || '" vence el ' ||
      to_char(r.fecha_vencimiento, 'DD/MM/YYYY') ||
      ' (' || r.dias_restantes || ' día(s)). [material:' || r.id::text || ']',
      r.carro_id, r.servicio_id);
  end loop;

  -- carros no operativos
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id
    from public.carros c
    where c.activo = true and c.deleted_at is null and c.estado = 'no_operativo'
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'carro_no_operativo'
          and a.resuelta = false and a.carro_id = c.id)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'carro_no_operativo', 'critica',
      'Carro NO OPERATIVO: ' || r.codigo,
      'El carro ' || r.codigo || ' (' || r.nombre || ') está marcado como NO OPERATIVO.',
      r.id, r.servicio_id);
  end loop;

  -- controles vencidos
  for r in
    select c.id, c.hospital_id, c.codigo, c.nombre, c.servicio_id, c.proximo_control,
           (current_date - c.proximo_control) as dias_retraso
    from public.carros c
    where c.activo = true and c.deleted_at is null
      and c.proximo_control is not null and c.proximo_control < current_date
      and not exists (select 1 from public.alertas a
        where a.hospital_id = c.hospital_id and a.tipo = 'control_vencido'
          and a.resuelta = false and a.carro_id = c.id)
  loop
    perform public.crear_alerta_con_notificaciones(
      r.hospital_id, 'control_vencido',
      case when r.dias_retraso > 14 then 'alta'
           when r.dias_retraso >  7 then 'media' else 'baja' end,
      'Control vencido: carro ' || r.codigo,
      'El carro ' || r.codigo || ' (' || r.nombre || ') tenía control programado para el ' ||
      to_char(r.proximo_control, 'DD/MM/YYYY') ||
      '. Han pasado ' || r.dias_retraso || ' día(s).',
      r.id, r.servicio_id);
  end loop;
end;
$$;

-- 9.5 generar_alertas_pendientes — DEPRECATED, eliminar
drop function if exists public.generar_alertas_pendientes();

-- 9.6 generar_codigo_informe (igual)
create or replace function public.generar_codigo_informe(tipo_inf text)
returns text language plpgsql as $$
declare v_anio text := extract(year from now())::text; v_seq int; v_prefijo text;
begin
  case tipo_inf
    when 'controles_vencidos'    then v_prefijo := 'INF-CTRL'; v_seq := nextval('seq_inf_ctrl');
    when 'no_operativos'         then v_prefijo := 'INF-NOP';  v_seq := nextval('seq_inf_nop');
    when 'vencimientos'          then v_prefijo := 'INF-VTO';  v_seq := nextval('seq_inf_vto');
    when 'historial_auditorias'  then v_prefijo := 'INF-HIST'; v_seq := nextval('seq_inf_hist');
    when 'control_realizado'     then v_prefijo := 'INF-CON';  v_seq := nextval('seq_inf_con');
    else v_prefijo := 'INF'; v_seq := 1;
  end case;
  return v_prefijo || '-' || v_anio || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- 9.7 versionado de plantillas
create or replace function public.crear_version_plantilla(p_plantilla_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_nueva int; v_snapshot jsonb; v_id uuid;
begin
  select jsonb_build_object(
    'plantilla_id', p_plantilla_id, 'snapshot_at', now(),
    'secciones', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', ps.id, 'nombre', ps.nombre, 'tipo', ps.tipo, 'orden', ps.orden,
      'obligatoria', ps.obligatoria,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pi.id, 'nombre', pi.nombre, 'orden', pi.orden,
        'tipo_campo', pi.tipo_campo, 'requerido', pi.requerido,
        'cantidad_esperada', pi.cantidad_esperada, 'tiene_vencimiento', pi.tiene_vencimiento,
        'unidad', pi.unidad, 'tipos_incidencia', pi.tipos_incidencia
      ) order by pi.orden), '[]'::jsonb)
      from public.plantilla_items pi where pi.seccion_id = ps.id and pi.activo = true)
    ) order by ps.orden), '[]'::jsonb)
    from public.plantilla_secciones ps
    where ps.plantilla_id = p_plantilla_id and ps.activo = true)
  ) into v_snapshot;

  select coalesce(max(version), 0) + 1 into v_nueva
  from public.plantilla_versiones where plantilla_id = p_plantilla_id;

  update public.plantilla_versiones set vigente_hasta = now()
   where plantilla_id = p_plantilla_id and vigente_hasta is null;

  insert into public.plantilla_versiones (plantilla_id, version, snapshot, creado_por)
  values (p_plantilla_id, v_nueva, v_snapshot, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 9.8 copiar_plantilla — REEMPLAZA la antigua (firma distinta)
drop function if exists public.copiar_plantilla(text, text, text, uuid, text, text, date, uuid);
create or replace function public.copiar_plantilla_a_carro(
  p_carro_id uuid, p_plantilla_id uuid default null
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_hospital_id uuid; v_plantilla uuid; v_seccion record; v_nuevo_cajon uuid;
begin
  select hospital_id into v_hospital_id from public.carros where id = p_carro_id;
  if v_hospital_id is null then raise exception 'Carro no encontrado'; end if;

  v_plantilla := coalesce(p_plantilla_id,
    (select id from public.plantillas
      where hospital_id = v_hospital_id and es_base = true and activo = true limit 1));
  if v_plantilla is null then return; end if;

  for v_seccion in
    select * from public.plantilla_secciones
    where plantilla_id = v_plantilla and tipo = 'materiales' and activo = true order by orden
  loop
    insert into public.cajones (carro_id, nombre, orden, activo)
    values (p_carro_id, v_seccion.nombre, v_seccion.orden, true)
    returning id into v_nuevo_cajon;

    insert into public.materiales (cajon_id, nombre, cantidad_requerida, orden, tiene_vencimiento, activo)
    select v_nuevo_cajon, pi.nombre, coalesce(pi.cantidad_esperada, 1),
           pi.orden, coalesce(pi.tiene_vencimiento, true), true
    from public.plantilla_items pi
    where pi.seccion_id = v_seccion.id and pi.activo = true order by pi.orden;
  end loop;

  update public.carros set plantilla_id = v_plantilla where id = p_carro_id;
end;
$$;

-- 9.9 inmutabilidad ISO
create or replace function public.bloquear_inspeccion_firmada()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and OLD.firmado_en is not null then
    if NEW.resultado is distinct from OLD.resultado
       or NEW.observaciones is distinct from OLD.observaciones
       or NEW.precinto_retirado is distinct from OLD.precinto_retirado
       or NEW.precinto_colocado is distinct from OLD.precinto_colocado
       or NEW.firma_url is distinct from OLD.firma_url
       or NEW.firmante_nombre is distinct from OLD.firmante_nombre
       or NEW.firmante_cargo is distinct from OLD.firmante_cargo
    then raise exception 'Inspección % está firmada y no puede modificarse (ISO 13485).', OLD.id;
    end if;
  end if;
  if TG_OP = 'DELETE' and OLD.firmado_en is not null then
    raise exception 'Inspección % está firmada y no puede eliminarse.', OLD.id;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create or replace function public.bloquear_modif_log()
returns trigger language plpgsql as $$
begin raise exception 'log_auditoria es inmutable (ISO).'; return null; end;
$$;

-- 9.10 lookup cross-servicio para escaneo
create or replace function public.lookup_codigo_barras(p_codigo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_hospital_id uuid; v_resultado jsonb;
begin
  select hospital_id into v_hospital_id from public.perfiles where id = auth.uid();
  if v_hospital_id is null then return null; end if;

  select jsonb_build_object('tipo','carro','id',c.id,'codigo',c.codigo,
    'nombre',c.nombre,'estado',c.estado,'servicio_id',c.servicio_id) into v_resultado
  from public.carros c
  where c.hospital_id = v_hospital_id
    and (c.codigo = p_codigo or c.codigo_barras_censo = p_codigo)
    and c.activo = true and c.deleted_at is null limit 1;
  if v_resultado is not null then return v_resultado; end if;

  select jsonb_build_object('tipo','equipo','id',e.id,'nombre',e.nombre,
    'numero_censo',e.numero_censo,'numero_serie',e.numero_serie,
    'estado',e.estado,'servicio_id',e.servicio_id,'carro_id',e.carro_id) into v_resultado
  from public.equipos e
  where e.hospital_id = v_hospital_id
    and (e.codigo_barras = p_codigo or e.numero_censo = p_codigo or e.numero_serie = p_codigo)
    and e.activo = true and e.deleted_at is null limit 1;
  if v_resultado is not null then return v_resultado; end if;

  select jsonb_build_object('tipo','material','id',m.id,'nombre',m.nombre,
    'carro_id',c.id,'cajon_id',m.cajon_id,'servicio_id',c.servicio_id) into v_resultado
  from public.materiales m
  join public.cajones caj on caj.id = m.cajon_id
  join public.carros  c   on c.id   = caj.carro_id
  where c.hospital_id = v_hospital_id
    and m.codigo_barras = p_codigo
    and m.activo = true and m.deleted_at is null limit 1;
  return v_resultado;
end;
$$;


-- ============================================================================
-- 10) TRIGGER notificar_alerta_por_email — usa private.get_secret
-- ============================================================================

create or replace function public.notificar_alerta_por_email()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_url_base text; v_url text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;
  if NEW.tipo not in (
       'carro_no_operativo','equipo_mantenimiento_vencido','equipo_calibracion_vencida',
       'vencimiento_proximo','material_caducado','material_vencimiento_proximo','control_vencido')
     and NEW.severidad not in ('critica','alta')
  then return NEW; end if;

  v_url_base := private.get_secret('functions_url');
  if v_url_base is null or length(v_url_base) = 0 then
    raise warning 'private.app_secrets.functions_url no configurado; email omitido para alerta %', NEW.id;
    return NEW;
  end if;

  v_url := v_url_base || '/alerta-email';
  perform net.http_post(url := v_url, headers := '{"Content-Type":"application/json"}'::jsonb,
                        body := jsonb_build_object('alerta_id', NEW.id::text));
  return NEW;
end;
$$;

-- recrear trigger por si la firma cambió
drop trigger if exists trigger_alerta_email on public.alertas;
create trigger trigger_alerta_email
  after insert on public.alertas
  for each row execute function public.notificar_alerta_por_email();


-- ============================================================================
-- 11) TRIGGERS de updated_at + audit log
-- ============================================================================

drop trigger if exists trg_hospitales_updated  on public.hospitales;
drop trigger if exists trg_servicios_updated   on public.servicios;
drop trigger if exists trg_perfiles_updated    on public.perfiles;
drop trigger if exists trg_carros_updated      on public.carros;
drop trigger if exists trg_materiales_updated  on public.materiales;
drop trigger if exists trg_equipos_updated     on public.equipos;
drop trigger if exists trg_plantillas_updated  on public.plantillas;

create trigger trg_hospitales_updated  before update on public.hospitales  for each row execute function public.set_updated_at();
create trigger trg_servicios_updated   before update on public.servicios   for each row execute function public.set_updated_at();
create trigger trg_perfiles_updated    before update on public.perfiles    for each row execute function public.set_updated_at();
create trigger trg_carros_updated      before update on public.carros      for each row execute function public.set_updated_at();
create trigger trg_materiales_updated  before update on public.materiales  for each row execute function public.set_updated_at();
create trigger trg_equipos_updated     before update on public.equipos     for each row execute function public.set_updated_at();
create trigger trg_plantillas_updated  before update on public.plantillas  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_carros        on public.carros;
drop trigger if exists trg_audit_equipos       on public.equipos;
drop trigger if exists trg_audit_inspecciones  on public.inspecciones;
drop trigger if exists trg_audit_perfiles      on public.perfiles;
drop trigger if exists trg_audit_plantillas    on public.plantillas;
drop trigger if exists trg_audit_alertas       on public.alertas;
drop trigger if exists trg_audit_historial     on public.historial_mantenimientos;

create trigger trg_audit_carros        after insert or update or delete on public.carros        for each row execute function public.audit_log_change();
create trigger trg_audit_equipos       after insert or update or delete on public.equipos       for each row execute function public.audit_log_change();
create trigger trg_audit_inspecciones  after insert or update or delete on public.inspecciones  for each row execute function public.audit_log_change();
create trigger trg_audit_perfiles      after insert or update or delete on public.perfiles      for each row execute function public.audit_log_change();
create trigger trg_audit_plantillas    after insert or update or delete on public.plantillas    for each row execute function public.audit_log_change();
create trigger trg_audit_alertas       after insert or update or delete on public.alertas       for each row execute function public.audit_log_change();
create trigger trg_audit_historial     after insert or update or delete on public.historial_mantenimientos for each row execute function public.audit_log_change();

-- inmutabilidad
drop trigger if exists trg_inspecciones_inmutables on public.inspecciones;
create trigger trg_inspecciones_inmutables
  before update or delete on public.inspecciones
  for each row execute function public.bloquear_inspeccion_firmada();

drop trigger if exists trg_log_auditoria_inmutable on public.log_auditoria;
create trigger trg_log_auditoria_inmutable
  before update or delete on public.log_auditoria
  for each row execute function public.bloquear_modif_log();


-- ============================================================================
-- 12) POLÍTICAS RLS CORRECTAS  (sin fugas)
-- ============================================================================

-- Hospitales
create policy hospitales_select_propio on public.hospitales for select to authenticated
  using (id = public.auth_hospital_id() or public.es_superadmin());
create policy hospitales_select_publico_login on public.hospitales for select to anon
  using (activo = true);
create policy hospitales_all_superadmin on public.hospitales for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

-- Servicios
create policy servicios_select_hospital on public.servicios for select to authenticated
  using (hospital_id = public.auth_hospital_id() or public.es_superadmin());
create policy servicios_modify_admin_calidad on public.servicios for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));

-- Perfiles
create policy perfiles_select_self on public.perfiles for select to authenticated
  using (id = auth.uid() or hospital_id = public.auth_hospital_id() or public.es_superadmin());
create policy perfiles_update_self on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perfiles_admin_all on public.perfiles for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador'))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador'));

-- Hospital config
create policy hospital_config_select on public.hospital_config for select to authenticated
  using (hospital_id = public.auth_hospital_id() or public.es_superadmin());
create policy hospital_config_modify_admin on public.hospital_config for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador'))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.auth_rol() = 'administrador'));

-- Ubicaciones
create policy ubicaciones_select on public.ubicaciones for select to authenticated
  using (hospital_id = public.auth_hospital_id() or public.es_superadmin());
create policy ubicaciones_modify on public.ubicaciones for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));

-- Categorías
create policy cat_equipo_select on public.categorias_equipo for select to authenticated
  using (activo = true and (hospital_id is null or hospital_id = public.auth_hospital_id() or public.es_superadmin()));
create policy cat_equipo_modify on public.categorias_equipo for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));
create policy cat_hospital_all on public.categorias_equipo_hospital for all to authenticated
  using (public.es_superadmin() or hospital_id = public.auth_hospital_id())
  with check (public.es_superadmin() or hospital_id = public.auth_hospital_id());

-- Plantillas
create policy plantillas_select on public.plantillas for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    servicio_id is null or public.auth_rol() in ('administrador','calidad','readonly')
    or servicio_id = public.auth_servicio_id())));
create policy plantillas_modify on public.plantillas for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad()
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad()
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))));

create policy plantilla_versiones_select on public.plantilla_versiones for select to authenticated
  using (public.es_superadmin() or exists (
    select 1 from public.plantillas p
    where p.id = plantilla_versiones.plantilla_id and p.hospital_id = public.auth_hospital_id()));
create policy plantilla_versiones_insert on public.plantilla_versiones for insert to authenticated
  with check (public.es_superadmin() or exists (
    select 1 from public.plantillas p
    where p.id = plantilla_versiones.plantilla_id and p.hospital_id = public.auth_hospital_id()
      and (public.es_admin_o_calidad()
           or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id()))));

create policy plantilla_secciones_select on public.plantilla_secciones for select to authenticated
  using (exists (select 1 from public.plantillas p where p.id = plantilla_secciones.plantilla_id));
create policy plantilla_secciones_modify on public.plantilla_secciones for all to authenticated
  using (exists (select 1 from public.plantillas p where p.id = plantilla_secciones.plantilla_id
    and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
      or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id()))))))
  with check (exists (select 1 from public.plantillas p where p.id = plantilla_secciones.plantilla_id
    and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
      or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id()))))));

create policy plantilla_items_select on public.plantilla_items for select to authenticated
  using (exists (select 1 from public.plantilla_secciones ps where ps.id = plantilla_items.seccion_id));
create policy plantilla_items_modify on public.plantilla_items for all to authenticated
  using (exists (select 1 from public.plantilla_secciones ps
    join public.plantillas p on p.id = ps.plantilla_id
    where ps.id = plantilla_items.seccion_id
      and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id()))))))
  with check (exists (select 1 from public.plantilla_secciones ps
    join public.plantillas p on p.id = ps.plantilla_id
    where ps.id = plantilla_items.seccion_id
      and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and p.servicio_id = public.auth_servicio_id()))))));

create policy plantilla_informes_all on public.plantilla_informes for all to authenticated
  using (exists (select 1 from public.plantillas p where p.id = plantilla_informes.plantilla_id
    and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))))
  with check (exists (select 1 from public.plantillas p where p.id = plantilla_informes.plantilla_id
    and (public.es_superadmin() or (p.hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))));

create policy plantillas_informe_all on public.plantillas_informe for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));

-- Carros
create policy carros_select on public.carros for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id()
    and deleted_at is null and (public.ve_todo_el_hospital()
    or (public.auth_rol() = 'supervisor' and (servicio_id = public.auth_servicio_id() or servicio_id is null)))));
create policy carros_modify on public.carros for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad()
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad()
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))));

-- Cajones / Materiales / Desfibriladores (heredan por carro)
create policy cajones_all on public.cajones for all to authenticated
  using (exists (select 1 from public.carros c where c.id = cajones.carro_id and (
    public.es_superadmin() or (c.hospital_id = public.auth_hospital_id() and c.deleted_at is null
      and (public.ve_todo_el_hospital()
        or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null)))))))
  with check (exists (select 1 from public.carros c where c.id = cajones.carro_id and (
    public.es_superadmin() or (c.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
      or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id()))))));

create policy materiales_all on public.materiales for all to authenticated
  using (exists (select 1 from public.cajones caj
    join public.carros c on c.id = caj.carro_id
    where caj.id = materiales.cajon_id and (
      public.es_superadmin() or (c.hospital_id = public.auth_hospital_id() and c.deleted_at is null
        and (public.ve_todo_el_hospital()
          or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null)))))))
  with check (exists (select 1 from public.cajones caj
    join public.carros c on c.id = caj.carro_id
    where caj.id = materiales.cajon_id and (
      public.es_superadmin() or (c.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
        or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id()))))));

create policy desfibriladores_all on public.desfibriladores for all to authenticated
  using (exists (select 1 from public.carros c where c.id = desfibriladores.carro_id and (
    public.es_superadmin() or (c.hospital_id = public.auth_hospital_id()
      and (public.ve_todo_el_hospital()
        or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null)))))))
  with check (exists (select 1 from public.carros c where c.id = desfibriladores.carro_id and (
    public.es_superadmin() or (c.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad()
      or (public.auth_rol() = 'supervisor' and c.servicio_id = public.auth_servicio_id()))))));

-- Equipos
create policy equipos_select on public.equipos for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and deleted_at is null
    and (public.ve_todo_el_hospital()
      or (public.auth_rol() = 'supervisor' and (servicio_id = public.auth_servicio_id() or servicio_id is null)))));
create policy equipos_modify on public.equipos for all to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad() or public.auth_rol() = 'tecnico'
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))))
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad() or public.auth_rol() = 'tecnico'
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))));

-- historial_mantenimientos
create policy historial_mant_select on public.historial_mantenimientos for select to authenticated
  using (exists (select 1 from public.equipos e where e.id = historial_mantenimientos.equipo_id
    and (public.es_superadmin() or e.hospital_id = public.auth_hospital_id())));
create policy historial_mant_insert on public.historial_mantenimientos for insert to authenticated
  with check (exists (select 1 from public.equipos e where e.id = historial_mantenimientos.equipo_id
    and (public.es_superadmin() or (e.hospital_id = public.auth_hospital_id() and (public.es_admin_o_calidad() or public.auth_rol() = 'tecnico')))));
create policy historial_mant_update_super on public.historial_mantenimientos for update to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

-- Inspecciones e items
create policy inspecciones_select on public.inspecciones for select to authenticated
  using (public.es_superadmin() or exists (select 1 from public.carros c
    where c.id = inspecciones.carro_id and c.hospital_id = public.auth_hospital_id()
      and (public.ve_todo_el_hospital()
        or (public.auth_rol() = 'supervisor' and (c.servicio_id = public.auth_servicio_id() or c.servicio_id is null)))));
create policy inspecciones_insert on public.inspecciones for insert to authenticated
  with check (exists (select 1 from public.carros c where c.id = inspecciones.carro_id
    and c.hospital_id = public.auth_hospital_id()
    and (public.es_admin_o_calidad() or public.auth_rol() in ('auditor','supervisor','tecnico'))));
create policy inspecciones_update on public.inspecciones for update to authenticated
  using (exists (select 1 from public.carros c where c.id = inspecciones.carro_id
    and c.hospital_id = public.auth_hospital_id()
    and (public.es_admin_o_calidad() or auditor_id = auth.uid())))
  with check (exists (select 1 from public.carros c where c.id = inspecciones.carro_id
    and c.hospital_id = public.auth_hospital_id()));
create policy inspecciones_delete_super on public.inspecciones for delete to authenticated
  using (public.es_superadmin());

create policy items_inspeccion_all on public.items_inspeccion for all to authenticated
  using (exists (select 1 from public.inspecciones i
    join public.carros c on c.id = i.carro_id
    where i.id = items_inspeccion.inspeccion_id and c.hospital_id = public.auth_hospital_id()))
  with check (exists (select 1 from public.inspecciones i
    join public.carros c on c.id = i.carro_id
    where i.id = items_inspeccion.inspeccion_id and c.hospital_id = public.auth_hospital_id()));

-- Alertas
create policy alertas_select on public.alertas for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.ve_todo_el_hospital()
    or (public.auth_rol() = 'supervisor' and (servicio_id = public.auth_servicio_id() or servicio_id is null)))));
create policy alertas_insert on public.alertas for insert to authenticated
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));
create policy alertas_update_resolver on public.alertas for update to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and (
    public.es_admin_o_calidad()
    or (public.auth_rol() = 'supervisor' and servicio_id = public.auth_servicio_id()))))
  with check (public.es_superadmin() or hospital_id = public.auth_hospital_id());

create policy alertas_email_super on public.alertas_email for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

-- Informes
create policy informes_select on public.informes for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.ve_todo_el_hospital()));
create policy informes_insert on public.informes for insert to authenticated
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id()
    and (public.es_admin_o_calidad() or public.auth_rol() = 'auditor')));
create policy informes_delete_super on public.informes for delete to authenticated
  using (public.es_superadmin());

-- Notificaciones
create policy notificaciones_select on public.notificaciones for select to authenticated
  using (usuario_id = auth.uid() or public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));
create policy notificaciones_insert on public.notificaciones for insert to authenticated
  with check (public.es_superadmin()
    or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));
create policy notificaciones_update_propias on public.notificaciones for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Log de auditoría
create policy log_auditoria_select on public.log_auditoria for select to authenticated
  using (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and public.es_admin_o_calidad()));
create policy log_auditoria_insert on public.log_auditoria for insert to authenticated
  with check (hospital_id is null or hospital_id = public.auth_hospital_id() or public.es_superadmin());

-- Evidencias
create policy evidencias_select on public.evidencias for select to authenticated
  using (public.es_superadmin() or hospital_id = public.auth_hospital_id());
create policy evidencias_insert on public.evidencias for insert to authenticated
  with check (public.es_superadmin() or (hospital_id = public.auth_hospital_id() and subido_por = auth.uid()));
create policy evidencias_delete_super on public.evidencias for delete to authenticated
  using (public.es_superadmin());

-- Solicitudes_registro
create policy solicitudes_insert_public on public.solicitudes_registro for insert to anon with check (true);
create policy solicitudes_insert_auth   on public.solicitudes_registro for insert to authenticated with check (true);
create policy solicitudes_admin_select  on public.solicitudes_registro for select to authenticated
  using (public.es_superadmin() or public.auth_rol() = 'administrador');
create policy solicitudes_admin_update  on public.solicitudes_registro for update to authenticated
  using (public.es_superadmin() or public.auth_rol() = 'administrador')
  with check (public.es_superadmin() or public.auth_rol() = 'administrador');


-- ============================================================================
-- 13) GRANT EXECUTE de funciones públicas para el frontend
-- ============================================================================

grant execute on function public.estado_plan(uuid)             to authenticated;
grant execute on function public.puede_crear_carro(uuid)       to authenticated;
grant execute on function public.puede_crear_usuario(uuid)     to authenticated;
grant execute on function public.lookup_codigo_barras(text)    to authenticated;
grant execute on function public.crear_version_plantilla(uuid) to authenticated;
grant execute on function public.copiar_plantilla_a_carro(uuid, uuid) to authenticated;


-- ============================================================================
-- 14) REPROGRAMAR cron del informe-mensual con private.get_secret
-- ============================================================================

select cron.unschedule('informe-mensual-dia-1')
  where exists (select 1 from cron.job where jobname = 'informe-mensual-dia-1');

select cron.schedule(
  'informe-mensual-dia-1',
  '0 8 1 * *',
  $$
  select net.http_post(
    url := private.get_secret('functions_url') || '/informe-mensual',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_secret('service_role_key')),
    body := '{}'::jsonb
  );
  $$
);


-- ============================================================================
-- FIN — SYNC PROD
--
-- POST-SYNC: el usuario debe ejecutar (UNA vez en SQL Editor de PROD) los
-- INSERT de los secretos. Ver supabase/setup_secrets_prod.sql.local (en
-- .gitignore) — generar copiando setup_guc.sql.example y ajustando valores.
-- ============================================================================
