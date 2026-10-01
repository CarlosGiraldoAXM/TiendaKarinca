-- Operaciones de escritura que tocan varias tablas. Cada función es una transacción.

-- Rechaza si alguno de los ítems indicados queda con disponibles < 0.
create or replace function _validar_stock(p_item_ids uuid[]) returns void
language plpgsql as $$
declare
  r record;
begin
  select inv.nombre, inv.unidades, inv.vendidas, inv.disponibles into r
  from v_inventario inv
  where inv.id = any (p_item_ids) and inv.disponibles < 0
  order by inv.nombre
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'SIN_STOCK',
      detail  = format('%s: hay %s y se están vendiendo %s', r.nombre, r.unidades, r.vendidas);
  end if;
end $$;

-- ---------------------------------------------------------------- guardar_venta
-- payload: { id?, fecha, vendedor, cliente_id, metodo_pago, descuento_cop, estado, notas,
--            items: [{ compra_item_id, unidades, precio_unitario_cop }] }
create or replace function guardar_venta(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_ids      uuid[];
  v_subtotal numeric;
  v_estado   estado_venta := coalesce(p->>'estado', 'pagada')::estado_venta;
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception using errcode = 'P0001', message = 'VENTA_SIN_ITEMS';
  end if;

  -- Ítems nuevos + los que ya tenía la venta (por si se editan o se quitan).
  select array_agg(distinct x) into v_ids from (
    select (i->>'compra_item_id')::uuid as x from jsonb_array_elements(p->'items') i
    union
    select compra_item_id from venta_items where venta_id = v_id
  ) s;

  -- Bloqueo en orden fijo para que dos ventas simultáneas no se crucen.
  perform 1 from compra_items where id = any (v_ids) order by id for update;

  if v_id is null then
    insert into ventas (fecha, vendedor, cliente_id, metodo_pago, descuento_cop, estado, notas)
    values (
      coalesce((p->>'fecha')::date, hoy_bogota()),
      coalesce(p->>'vendedor', ''),
      (p->>'cliente_id')::uuid,
      coalesce(p->>'metodo_pago', 'efectivo')::metodo_pago,
      coalesce((p->>'descuento_cop')::numeric, 0),
      v_estado,
      nullif(p->>'notas', '')
    ) returning id into v_id;
  else
    update ventas set
      fecha         = coalesce((p->>'fecha')::date, fecha),
      vendedor      = coalesce(p->>'vendedor', ''),
      cliente_id    = (p->>'cliente_id')::uuid,
      metodo_pago   = coalesce(p->>'metodo_pago', 'efectivo')::metodo_pago,
      descuento_cop = coalesce((p->>'descuento_cop')::numeric, 0),
      estado        = v_estado,
      notas         = nullif(p->>'notas', '')
    where id = v_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'NO_ENCONTRADO';
    end if;
    delete from venta_items where venta_id = v_id;
  end if;

  insert into venta_items (venta_id, compra_item_id, unidades, precio_unitario_cop)
  select v_id, (i->>'compra_item_id')::uuid, (i->>'unidades')::integer, (i->>'precio_unitario_cop')::numeric
  from jsonb_array_elements(p->'items') i;

  select sum(unidades * precio_unitario_cop) into v_subtotal from venta_items where venta_id = v_id;
  if coalesce((p->>'descuento_cop')::numeric, 0) > v_subtotal then
    raise exception using errcode = 'P0001', message = 'DESCUENTO_EXCEDE';
  end if;

  if v_estado <> 'anulada' then
    perform _validar_stock(v_ids);
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------- cambiar_estado_venta
create or replace function cambiar_estado_venta(p_id uuid, p_estado estado_venta) returns void
language plpgsql as $$
declare
  v_ids uuid[];
begin
  select array_agg(distinct compra_item_id) into v_ids from venta_items where venta_id = p_id;
  perform 1 from compra_items where id = any (v_ids) order by id for update;

  update ventas set estado = p_estado where id = p_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'NO_ENCONTRADO';
  end if;

  -- Reactivar una venta anulada vuelve a ocupar unidades: hay que comprobar que existan.
  if p_estado <> 'anulada' then
    perform _validar_stock(v_ids);
  end if;
end $$;

-- ---------------------------------------------------------------- guardar_compra
-- payload: { id?, tienda_id, fecha, trm, notas,
--            items: [{ id?, nombre, unidades, precio_unitario_usd, tax_unitario_usd }] }
create or replace function guardar_compra(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_en_uso text;
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception using errcode = 'P0001', message = 'COMPRA_SIN_ITEMS';
  end if;

  if v_id is null then
    insert into compras (tienda_id, fecha, trm, notas)
    values (
      (p->>'tienda_id')::uuid,
      coalesce((p->>'fecha')::date, hoy_bogota()),
      (p->>'trm')::numeric,
      nullif(p->>'notas', '')
    ) returning id into v_id;
  else
    update compras set
      tienda_id = (p->>'tienda_id')::uuid,
      fecha     = coalesce((p->>'fecha')::date, fecha),
      trm       = (p->>'trm')::numeric,
      notas     = nullif(p->>'notas', '')
    where id = v_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'NO_ENCONTRADO';
    end if;

    -- Ítems que ya no vienen en el formulario: solo se borran si no tienen ventas ni envíos.
    select ci.nombre into v_en_uso
    from compra_items ci
    where ci.compra_id = v_id
      and ci.id not in (
        select (i->>'id')::uuid from jsonb_array_elements(p->'items') i
        where nullif(i->>'id', '') is not null
      )
      and (exists (select 1 from envio_items ei where ei.compra_item_id = ci.id)
        or exists (select 1 from venta_items vi where vi.compra_item_id = ci.id))
    limit 1;
    if v_en_uso is not null then
      raise exception using errcode = 'P0001', message = 'ITEM_EN_USO', detail = v_en_uso;
    end if;

    delete from compra_items ci
    where ci.compra_id = v_id
      and ci.id not in (
        select (i->>'id')::uuid from jsonb_array_elements(p->'items') i
        where nullif(i->>'id', '') is not null
      );
  end if;

  update compra_items ci set
    nombre              = trim(i.item->>'nombre'),
    unidades            = (i.item->>'unidades')::integer,
    precio_unitario_usd = (i.item->>'precio_unitario_usd')::numeric,
    tax_unitario_usd    = coalesce((i.item->>'tax_unitario_usd')::numeric, 0),
    orden               = i.orden
  from jsonb_array_elements(p->'items') with ordinality as i(item, orden)
  where ci.id = nullif(i.item->>'id', '')::uuid and ci.compra_id = v_id;

  insert into compra_items (compra_id, nombre, unidades, precio_unitario_usd, tax_unitario_usd, orden)
  select
    v_id,
    trim(i.item->>'nombre'),
    (i.item->>'unidades')::integer,
    (i.item->>'precio_unitario_usd')::numeric,
    coalesce((i.item->>'tax_unitario_usd')::numeric, 0),
    i.orden
  from jsonb_array_elements(p->'items') with ordinality as i(item, orden)
  where nullif(i.item->>'id', '') is null;

  return v_id;
end $$;

-- ---------------------------------------------------------------- guardar_envio
-- payload: { id?, fecha, descripcion, valor_usd, valor_cop, notas,
--            items: [{ compra_item_id, unidades }] }
create or replace function guardar_envio(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception using errcode = 'P0001', message = 'ENVIO_SIN_ITEMS';
  end if;

  if v_id is null then
    insert into envios (fecha, descripcion, valor_usd, valor_cop, notas)
    values (
      coalesce((p->>'fecha')::date, hoy_bogota()),
      nullif(p->>'descripcion', ''),
      (p->>'valor_usd')::numeric,
      (p->>'valor_cop')::numeric,
      nullif(p->>'notas', '')
    ) returning id into v_id;
  else
    update envios set
      fecha       = coalesce((p->>'fecha')::date, fecha),
      descripcion = nullif(p->>'descripcion', ''),
      valor_usd   = (p->>'valor_usd')::numeric,
      valor_cop   = (p->>'valor_cop')::numeric,
      notas       = nullif(p->>'notas', '')
    where id = v_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'NO_ENCONTRADO';
    end if;
    delete from envio_items where envio_id = v_id;
  end if;

  -- El trigger de envio_items valida que no se superen las unidades compradas.
  insert into envio_items (envio_id, compra_item_id, unidades)
  select v_id, (i->>'compra_item_id')::uuid, (i->>'unidades')::integer
  from jsonb_array_elements(p->'items') i;

  return v_id;
end $$;

-- ---------------------------------------------------------------- fusionar_tiendas
-- Pasa todas las compras de `origen` a `destino` y borra `origen`.
create or replace function fusionar_tiendas(p_origen uuid, p_destino uuid) returns void
language plpgsql as $$
begin
  if p_origen = p_destino then
    raise exception using errcode = 'P0001', message = 'FUSION_MISMA_TIENDA';
  end if;
  if not exists (select 1 from tiendas where id = p_destino) then
    raise exception using errcode = 'P0001', message = 'NO_ENCONTRADO';
  end if;
  update compras set tienda_id = p_destino where tienda_id = p_origen;
  delete from tiendas where id = p_origen;
end $$;
