import { envioSchema } from "../../shared/schemas";
import { ApiError, NO_ENCONTRADO } from "../errores";
import { cuerpo, ejecutar, fila, filas, idValido, nuevaRuta } from "../lib";
import { guardarEnvio } from "../operaciones";

export const envios = nuevaRuta()
  .get("/", async (c) => c.json(await filas(c.env.DB, "SELECT * FROM v_envios_resumen ORDER BY fecha DESC, created_at DESC")))
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [envio, lineas] = await Promise.all([
      fila<object>(c.env.DB, "SELECT * FROM v_envios_resumen WHERE id = ?", id),
      filas(c.env.DB, "SELECT * FROM v_envio_detalle WHERE envio_id = ? ORDER BY tienda COLLATE NOCASE, nombre COLLATE NOCASE", id),
    ]);
    return c.json({ ...envio, lineas });
  })
  .post("/", cuerpo(envioSchema), async (c) => c.json({ id: await guardarEnvio(c.env.DB, c.req.valid("json")) }, 201))
  .put("/:id", cuerpo(envioSchema), async (c) => c.json({ id: await guardarEnvio(c.env.DB, c.req.valid("json"), idValido(c.req.param("id"))) }))
  .delete("/:id", async (c) => {
    if (!(await ejecutar(c.env.DB, undefined, "DELETE FROM envios WHERE id = ?", idValido(c.req.param("id"))))) throw new ApiError(404, NO_ENCONTRADO);
    return c.json({ ok: true });
  });
