import { fusionSchema, tiendaSchema } from "../../shared/schemas";
import { cuerpo, datos, idValido, nuevaRuta } from "../lib";

const DUPLICADA = { duplicado: "Ya existe una tienda con ese nombre." };

export const tiendas = nuevaRuta()
  .get("/", async (c) => {
    const filas = await datos<{ id: string; nombre: string; compras: { count: number }[] }[]>(
      c.var.db.from("tiendas").select("id, nombre, compras(count)").order("nombre"),
    );
    return c.json(filas.map((t) => ({ id: t.id, nombre: t.nombre, num_compras: t.compras[0]?.count ?? 0 })));
  })
  .post("/", cuerpo(tiendaSchema), async (c) => {
    const t = await datos(c.var.db.from("tiendas").insert(c.req.valid("json")).select("id, nombre").single(), DUPLICADA);
    return c.json(t, 201);
  })
  .patch("/:id", cuerpo(tiendaSchema), async (c) => {
    const t = await datos(
      c.var.db.from("tiendas").update(c.req.valid("json")).eq("id", idValido(c.req.param("id"))).select("id, nombre").single(),
      DUPLICADA,
    );
    return c.json(t);
  })
  .post("/:id/fusionar", cuerpo(fusionSchema), async (c) => {
    await datos(
      c.var.db.rpc("fusionar_tiendas", { p_origen: idValido(c.req.param("id")), p_destino: c.req.valid("json").destino_id }),
    );
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    await datos(c.var.db.from("tiendas").delete().eq("id", idValido(c.req.param("id"))), {
      enUso: "Esta tienda tiene compras. Fusiónala con otra en lugar de borrarla.",
    });
    return c.json({ ok: true });
  });
