import { clienteSchema } from "../../shared/schemas";
import type { Cliente, VentaResumen } from "../../shared/types";
import { cuerpo, datos, idValido, nuevaRuta, suma } from "../lib";

// Lo comprado por un cliente no incluye ventas anuladas.
const cuenta = (v: Pick<VentaResumen, "estado">) => v.estado !== "anulada";

export const clientes = nuevaRuta()
  .get("/", async (c) => {
    const [lista, ventas] = await Promise.all([
      datos<Cliente[]>(c.var.db.from("clientes").select("*").order("nombre")),
      datos<Pick<VentaResumen, "cliente_id" | "total_cop" | "estado">[]>(
        c.var.db.from("v_ventas_resumen").select("cliente_id, total_cop, estado"),
      ),
    ]);
    return c.json(
      lista.map((cl) => {
        const suyas = ventas.filter((v) => v.cliente_id === cl.id && cuenta(v));
        return { ...cl, num_ventas: suyas.length, total_comprado_cop: suma(suyas, (v) => v.total_cop) };
      }),
    );
  })
  .get("/:id", async (c) => {
    const id = idValido(c.req.param("id"));
    const [cliente, ventas] = await Promise.all([
      datos<Cliente>(c.var.db.from("clientes").select("*").eq("id", id).single()),
      datos<VentaResumen[]>(
        c.var.db.from("v_ventas_resumen").select("*").eq("cliente_id", id).order("consecutivo", { ascending: false }),
      ),
    ]);
    const suyas = ventas.filter(cuenta);
    return c.json({ ...cliente, num_ventas: suyas.length, total_comprado_cop: suma(suyas, (v) => v.total_cop), ventas });
  })
  .post("/", cuerpo(clienteSchema), async (c) => {
    return c.json(await datos(c.var.db.from("clientes").insert(c.req.valid("json")).select("*").single()), 201);
  })
  .patch("/:id", cuerpo(clienteSchema), async (c) => {
    return c.json(
      await datos(
        c.var.db.from("clientes").update(c.req.valid("json")).eq("id", idValido(c.req.param("id"))).select("*").single(),
      ),
    );
  });
