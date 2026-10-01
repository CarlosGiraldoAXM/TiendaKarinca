import { ESTADOS_VENTA, estadoVentaSchema, ventaSchema } from "../../shared/schemas";
import { cuerpo, fechaOpcional, fila, filas, idValido, nuevaRuta } from "../lib";
import { cambiarEstadoVenta, guardarVenta } from "../operaciones";

export const ventas = nuevaRuta()
  .get("/", async (c) => {
    const { estado, desde, hasta, cliente_id } = c.req.query();
    const donde: string[] = [];
    const params: string[] = [];
    const filtrar = (condicion: string, valor: string) => (donde.push(condicion), params.push(valor));
    if (estado && (ESTADOS_VENTA as readonly string[]).includes(estado)) filtrar("estado = ?", estado);
    if (fechaOpcional(desde)) filtrar("fecha >= ?", desde!);
    if (fechaOpcional(hasta)) filtrar("fecha <= ?", hasta!);
    if (cliente_id) filtrar("cliente_id = ?", idValido(cliente_id));
    return c.json(
      await filas(c.env.DB, `SELECT * FROM v_ventas_resumen ${donde.length ? `WHERE ${donde.join(" AND ")}` : ""} ORDER BY consecutivo DESC`, ...params),
    );
  })
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [venta, lineas] = await Promise.all([
      fila<object>(c.env.DB, "SELECT * FROM v_ventas_resumen WHERE id = ?", id),
      filas(c.env.DB, "SELECT * FROM v_venta_items_detalle WHERE venta_id = ? ORDER BY nombre COLLATE NOCASE", id),
    ]);
    return c.json({ ...venta, lineas });
  })
  .post("/", cuerpo(ventaSchema), async (c) => c.json({ id: await guardarVenta(c.env.DB, c.req.valid("json")) }, 201))
  .put("/:id", cuerpo(ventaSchema), async (c) => c.json({ id: await guardarVenta(c.env.DB, c.req.valid("json"), idValido(c.req.param("id"))) }))
  .patch("/:id/estado", cuerpo(estadoVentaSchema), async (c) => {
    await cambiarEstadoVenta(c.env.DB, idValido(c.req.param("id")), c.req.valid("json").estado);
    return c.json({ ok: true });
  });
