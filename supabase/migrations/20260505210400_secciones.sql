-- ============================================================================
-- Secciones dentro de un servicio
-- ============================================================================
-- Un servicio (ej. UMI) puede dividirse en secciones (ej. Respiratorio,
-- Hemodinamia, Vía aérea). Equipos y carros se asignan a un servicio y,
-- opcionalmente, a una sección dentro de ese servicio.
--
-- Permisos:
--   - Lectura: cualquier usuario autenticado del hospital
--   - Escritura: supervisor del servicio + admin/calidad del hospital + superadmin
-- ============================================================================


-- 1) Tabla secciones
create table if not exists public.secciones (
  id           uuid primary key default gen_random_uuid(),
  servicio_id  uuid not null references public.servicios(id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  color        text default '#6b7280',
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  creado_por   uuid references public.perfiles(id) on delete set null,
  -- soft-delete
  deleted_at   timestamptz,
  deleted_by   uuid,
  -- nombre único por servicio (case-insensitive)
  unique (servicio_id, nombre)
);

create index if not exists idx_secciones_servicio  on public.secciones(servicio_id);
create index if not exists idx_secciones_activo    on public.secciones(servicio_id, activo) where activo = true and deleted_at is null;


-- 2) FK opcional en equipos y carros
alter table public.equipos add column if not exists seccion_id uuid references public.secciones(id) on delete set null;
alter table public.carros  add column if not exists seccion_id uuid references public.secciones(id) on delete set null;

create index if not exists idx_equipos_seccion on public.equipos(seccion_id) where seccion_id is not null;
create index if not exists idx_carros_seccion  on public.carros(seccion_id)  where seccion_id is not null;


-- 3) RLS
alter table public.secciones enable row level security;

drop policy if exists secciones_select on public.secciones;
drop policy if exists secciones_modify on public.secciones;

-- Lectura: cualquier usuario activo del hospital ve secciones de servicios
-- de su hospital. (servicios.hospital_id = mi hospital)
create policy secciones_select on public.secciones
  for select to authenticated
  using (
    public.es_superadmin()
    or exists (
      select 1 from public.servicios sv
      where sv.id = secciones.servicio_id
        and sv.hospital_id = public.auth_hospital_id()
    )
  );

-- Escritura:
--   - superadmin → todo
--   - admin / calidad del hospital → cualquier sección de cualquier servicio del hospital
--   - supervisor → solo secciones de SU servicio
create policy secciones_modify on public.secciones
  for all to authenticated
  using (
    public.es_superadmin()
    or exists (
      select 1 from public.servicios sv
      where sv.id = secciones.servicio_id
        and sv.hospital_id = public.auth_hospital_id()
        and (
          public.es_admin_o_calidad()
          or (public.auth_rol() = 'supervisor' and sv.id = public.auth_servicio_id())
        )
    )
  )
  with check (
    public.es_superadmin()
    or exists (
      select 1 from public.servicios sv
      where sv.id = secciones.servicio_id
        and sv.hospital_id = public.auth_hospital_id()
        and (
          public.es_admin_o_calidad()
          or (public.auth_rol() = 'supervisor' and sv.id = public.auth_servicio_id())
        )
    )
  );


-- 4) Trigger de audit_log para secciones
drop trigger if exists trg_audit_secciones on public.secciones;
create trigger trg_audit_secciones
  after insert or update or delete on public.secciones
  for each row execute function public.audit_log_change();


-- 5) Helper RPC: secciones del servicio del usuario actual (útil en supervisor)
create or replace function public.mis_secciones()
returns setof public.secciones
language sql stable security definer
set search_path = public
as $$
  select s.* from public.secciones s
  where s.activo = true and s.deleted_at is null
    and s.servicio_id = public.auth_servicio_id()
  order by s.nombre
$$;
grant execute on function public.mis_secciones() to authenticated;
