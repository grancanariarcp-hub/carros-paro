-- ============================================================================
-- El detalle de una inspección firmada tampoco puede alterarse
-- ============================================================================
-- `inspecciones` tenía trigger de inmutabilidad desde el principio: una vez
-- firmada, no se le puede cambiar el resultado ni borrarla (ISO 13485).
--
-- Pero `items_inspeccion` no tenía ninguno, y su política RLS concede ALL a
-- cualquier usuario autenticado del hospital. Comprobado en astor-dev el
-- 2026-08-02 con una sesión real de administrador: se podía marcar como
-- "falla" un material que se había firmado conforme, cambiar su descripción, o
-- borrar la línea entera. Todo ello sobre una inspección ya firmada.
--
-- Eso vacía de contenido la firma. La cabecera dice "operativo, firmado por
-- Dra. X el día Y", pero el detalle de QUÉ se revisó podía reescribirse
-- después sin dejar rastro. Una firma que avala un contenido modificable no
-- prueba nada, que es justo lo contrario de para lo que existe esta app.
--
-- Se bloquean UPDATE y DELETE, no INSERT. Motivo: la pantalla de control crea
-- la inspección ya firmada y a continuación inserta sus items
-- (app/carro/[id]/control/[tipo]/page.tsx). Bloquear el INSERT rompería el
-- guardado diario.
--
-- Queda por tanto una vía abierta: añadir items nuevos a una inspección ya
-- firmada. Cerrarla requiere invertir el orden de guardado en la app —crear
-- sin firmar, insertar los items, y firmar al final— que es además el orden
-- natural: se firma lo que ya está completo. Es un cambio en la ruta más
-- crítica de la aplicación y se deja para decidirlo aparte.
-- ============================================================================

create or replace function public.bloquear_items_de_inspeccion_firmada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspeccion uuid;
  v_firmado    timestamptz;
begin
  v_inspeccion := coalesce(NEW.inspeccion_id, OLD.inspeccion_id);

  select firmado_en into v_firmado
  from public.inspecciones
  where id = v_inspeccion;

  if v_firmado is not null then
    raise exception
      'La inspección % está firmada: su detalle no puede modificarse (ISO 13485).',
      v_inspeccion;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_items_inspeccion_inmutables on public.items_inspeccion;
create trigger trg_items_inspeccion_inmutables
  before update or delete on public.items_inspeccion
  for each row execute function public.bloquear_items_de_inspeccion_firmada();
