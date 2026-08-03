-- Catálogo de modelos de dispositivo.
--
-- Hoy cada hospital teclea a mano marca, modelo y categoría cada vez que da de
-- alta un aparato. Con un centro y cinco equipos se aguanta; con varios
-- centros, el mismo desfibrilador acaba escrito de seis maneras
-- ("Zoll X Series", "ZOLL X-Series", "Xseries") y ninguna consulta agregada
-- vuelve a cuadrar. El catálogo fija el nombre una vez y todos lo eligen.
--
-- Importante: aquí no se guarda un aparato, se guarda un MODELO. El número de
-- serie, el censo y las fechas de calibración siguen en equipos, que es donde
-- viven las unidades físicas.
--
-- Se sigue el patrón que ya usa categorias_equipo: un catálogo global más una
-- tabla de adopción por hospital, en vez del patrón de copia de servicios. La
-- diferencia importa: un servicio se renombra según el centro ("UCI" vs
-- "Medicina Intensiva"), pero un "Zoll X Series" es el mismo aparato en todas
-- partes. Copiándolo, la pregunta "¿qué centros tienen este modelo?" dejaría
-- de tener respuesta.

create table if not exists plantillas_dispositivo (
  id uuid primary key default gen_random_uuid(),

  nombre       text not null,
  marca        text,
  modelo       text,
  categoria_id uuid references categorias_equipo(id),

  -- Lo que se repite igual en todas las unidades del mismo modelo y hoy hay
  -- que recordar de memoria en cada alta.
  frecuencia_mantenimiento text,
  requiere_calibracion     boolean not null default false,
  observaciones            text,

  -- null = catálogo global (lo mantiene el superadmin).
  -- Con valor = plantilla propia de ese hospital, invisible para los demás.
  hospital_id uuid references hospitales(id),

  activo boolean not null default true,

  creado_por uuid references perfiles(id),
  creado_en  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references perfiles(id),
  deleted_at timestamptz,
  deleted_by uuid references perfiles(id)
);

-- Qué modelos del catálogo global ha decidido usar cada hospital. Sin esto,
-- el desplegable de un centro pequeño mostraría los cien modelos del catálogo
-- para elegir entre los cuatro que realmente tiene.
create table if not exists plantillas_dispositivo_hospital (
  hospital_id  uuid not null references hospitales(id) on delete cascade,
  plantilla_id uuid not null references plantillas_dispositivo(id) on delete cascade,
  adoptada_en  timestamptz not null default now(),
  adoptada_por uuid references perfiles(id),
  primary key (hospital_id, plantilla_id)
);

-- Mismo criterio que en servicios: dos entradas iguales en un desplegable son
-- inservibles. Se compara ignorando mayúsculas y espacios sobrantes.
create unique index if not exists plantillas_disp_catalogo_unica
  on plantillas_dispositivo (lower(trim(nombre)), lower(trim(coalesce(marca,''))), lower(trim(coalesce(modelo,''))))
  where deleted_at is null and hospital_id is null;

create unique index if not exists plantillas_disp_hospital_unica
  on plantillas_dispositivo (hospital_id, lower(trim(nombre)), lower(trim(coalesce(marca,''))), lower(trim(coalesce(modelo,''))))
  where deleted_at is null and hospital_id is not null;

create index if not exists idx_plantillas_disp_hospital
  on plantillas_dispositivo (hospital_id) where deleted_at is null;
create index if not exists idx_plantillas_disp_catalogo
  on plantillas_dispositivo (activo) where hospital_id is null and deleted_at is null;

-- Enlaza cada unidad física con el modelo del que salió. Nullable: los equipos
-- que ya existen no tienen plantilla, y seguir dando de alta sin ella tiene que
-- seguir siendo posible.
alter table equipos
  add column if not exists plantilla_id uuid references plantillas_dispositivo(id);

create index if not exists idx_equipos_plantilla
  on equipos (plantilla_id) where plantilla_id is not null;

-- ── Permisos ──────────────────────────────────────────────────────────────
alter table plantillas_dispositivo          enable row level security;
alter table plantillas_dispositivo_hospital enable row level security;

drop policy if exists plantillas_disp_select on plantillas_dispositivo;
create policy plantillas_disp_select on plantillas_dispositivo
  for select using (
    hospital_id is null              -- el catálogo lo ve cualquiera: sin verlo no hay de dónde elegir
    or hospital_id = auth_hospital_id()
    or es_superadmin()
  );

-- El administrador solo dentro de su hospital. Escribir en el catálogo global
-- (hospital_id null) queda para el superadmin: si cada centro pudiera, se
-- llenaría de modelos que no le sirven a nadie más.
drop policy if exists plantillas_disp_modify on plantillas_dispositivo;
create policy plantillas_disp_modify on plantillas_dispositivo
  for all using (
    es_superadmin() or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  ) with check (
    es_superadmin() or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  );

drop policy if exists plantillas_disp_hosp_select on plantillas_dispositivo_hospital;
create policy plantillas_disp_hosp_select on plantillas_dispositivo_hospital
  for select using (hospital_id = auth_hospital_id() or es_superadmin());

drop policy if exists plantillas_disp_hosp_modify on plantillas_dispositivo_hospital;
create policy plantillas_disp_hosp_modify on plantillas_dispositivo_hospital
  for all using (
    es_superadmin() or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  ) with check (
    es_superadmin() or (hospital_id = auth_hospital_id() and es_admin_o_calidad())
  );

-- ── Semilla ───────────────────────────────────────────────────────────────
-- Solo los modelos que ya están dados de alta en la aplicación. Inventar un
-- catálogo de aparatos comerciales que nadie ha verificado sería peor que no
-- tenerlo: en un equipo de parada, un dato de mantenimiento equivocado no es
-- una errata. El resto lo añade el superadmin desde el panel.
insert into plantillas_dispositivo (nombre, marca, modelo, categoria_id, hospital_id)
select distinct on (lower(trim(e.marca)), lower(trim(e.modelo)))
       coalesce(c.nombre, e.categoria, e.nombre),
       trim(e.marca), trim(e.modelo), e.categoria_id, null
from equipos e
left join categorias_equipo c on c.id = e.categoria_id
where e.deleted_at is null and e.activo
  and nullif(trim(e.marca), '') is not null
  and nullif(trim(e.modelo), '') is not null
on conflict do nothing;
