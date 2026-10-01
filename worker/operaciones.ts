// Escrituras que tocan varias tablas. Cada una va en un lote atómico de D1;
// los triggers (stock, unidades por envío) abortan el lote completo si algo no cuadra.
import type { D1Database } from "@cloudflare/workers-types";
import type { CompraInput, EnvioInput, VentaInput } from "../shared/schemas";
import type { EstadoVenta } from "../shared/types";
import { ApiError, NO_ENCONTRADO } from "./errores";
import { centavos, ejecutar, fila, filas, lote, suma } from "./lib";

const nuevoId = () => crypto.randomUUID();

async function debeExistir(db: D1Database, tabla: "compras" | "envios" | "ventas" | "tiendas", id: string) {
  await fila(db, `SELECT id FROM ${tabla} WHERE id = ?`, id);
}

// ---------------------------------------------------------------- compras
export async function guardarCompra(db: D1Database, d: CompraInput, id?: string): Promise<string> {
  const compraId = id ?? nuevoId();
  const s = [];
  /** Ítems que ya pertenecen a esta compra; cualquier otro se inserta como nuevo. */
  let existentes = new Set<string>();

  if (!id) {
    s.push(
      db.prepare("INSERT INTO compras (id, tienda_id, fecha, trm_c, notas) VALUES (?, ?, ?, ?, ?)").bind(compraId, d.tienda_id, d.fecha, centavos(d.trm), d.notas),
    );
  } else {
    await debeExistir(db, "compras", id);
    const actuales = await filas<{ id: string; nombre: string; en_uso: number }>(
      db,
      `SELECT ci.id, ci.nombre,
              EXISTS (SELECT 1 FROM envio_items WHERE compra_item_id = ci.id)
           OR EXISTS (SELECT 1 FROM venta_items WHERE compra_item_id = ci.id) AS en_uso
       FROM compra_items ci WHERE ci.compra_id = ?`,
      id,
    );
    existentes = new Set(actuales.map((a) => a.id));
    // Ítems que ya no vienen en el formulario: solo se borran si no tienen ventas ni envíos.
    const conservados = new Set(d.items.map((i) => i.id).filter(Boolean));
    const quitados = actuales.filter((a) => !conservados.has(a.id));
    const enUso = quitados.find((q) => q.en_uso);
    if (enUso) throw new ApiError(409, `No se puede quitar «${enUso.nombre}» porque ya tiene ventas o envíos.`);

    s.push(db.prepare("UPDATE compras SET tienda_id = ?, fecha = ?, trm_c = ?, notas = ? WHERE id = ?").bind(d.tienda_id, d.fecha, centavos(d.trm), d.notas, id));
    for (const q of quitados) s.push(db.prepare("DELETE FROM compra_items WHERE id = ?").bind(q.id));
  }

  d.items.forEach((i, n) => {
    const orden = n + 1;
    s.push(
      i.id && existentes.has(i.id)
        ? db
            .prepare("UPDATE compra_items SET nombre = ?, unidades = ?, precio_unitario_usd_c = ?, tax_unitario_usd_c = ?, orden = ? WHERE id = ? AND compra_id = ?")
            .bind(i.nombre, i.unidades, centavos(i.precio_unitario_usd), centavos(i.tax_unitario_usd), orden, i.id, compraId)
        : db
            .prepare("INSERT INTO compra_items (id, compra_id, nombre, unidades, precio_unitario_usd_c, tax_unitario_usd_c, orden) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(nuevoId(), compraId, i.nombre, i.unidades, centavos(i.precio_unitario_usd), centavos(i.tax_unitario_usd), orden),
    );
  });

  await lote(db, s, { enUso: "La tienda seleccionada ya no existe. Elige otra." });
  return compraId;
}

export async function borrarCompra(db: D1Database, id: string) {
  await debeExistir(db, "compras", id);
  await ejecutar(db, { enUso: "No se puede borrar esta compra porque tiene productos con ventas o envíos." }, "DELETE FROM compras WHERE id = ?", id);
}

// ---------------------------------------------------------------- envíos
export async function guardarEnvio(db: D1Database, d: EnvioInput, id?: string): Promise<string> {
  const envioId = id ?? nuevoId();
  const s = [];

  if (!id) {
    s.push(
      db
        .prepare("INSERT INTO envios (id, fecha, descripcion, valor_usd_c, valor_cop_c, notas) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(envioId, d.fecha, d.descripcion, centavos(d.valor_usd), centavos(d.valor_cop), d.notas),
    );
  } else {
    await debeExistir(db, "envios", id);
    s.push(
      db
        .prepare("UPDATE envios SET fecha = ?, descripcion = ?, valor_usd_c = ?, valor_cop_c = ?, notas = ? WHERE id = ?")
        .bind(d.fecha, d.descripcion, centavos(d.valor_usd), centavos(d.valor_cop), d.notas, id),
      db.prepare("DELETE FROM envio_items WHERE envio_id = ?").bind(id),
    );
  }
  for (const i of d.items)
    s.push(db.prepare("INSERT INTO envio_items (id, envio_id, compra_item_id, unidades) VALUES (?, ?, ?, ?)").bind(nuevoId(), envioId, i.compra_item_id, i.unidades));

  await lote(db, s, { duplicado: "Hay un producto repetido en el envío.", enUso: "Alguno de los productos ya no existe. Actualiza la página." });
  return envioId;
}

// ---------------------------------------------------------------- ventas
export async function guardarVenta(db: D1Database, d: VentaInput, id?: string): Promise<string> {
  const subtotal = suma(d.items, (i) => i.unidades * i.precio_unitario_cop);
  if (d.descuento_cop > subtotal) throw new ApiError(409, "El descuento no puede ser mayor que el total de la venta.");

  const ventaId = id ?? nuevoId();
  const s = [];

  if (!id) {
    s.push(
      db
        .prepare(
          `INSERT INTO ventas (id, consecutivo, fecha, vendedor, cliente_id, metodo_pago, descuento_cop_c, estado, notas)
           VALUES (?, (SELECT coalesce(max(consecutivo), 0) + 1 FROM ventas), ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(ventaId, d.fecha, d.vendedor, d.cliente_id, d.metodo_pago, centavos(d.descuento_cop), d.estado, d.notas),
    );
  } else {
    await debeExistir(db, "ventas", id);
    // Primero se quitan las líneas viejas: así, si la venta estaba anulada y se reactiva,
    // el stock se comprueba solo contra las líneas nuevas.
    s.push(
      db.prepare("DELETE FROM venta_items WHERE venta_id = ?").bind(id),
      db
        .prepare("UPDATE ventas SET fecha = ?, vendedor = ?, cliente_id = ?, metodo_pago = ?, descuento_cop_c = ?, estado = ?, notas = ? WHERE id = ?")
        .bind(d.fecha, d.vendedor, d.cliente_id, d.metodo_pago, centavos(d.descuento_cop), d.estado, d.notas, id),
    );
  }
  for (const i of d.items)
    s.push(
      db
        .prepare("INSERT INTO venta_items (id, venta_id, compra_item_id, unidades, precio_unitario_cop_c) VALUES (?, ?, ?, ?, ?)")
        .bind(nuevoId(), ventaId, i.compra_item_id, i.unidades, centavos(i.precio_unitario_cop)),
    );

  await lote(db, s, { enUso: "El cliente o alguno de los productos ya no existe. Actualiza la página." });
  return ventaId;
}

export async function cambiarEstadoVenta(db: D1Database, id: string, estado: EstadoVenta) {
  const cambios = await ejecutar(db, undefined, "UPDATE ventas SET estado = ? WHERE id = ?", estado, id);
  if (!cambios) throw new ApiError(404, NO_ENCONTRADO);
}

// ---------------------------------------------------------------- tiendas
/** Pasa todas las compras de `origen` a `destino` y borra `origen`. */
export async function fusionarTiendas(db: D1Database, origen: string, destino: string) {
  if (origen === destino) throw new ApiError(409, "Elige una tienda diferente para fusionar.");
  await debeExistir(db, "tiendas", origen);
  await debeExistir(db, "tiendas", destino);
  await lote(db, [
    db.prepare("UPDATE compras SET tienda_id = ? WHERE tienda_id = ?").bind(destino, origen),
    db.prepare("DELETE FROM tiendas WHERE id = ?").bind(origen),
  ]);
}
