import { envioSchema } from "../../shared/schemas";
import { cuerpo, datos, idValido, nuevaRuta, suma } from "../lib";

interface FilaEnvio {
  id: string;
  fecha: string;
  descripcion: string | null;
  valor_usd: number;
  valor_cop: number;
  notas: string | null;
  envio_items: { unidades: number }[];
}

const SELECT = "id, fecha, descripcion, valor_usd, valor_cop, notas, envio_items(unidades)";

const resumir = ({ envio_items, ...e }: FilaEnvio) => ({
  ...e,
  num_items: envio_items.length,
  unidades: suma(envio_items, (i) => i.unidades),
});

export const envios = nuevaRuta()
  .get("/", async (c) => {
    const filas = await datos<FilaEnvio[]>(
      c.var.db.from("envios").select(SELECT).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    );
    return c.json(filas.map(resumir));
  })
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [envio, lineas] = await Promise.all([
      datos<FilaEnvio>(c.var.db.from("envios").select(SELECT).eq("id", id).single()),
      datos(c.var.db.from("v_envio_detalle").select("*").eq("envio_id", id).order("tienda").order("nombre")),
    ]);
    return c.json({ ...resumir(envio), lineas });
  })
  .post("/", cuerpo(envioSchema), async (c) => {
    const id = await datos<string>(c.var.db.rpc("guardar_envio", { p: c.req.valid("json") }));
    return c.json({ id }, 201);
  })
  .put("/:id", cuerpo(envioSchema), async (c) => {
    const id = await datos<string>(
      c.var.db.rpc("guardar_envio", { p: { ...c.req.valid("json"), id: idValido(c.req.param("id")) } }),
    );
    return c.json({ id });
  })
  .delete("/:id", async (c) => {
    await datos(c.var.db.from("envios").delete().eq("id", idValido(c.req.param("id"))));
    return c.json({ ok: true });
  });
