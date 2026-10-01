import { compraSchema } from "../../shared/schemas";
import type { CompraItem } from "../../shared/types";
import { cuerpo, datos, idValido, nuevaRuta, suma } from "../lib";

interface FilaCompra {
  id: string;
  tienda_id: string;
  fecha: string;
  trm: number;
  notas: string | null;
  tiendas: { nombre: string };
  compra_items: CompraItem[];
}

const SELECT = "id, tienda_id, fecha, trm, notas, tiendas(nombre), compra_items(*)";

function resumir(c: FilaCompra) {
  const totalUsd = suma(c.compra_items, (i) => i.unidades * (i.precio_unitario_usd + i.tax_unitario_usd));
  return {
    id: c.id,
    tienda_id: c.tienda_id,
    tienda: c.tiendas.nombre,
    fecha: c.fecha,
    trm: c.trm,
    notas: c.notas,
    num_items: c.compra_items.length,
    unidades: suma(c.compra_items, (i) => i.unidades),
    total_usd: totalUsd,
    total_cop: totalUsd * c.trm,
  };
}

export const compras = nuevaRuta()
  .get("/", async (c) => {
    const filas = await datos<FilaCompra[]>(
      c.var.db.from("compras").select(SELECT).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    );
    return c.json(filas.map(resumir));
  })
  // Nombres ya usados, para el autocompletado del formulario.
  .get("/nombres-items", async (c) => {
    const filas = await datos<{ nombre: string }[]>(c.var.db.from("compra_items").select("nombre"));
    return c.json([...new Set(filas.map((f) => f.nombre))].sort((a, b) => a.localeCompare(b, "es")));
  })
  .get("/:id", async (c) => {
    const fila = await datos<FilaCompra>(
      c.var.db.from("compras").select(SELECT).eq("id", idValido(c.req.param("id"))).single(),
    );
    return c.json({ ...resumir(fila), items: [...fila.compra_items].sort((a, b) => a.orden - b.orden) });
  })
  .post("/", cuerpo(compraSchema), async (c) => {
    const id = await datos<string>(c.var.db.rpc("guardar_compra", { p: c.req.valid("json") }));
    return c.json({ id }, 201);
  })
  .put("/:id", cuerpo(compraSchema), async (c) => {
    const id = await datos<string>(
      c.var.db.rpc("guardar_compra", { p: { ...c.req.valid("json"), id: idValido(c.req.param("id")) } }),
    );
    return c.json({ id });
  })
  .delete("/:id", async (c) => {
    await datos(c.var.db.from("compras").delete().eq("id", idValido(c.req.param("id"))), {
      enUso: "No se puede borrar esta compra porque tiene productos con ventas o envíos.",
    });
    return c.json({ ok: true });
  });
