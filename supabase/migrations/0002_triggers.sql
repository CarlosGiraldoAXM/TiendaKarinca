-- Reglas que la base de datos hace cumplir aunque la API falle.
-- Los errores de negocio usan errcode P0001 con un código corto en `message`
-- y el detalle legible en `detail`; el Worker los traduce (worker/errores.ts).

-- La suma de unidades de un ítem en todos los envíos no puede superar las compradas.
create or replace function trg_envio_items_validar() returns trigger
language plpgsql as $$
declare
  v_compradas integer;
  v_nombre    text;
  v_enviadas  integer;
begin
  -- Bloquea el ítem para que dos envíos simultáneos no se pasen entre los dos.
  select unidades, nombre into v_compradas, v_nombre
  from compra_items where id = new.compra_item_id for update;

  select coalesce(sum(unidades), 0) into v_enviadas
  from envio_items where compra_item_id = new.compra_item_id;

  if v_enviadas > v_compradas then
    raise exception using
      errcode = 'P0001',
      message = 'EXCEDE_UNIDADES',
      detail  = format('%s: se compraron %s y quedarían %s en envíos', v_nombre, v_compradas, v_enviadas);
  end if;
  return new;
end $$;

create trigger envio_items_validar
after insert or update on envio_items
for each row execute function trg_envio_items_validar();

-- Las unidades de un ítem no pueden bajar de lo ya enviado ni de lo ya vendido.
create or replace function trg_compra_items_validar_unidades() returns trigger
language plpgsql as $$
declare
  v_enviadas integer;
  v_vendidas integer;
begin
  select coalesce(sum(unidades), 0) into v_enviadas
  from envio_items where compra_item_id = new.id;

  if new.unidades < v_enviadas then
    raise exception using
      errcode = 'P0001',
      message = 'UNIDADES_MENOR_ENVIADAS',
      detail  = format('%s: ya hay %s unidades en envíos', new.nombre, v_enviadas);
  end if;

  select coalesce(sum(vi.unidades), 0) into v_vendidas
  from venta_items vi join ventas v on v.id = vi.venta_id
  where vi.compra_item_id = new.id and v.estado <> 'anulada';

  if new.unidades < v_vendidas then
    raise exception using
      errcode = 'P0001',
      message = 'UNIDADES_MENOR_VENDIDAS',
      detail  = format('%s: ya se vendieron %s unidades', new.nombre, v_vendidas);
  end if;
  return new;
end $$;

create trigger compra_items_validar_unidades
before update of unidades on compra_items
for each row when (new.unidades < old.unidades)
execute function trg_compra_items_validar_unidades();
