-- Derivados. Nada de esto se guarda: siempre se recalcula.
-- La referencia en TypeScript de estas fórmulas es shared/calc.ts.
-- Las vistas devuelven el dinero en unidades (no en centavos).

-- ---------------------------------------------------------------- v_envio_detalle
-- Una fila por línea de envío, con el prorrateo por participación en valor.
CREATE VIEW v_envio_detalle AS
WITH lineas AS (
  SELECT
    ei.id,
    ei.envio_id,
    ei.compra_item_id,
    ei.unidades,
    ci.nombre,
    ci.compra_id,
    c.tienda_id,
    t.nombre AS tienda,
    e.valor_usd_c / 100.0 AS valor_usd,
    e.valor_cop_c / 100.0 AS valor_cop,
    (ci.precio_unitario_usd_c + ci.tax_unitario_usd_c) * c.trm_c / 10000.0 AS costo_unitario_cop
  FROM envio_items ei
  JOIN envios e        ON e.id = ei.envio_id
  JOIN compra_items ci ON ci.id = ei.compra_item_id
  JOIN compras c       ON c.id = ci.compra_id
  JOIN tiendas t       ON t.id = c.tienda_id
), con_total AS (
  SELECT
    l.*,
    l.unidades * l.costo_unitario_cop AS valor_linea_cop,
    sum(l.unidades * l.costo_unitario_cop) OVER (PARTITION BY l.envio_id) AS valor_total_envio_cop
  FROM lineas l
)
SELECT
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
  coalesce(valor_linea_cop / nullif(valor_total_envio_cop, 0), 0)             AS participacion,
  coalesce(valor_linea_cop * valor_cop / nullif(valor_total_envio_cop, 0), 0) AS envio_asignado_cop,
  coalesce(valor_linea_cop * valor_usd / nullif(valor_total_envio_cop, 0), 0) AS envio_asignado_usd,
  coalesce(valor_linea_cop * valor_cop / nullif(valor_total_envio_cop, 0), 0) / unidades AS envio_por_unidad_cop
FROM con_total;

-- ---------------------------------------------------------------- v_inventario
-- Una fila por ítem de compra (lote). Es la tabla que reemplaza el Excel.
CREATE VIEW v_inventario AS
WITH envio AS (
  SELECT
    compra_item_id,
    sum(unidades)           AS unidades_enviadas,
    sum(envio_asignado_cop) AS envio_total_item_cop,
    sum(envio_asignado_usd) AS envio_total_item_usd
  FROM v_envio_detalle
  GROUP BY compra_item_id
), venta AS (
  SELECT vi.compra_item_id, sum(vi.unidades) AS vendidas
  FROM venta_items vi
  JOIN ventas v ON v.id = vi.venta_id
  WHERE v.estado <> 'anulada'
  GROUP BY vi.compra_item_id
), base AS (
  SELECT
    ci.id,
    ci.compra_id,
    ci.nombre,
    ci.orden,
    ci.unidades,
    ci.precio_unitario_usd_c / 100.0 AS precio_unitario_usd,
    ci.tax_unitario_usd_c / 100.0    AS tax_unitario_usd,
    ci.precio_venta_cop_c / 100.0    AS precio_venta_cop,
    c.fecha          AS fecha_compra,
    c.trm_c / 100.0  AS trm,
    c.tienda_id,
    t.nombre         AS tienda,
    (ci.precio_unitario_usd_c + ci.tax_unitario_usd_c) / 100.0             AS costo_unitario_usd,
    (ci.precio_unitario_usd_c + ci.tax_unitario_usd_c) * c.trm_c / 10000.0 AS costo_unitario_cop,
    coalesce(e.unidades_enviadas, 0)      AS unidades_enviadas,
    coalesce(e.envio_total_item_cop, 0.0) AS envio_total_item_cop,
    coalesce(e.envio_total_item_usd, 0.0) AS envio_total_item_usd,
    coalesce(v.vendidas, 0)               AS vendidas
  FROM compra_items ci
  JOIN compras c    ON c.id = ci.compra_id
  JOIN tiendas t    ON t.id = c.tienda_id
  LEFT JOIN envio e ON e.compra_item_id = ci.id
  LEFT JOIN venta v ON v.compra_item_id = ci.id
), costos AS (
  SELECT
    b.*,
    b.costo_unitario_cop * b.unidades                          AS costo_base_total_cop,
    b.envio_total_item_cop / b.unidades                        AS envio_unitario_cop,
    b.costo_unitario_cop + b.envio_total_item_cop / b.unidades AS costo_total_unitario_cop
  FROM base b
), precios AS (
  SELECT
    k.*,
    k.costo_total_unitario_cop * (1 + cfg.utilidad_pct_c / 10000.0) AS precio_sugerido_cop,
    coalesce(k.precio_venta_cop,
             k.costo_total_unitario_cop * (1 + cfg.utilidad_pct_c / 10000.0)) AS precio_venta_efectivo_cop
  FROM costos k
  CROSS JOIN config cfg
)
SELECT
  id,
  compra_id,
  tienda_id,
  tienda,
  fecha_compra,
  nombre,
  orden,
  unidades,
  vendidas,
  unidades - vendidas          AS disponibles,
  unidades_enviadas,
  unidades - unidades_enviadas AS pendientes_envio,
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
  CASE WHEN costo_total_unitario_cop > 0
       THEN (precio_venta_efectivo_cop - costo_total_unitario_cop) / costo_total_unitario_cop
  END AS margen
FROM precios;

-- ---------------------------------------------------------------- v_compras_resumen
CREATE VIEW v_compras_resumen AS
SELECT
  c.id,
  c.tienda_id,
  t.nombre        AS tienda,
  c.fecha,
  c.trm_c / 100.0 AS trm,
  c.notas,
  c.created_at,
  count(ci.id)                  AS num_items,
  coalesce(sum(ci.unidades), 0) AS unidades,
  coalesce(sum(ci.unidades * (ci.precio_unitario_usd_c + ci.tax_unitario_usd_c)), 0) / 100.0             AS total_usd,
  coalesce(sum(ci.unidades * (ci.precio_unitario_usd_c + ci.tax_unitario_usd_c)), 0) * c.trm_c / 10000.0 AS total_cop
FROM compras c
JOIN tiendas t            ON t.id = c.tienda_id
LEFT JOIN compra_items ci ON ci.compra_id = c.id
GROUP BY c.id;

-- ---------------------------------------------------------------- v_envios_resumen
CREATE VIEW v_envios_resumen AS
SELECT
  e.id,
  e.fecha,
  e.descripcion,
  e.valor_usd_c / 100.0 AS valor_usd,
  e.valor_cop_c / 100.0 AS valor_cop,
  e.notas,
  e.created_at,
  count(ei.id)                  AS num_items,
  coalesce(sum(ei.unidades), 0) AS unidades
FROM envios e
LEFT JOIN envio_items ei ON ei.envio_id = e.id
GROUP BY e.id;

-- ---------------------------------------------------------------- v_venta_items_detalle
CREATE VIEW v_venta_items_detalle AS
SELECT
  vi.id,
  vi.venta_id,
  vi.compra_item_id,
  inv.nombre,
  inv.tienda,
  vi.unidades,
  vi.precio_unitario_cop_c / 100.0               AS precio_unitario_cop,
  vi.unidades * vi.precio_unitario_cop_c / 100.0 AS subtotal_cop,
  inv.costo_total_unitario_cop,
  vi.unidades * inv.costo_total_unitario_cop     AS costo_cop,
  inv.disponibles
FROM venta_items vi
JOIN v_inventario inv ON inv.id = vi.compra_item_id;

-- ---------------------------------------------------------------- v_ventas_resumen
CREATE VIEW v_ventas_resumen AS
WITH totales AS (
  SELECT
    venta_id,
    count(*)          AS num_items,
    sum(unidades)     AS unidades,
    sum(subtotal_cop) AS subtotal_cop,
    sum(costo_cop)    AS costo_cop
  FROM v_venta_items_detalle
  GROUP BY venta_id
)
SELECT
  v.id,
  v.consecutivo,
  v.numero,
  v.fecha,
  v.vendedor,
  v.cliente_id,
  cl.nombre   AS cliente,
  cl.telefono AS cliente_telefono,
  v.metodo_pago,
  v.estado,
  v.notas,
  v.created_at,
  coalesce(t.num_items, 0)                                  AS num_items,
  coalesce(t.unidades, 0)                                   AS unidades,
  coalesce(t.subtotal_cop, 0.0)                             AS subtotal_cop,
  v.descuento_cop_c / 100.0                                 AS descuento_cop,
  coalesce(t.subtotal_cop, 0.0) - v.descuento_cop_c / 100.0 AS total_cop,
  coalesce(t.costo_cop, 0.0)                                AS costo_cop,
  coalesce(t.subtotal_cop, 0.0) - v.descuento_cop_c / 100.0 - coalesce(t.costo_cop, 0.0) AS utilidad_cop
FROM ventas v
JOIN clientes cl    ON cl.id = v.cliente_id
LEFT JOIN totales t ON t.venta_id = v.id;

-- ---------------------------------------------------------------- v_dashboard
-- Una sola fila con los acumulados de todo el histórico.
CREATE VIEW v_dashboard AS
WITH inv AS (
  SELECT
    coalesce(sum(costo_base_total_cop), 0.0)                    AS mercancia_cop,
    coalesce(sum(disponibles * precio_venta_efectivo_cop), 0.0) AS valor_inventario_cop,
    coalesce(sum(unidades), 0)                                  AS unidades_totales,
    coalesce(sum(vendidas), 0)                                  AS unidades_vendidas,
    coalesce(sum(disponibles), 0)                               AS unidades_disponibles
  FROM v_inventario
), env AS (
  SELECT coalesce(sum(valor_cop_c), 0) / 100.0 AS envios_cop FROM envios
), ven AS (
  SELECT
    coalesce(sum(total_cop)    FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS venta_real_cop,
    coalesce(sum(costo_cop)    FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS costo_vendido_cop,
    coalesce(sum(utilidad_cop) FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS utilidad_real_cop,
    coalesce(sum(total_cop)    FILTER (WHERE estado = 'pendiente'), 0.0)              AS por_cobrar_cop
  FROM v_ventas_resumen
)
SELECT
  inv.mercancia_cop,
  env.envios_cop,
  inv.mercancia_cop + env.envios_cop                                 AS invertido_cop,
  inv.valor_inventario_cop,
  ven.venta_real_cop,
  ven.por_cobrar_cop,
  ven.costo_vendido_cop,
  ven.utilidad_real_cop,
  ven.venta_real_cop + ven.por_cobrar_cop + inv.valor_inventario_cop AS potencial_cop,
  inv.unidades_totales,
  inv.unidades_vendidas,
  inv.unidades_disponibles
FROM inv, env, ven;
