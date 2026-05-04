-- ============================================================================
-- ÁSTOR — BASELINE SEED (5/5)
-- ============================================================================
-- Datos demo mínimos para arrancar DEV. Idempotente (ON CONFLICT DO NOTHING)
-- para que reaplicar la migración no cree duplicados.
--
-- Tras aplicar este archivo:
--   1) Hacer signup en https://app.astormanager.com (apuntando ya a DEV) o
--      desde Auth Dashboard de Supabase para crear un usuario auth.users.
--   2) Tras el signup, INSERT en public.perfiles con rol='superadmin' y
--      activo=true para que ese usuario pueda loguear y gestionar todo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Hospital demo (DEV)
-- ----------------------------------------------------------------------------
insert into public.hospitales (id, slug, nombre, plan, max_carros, max_usuarios, activo, pais)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo-dev',
  'Hospital Demo (DEV)',
  'enterprise',
  100,
  50,
  true,
  'España'
)
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- 2) Configuración del hospital demo
-- ----------------------------------------------------------------------------
insert into public.hospital_config (hospital_id, informe_membrete, informe_pie, requiere_firma)
values (
  '00000000-0000-0000-0000-000000000001',
  'Hospital Demo DEV — Sistema ÁSTOR',
  'Generado por ÁSTOR — astormanager.com',
  true
)
on conflict (hospital_id) do nothing;


-- ----------------------------------------------------------------------------
-- 3) Servicios demo
-- ----------------------------------------------------------------------------
insert into public.servicios (id, hospital_id, nombre, descripcion, color)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', 'Urgencias',     'Servicio de urgencias',          '#dc2626'),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000001', 'UCI',           'Unidad de cuidados intensivos',  '#7c3aed'),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000001', 'Quirófano',     'Bloque quirúrgico',              '#0891b2'),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000001', 'Hospitalización', 'Plantas de hospitalización',    '#16a34a')
on conflict (hospital_id, nombre) do nothing;


-- ----------------------------------------------------------------------------
-- 4) Plantilla informe genérica para los 5 tipos
-- ----------------------------------------------------------------------------
insert into public.plantillas_informe (hospital_id, tipo, codigo_prefijo, titulo_personalizado)
values
  ('00000000-0000-0000-0000-000000000001', 'controles_vencidos',    'INF-CTRL', 'Controles vencidos'),
  ('00000000-0000-0000-0000-000000000001', 'no_operativos',         'INF-NOP',  'Carros no operativos'),
  ('00000000-0000-0000-0000-000000000001', 'vencimientos',          'INF-VTO',  'Vencimientos próximos'),
  ('00000000-0000-0000-0000-000000000001', 'historial_auditorias',  'INF-HIST', 'Historial de auditorías'),
  ('00000000-0000-0000-0000-000000000001', 'control_realizado',     'INF-CON',  'Control realizado')
on conflict (hospital_id, tipo) do nothing;


-- ============================================================================
-- FIN BASELINE 5/5 — Seed
--
-- Pasos siguientes (manuales):
--   a) Setear GUCs (ver supabase/setup_dev_guc.sql.example en repo).
--   b) Crear primer usuario auth.users via Supabase Dashboard.
--   c) Insertar perfil con rol='superadmin'.
--   d) Apuntar .env.local a DEV.
--   e) Probar `npm run dev` en localhost:3002.
-- ============================================================================
