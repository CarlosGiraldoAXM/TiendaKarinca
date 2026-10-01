import { datos, fechaOpcional, nuevaRuta } from "../lib";

export const dashboard = nuevaRuta().get("/", async (c) => {
  const { desde, hasta, granularidad } = c.req.query();
  return c.json(
    await datos(
      c.var.db.rpc("f_dashboard", {
        p_desde: fechaOpcional(desde),
        p_hasta: fechaOpcional(hasta),
        p_granularidad: granularidad === "semana" ? "semana" : "mes",
      }),
    ),
  );
});
