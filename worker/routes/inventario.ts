import { precioVentaSchema } from "../../shared/schemas";
import { ApiError, NO_ENCONTRADO } from "../errores";
import { centavos, cuerpo, ejecutar, fila, filas, idValido, nuevaRuta } from "../lib";

export const inventario = nuevaRuta()
  .get("/", async (c) => c.json(await filas(c.env.DB, "SELECT * FROM v_inventario ORDER BY tienda COLLATE NOCASE, fecha_compra DESC, orden")))
  // precio_venta_cop = null vuelve al precio sugerido.
  .patch("/:id/precio", cuerpo(precioVentaSchema), async (c) => {
    const id = idValido(c.req.param("id"));
    const { precio_venta_cop } = c.req.valid("json");
    const cambios = await ejecutar(
      c.env.DB,
      undefined,
      "UPDATE compra_items SET precio_venta_cop_c = ? WHERE id = ?",
      precio_venta_cop === null ? null : centavos(precio_venta_cop),
      id,
    );
    if (!cambios) throw new ApiError(404, NO_ENCONTRADO);
    return c.json(await fila(c.env.DB, "SELECT * FROM v_inventario WHERE id = ?", id));
  });
