import { clienteSchema } from "../../shared/schemas";
import type { Cliente, VentaResumen } from "../../shared/types";
import { ApiError, NO_ENCONTRADO } from "../errores";
import { cuerpo, ejecutar, fila, filas, idValido, nuevaRuta, suma } from "../lib";

// Lo comprado por un cliente no incluye ventas anuladas.
const cuenta = (v: Pick<VentaResumen, "estado">) => v.estado !== "anulada";

export const clientes = nuevaRuta()
  .get("/", async (c) => {
    const [lista, ventas] = await Promise.all([
      filas<Cliente>(c.env.DB, "SELECT * FROM clientes ORDER BY nombre COLLATE NOCASE"),
      filas<Pick<VentaResumen, "cliente_id" | "total_cop" | "estado">>(c.env.DB, "SELECT cliente_id, total_cop, estado FROM v_ventas_resumen"),
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
      fila<Cliente>(c.env.DB, "SELECT * FROM clientes WHERE id = ?", id),
      filas<VentaResumen>(c.env.DB, "SELECT * FROM v_ventas_resumen WHERE cliente_id = ? ORDER BY consecutivo DESC", id),
    ]);
    const suyas = ventas.filter(cuenta);
    return c.json({ ...cliente, num_ventas: suyas.length, total_comprado_cop: suma(suyas, (v) => v.total_cop), ventas });
  })
  .post("/", cuerpo(clienteSchema), async (c) => {
    const d = c.req.valid("json");
    const id = crypto.randomUUID();
    await ejecutar(
      c.env.DB,
      undefined,
      "INSERT INTO clientes (id, nombre, telefono, canal, usuario_red, notas) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      d.nombre,
      d.telefono,
      d.canal,
      d.usuario_red,
      d.notas,
    );
    return c.json(await fila(c.env.DB, "SELECT * FROM clientes WHERE id = ?", id), 201);
  })
  .patch("/:id", cuerpo(clienteSchema), async (c) => {
    const d = c.req.valid("json");
    const id = idValido(c.req.param("id"));
    const cambios = await ejecutar(
      c.env.DB,
      undefined,
      "UPDATE clientes SET nombre = ?, telefono = ?, canal = ?, usuario_red = ?, notas = ? WHERE id = ?",
      d.nombre,
      d.telefono,
      d.canal,
      d.usuario_red,
      d.notas,
      id,
    );
    if (!cambios) throw new ApiError(404, NO_ENCONTRADO);
    return c.json(await fila(c.env.DB, "SELECT * FROM clientes WHERE id = ?", id));
  });
