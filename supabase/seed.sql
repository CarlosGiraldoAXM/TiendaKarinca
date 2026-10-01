-- Datos iniciales tomados del Excel.
-- Ajusta estas constantes si hace falta y vuelve a correr el seed sobre una base vacía.
do $seed$
declare
  c_trm       constant numeric := 3149;          -- COP por 1 USD
  c_fecha     constant date    := '2026-09-30';  -- fecha de todas las compras y del envío
  c_envio_usd constant numeric := 170;
  c_envio_cop constant numeric := 535330;        -- 170 × 3.149

  -- [nombre, unidades, precio unitario USD, tax unitario USD]
  c_datos constant jsonb := $json$
  [
    {"tienda": "DAISE", "items": [
      ["DAISE Rosado Mini Body Mist + Charm", 3, 6.99, 0.46],
      ["DAISE Amarillo Mini Body Mist + Charm", 3, 6.99, 0.46],
      ["DAISE Azul Mini Body Mist + Charm", 3, 6.99, 0.46],
      ["DAISE Naranja Mini Body Mist + Charm", 3, 6.99, 0.46]
    ]},
    {"tienda": "PINK", "items": [
      ["Rich Honey Body Lotion", 4, 8.26, 0.55],
      ["Rich Hair & Body Mist", 4, 8.26, 0.55],
      ["Body Lotion", 4, 8.26, 0.55],
      ["Rich Honey Body Oil", 6, 8.26, 0.55],
      ["Coconut Hair & Body Mist", 4, 8.26, 0.55],
      ["Coconut Shimmer Me! Body Mist", 4, 8.26, 0.55],
      ["Classic Highlighting Body Oil", 6, 8.26, 0.55],
      ["Coconut Creamy Gelato Body Butter", 4, 8.26, 0.55],
      ["Coconut Body Scrub", 4, 8.26, 0.55],
      ["Vanilla Body Oil", 6, 8.26, 0.55]
    ]},
    {"tienda": "Bath & Body Works", "items": [
      ["Champagne Toast PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Cozy Vanilla Almond PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Sunshine & Lemons PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Pumpkin Cupcake PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Pink Peach Blossom PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["A Thousand Wishes PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Ocean PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Strawberry Pound Cake PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Crisp Morning Air PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Pumpkin Pecan Waffles PocketBac Hand Sanitizer", 5, 1.48, 0.10],
      ["Japanese Cherry Blossom PocketBac Hand Sanitizer", 5, 1.48, 0.10]
    ]},
    {"tienda": "Vaseline", "items": [
      ["Vaseline Lip Therapy Rosy Lips", 2, 2.99, 0],
      ["Vaseline Lip Therapy Crème Brulee", 2, 2.99, 0],
      ["Vaseline Lip Therapy Original", 2, 2.99, 0],
      ["Vaseline Lip Therapy Cocoa Butter", 2, 2.99, 0],
      ["Vaseline Cocoa Radiant Oil Gel with Cocoa Butter", 6, 2.74, 0],
      ["Vaseline Cocoa Shimmer Jelly Stick", 3, 7.33, 0],
      ["Vaseline Cocoa Radiant Oil Gel Glazed", 6, 2.81, 0]
    ]},
    {"tienda": "EOS", "items": [
      ["EOS Pumpkin Chai Shea Butter", 3, 10.99, 0],
      ["EOS Pistachio Shea Butter", 3, 9.98, 0],
      ["EOS Vainilla Cashmere Shea Butter", 3, 9.97, 0],
      ["EOS Strawberry Dream Shea Butter", 3, 9.97, 0]
    ]},
    {"tienda": "Dove", "items": [
      ["DOVE Cedarwood + Crushed Mint Body Wash", 3, 8.87, 0],
      ["DOVE Cranberry + Orange Peel Body Wash", 3, 8.87, 0],
      ["DOVE Marshmallow + Warm Vanilla Body Wash", 3, 8.87, 0],
      ["DOVE Cinnamon Pumpkin", 2, 7.97, 0]
    ]}
  ]
  $json$;

  v_grupo     jsonb;
  v_tienda    uuid;
  v_compra    uuid;
  v_envio     uuid;
  v_items     integer;
  v_unidades  integer;
  v_total_usd numeric;
begin
  if exists (select 1 from compras) then
    raise notice 'Seed omitido: ya hay compras en la base.';
    return;
  end if;

  for v_grupo in select * from jsonb_array_elements(c_datos) loop
    insert into tiendas (nombre) values (v_grupo->>'tienda') returning id into v_tienda;
    insert into compras (tienda_id, fecha, trm) values (v_tienda, c_fecha, c_trm) returning id into v_compra;

    insert into compra_items (compra_id, nombre, unidades, precio_unitario_usd, tax_unitario_usd, orden)
    select v_compra, i.item->>0, (i.item->>1)::integer, (i.item->>2)::numeric, (i.item->>3)::numeric, i.orden
    from jsonb_array_elements(v_grupo->'items') with ordinality as i(item, orden);
  end loop;

  -- Un solo envío con todas las unidades de todos los ítems.
  insert into envios (fecha, descripcion, valor_usd, valor_cop)
  values (c_fecha, 'Envío inicial', c_envio_usd, c_envio_cop) returning id into v_envio;

  insert into envio_items (envio_id, compra_item_id, unidades)
  select v_envio, id, unidades from compra_items;

  -- Totales para cotejar con el Excel.
  select count(*), sum(unidades), sum(unidades * (precio_unitario_usd + tax_unitario_usd))
  into v_items, v_unidades, v_total_usd
  from compra_items;

  raise notice '--- Verificación del seed ---';
  raise notice 'Ítems: %   Unidades: %', v_items, v_unidades;
  raise notice 'Total mercancía (USD): %', v_total_usd;
  raise notice 'Envío (USD): %', c_envio_usd;
  raise notice 'Total gastado en USA (USD): %', v_total_usd + c_envio_usd;
  raise notice 'Total invertido (COP): %', v_total_usd * c_trm + c_envio_cop;
end
$seed$;
