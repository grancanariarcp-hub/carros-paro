-- Fijar el search_path en las funciones que corren con privilegios elevados.
--
-- Una función SECURITY DEFINER se ejecuta con los permisos de quien la creó,
-- no de quien la llama. Si además no fija su search_path, resuelve los nombres
-- de tablas y funciones según el que traiga el llamante: basta con crear un
-- objeto que se llame igual en un esquema que vaya antes para que la función
-- acabe leyendo o escribiendo ahí, ya con privilegios elevados.
--
-- Estas tres consultan límites de plan y cuentan carros y usuarios. Las otras
-- funciones del proyecto ya lo fijaban; estas tres se habían quedado atrás.
-- El cuerpo no cambia: solo se ancla dónde buscan.

create or replace function estado_plan(p_hospital_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h hospitales%rowtype;
  v_c int;
  v_u int;
begin
  select * into v_h from hospitales where id = p_hospital_id;

  select count(*) into v_c from carros
   where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  select count(*) into v_u from perfiles
   where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  return jsonb_build_object(
    'plan', v_h.plan,
    'max_carros', v_h.max_carros,
    'carros_usados', v_c,
    'carros_disponibles', v_h.max_carros - v_c,
    'puede_crear_carro', v_c < v_h.max_carros,
    'max_usuarios', v_h.max_usuarios,
    'usuarios_usados', v_u,
    'usuarios_disponibles', v_h.max_usuarios - v_u,
    'puede_crear_usuario', v_u < v_h.max_usuarios
  );
end $$;

create or replace function puede_crear_carro(p_hospital_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max    int;
  v_actual int;
begin
  select max_carros into v_max from hospitales where id = p_hospital_id;

  select count(*) into v_actual from carros
   where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  return v_actual < v_max;
end $$;

create or replace function puede_crear_usuario(p_hospital_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max    int;
  v_actual int;
begin
  select max_usuarios into v_max from hospitales where id = p_hospital_id;

  select count(*) into v_actual from perfiles
   where hospital_id = p_hospital_id and activo = true and deleted_at is null;

  return v_actual < v_max;
end $$;
