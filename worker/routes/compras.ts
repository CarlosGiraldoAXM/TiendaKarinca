import { compraSchema } from "../../shared/schemas";
import { cuerpo, fila, filas, idValido, nuevaRuta } from "../lib";
import { borrarCompra, guardarCompra } from "../operaciones";

export const compras = nuevaRuta()
  .get("/", async (c) => c.json(await filas(c.env.DB, "SELECT * FROM v_compras_resumen ORDER BY fecha DESC, created_at DESC")))
  // Nombres ya usados, para el autocompletado del formulario.
  .get("/nombres-items", async (c) => {
    const nombres = await filas<{ nombre: string }>(c.env.DB, "SELECT DISTINCT nombre FROM compra_items ORDER BY nombre COLLATE NOCASE");
    return c.json(nombres.map((n) => n.nombre));
  })
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [compra, items] = await Promise.all([
      fila<object>(c.env.DB, "SELECT * FROM v_compras_resumen WHERE id = ?", id),
      filas(
        c.env.DB,
        "SELECT id, compra_id, nombre, unidades, precio_unitario_usd, tax_unitario_usd, precio_venta_cop, orden FROM v_inventario WHERE compra_id = ? ORDER BY orden",
        id,
      ),
    ]);
    return c.json({ ...compra, items });
  })
  .post("/", cuerpo(compraSchema), async (c) => c.json({ id: await guardarCompra(c.env.DB, c.req.valid("json")) }, 201))
  .put("/:id", cuerpo(compraSchema), async (c) => c.json({ id: await guardarCompra(c.env.DB, c.req.valid("json"), idValido(c.req.param("id"))) }))
  .delete("/:id", async (c) => {
    await borrarCompra(c.env.DB, idValido(c.req.param("id")));
    return c.json({ ok: true });
  });
