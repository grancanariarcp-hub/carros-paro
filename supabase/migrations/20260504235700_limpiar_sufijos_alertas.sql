-- ============================================================================
-- Limpieza: quita los sufijos [equipo:UUID] y [material:UUID] de los mensajes
-- de alertas existentes. Las funciones plpgsql ya no los añaden, pero alertas
-- pre-fix los tenían y se ven feo en el frontend.
-- ============================================================================

update public.alertas
   set mensaje = trim(regexp_replace(mensaje, '\s*\[(equipo|material):[0-9a-f-]+\]', '', 'g'))
 where mensaje ~ '\[(equipo|material):[0-9a-f-]+\]';
