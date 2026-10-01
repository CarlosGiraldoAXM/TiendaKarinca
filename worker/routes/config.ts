import { configSchema } from "../../shared/schemas";
import { centavos, cuerpo, ejecutar, fila, nuevaRuta } from "../lib";

const LEER = "SELECT utilidad_pct_c / 100.0 AS utilidad_pct FROM config WHERE id = 1";

export const config = nuevaRuta()
  .get("/", async (c) => c.json(await fila(c.env.DB, LEER)))
  .patch("/", cuerpo(configSchema), async (c) => {
    await ejecutar(c.env.DB, undefined, "UPDATE config SET utilidad_pct_c = ? WHERE id = 1", centavos(c.req.valid("json").utilidad_pct));
    return c.json(await fila(c.env.DB, LEER));
  });
