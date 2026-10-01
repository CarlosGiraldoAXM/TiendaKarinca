import { Hono } from "hono";
import { ApiError } from "./errores";
import type { AppEnv } from "./lib";
import { clientes } from "./routes/clientes";
import { compras } from "./routes/compras";
import { config } from "./routes/config";
import { dashboard } from "./routes/dashboard";
import { envios } from "./routes/envios";
import { inventario } from "./routes/inventario";
import { tiendas } from "./routes/tiendas";
import { ventas } from "./routes/ventas";

const api = new Hono<AppEnv>().basePath("/api");

api.use("*", async (c, next) => {
  await next();
  // Los datos cambian todo el tiempo y son privados: que nada quede en caché.
  c.header("Cache-Control", "no-store");
});

api.route("/tiendas", tiendas);
api.route("/compras", compras);
api.route("/inventario", inventario);
api.route("/envios", envios);
api.route("/ventas", ventas);
api.route("/clientes", clientes);
api.route("/config", config);
api.route("/dashboard", dashboard);

api.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));

api.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
  if (err instanceof SyntaxError) return c.json({ error: "Los datos enviados no son válidos." }, 400);
  console.error(err);
  return c.json({ error: "Algo salió mal. Inténtalo de nuevo en un momento." }, 500);
});

export default api;
