-- Guardar un control es una sola operación, no seis.
--
-- Hasta ahora la pantalla de control encadenaba seis escrituras sueltas desde
-- el navegador: inspección, ítems, carro, desfibrilador y auditoría. Solo se
-- comprobaba el error de la primera. Las consecuencias de que fallara
-- cualquiera de las otras no son teóricas:
--
--   · Si fallaban los ÍTEMS, quedaba una inspección firmada y sin detalle. Y
--     como una inspección firmada es inmutable (ISO 13485), ese detalle ya no
--     se podía añadir nunca: el control queda inservible para siempre.
--   · Si fallaba el CARRO, no se actualizaba proximo_control y el carro se
--     caía del calendario en silencio. Un carro de parada que nadie vuelve a
--     revisar porque la aplicación cree que ya está al día es exactamente el
--     fallo que esta aplicación existe para evitar.
--   · Si fallaba el ESTADO, un carro declarado no operativo seguía figurando
--     como operativo.
--
-- Nada de eso avisaba: la pantalla mostraba "guardado" y llevaba al informe.
--
-- Aquí todo va en una transacción: o se guarda entero o no se guarda nada, y
-- el error llega a quien está delante del carro.
--
-- La función es SECURITY INVOKER a propósito. No concede ningún permiso nuevo:
-- las mismas políticas RLS que se aplicaban a las seis escrituras sueltas se
-- aplican ahora dentro. Lo único que cambia es que son atómicas.

create or replace function registrar_control(
  p_carro_id        uuid,
  p_tipo            text,
  p_resultado       text,
  p_items           jsonb,           -- [{material_id, cantidad_ok, ...}]
  p_proximo_control date,
  p_firma           jsonb,           -- {nombre, cargo, url, firmado_en}
  p_desfibrilador   jsonb default null,
  p_precintos       jsonb default null,
  p_detalle_log     jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_perfil     record;
  v_carro      record;
  v_inspeccion uuid;
  v_desf       uuid;
begin
  select id, hospital_id, activo into v_perfil
  from perfiles where id = auth.uid();

  if v_perfil.id is null or not coalesce(v_perfil.activo, false) then
    raise exception 'Tu cuenta no esta activa.';
  end if;

  -- RLS ya impide ver carros de otro hospital, así que si no aparece es que no
  -- se puede tocar. Decirlo claro evita un error incomprensible más abajo.
  select id, hospital_id, codigo into v_carro
  from carros where id = p_carro_id;

  if v_carro.id is null then
    raise exception 'Ese carro no existe o no es de tu hospital.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un control sin ningun item comprobado no es un control.';
  end if;

  insert into inspecciones (
    carro_id, tipo, resultado, auditor_id,
    numero_censo_desf, modelo_desf, fecha_mantenimiento_desf,
    precinto_retirado, precinto_colocado,
    foto_precinto_retirado, foto_precinto_colocado,
    firma_url, firmante_nombre, firmante_cargo, firmado_en, firmante_usuario_id
  ) values (
    p_carro_id, p_tipo, p_resultado, v_perfil.id,
    p_desfibrilador ->> 'numero_censo',
    p_desfibrilador ->> 'modelo',
    nullif(p_desfibrilador ->> 'fecha_mantenimiento', '')::date,
    nullif(p_precintos ->> 'retirado', ''),
    nullif(p_precintos ->> 'colocado', ''),
    p_precintos ->> 'foto_retirado',
    p_precintos ->> 'foto_colocado',
    p_firma ->> 'url',
    p_firma ->> 'nombre',
    nullif(p_firma ->> 'cargo', ''),
    coalesce((p_firma ->> 'firmado_en')::timestamptz, now()),
    v_perfil.id
  )
  returning id into v_inspeccion;

  insert into items_inspeccion (
    inspeccion_id, material_id, cantidad_ok, estado_ok,
    tiene_falla, tipo_falla, descripcion_falla, foto_url, fecha_vencimiento
  )
  select
    v_inspeccion,
    nullif(i ->> 'material_id', '')::uuid,
    coalesce((i ->> 'cantidad_ok')::boolean, false),
    coalesce((i ->> 'estado_ok')::boolean, false),
    coalesce((i ->> 'tiene_falla')::boolean, false),
    nullif(i ->> 'tipo_falla', ''),
    nullif(i ->> 'descripcion_falla', ''),
    nullif(i ->> 'foto_url', ''),
    nullif(i ->> 'fecha_vencimiento', '')::date
  from jsonb_array_elements(p_items) as i;

  update carros set
    estado              = p_resultado,
    ultimo_control      = now(),
    ultimo_tipo_control = p_tipo,
    proximo_control     = coalesce(p_proximo_control, proximo_control)
  where id = p_carro_id;

  -- Si RLS deja ver el carro pero no actualizarlo, el update no da error:
  -- simplemente no afecta a ninguna fila. Sin esta comprobación, el carro se
  -- quedaría fuera del calendario en silencio, que es justo lo que se
  -- pretende evitar.
  if not found then
    raise exception 'No tienes permiso para actualizar este carro.';
  end if;

  if p_desfibrilador is not null then
    select id into v_desf from desfibriladores where carro_id = p_carro_id limit 1;

    if v_desf is not null then
      update desfibriladores set
        numero_censo               = p_desfibrilador ->> 'numero_censo',
        modelo                     = p_desfibrilador ->> 'modelo',
        marca                      = nullif(p_desfibrilador ->> 'marca', ''),
        fecha_ultimo_mantenimiento = nullif(p_desfibrilador ->> 'fecha_ultimo_mantenimiento', '')::date,
        fecha_mantenimiento        = nullif(p_desfibrilador ->> 'fecha_mantenimiento', '')::date
      where id = v_desf;
    else
      insert into desfibriladores (carro_id, numero_censo, modelo, marca,
                                   fecha_ultimo_mantenimiento, fecha_mantenimiento)
      values (
        p_carro_id,
        p_desfibrilador ->> 'numero_censo',
        p_desfibrilador ->> 'modelo',
        nullif(p_desfibrilador ->> 'marca', ''),
        nullif(p_desfibrilador ->> 'fecha_ultimo_mantenimiento', '')::date,
        nullif(p_desfibrilador ->> 'fecha_mantenimiento', '')::date
      );
    end if;
  end if;

  -- El hospital sí se guarda aquí. La pantalla no lo pasaba, y sin él estas
  -- entradas no salen al filtrar la auditoría por centro.
  insert into log_auditoria (usuario_id, hospital_id, accion, tabla_afectada,
                             registro_id, detalle, resultado)
  values (
    v_perfil.id, v_carro.hospital_id, 'control_realizado', 'inspecciones',
    v_inspeccion,
    coalesce(p_detalle_log, '{}'::jsonb) || jsonb_build_object(
      'tipo', p_tipo, 'resultado', p_resultado, 'carro_codigo', v_carro.codigo
    ),
    'exito'
  );

  return v_inspeccion;
end $$;

revoke all on function registrar_control(uuid, text, text, jsonb, date, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function registrar_control(uuid, text, text, jsonb, date, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function registrar_control is
  'Guarda un control completo (inspeccion + items + carro + desfibrilador + auditoria) en una sola transaccion. Ver 20260803080000 para el porque.';
