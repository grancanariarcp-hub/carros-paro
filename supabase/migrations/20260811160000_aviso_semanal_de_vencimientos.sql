-- Avisar cada semana de lo que va a caducar, sin que nadie tenga que buscarlo.
--
-- Un hospital pasa la acreditación una vez al año, pero convive con los carros
-- todos los días. El informe de vencimientos ya existía; el problema es que
-- hay que acordarse de abrirlo. Un medicamento caducado dentro de un carro de
-- parada no se descubre en el informe: se descubre en la parada.
--
-- Esto le da la vuelta: cada lunes, quien lleva un servicio recibe en su
-- bandeja qué le caduca y en qué carro está. Convierte una obligación anual en
-- una ayuda semanal, que es lo que hace que una herramienta se abra sola.

create or replace function avisar_vencimientos_proximos(p_dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo   record;
  v_creados integer := 0;
  v_detalle text;
begin
  for v_grupo in
    select
      c.hospital_id,
      c.servicio_id,
      count(*)                          as cuantos,
      min(m.fecha_vencimiento)          as el_mas_urgente,
      count(*) filter (
        where m.fecha_vencimiento < current_date
      )                                 as ya_caducados
    from materiales m
    join cajones ca on ca.id = m.cajon_id
    join carros  c  on c.id  = ca.carro_id
    where coalesce(m.activo, true)
      and m.deleted_at is null
      and coalesce(ca.activo, true)
      and coalesce(c.activo, true)
      and c.deleted_at is null
      and m.tiene_vencimiento
      and m.fecha_vencimiento is not null
      and m.fecha_vencimiento <= current_date + p_dias
    group by c.hospital_id, c.servicio_id
  loop
    -- No repetir el aviso si el de la semana pasada sigue sin atender: la
    -- bandeja se llenaría de lo mismo y se dejaría de mirar, que es la forma
    -- más rápida de que un aviso deje de servir.
    if exists (
      select 1 from alertas a
      where a.hospital_id = v_grupo.hospital_id
        and a.tipo = 'material_vencimiento_proximo'
        and a.servicio_id is not distinct from v_grupo.servicio_id
        and not coalesce(a.resuelta, false)
        and a.creado_en > now() - interval '6 days'
    ) then
      continue;
    end if;

    -- Los tres más urgentes por nombre y carro: con eso ya se sabe si hay que
    -- salir corriendo o puede esperar al martes.
    select string_agg(t.linea, chr(10))
      into v_detalle
    from (
      select '· ' || m.nombre || ' (carro ' || c.codigo || ') — ' ||
             case
               when m.fecha_vencimiento < current_date then 'CADUCADO'
               when m.fecha_vencimiento = current_date then 'caduca hoy'
               else 'caduca el ' || to_char(m.fecha_vencimiento, 'DD/MM/YYYY')
             end as linea
      from materiales m
      join cajones ca on ca.id = m.cajon_id
      join carros  c  on c.id  = ca.carro_id
      where c.hospital_id = v_grupo.hospital_id
        and c.servicio_id is not distinct from v_grupo.servicio_id
        and coalesce(m.activo, true) and m.deleted_at is null
        and coalesce(ca.activo, true)
        and coalesce(c.activo, true) and c.deleted_at is null
        and m.tiene_vencimiento
        and m.fecha_vencimiento is not null
        and m.fecha_vencimiento <= current_date + p_dias
      order by m.fecha_vencimiento
      limit 3
    ) t;

    perform crear_alerta_con_notificaciones(
      p_hospital_id := v_grupo.hospital_id,
      p_tipo        := 'material_vencimiento_proximo',
      -- Algo ya caducado dentro de un carro de parada no es un recordatorio.
      p_severidad   := case when v_grupo.ya_caducados > 0 then 'critica' else 'media' end,
      p_titulo      := case
                         when v_grupo.ya_caducados > 0
                         then v_grupo.ya_caducados || ' material(es) CADUCADOS en el carro'
                         else v_grupo.cuantos || ' material(es) caducan en ' || p_dias || ' dias'
                       end,
      p_mensaje     := coalesce(v_detalle, '') ||
                       case when v_grupo.cuantos > 3
                            then chr(10) || 'y ' || (v_grupo.cuantos - 3) || ' mas.'
                            else '' end,
      p_servicio_id := v_grupo.servicio_id
    );

    v_creados := v_creados + 1;
  end loop;

  return v_creados;
end $$;

revoke all on function avisar_vencimientos_proximos(integer) from public;
grant execute on function avisar_vencimientos_proximos(integer) to authenticated;

comment on function avisar_vencimientos_proximos is
  'Avisa por servicio de los materiales que caducan en los proximos N dias. La lanza pg_cron cada lunes.';

-- Lunes a las 7:00 UTC: en Canarias son las 7 u 8 de la mañana según la época
-- del año, así que el aviso está en la bandeja al empezar el turno y no a
-- media tarde, cuando ya no da tiempo a reponer nada.
select cron.unschedule('avisar-vencimientos')
 where exists (select 1 from cron.job where jobname = 'avisar-vencimientos');

select cron.schedule(
  'avisar-vencimientos',
  '0 7 * * 1',
  $cron$ select public.avisar_vencimientos_proximos(30) $cron$
);
