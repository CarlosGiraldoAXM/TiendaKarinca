import { precioVentaSchema } from "../../shared/schemas";
import { cuerpo, datos, idValido, nuevaRuta } from "../lib";

export const inventario = nuevaRuta()
  .get("/", async (c) => {
    const filas = await datos(
      c.var.db
        .from("v_inventario")
        .select("*")
        .order("tienda")
        .order("fecha_compra", { ascending: false })
        .order("orden"),
    );
    return c.json(filas);
  })
  // precio_venta_cop = null vuelve al precio sugerido.
  .patch("/:id/precio", cuerpo(precioVentaSchema), async (c) => {
    const id = idValido(c.req.param("id"));
    await datos(c.var.db.from("compra_items").update(c.req.valid("json")).eq("id", id).select("id").single());
    return c.json(await datos(c.var.db.from("v_inventario").select("*").eq("id", id).single()));
  });
