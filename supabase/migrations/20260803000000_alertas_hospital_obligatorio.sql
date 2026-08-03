-- ============================================================================
-- alertas.hospital_id vuelve a ser obligatorio en producción
-- ============================================================================
-- Divergencia detectada el 2026-08-02 comparando producción con astor-dev:
--
--   producción : hospital_id admite NULL
--   astor-dev  : hospital_id NOT NULL   (lo que dicen las migraciones)
--
-- Producción se separó de las migraciones en algún momento. Y esa diferencia
-- no era inocua: la pantalla de control creaba la alerta de "carro no
-- operativo" con un insert directo que no pasaba hospital_id. En producción
-- colaba, dejando la alerta huérfana de hospital; y las Edge Functions de
-- email y push buscan destinatarios POR HOSPITAL, así que no encontraban a
-- nadie. Resultado: un carro declarado no operativo y ningún aviso a quien
-- tenía que actuar.
--
-- Que nunca se notara tiene explicación: revisando las 31 alertas de
-- producción, las 20 de tipo carro_no_operativo son pruebas manuales de mayo
-- creadas por RPC. Ningún control real había generado una todavía.
--
-- La app pasa a usar crear_alerta_con_notificaciones, que exige hospital_id,
-- fija la severidad y además crea las filas de `notificaciones` (la campana de
-- la app, que con el insert directo tampoco se enteraba).
--
-- Esta migración cierra la puerta: con la columna obligatoria, un insert que
-- olvide el hospital falla en vez de crear una alerta que no avisa a nadie.
-- Verificado antes de aplicarla que no hay filas con hospital_id nulo.
-- ============================================================================

do $$
declare
  v_huerfanas integer;
begin
  select count(*) into v_huerfanas from public.alertas where hospital_id is null;

  if v_huerfanas > 0 then
    -- No se fuerza a ciegas: una alerta sin hospital indica un problema previo
    -- que hay que mirar, no algo que deba resolverse borrando o inventando.
    raise exception
      'Hay % alertas sin hospital_id. Revísalas antes de aplicar esta migración.',
      v_huerfanas;
  end if;

  alter table public.alertas alter column hospital_id set not null;
end $$;
