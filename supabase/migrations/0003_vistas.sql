-- Derivados. Nada de esto se guarda: siempre se recalcula.
-- La referencia en TypeScript de estas fórmulas es shared/calc.ts.

-- ---------------------------------------------------------------- v_envio_detalle
-- Una fila por línea de envío, con el prorrateo por participación en valor.
create view v_envio_detalle with (security_invoker = true) as
with lineas as (
  select
    ei.id,
    ei.envio_id,
    ei.compra_item_id,
    ei.unidades,
    ci.nombre,
    ci.compra_id,
    c.tienda_id,
    t.nombre as tienda,
    e.valor_usd,
    e.valor_cop,
    (ci.precio_unitario_usd + ci.tax_unitario_usd) * c.trm               as costo_unitario_cop,
    ei.unidades * (ci.precio_unitario_usd + ci.tax_unitario_usd) * c.trm as valor_linea_cop
  from envio_items ei
  join envios e        on e.id = ei.envio_id
  join compra_items ci on ci.id = ei.compra_item_id
  join compras c       on c.id = ci.compra_id
  join tiendas t       on t.id = c.tienda_id
), con_total as (
  select l.*, sum(l.valor_linea_cop) over (partition by l.envio_id) as valor_total_envio_cop
  from lineas l
)
select
  id,
  envio_id,
  compra_item_id,
  compra_id,
  tienda_id,
  tienda,
  nombre,
  unidades,
  costo_unitario_cop,
  valor_linea_cop,
  coalesce(valor_linea_cop / nullif(valor_total_envio_cop, 0), 0)               as participacion,
  coalesce(valor_linea_cop * valor_cop / nullif(valor_total_envio_cop, 0), 0)   as envio_asignado_cop,
  coalesce(valor_linea_cop * valor_usd / nullif(valor_total_envio_cop, 0), 0)   as envio_asignado_usd,
  coalesce(valor_linea_cop * valor_cop / nullif(valor_total_envio_cop, 0), 0) / unidades as envio_por_unidad_cop
from con_total;

-- ---------------------------------------------------------------- v_inventario
-- Una fila por ítem de compra (lote). Es la tabla que reemplaza el Excel.
create view v_inventario with (security_invoker = true) as
with envio as (
  select
    compra_item_id,
    sum(unidades)           as unidades_enviadas,
    sum(envio_asignado_cop) as envio_total_item_cop,
    sum(envio_asignado_usd) as envio_total_item_usd
  from v_envio_detalle
  group by compra_item_id
), venta as (
  select vi.compra_item_id, sum(vi.unidades) as vendidas
  from venta_items vi
  join ventas v on v.id = vi.venta_id
  where v.estado <> 'anulada'
  group by vi.compra_item_id
), base as (
  select
    ci.id,
    ci.compra_id,
    ci.nombre,
    ci.orden,
    ci.unidades,
    ci.precio_unitario_usd,
    ci.tax_unitario_usd,
    ci.precio_venta_cop,
    c.fecha  as fecha_compra,
    c.trm,
    c.tienda_id,
    t.nombre as tienda,
    ci.precio_unitario_usd + ci.tax_unitario_usd           as costo_unitario_usd,
    (ci.precio_unitario_usd + ci.tax_unitario_usd) * c.trm as costo_unitario_cop,
    coalesce(e.unidades_enviadas, 0)::integer              as unidades_enviadas,
    coalesce(e.envio_total_item_cop, 0)                    as envio_total_item_cop,
    coalesce(e.envio_total_item_usd, 0)                    as envio_total_item_usd,
    coalesce(v.vendidas, 0)::integer                       as vendidas
  from compra_items ci
  join compras c    on c.id = ci.compra_id
  join tiendas t    on t.id = c.tienda_id
  left join envio e on e.compra_item_id = ci.id
  left join venta v on v.compra_item_id = ci.id
), costos as (
  select
    b.*,
    b.costo_unitario_cop * b.unidades                               as costo_base_total_cop,
    b.envio_total_item_cop / b.unidades                             as envio_unitario_cop,
    b.costo_unitario_cop + b.envio_total_item_cop / b.unidades      as costo_total_unitario_cop
  from base b
), precios as (
  select
    k.*,
    k.costo_total_unitario_cop * (1 + cfg.utilidad_pct / 100) as precio_sugerido_cop,
    coalesce(k.precio_venta_cop,
             k.costo_total_unitario_cop * (1 + cfg.utilidad_pct / 100)) as precio_venta_efectivo_cop
  from costos k
  cross join config cfg
)
select
  id,
  compra_id,
  tienda_id,
  tienda,
  fecha_compra,
  nombre,
  orden,
  unidades,
  vendidas,
  unidades - vendidas          as disponibles,
  unidades_enviadas,
  unidades - unidades_enviadas as pendientes_envio,
  precio_unitario_usd,
  tax_unitario_usd,
  costo_unitario_usd,
  trm,
  costo_unitario_cop,
  costo_base_total_cop,
  envio_total_item_cop,
  envio_total_item_usd,
  envio_unitario_cop,
  costo_total_unitario_cop,
  precio_sugerido_cop,
  precio_venta_cop,
  precio_venta_efectivo_cop,
  case when costo_total_unitario_cop > 0
       then (precio_venta_efectivo_cop - costo_total_unitario_cop) / costo_total_unitario_cop
  end as margen
from precios;

-- ---------------------------------------------------------------- v_venta_items_detalle
create view v_venta_items_detalle with (security_invoker = true) as
select
  vi.id,
  vi.venta_id,
  vi.compra_item_id,
  inv.nombre,
  inv.tienda,
  vi.unidades,
  vi.precio_unitario_cop,
  vi.unidades * vi.precio_unitario_cop          as subtotal_cop,
  inv.costo_total_unitario_cop,
  vi.unidades * inv.costo_total_unitario_cop    as costo_cop,
  inv.disponibles
from venta_items vi
join v_inventario inv on inv.id = vi.compra_item_id;

-- ---------------------------------------------------------------- v_ventas_resumen
create view v_ventas_resumen with (security_invoker = true) as
with totales as (
  select
    venta_id,
    count(*)::integer      as num_items,
    sum(unidades)::integer as unidades,
    sum(subtotal_cop)      as subtotal_cop,
    sum(costo_cop)         as costo_cop
  from v_venta_items_detalle
  group by venta_id
)
select
  v.id,
  v.consecutivo,
  v.numero,
  v.fecha,
  v.vendedor,
  v.cliente_id,
  cl.nombre   as cliente,
  cl.telefono as cliente_telefono,
  v.metodo_pago,
  v.estado,
  v.notas,
  v.created_at,
  coalesce(t.num_items, 0)                                       as num_items,
  coalesce(t.unidades, 0)                                        as unidades,
  coalesce(t.subtotal_cop, 0)                                    as subtotal_cop,
  v.descuento_cop,
  coalesce(t.subtotal_cop, 0) - v.descuento_cop                  as total_cop,
  coalesce(t.costo_cop, 0)                                       as costo_cop,
  coalesce(t.subtotal_cop, 0) - v.descuento_cop - coalesce(t.costo_cop, 0) as utilidad_cop
from ventas v
join clientes cl     on cl.id = v.cliente_id
left join totales t  on t.venta_id = v.id;

-- ---------------------------------------------------------------- v_dashboard
-- Una sola fila con los acumulados de todo el histórico.
create view v_dashboard with (security_invoker = true) as
with inv as (
  select
    coalesce(sum(costo_base_total_cop), 0)                    as mercancia_cop,
    coalesce(sum(disponibles * precio_venta_efectivo_cop), 0) as valor_inventario_cop,
    coalesce(sum(unidades), 0)::integer                       as unidades_totales,
    coalesce(sum(vendidas), 0)::integer                       as unidades_vendidas,
    coalesce(sum(disponibles), 0)::integer                    as unidades_disponibles
  from v_inventario
), env as (
  select coalesce(sum(valor_cop), 0) as envios_cop from envios
), ven as (
  select
    coalesce(sum(total_cop)    filter (where estado in ('pagada', 'entregada')), 0) as venta_real_cop,
    coalesce(sum(costo_cop)    filter (where estado in ('pagada', 'entregada')), 0) as costo_vendido_cop,
    coalesce(sum(utilidad_cop) filter (where estado in ('pagada', 'entregada')), 0) as utilidad_real_cop,
    coalesce(sum(total_cop)    filter (where estado = 'pendiente'), 0)              as por_cobrar_cop
  from v_ventas_resumen
)
select
  inv.mercancia_cop,
  env.envios_cop,
  inv.mercancia_cop + env.envios_cop                                  as invertido_cop,
  inv.valor_inventario_cop,
  ven.venta_real_cop,
  ven.por_cobrar_cop,
  ven.costo_vendido_cop,
  ven.utilidad_real_cop,
  ven.venta_real_cop + ven.por_cobrar_cop + inv.valor_inventario_cop  as potencial_cop,
  inv.unidades_totales,
  inv.unidades_vendidas,
  inv.unidades_disponibles
from inv, env, ven;

-- ---------------------------------------------------------------- f_dashboard
-- Todo lo que necesita la pantalla principal en un solo viaje.
-- El rango de fechas aplica a ventas y utilidad; lo acumulado no se filtra.
create or replace function f_dashboard(
  p_desde date default null,
  p_hasta date default null,
  p_granularidad text default 'mes'
) returns jsonb
language sql stable as $$
  with ventas_rango as (
    select * from v_ventas_resumen
    where (p_desde is null or fecha >= p_desde)
      and (p_hasta is null or fecha <= p_hasta)
  ), periodo as (
    select
      coalesce(sum(total_cop)    filter (where estado in ('pagada', 'entregada')), 0) as venta_real_cop,
      coalesce(sum(costo_cop)    filter (where estado in ('pagada', 'entregada')), 0) as costo_vendido_cop,
      coalesce(sum(utilidad_cop) filter (where estado in ('pagada', 'entregada')), 0) as utilidad_real_cop,
      coalesce(sum(total_cop)    filter (where estado = 'pendiente'), 0)              as por_cobrar_cop,
      count(*) filter (where estado <> 'anulada')::integer                           as num_ventas
    from ventas_rango
  ), serie as (
    select
      date_trunc(case when p_granularidad = 'semana' then 'week' else 'month' end, fecha)::date as periodo,
      sum(total_cop)    as venta_cop,
      sum(utilidad_cop) as utilidad_cop
    from ventas_rango
    where estado in ('pagada', 'entregada')
    group by 1
  ), por_tienda as (
    select tienda, sum(costo_base_total_cop + envio_total_item_cop) as invertido_cop
    from v_inventario
    group by tienda
  ), top as (
    select d.nombre, d.tienda, sum(d.unidades)::integer as unidades, sum(d.subtotal_cop) as venta_cop
    from v_venta_items_detalle d
    join ventas_rango v on v.id = d.venta_id
    where v.estado <> 'anulada'
    group by d.nombre, d.tienda
    order by sum(d.unidades) desc, sum(d.subtotal_cop) desc
    limit 5
  ), menor_stock as (
    select id, nombre, tienda, disponibles, unidades
    from v_inventario
    where disponibles > 0
    order by disponibles asc, nombre asc
    limit 5
  )
  select jsonb_build_object(
    'acumulado',    (select to_jsonb(d) from v_dashboard d),
    'periodo',      (select to_jsonb(p) from periodo p),
    'serie',        coalesce((select jsonb_agg(to_jsonb(s) order by s.periodo) from serie s), '[]'::jsonb),
    'por_tienda',   coalesce((select jsonb_agg(to_jsonb(t) order by t.invertido_cop desc) from por_tienda t), '[]'::jsonb),
    'top_vendidos', coalesce((select jsonb_agg(to_jsonb(t)) from top t), '[]'::jsonb),
    'menor_stock',  coalesce((select jsonb_agg(to_jsonb(m)) from menor_stock m), '[]'::jsonb)
  );
$$;
