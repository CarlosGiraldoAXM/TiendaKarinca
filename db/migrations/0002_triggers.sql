-- Reglas que la base hace cumplir aunque la API falle o dos personas guarden a la vez.
-- Cada escritura del Worker va en un lote atómico: si un trigger aborta, no se guarda nada.
-- El texto de RAISE es un código que el Worker traduce (worker/errores.ts).

-- La suma de unidades de un ítem en todos los envíos no puede superar las compradas.
CREATE TRIGGER envio_items_validar_ins AFTER INSERT ON envio_items
WHEN (SELECT sum(unidades) FROM envio_items WHERE compra_item_id = NEW.compra_item_id)
   > (SELECT unidades FROM compra_items WHERE id = NEW.compra_item_id)
BEGIN
  SELECT RAISE(ABORT, 'EXCEDE_UNIDADES');
END;

CREATE TRIGGER envio_items_validar_upd AFTER UPDATE ON envio_items
WHEN (SELECT sum(unidades) FROM envio_items WHERE compra_item_id = NEW.compra_item_id)
   > (SELECT unidades FROM compra_items WHERE id = NEW.compra_item_id)
BEGIN
  SELECT RAISE(ABORT, 'EXCEDE_UNIDADES');
END;

-- Las unidades de un ítem no pueden bajar de lo ya enviado ni de lo ya vendido.
CREATE TRIGGER compra_items_validar_enviadas BEFORE UPDATE OF unidades ON compra_items
WHEN NEW.unidades < OLD.unidades
 AND NEW.unidades < (SELECT coalesce(sum(unidades), 0) FROM envio_items WHERE compra_item_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'UNIDADES_MENOR_ENVIADAS');
END;

CREATE TRIGGER compra_items_validar_vendidas BEFORE UPDATE OF unidades ON compra_items
WHEN NEW.unidades < OLD.unidades
 AND NEW.unidades < (SELECT coalesce(sum(vi.unidades), 0)
                     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
                     WHERE vi.compra_item_id = NEW.id AND v.estado <> 'anulada')
BEGIN
  SELECT RAISE(ABORT, 'UNIDADES_MENOR_VENDIDAS');
END;

-- Stock: no se puede vender más de lo que hay. Las ventas anuladas no ocupan unidades.
CREATE TRIGGER venta_items_stock_ins AFTER INSERT ON venta_items
WHEN (SELECT estado FROM ventas WHERE id = NEW.venta_id) <> 'anulada'
 AND (SELECT sum(vi.unidades)
      FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
      WHERE vi.compra_item_id = NEW.compra_item_id AND v.estado <> 'anulada')
   > (SELECT unidades FROM compra_items WHERE id = NEW.compra_item_id)
BEGIN
  SELECT RAISE(ABORT, 'SIN_STOCK');
END;

CREATE TRIGGER venta_items_stock_upd AFTER UPDATE ON venta_items
WHEN (SELECT estado FROM ventas WHERE id = NEW.venta_id) <> 'anulada'
 AND (SELECT sum(vi.unidades)
      FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
      WHERE vi.compra_item_id = NEW.compra_item_id AND v.estado <> 'anulada')
   > (SELECT unidades FROM compra_items WHERE id = NEW.compra_item_id)
BEGIN
  SELECT RAISE(ABORT, 'SIN_STOCK');
END;

-- Reactivar una venta anulada vuelve a ocupar unidades: hay que comprobar que existan.
CREATE TRIGGER ventas_stock_reactivar AFTER UPDATE OF estado ON ventas
WHEN OLD.estado = 'anulada' AND NEW.estado <> 'anulada'
 AND EXISTS (
   SELECT 1
   FROM compra_items ci
   WHERE ci.id IN (SELECT compra_item_id FROM venta_items WHERE venta_id = NEW.id)
     AND ci.unidades < (SELECT sum(vi.unidades)
                        FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
                        WHERE vi.compra_item_id = ci.id AND v.estado <> 'anulada')
 )
BEGIN
  SELECT RAISE(ABORT, 'SIN_STOCK');
END;
