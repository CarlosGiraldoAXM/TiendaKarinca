import { configSchema } from "../../shared/schemas";
import { cuerpo, datos, nuevaRuta } from "../lib";

export const config = nuevaRuta()
  .get("/", async (c) => c.json(await datos(c.var.db.from("config").select("utilidad_pct").single())))
  .patch("/", cuerpo(configSchema), async (c) =>
    c.json(
      await datos(c.var.db.from("config").update(c.req.valid("json")).eq("id", true).select("utilidad_pct").single()),
    ),
  );
