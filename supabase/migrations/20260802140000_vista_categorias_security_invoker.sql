-- ============================================================================
-- v_categorias_por_hospital: añadir a migraciones + cerrar fuga a anónimos
-- ============================================================================
-- Dos problemas, ambos detectados al reconstruir el esquema en astor-dev:
--
-- 1) La vista existía en producción pero NO estaba en ninguna migración: se
--    creó a mano en el panel. Una reconstrucción desde cero se quedaba sin
--    ella y la app fallaba al leerla.
--
-- 2) Se creó sin `security_invoker`, así que se ejecutaba con los permisos
--    de su propietario (postgres) y saltaba las políticas RLS de las tablas
--    base. Con la anon key pública y sin autenticarse, se leían las 12
--    categorías globales. Hoy no hay categorías por hospital, pero en cuanto
--    un hospital cree las suyas también se filtrarían.
--
--    Comprobado antes de aplicarlo: `cat_equipo_select` es `to authenticated`,
--    de modo que con security_invoker un anónimo no encaja en ninguna política
--    y obtiene 0 filas, mientras que un usuario autenticado sigue viendo lo
--    mismo que antes (globales + las de su hospital). No cambia la app.
-- ============================================================================

create or replace view public.v_categorias_por_hospital as
  select
    c.id,
    c.nombre,
    c.hospital_id,
    c.es_global,
    c.activo,
    coalesce(ch.visible,  true)  as visible,
    coalesce(ch.favorita, false) as favorita,
    case
      when coalesce(ch.favorita, false) then 0
      when c.hospital_id is not null    then 1
      else 2
    end as orden_grupo
  from public.categorias_equipo c
  left join public.categorias_equipo_hospital ch on ch.categoria_id = c.id
  where c.activo = true;

-- La vista respeta las políticas RLS del usuario que consulta, no las de
-- su propietario. Sin esto, la vista es un agujero alrededor de la RLS.
alter view public.v_categorias_por_hospital set (security_invoker = on);

grant select on public.v_categorias_por_hospital to authenticated;
