import { ESTADOS_VENTA, estadoVentaSchema, ventaSchema } from "../../shared/schemas";
import type { EstadoVenta } from "../../shared/types";
import { cuerpo, datos, fechaOpcional, idValido, nuevaRuta } from "../lib";

const SIN_CLIENTE = { enUso: "El cliente seleccionado ya no existe. Elige otro." };

export const ventas = nuevaRuta()
  .get("/", async (c) => {
    let q = c.var.db.from("v_ventas_resumen").select("*").order("consecutivo", { ascending: false });
    const { estado, desde, hasta, cliente_id } = c.req.query();
    if (estado && (ESTADOS_VENTA as readonly string[]).includes(estado)) q = q.eq("estado", estado as EstadoVenta);
    if (fechaOpcional(desde)) q = q.gte("fecha", desde!);
    if (fechaOpcional(hasta)) q = q.lte("fecha", hasta!);
    if (cliente_id) q = q.eq("cliente_id", idValido(cliente_id));
    return c.json(await datos(q));
  })
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [venta, lineas] = await Promise.all([
      datos<object>(c.var.db.from("v_ventas_resumen").select("*").eq("id", id).single()),
      datos(c.var.db.from("v_venta_items_detalle").select("*").eq("venta_id", id).order("nombre")),
    ]);
    return c.json({ ...venta, lineas });
  })
  .post("/", cuerpo(ventaSchema), async (c) => {
    const id = await datos<string>(c.var.db.rpc("guardar_venta", { p: c.req.valid("json") }), SIN_CLIENTE);
    return c.json({ id }, 201);
  })
  .put("/:id", cuerpo(ventaSchema), async (c) => {
    const id = await datos<string>(
      c.var.db.rpc("guardar_venta", { p: { ...c.req.valid("json"), id: idValido(c.req.param("id")) } }),
      SIN_CLIENTE,
    );
    return c.json({ id });
  })
  .patch("/:id/estado", cuerpo(estadoVentaSchema), async (c) => {
    await datos(
      c.var.db.rpc("cambiar_estado_venta", { p_id: idValido(c.req.param("id")), p_estado: c.req.valid("json").estado }),
    );
    return c.json({ ok: true });
  });
