-- ============================================================================
-- Un servicio pertenece a un hospital, salvo que sea plantilla
-- ============================================================================
-- El catálogo introducido en 20260803020000 necesita servicios sin hospital,
-- pero `servicios.hospital_id` era NOT NULL según las migraciones. Producción
-- había divergido y sí admitía nulos, y por eso allí el catálogo funcionaba
-- mientras que en un entorno reconstruido desde cero no existía siquiera:
--
--   producción : hospital_id admite NULL → 33 plantillas
--   astor-dev  : hospital_id NOT NULL    → 0 plantillas
--
-- Es el mismo tipo de divergencia que apareció con alertas.hospital_id, en
-- sentido contrario. Se resuelve dejando que la regla la exprese el propio
-- esquema en vez de un NOT NULL que no distingue los dos casos:
--
--   plantilla        → SIN hospital (es un modelo compartido)
--   servicio de uso  → CON hospital (pertenece a un centro)
--
-- Así un servicio real sin hospital sigue siendo imposible —era lo que
-- protegía el NOT NULL— pero el catálogo cabe.
-- ============================================================================

alter table public.servicios alter column hospital_id drop not null;

do $$
declare
  v_incoherentes integer;
begin
  -- Antes de imponer la regla, comprobar que nada la incumple. Si hubiera
  -- filas raras conviene mirarlas, no forzarlas.
  select count(*) into v_incoherentes
  from public.servicios
  where (es_plantilla = true  and hospital_id is not null)
     or (es_plantilla = false and hospital_id is null);

  if v_incoherentes > 0 then
    raise exception
      'Hay % servicios que no encajan (plantilla con hospital, o servicio sin él). Revísalos.',
      v_incoherentes;
  end if;
end $$;

alter table public.servicios drop constraint if exists servicios_plantilla_coherente;
alter table public.servicios add constraint servicios_plantilla_coherente check (
  (es_plantilla = true  and hospital_id is null)
  or
  (es_plantilla = false and hospital_id is not null)
);
