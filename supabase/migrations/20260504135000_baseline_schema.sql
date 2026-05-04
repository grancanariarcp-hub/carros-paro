-- ============================================================================
-- ÁSTOR — BASELINE SCHEMA (1/5)
-- ============================================================================
-- Aplicar SOLO en astor-dev (proyecto wpizklvzdprnqmcloiuq).
-- En PROD se omite con `supabase migration repair --status applied <ts>`
-- y se aplica una migración de sync separada para corregir agujeros y añadir
-- features nuevas.
--
-- Sigue el orden:
--   1) Extensiones
--   2) Secuencias para numeración ISO de informes
--   3) Tablas en orden de dependencia (FKs hacia atrás)
--   4) Índices de rendimiento
--
-- Las funciones plpgsql, políticas RLS y cron jobs van en archivos separados:
--   2/5  20260504135100_baseline_functions.sql
--   3/5  20260504135200_baseline_rls.sql
--   4/5  20260504135300_baseline_cron.sql
--   5/5  20260504135400_baseline_seed.sql   (datos demo opcional para DEV)
-- ============================================================================


-- ============================================================================
-- 1) EXTENSIONES
-- ============================================================================
-- pgcrypto: gen_random_uuid()
-- pg_cron : ejecución programada (alertas diarias, informe mensual)
-- pg_net  : llamadas http_post desde plpgsql (trigger -> edge function)
--
-- En Supabase, pg_cron y pg_net se habilitan en Database -> Extensions.
-- Una vez habilitadas allí, este CREATE EXTENSION es idempotente.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ============================================================================
-- 2) SECUENCIAS — usadas por generar_codigo_informe()
-- ============================================================================

create sequence if not exists seq_inf_ctrl;
create sequence if not exists seq_inf_nop;
create sequence if not exists seq_inf_vto;
create sequence if not exists seq_inf_hist;
create sequence if not exists seq_inf_con;


-- ============================================================================
-- 3) TABLAS  (orden estricto de dependencia)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1  hospitales — tenant raíz
-- ----------------------------------------------------------------------------
create table hospitales (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  nombre          text not null,
  logo_url        text,
  color_primario  text default '#1d4ed8',
  plan            text default 'basico'
                  check (plan in ('basico','estandar','hospital','enterprise')),
  max_carros      int  default 15,
  max_usuarios    int  default 5,
  activo          boolean default false,
  email_admin     text,
  telefono        text,
  pais            text default 'España',
  -- soft-delete
  deleted_at      timestamptz,
  deleted_by      uuid,
  deleted_reason  text,
  -- audit
  creado_en       timestamptz default now(),
  activado_en     timestamptz,
  updated_at      timestamptz default now(),
  updated_by      uuid
);


-- ----------------------------------------------------------------------------
-- 3.2  servicios — unidades dentro de un hospital
-- ----------------------------------------------------------------------------
create table servicios (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references hospitales(id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  color        text default '#1d4ed8',
  activo       boolean default true,
  -- soft-delete
  deleted_at   timestamptz,
  deleted_by   uuid,
  -- audit
  creado_en    timestamptz default now(),
  updated_at   timestamptz default now(),
  updated_by   uuid,
  unique (hospital_id, nombre)
);


-- ----------------------------------------------------------------------------
-- 3.3  perfiles — usuario de la app, 1-a-1 con auth.users
-- ----------------------------------------------------------------------------
create table perfiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  hospital_id       uuid references hospitales(id) on delete restrict,
  servicio_id       uuid references servicios(id)  on delete set null,
  nombre            text not null,
  email             text not null,
  rol               text not null
                    check (rol in ('superadmin','administrador','calidad',
                                   'supervisor','auditor','tecnico','readonly')),
  activo            boolean default false,
  codigo_empleado   text unique,
  recibir_alertas   boolean default false,
  email_alertas     text,
  aprobado_por      uuid references perfiles(id) on delete set null,
  -- soft-delete
  deleted_at        timestamptz,
  deleted_by        uuid,
  deleted_reason    text,
  -- audit
  creado_en         timestamptz default now(),
  updated_at        timestamptz default now(),
  updated_by        uuid
);

-- supervisor solo puede pertenecer a un servicio (regla de negocio)
-- calidad y administrador NO tienen servicio_id
alter table perfiles add constraint perfiles_servicio_coherente
  check (
    (rol = 'supervisor' and servicio_id is not null)
    or (rol <> 'supervisor')
  );


-- ----------------------------------------------------------------------------
-- 3.4  hospital_config — configuración funcional por hospital
-- ----------------------------------------------------------------------------
create table hospital_config (
  id                          uuid primary key default gen_random_uuid(),
  hospital_id                 uuid not null unique references hospitales(id) on delete cascade,
  -- informes
  informe_membrete            text,
  informe_pie                 text,
  informe_logo_url            text,
  informe_numeracion_iso      text default 'INF',
  -- controles permitidos
  permite_control_mensual     boolean default true,
  permite_control_post_uso    boolean default true,
  permite_control_extra       boolean default true,
  frecuencia_control_default  text   default 'mensual',
  -- tipos de fallo (configurables por hospital)
  tipos_fallo                 jsonb  default
    '[{"id":"grave","color":"rojo","label":"Fallo grave"},{"id":"menor","color":"ambar","label":"Fallo menor"}]'::jsonb,
  -- alertas
  alertas_vencimiento_dias    int    default 7,
  alertas_control_dias        int    default 0,
  -- firma
  requiere_firma              boolean default false,
  -- campos extra dinámicos
  campos_extra                jsonb  default '[]'::jsonb,
  -- retención (años) — política para ISO/RGPD
  retencion_inspecciones_anos int    default 10,
  retencion_log_auditoria_anos int   default 10,
  retencion_alertas_anos      int    default 5,
  retencion_notificaciones_meses int default 12,
  -- audit
  creado_en                   timestamptz default now(),
  actualizado_en              timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- 3.5  ubicaciones — geolocalización (preparado para UWB Tier Enterprise)
-- ----------------------------------------------------------------------------
create table ubicaciones (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references hospitales(id) on delete cascade,
  -- datos lógicos del centro
  planta        text,
  ala           text,
  sala          text,
  descripcion   text,
  -- coordenadas (opcional, para mapas)
  lat           double precision,
  lng           double precision,
  -- integración con sistema RTLS
  provider      text default 'manual'
                check (provider in ('manual','uwb_sewio','uwb_quuppa','uwb_pozyx',
                                    'uwb_ubisense','uwb_zebra','ble','gps','otro')),
  external_id   text,                      -- id en el sistema externo (UWB, BLE)
  zone_id       text,                      -- zona definida en el RTLS
  activo        boolean default true,
  creado_en     timestamptz default now(),
  unique (hospital_id, provider, external_id)
);


-- ----------------------------------------------------------------------------
-- 3.6  categorias_equipo + pivote por hospital
-- ----------------------------------------------------------------------------
create table categorias_equipo (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  hospital_id  uuid references hospitales(id) on delete cascade,
  es_global    boolean not null default false,
  activo       boolean not null default true,
  creado_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now(),
  -- nombre único por hospital (NULLS NOT DISTINCT trata NULL como un valor más,
  -- de modo que las categorías globales también deben tener nombre único)
  unique nulls not distinct (nombre, hospital_id)
);

create table categorias_equipo_hospital (
  hospital_id   uuid not null references hospitales(id)        on delete cascade,
  categoria_id  uuid not null references categorias_equipo(id) on delete cascade,
  visible       boolean not null default true,
  favorita      boolean not null default false,
  primary key (hospital_id, categoria_id)
);


-- ----------------------------------------------------------------------------
-- 3.7  plantillas (raíz) + secciones + items + config informe
-- ----------------------------------------------------------------------------
create table plantillas (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references hospitales(id) on delete cascade,
  -- una plantilla puede ser global del hospital (servicio_id NULL) o específica
  -- de un servicio. Esto cubre la regla "calidad genera para todo el hospital,
  -- cada servicio puede generar las suyas".
  servicio_id  uuid references servicios(id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  tipo_carro   text,
  es_base      boolean default false,
  activo       boolean default true,
  -- soft-delete
  deleted_at   timestamptz,
  deleted_by   uuid,
  -- audit
  creado_en    timestamptz default now(),
  creado_por   uuid references perfiles(id) on delete set null,
  updated_at   timestamptz default now(),
  updated_by   uuid
);

-- versionado inmutable (clave para ISO 13485):
-- al editar una plantilla creamos una nueva versión; las inspecciones
-- históricas siguen apuntando a la versión que usaron.
create table plantilla_versiones (
  id             uuid primary key default gen_random_uuid(),
  plantilla_id   uuid not null references plantillas(id) on delete cascade,
  version        int  not null,
  -- snapshot completo: secciones + items en JSON inmutable
  snapshot       jsonb not null,
  vigente_desde  timestamptz not null default now(),
  vigente_hasta  timestamptz,
  creado_por     uuid references perfiles(id) on delete set null,
  unique (plantilla_id, version)
);

create table plantilla_secciones (
  id                  uuid primary key default gen_random_uuid(),
  plantilla_id        uuid not null references plantillas(id) on delete cascade,
  nombre              text not null,
  descripcion_ayuda   text,
  tipo                text not null default 'custom'
                      check (tipo in ('materiales','equipos','desfibrilador',
                                      'precintos','medicamentos','observaciones','custom')),
  icono               text default '📋',
  orden               int  not null default 0,
  obligatoria         boolean default true,
  activo              boolean default true
);

create table plantilla_items (
  id                  uuid primary key default gen_random_uuid(),
  seccion_id          uuid not null references plantilla_secciones(id) on delete cascade,
  nombre              text not null,
  descripcion         text,
  orden               int  not null default 0,
  tipo_campo          text not null default 'checkbox'
                      check (tipo_campo in ('checkbox','cantidad','fecha_vto',
                                            'texto','foto','compuesto')),
  requerido           boolean default true,
  cantidad_esperada   int,
  tiene_vencimiento   boolean default false,
  unidad              text,
  tipos_incidencia    text[] default array['falta','vencimiento','deterioro',
                                           'cantidad_incorrecta','caducado',
                                           'mal_estado','otro'],
  activo              boolean default true
);

-- config visual del PDF asociado a una plantilla
create table plantilla_informes (
  id                       uuid primary key default gen_random_uuid(),
  plantilla_id             uuid not null unique references plantillas(id) on delete cascade,
  secciones_incluidas      uuid[] default array[]::uuid[],
  mostrar_logo             boolean default true,
  mostrar_firma            boolean default true,
  mostrar_fotos_fallos     boolean default true,
  mostrar_precintos        boolean default true,
  mostrar_vencimientos     boolean default true,
  mostrar_resumen_fallos   boolean default true,
  destinatarios            jsonb   default '[]'::jsonb,
  envio_automatico         boolean default false,
  cuando_enviar            text    default 'no_operativo'
                           check (cuando_enviar in ('siempre','solo_fallos','no_operativo')),
  asunto_email             text,
  mensaje_email            text,
  creado_en                timestamptz default now()
);

-- plantilla genérica de informes a nivel HOSPITAL (no liga a una plantilla
-- de control concreta). Distinta de plantilla_informes.
create table plantillas_informe (
  id                     uuid primary key default gen_random_uuid(),
  hospital_id            uuid references hospitales(id) on delete cascade,
  tipo                   text not null
                         check (tipo in ('controles_vencidos','no_operativos','vencimientos',
                                         'historial_auditorias','control_realizado')),
  codigo_prefijo         text not null,
  titulo_personalizado   text,
  membrete_linea1        text,
  membrete_linea2        text,
  pie_pagina             text,
  incluir_logo           boolean default true,
  incluir_firma          boolean default false,
  campos_visibles        jsonb default '[]'::jsonb,
  activo                 boolean default true,
  creado_en              timestamptz default now(),
  unique (hospital_id, tipo)
);


-- ----------------------------------------------------------------------------
-- 3.8  carros + cajones + materiales + desfibriladores
-- ----------------------------------------------------------------------------
create table carros (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references hospitales(id) on delete cascade,
  servicio_id     uuid references servicios(id) on delete set null,
  plantilla_id    uuid references plantillas(id) on delete set null,
  ubicacion_id    uuid references ubicaciones(id) on delete set null,
  codigo          text not null unique,
  nombre          text not null,
  ubicacion       text,                                 -- texto libre legacy
  responsable     text,
  tipo_carro      text default 'parada'
                  check (tipo_carro in ('parada','via_aerea','trauma','neonatal','otro')),
  -- control / estado
  frecuencia_control  text default 'mensual'
                      check (frecuencia_control in ('semanal','quincenal','mensual')),
  proximo_control     date,
  ultimo_control      timestamptz,
  ultimo_tipo_control text,
  estado              text default 'sin_control'
                      check (estado in ('operativo','condicional','no_operativo','sin_control')),
  operativo           boolean default true,
  activo              boolean default true,
  -- censo
  numero_censo            text,
  codigo_barras_censo     text,
  -- desfibrilador embebido (legacy — recomendamos usar tabla equipos)
  marca_desfibrilador          text,
  modelo_desfibrilador         text,
  numero_serie_desfibrilador   text,
  fecha_ultimo_mantenimiento   date,
  fecha_proximo_mantenimiento  date,
  -- geo / RTLS
  last_seen_at    timestamptz,
  -- soft-delete
  deleted_at      timestamptz,
  deleted_by      uuid,
  deleted_reason  text,
  -- audit
  creado_en       timestamptz default now(),
  creado_por      uuid references perfiles(id) on delete set null,
  updated_at      timestamptz default now(),
  updated_by      uuid
);

create table cajones (
  id        uuid primary key default gen_random_uuid(),
  carro_id  uuid not null references carros(id) on delete cascade,
  nombre    text not null,
  orden     int  default 0,
  activo    boolean default true
);

create table materiales (
  id                          uuid primary key default gen_random_uuid(),
  cajon_id                    uuid references cajones(id) on delete cascade,
  nombre                      text not null,
  cantidad_requerida          int  default 1,
  tipo_falla                  text default 'menor'
                              check (tipo_falla in ('menor','grave','ninguno')),
  orden                       int  default 0,
  -- vencimiento del consumible
  tiene_vencimiento           boolean default true,
  fecha_vencimiento           date,
  -- compatibilidad legacy: equipo embebido en material (a migrar a tabla equipos)
  es_equipo                   boolean default false,
  numero_serie                text,
  marca                       text,
  modelo                      text,
  codigo_barras               text,
  fecha_ultimo_mantenimiento  date,
  fecha_proximo_mantenimiento date,
  -- soft-delete
  deleted_at                  timestamptz,
  deleted_by                  uuid,
  -- audit
  activo                      boolean default true,
  updated_at                  timestamptz default now(),
  updated_by                  uuid
);

create table desfibriladores (
  id                          uuid primary key default gen_random_uuid(),
  carro_id                    uuid references carros(id) on delete cascade,
  numero_censo                text,
  modelo                      text,
  marca                       text,
  fecha_mantenimiento         date,
  fecha_ultimo_mantenimiento  date,
  activo                      boolean default true
);


-- ----------------------------------------------------------------------------
-- 3.9  equipos — equipos médicos individuales con trazabilidad ISO completa
-- ----------------------------------------------------------------------------
create table equipos (
  id                          uuid primary key default gen_random_uuid(),
  hospital_id                 uuid not null references hospitales(id) on delete cascade,
  servicio_id                 uuid references servicios(id) on delete set null,
  carro_id                    uuid references carros(id)    on delete set null,
  cajon_id                    uuid references cajones(id)   on delete set null,
  categoria_id                uuid references categorias_equipo(id) on delete set null,
  ubicacion_id                uuid references ubicaciones(id) on delete set null,
  -- identificación
  nombre                      text not null,
  marca                       text,
  modelo                      text,
  numero_serie                text,
  numero_censo                text,
  codigo_barras               text,
  categoria                   text default 'general',         -- legacy texto
  estado                      text default 'operativo'
                              check (estado in ('operativo','en_mantenimiento',
                                                'fuera_de_servicio','baja')),
  foto_url                    text,
  -- fechas ISO (mantenimiento, calibración, garantía)
  fecha_adquisicion           date,
  fecha_fabricacion           date,
  fecha_ultimo_mantenimiento  date,
  fecha_proximo_mantenimiento date,
  fecha_ultima_calibracion    date,
  fecha_proxima_calibracion   date,
  fecha_garantia_hasta        date,
  -- proveedor de servicio técnico
  empresa_mantenimiento       text,
  contacto_mantenimiento      text,
  numero_contrato             text,
  frecuencia_mantenimiento    text default 'anual',
  observaciones               text,
  -- bandera de criticidad
  indispensable               boolean not null default false,
  -- geo / RTLS
  last_seen_at                timestamptz,
  -- soft-delete
  deleted_at                  timestamptz,
  deleted_by                  uuid,
  deleted_reason              text,
  -- audit
  activo                      boolean default true,
  creado_en                   timestamptz default now(),
  creado_por                  uuid references perfiles(id) on delete set null,
  updated_at                  timestamptz default now(),
  updated_by                  uuid
);


-- ----------------------------------------------------------------------------
-- 3.10  historial_mantenimientos — bitácora ISO de servicios técnicos
-- ----------------------------------------------------------------------------
create table historial_mantenimientos (
  id           uuid primary key default gen_random_uuid(),
  equipo_id    uuid not null references equipos(id) on delete cascade,
  client_uuid  uuid unique,                          -- idempotencia desde móvil
  tipo         text not null
               check (tipo in ('preventivo','correctivo','calibracion','revision','baja')),
  fecha        date not null,
  descripcion  text,
  empresa      text,
  tecnico      text,
  coste        numeric,
  resultado    text default 'correcto'
               check (resultado in ('correcto','con_incidencias','equipo_retirado')),
  foto_url     text,
  creado_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- 3.11  inspecciones + items_inspeccion (con plantilla_version inmutable)
-- ----------------------------------------------------------------------------
create table inspecciones (
  id                       uuid primary key default gen_random_uuid(),
  carro_id                 uuid references carros(id) on delete restrict,
  client_uuid              uuid unique,                 -- idempotencia
  -- versión exacta de la plantilla usada (clave ISO)
  plantilla_version_id     uuid references plantilla_versiones(id),
  tipo                     text not null
                           check (tipo in ('mensual','semanal','quincenal','post_uso','extra')),
  resultado                text
                           check (resultado in ('operativo','condicional','no_operativo')),
  auditor_id               uuid references perfiles(id) on delete set null,
  fecha                    timestamptz default now(),
  observaciones            text,
  -- desfibrilador (snapshot)
  numero_censo_desf        text,
  modelo_desf              text,
  fecha_mantenimiento_desf date,
  alerta_enviada           boolean default false,
  -- precintos
  precinto_retirado        text,
  precinto_colocado        text,
  foto_precinto_retirado   text,
  foto_precinto_colocado   text,
  -- firma digital (cadena de custodia)
  firma_url                text,
  firmante_nombre          text,
  firmante_cargo           text,
  firmado_en               timestamptz,
  firmante_usuario_id      uuid references perfiles(id) on delete set null,
  -- soft-delete (las inspecciones firmadas NO se borran nunca; ver trigger)
  deleted_at               timestamptz,
  deleted_by               uuid,
  deleted_reason           text
);

create table items_inspeccion (
  id                  uuid primary key default gen_random_uuid(),
  inspeccion_id       uuid references inspecciones(id) on delete cascade,
  material_id         uuid references materiales(id)   on delete set null,
  plantilla_item_id   uuid references plantilla_items(id) on delete set null,
  cantidad_ok         boolean default false,
  estado_ok           boolean default false,
  tiene_falla         boolean default false,
  tipo_falla          text check (tipo_falla in ('menor','grave')),
  descripcion_falla   text,
  foto_url            text,
  fecha_vencimiento   date
);


-- ----------------------------------------------------------------------------
-- 3.12  alertas + alertas_email
-- ----------------------------------------------------------------------------
create table alertas (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references hospitales(id) on delete cascade,
  carro_id     uuid references carros(id)    on delete set null,
  servicio_id  uuid references servicios(id) on delete set null,
  client_uuid  uuid unique,
  tipo         text not null
               check (tipo in ('carro_no_operativo','vencimiento_proximo','control_vencido',
                               'usuario_creado','usuario_aprobado','carro_creado',
                               'informe_generado','sistema','equipo_creado','equipo_movido',
                               'equipo_indispensable_movido','equipo_mantenimiento_vencido',
                               'equipo_calibracion_vencida','equipo_garantia_vencida',
                               'inspeccion_completada','firma_pendiente',
                               'material_vencimiento_proximo','material_caducado')),
  severidad    text not null default 'media'
               check (severidad in ('baja','media','alta','critica')),
  titulo       text,
  mensaje      text,
  resuelta     boolean default false,
  resuelta_en  timestamptz,
  resuelta_por uuid references perfiles(id) on delete set null,
  creado_en    timestamptz default now()
);

create table alertas_email (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null,
  referencia_id       uuid,
  destinatario_email  text not null,
  asunto              text,
  enviado_en          timestamptz default now(),
  resuelto            boolean default false
);


-- ----------------------------------------------------------------------------
-- 3.13  informes (PDF generados, cacheados como jsonb)
-- ----------------------------------------------------------------------------
create table informes (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid references hospitales(id) on delete cascade,
  codigo        text not null,
  tipo          text not null
                check (tipo in ('controles_vencidos','no_operativos','vencimientos',
                                'historial_auditorias','control_realizado')),
  titulo        text not null,
  generado_por  uuid references perfiles(id) on delete set null,
  generado_en   timestamptz default now(),
  filtros       jsonb,
  datos         jsonb
);


-- ----------------------------------------------------------------------------
-- 3.14  notificaciones — campanita in-app
-- ----------------------------------------------------------------------------
create table notificaciones (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid references hospitales(id) on delete cascade,
  usuario_id   uuid references perfiles(id)   on delete cascade,
  tipo         text not null
               check (tipo in ('carro_no_operativo','vencimiento_proximo','control_vencido',
                               'usuario_creado','usuario_aprobado','carro_creado',
                               'informe_generado','sistema','equipo_creado','equipo_movido',
                               'equipo_indispensable_movido','equipo_mantenimiento_vencido',
                               'equipo_calibracion_vencida','equipo_garantia_vencida',
                               'inspeccion_completada','firma_pendiente',
                               'material_vencimiento_proximo','material_caducado')),
  titulo       text not null,
  mensaje      text,
  leida        boolean default false,
  accion_url   text,
  creado_en    timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- 3.15  log_auditoria — registro inmutable ISO
-- ----------------------------------------------------------------------------
create table log_auditoria (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid references hospitales(id) on delete set null,
  usuario_id      uuid references perfiles(id)   on delete set null,
  accion          text not null,                                          -- INSERT / UPDATE / DELETE / LOGIN / etc.
  tabla_afectada  text,
  registro_id     uuid,
  -- diff completo (clave ISO 13485 / 15189)
  valores_antes   jsonb,
  valores_despues jsonb,
  detalle         jsonb,
  ip_address      text,
  user_agent      text,
  resultado       text default 'exito'
                  check (resultado in ('exito','error','bloqueado')),
  fecha           timestamptz default now()
);
-- Una vez insertado un registro de auditoría, NO se puede modificar.
-- (la prohibición se hará vía RLS y un trigger BEFORE UPDATE / DELETE en 2/5)


-- ----------------------------------------------------------------------------
-- 3.16  evidencias — metadatos firmados de archivos (cadena de custodia ISO)
-- ----------------------------------------------------------------------------
create table evidencias (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references hospitales(id) on delete cascade,
  bucket          text not null,                       -- storage bucket
  path            text not null,                       -- path dentro del bucket
  -- vinculación al recurso al que pertenece la evidencia
  tipo            text not null
                  check (tipo in ('foto_inspeccion','foto_precinto','firma_inspeccion',
                                  'foto_equipo','foto_falla','foto_mantenimiento','otro')),
  inspeccion_id   uuid references inspecciones(id) on delete set null,
  item_inspeccion_id uuid references items_inspeccion(id) on delete set null,
  equipo_id       uuid references equipos(id) on delete set null,
  mantenimiento_id uuid references historial_mantenimientos(id) on delete set null,
  -- huella criptográfica para detectar manipulación
  hash_sha256     text not null,
  mime_type       text,
  size_bytes      bigint,
  -- audit
  subido_por      uuid references perfiles(id) on delete set null,
  subido_en       timestamptz default now(),
  unique (bucket, path)
);


-- ----------------------------------------------------------------------------
-- 3.17  solicitudes_registro — formulario público de pre-alta
-- ----------------------------------------------------------------------------
create table solicitudes_registro (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  email            text not null,
  hospital_nombre  text not null,
  rol_solicitado   text not null default 'auditor'
                   check (rol_solicitado in ('auditor','tecnico','supervisor','readonly')),
  mensaje          text,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','aprobada','rechazada')),
  gestionado_por   uuid references perfiles(id) on delete set null,
  gestionado_en    timestamptz,
  -- antiabuso (a poblar desde edge function antes del insert)
  ip_address       text,
  user_agent       text,
  creado_en        timestamptz default now()
);


-- ============================================================================
-- 4) ÍNDICES — rendimiento + RLS rápida
-- ============================================================================

-- hospitales / servicios
create index idx_servicios_hospital_id on servicios(hospital_id);

-- perfiles (RLS y joins)
create index idx_perfiles_hospital_id          on perfiles(hospital_id);
create index idx_perfiles_servicio_id          on perfiles(servicio_id) where servicio_id is not null;
create index idx_perfiles_rol                  on perfiles(rol);
create index idx_perfiles_activo_recibir       on perfiles(hospital_id, rol)
  where activo = true and recibir_alertas = true;
create index idx_perfiles_codigo_empleado      on perfiles(codigo_empleado)
  where codigo_empleado is not null;

-- carros
create index idx_carros_hospital_id    on carros(hospital_id);
create index idx_carros_servicio_id    on carros(servicio_id) where servicio_id is not null;
create index idx_carros_estado         on carros(hospital_id, estado);
create index idx_carros_proximo_ctrl   on carros(proximo_control) where activo = true and deleted_at is null;
create index idx_carros_ubicacion      on carros(ubicacion_id) where ubicacion_id is not null;

-- cajones / materiales
create index idx_cajones_carro_id      on cajones(carro_id);
create index idx_materiales_cajon_id   on materiales(cajon_id);
create index idx_materiales_vencimiento on materiales(fecha_vencimiento)
  where activo = true and tiene_vencimiento = true and deleted_at is null;

-- equipos
create index idx_equipos_hospital_id   on equipos(hospital_id);
create index idx_equipos_servicio_id   on equipos(servicio_id);
create index idx_equipos_carro_id      on equipos(carro_id);
create index idx_equipos_cajon_id      on equipos(cajon_id);
create index idx_equipos_activo        on equipos(activo);
create index idx_equipos_indispensable on equipos(indispensable) where indispensable = true;
create index idx_equipos_categoria_id  on equipos(categoria_id) where categoria_id is not null;
create index idx_equipos_ubicacion     on equipos(ubicacion_id) where ubicacion_id is not null;
create index idx_equipos_hospital_cat_estado on equipos(hospital_id, categoria_id, estado)
  where activo = true;
-- buscar por censo / serie / código de barras (escaneo cross-servicio)
create index idx_equipos_numero_censo_hosp on equipos(hospital_id, numero_censo)
  where numero_censo is not null;
create index idx_equipos_numero_serie_hosp on equipos(hospital_id, numero_serie)
  where numero_serie is not null;
create index idx_equipos_codigo_barras_hosp on equipos(hospital_id, codigo_barras)
  where codigo_barras is not null;
-- unicidad de identificadores (un mismo equipo no puede repetirse en el hospital)
create unique index uq_equipos_hospital_censo  on equipos(hospital_id, numero_censo)
  where numero_censo is not null and activo = true;
create unique index uq_equipos_hospital_serie  on equipos(hospital_id, numero_serie)
  where numero_serie is not null and activo = true;
create unique index uq_equipos_hospital_codbar on equipos(hospital_id, codigo_barras)
  where codigo_barras is not null and activo = true;

-- categorias_equipo
create index idx_cat_equipo_hospital_id on categorias_equipo(hospital_id) where hospital_id is not null;
create index idx_cat_equipo_global      on categorias_equipo(es_global, activo) where es_global = true;
create index idx_cat_equipo_nombre      on categorias_equipo(lower(nombre));
create index idx_cat_hosp_hospital      on categorias_equipo_hospital(hospital_id);
create index idx_cat_hosp_favorita      on categorias_equipo_hospital(hospital_id, favorita) where favorita = true;

-- plantillas
create index idx_plantillas_hospital_id   on plantillas(hospital_id);
create index idx_plantillas_servicio_id   on plantillas(servicio_id) where servicio_id is not null;
create unique index idx_plantillas_base_unica on plantillas(hospital_id)
  where es_base = true and activo = true;
create index idx_plantilla_versiones      on plantilla_versiones(plantilla_id, version desc);
create index idx_plantilla_secciones_pid  on plantilla_secciones(plantilla_id);
create index idx_plantilla_items_seccion  on plantilla_items(seccion_id);

-- inspecciones
create index idx_inspecciones_carro_id    on inspecciones(carro_id);
create index idx_inspecciones_fecha       on inspecciones(fecha desc);
create index idx_inspecciones_auditor     on inspecciones(auditor_id);
create index idx_inspecciones_firmado     on inspecciones(firmado_en) where firmado_en is not null;
create index idx_items_inspeccion_inspid  on items_inspeccion(inspeccion_id);
create index idx_items_inspeccion_matid   on items_inspeccion(material_id) where material_id is not null;

-- alertas
create index idx_alertas_hospital_id      on alertas(hospital_id);
create index idx_alertas_servicio_id      on alertas(servicio_id) where servicio_id is not null;
create index idx_alertas_resuelta         on alertas(resuelta) where resuelta = false;
create index idx_alertas_severidad        on alertas(severidad);
create index idx_alertas_tipo             on alertas(tipo);
create index idx_alertas_creado_en        on alertas(creado_en desc);
create index idx_alertas_email_pendientes on alertas_email(tipo, referencia_id, destinatario_email)
  where resuelto = false;

-- notificaciones
create index idx_notificaciones_hospital  on notificaciones(hospital_id);
create index idx_notificaciones_usuario   on notificaciones(usuario_id, leida) where leida = false;

-- log_auditoria
create index idx_log_auditoria_hospital   on log_auditoria(hospital_id);
create index idx_log_auditoria_usuario    on log_auditoria(usuario_id);
create index idx_log_auditoria_fecha      on log_auditoria(fecha desc);
create index idx_log_auditoria_tabla      on log_auditoria(tabla_afectada, registro_id);

-- evidencias
create index idx_evidencias_hospital      on evidencias(hospital_id);
create index idx_evidencias_inspeccion    on evidencias(inspeccion_id) where inspeccion_id is not null;
create index idx_evidencias_equipo        on evidencias(equipo_id) where equipo_id is not null;

-- solicitudes_registro
create index idx_solicitudes_estado       on solicitudes_registro(estado);
create index idx_solicitudes_creado_en    on solicitudes_registro(creado_en desc);

-- historial_mantenimientos
create index idx_historial_equipo_id      on historial_mantenimientos(equipo_id);
create index idx_historial_fecha          on historial_mantenimientos(fecha desc);


-- ============================================================================
-- 5) HABILITAR RLS  (las políticas se crean en 3/5 baseline_rls.sql)
-- ============================================================================
-- Por defecto, sin políticas, RLS bloquea todo. Esto es deliberado: garantiza
-- que cualquier query falle hasta que el siguiente archivo cree las políticas.
-- ============================================================================

alter table hospitales                  enable row level security;
alter table servicios                   enable row level security;
alter table perfiles                    enable row level security;
alter table hospital_config             enable row level security;
alter table ubicaciones                 enable row level security;
alter table categorias_equipo           enable row level security;
alter table categorias_equipo_hospital  enable row level security;
alter table plantillas                  enable row level security;
alter table plantilla_versiones         enable row level security;
alter table plantilla_secciones         enable row level security;
alter table plantilla_items             enable row level security;
alter table plantilla_informes          enable row level security;
alter table plantillas_informe          enable row level security;
alter table carros                      enable row level security;
alter table cajones                     enable row level security;
alter table materiales                  enable row level security;
alter table desfibriladores             enable row level security;
alter table equipos                     enable row level security;
alter table historial_mantenimientos    enable row level security;
alter table inspecciones                enable row level security;
alter table items_inspeccion            enable row level security;
alter table alertas                     enable row level security;
alter table alertas_email               enable row level security;
alter table informes                    enable row level security;
alter table notificaciones              enable row level security;
alter table log_auditoria               enable row level security;
alter table evidencias                  enable row level security;
alter table solicitudes_registro        enable row level security;


-- ============================================================================
-- FIN BASELINE 1/5 — Schema base
--
-- Siguiente paso (cuando confirmes este archivo):
--   2/5  Funciones plpgsql (alertas ampliada con materiales/carros/controles,
--        URL del trigger parametrizada con app.functions_url, helpers).
-- ============================================================================
