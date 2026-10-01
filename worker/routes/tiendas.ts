import { fusionSchema, tiendaSchema } from "../../shared/schemas";
import { ApiError, NO_ENCONTRADO } from "../errores";
import { cuerpo, ejecutar, filas, idValido, nuevaRuta } from "../lib";
import { fusionarTiendas } from "../operaciones";

const DUPLICADA = { duplicado: "Ya existe una tienda con ese nombre." };

export const tiendas = nuevaRuta()
  .get("/", async (c) =>
    c.json(
      await filas(
        c.env.DB,
        `SELECT t.id, t.nombre, (SELECT count(*) FROM compras WHERE tienda_id = t.id) AS num_compras
         FROM tiendas t ORDER BY t.nombre COLLATE NOCASE`,
      ),
    ),
  )
  .post("/", cuerpo(tiendaSchema), async (c) => {
    const t = { id: crypto.randomUUID(), nombre: c.req.valid("json").nombre };
    await ejecutar(c.env.DB, DUPLICADA, "INSERT INTO tiendas (id, nombre) VALUES (?, ?)", t.id, t.nombre);
    return c.json(t, 201);
  })
  .patch("/:id", cuerpo(tiendaSchema), async (c) => {
    const t = { id: idValido(c.req.param("id")), nombre: c.req.valid("json").nombre };
    if (!(await ejecutar(c.env.DB, DUPLICADA, "UPDATE tiendas SET nombre = ? WHERE id = ?", t.nombre, t.id))) throw new ApiError(404, NO_ENCONTRADO);
    return c.json(t);
  })
  .post("/:id/fusionar", cuerpo(fusionSchema), async (c) => {
    await fusionarTiendas(c.env.DB, idValido(c.req.param("id")), c.req.valid("json").destino_id);
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    await ejecutar(
      c.env.DB,
      { enUso: "Esta tienda tiene compras. Fusiónala con otra en lugar de borrarla." },
      "DELETE FROM tiendas WHERE id = ?",
      idValido(c.req.param("id")),
    );
    return c.json({ ok: true });
  });
