// Test de integración sobre una base D1 local nueva y en memoria (no toca la de desarrollo):
// aplica las migraciones y el seed, compara las vistas SQL con shared/calc.ts
// y ejercita las escrituras reales del Worker (stock, anulación, envíos).
import type { D1Database } from "@cloudflare/workers-types";
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { calcularInventario, prorratearEnvio, totalesVenta, type Envio, type ItemCompra, type Venta } from "../shared/calc";
import type { CompraInput, VentaInput } from "../shared/schemas";
import type { EnvioLinea, InventarioFila, VentaResumen } from "../shared/types";
import { borrarCompra, cambiarEstadoVenta, guardarCompra, guardarEnvio, guardarVenta } from "../worker/operaciones";
import { leerDashboard } from "../worker/routes/dashboard";

let db: D1Database;
let cerrar: () => Promise<void>;

/** Parte un archivo .sql en sentencias, respetando los cuerpos BEGIN…END de los triggers. */
function sentencias(sql: string): string[] {
  const out: string[] = [];
  let actual = "";
  for (const linea of sql.split(/\r?\n/)) {
    const limpia = linea.replace(/--.*$/, "").trimEnd();
    if (!limpia.trim()) continue;
    actual += limpia + "\n";
    const enTrigger = /^\s*CREATE TRIGGER/i.test(actual);
    if (enTrigger ? /^END;$/i.test(limpia.trim()) : limpia.endsWith(";")) {
      out.push(actual.trim());
      actual = "";
    }
  }
  return out;
}
async function correrArchivo(ruta: string) {
  for (const s of sentencias(readFileSync(ruta, "utf8"))) await db.prepare(s).run();
}
const todas = async <T>(sql: string, ...p: (string | number | null)[]) => (await db.prepare(sql).bind(...p).all<T>()).results;

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  db = proxy.env.DB;
  cerrar = proxy.dispose;
  for (const f of readdirSync("db/migrations").sort()) await correrArchivo(`db/migrations/${f}`);
  await correrArchivo("db/seed.sql");
});
afterAll(() => cerrar?.());

/** Recalcula todo con shared/calc.ts a partir de las tablas y lo compara con las vistas. */
async function compararVistasConCalc() {
  const items = (
    await todas<{ id: string; unidades: number; p: number; t: number; trm_c: number; pv: number | null }>(
      `SELECT ci.id, ci.unidades, ci.precio_unitario_usd_c AS p, ci.tax_unitario_usd_c AS t, c.trm_c, ci.precio_venta_cop_c AS pv
       FROM compra_items ci JOIN compras c ON c.id = ci.compra_id`,
    )
  ).map(
    (i): ItemCompra => ({
      id: i.id,
      unidades: i.unidades,
      precio_unitario_usd: i.p / 100,
      tax_unitario_usd: i.t / 100,
      trm: i.trm_c / 100,
      precio_venta_cop: i.pv === null ? null : i.pv / 100,
    }),
  );
  const eItems = await todas<{ envio_id: string; compra_item_id: string; unidades: number }>("SELECT envio_id, compra_item_id, unidades FROM envio_items");
  const envios = (await todas<{ id: string; u: number; c: number }>("SELECT id, valor_usd_c AS u, valor_cop_c AS c FROM envios")).map(
    (e): Envio => ({ id: e.id, valor_usd: e.u / 100, valor_cop: e.c / 100, items: eItems.filter((l) => l.envio_id === e.id) }),
  );
  const vItems = await todas<{ venta_id: string; compra_item_id: string; unidades: number; p: number }>(
    "SELECT venta_id, compra_item_id, unidades, precio_unitario_cop_c AS p FROM venta_items",
  );
  const ventas = (await todas<{ id: string; estado: Venta["estado"]; d: number }>("SELECT id, estado, descuento_cop_c AS d FROM ventas")).map(
    (v): Venta => ({
      id: v.id,
      estado: v.estado,
      descuento_cop: v.d / 100,
      items: vItems.filter((l) => l.venta_id === v.id).map((l) => ({ compra_item_id: l.compra_item_id, unidades: l.unidades, precio_unitario_cop: l.p / 100 })),
    }),
  );
  const [{ pct }] = (await todas<{ pct: number }>("SELECT utilidad_pct_c / 100.0 AS pct FROM config")) as [{ pct: number }];

  const inv = calcularInventario(items, envios, ventas, pct);
  const porId = new Map(inv.map((f) => [f.id, f]));

  // v_inventario
  const vInv = await todas<InventarioFila>("SELECT * FROM v_inventario");
  expect(vInv).toHaveLength(inv.length);
  const campos = [
    "unidades", "vendidas", "disponibles", "unidades_enviadas", "pendientes_envio", "costo_unitario_usd", "costo_unitario_cop",
    "costo_base_total_cop", "envio_total_item_cop", "envio_unitario_cop", "costo_total_unitario_cop", "precio_sugerido_cop", "precio_venta_efectivo_cop",
  ] as const;
  for (const f of vInv) {
    const ts = porId.get(f.id)!;
    for (const c of campos) expect(f[c], `v_inventario.${c} [${f.nombre}]`).toBeCloseTo(ts[c], 4);
    if (ts.margen === null) expect(f.margen).toBeNull();
    else expect(f.margen, `margen [${f.nombre}]`).toBeCloseTo(ts.margen, 8);
  }

  // v_envio_detalle
  const vEnv = await todas<EnvioLinea>("SELECT * FROM v_envio_detalle");
  for (const e of envios) {
    const lineas = prorratearEnvio(
      e,
      e.items.map((l) => ({ clave: l.compra_item_id, unidades: l.unidades, costo_unitario_cop: porId.get(l.compra_item_id)!.costo_unitario_cop })),
    );
    for (const l of lineas) {
      const f = vEnv.find((x) => x.envio_id === e.id && x.compra_item_id === l.clave)!;
      for (const c of ["valor_linea_cop", "envio_asignado_cop", "envio_asignado_usd", "envio_por_unidad_cop"] as const)
        expect(f[c], `v_envio_detalle.${c} [${f.nombre}]`).toBeCloseTo(l[c], 4);
      expect(f.participacion).toBeCloseTo(l.participacion, 10);
    }
    const suma = vEnv.filter((x) => x.envio_id === e.id).reduce((a, x) => a + x.participacion, 0);
    expect(suma, "la participación del envío suma 100%").toBeCloseTo(1, 9);
  }

  // v_ventas_resumen
  const vVen = await todas<VentaResumen>("SELECT * FROM v_ventas_resumen");
  expect(vVen).toHaveLength(ventas.length);
  const totales = new Map(ventas.map((v) => [v.id, totalesVenta(v, (id) => porId.get(id)!.costo_total_unitario_cop)]));
  for (const f of vVen) {
    const t = totales.get(f.id)!;
    for (const c of ["subtotal_cop", "total_cop", "costo_cop", "utilidad_cop"] as const) expect(f[c], `v_ventas_resumen.${c} [${f.numero}]`).toBeCloseTo(t[c], 4);
  }

  // v_dashboard
  const d = (await leerDashboard(db, null, null, "mes")).acumulado;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const reales = ventas.filter((v) => v.estado === "pagada" || v.estado === "entregada");
  const ventaReal = sum(reales.map((v) => totales.get(v.id)!.total_cop));
  const porCobrar = sum(ventas.filter((v) => v.estado === "pendiente").map((v) => totales.get(v.id)!.total_cop));
  const valorInv = sum(inv.map((f) => f.disponibles * f.precio_venta_efectivo_cop));
  expect(d.invertido_cop).toBeCloseTo(sum(inv.map((f) => f.costo_base_total_cop)) + sum(envios.map((e) => e.valor_cop)), 4);
  expect(d.valor_inventario_cop).toBeCloseTo(valorInv, 3);
  expect(d.venta_real_cop).toBeCloseTo(ventaReal, 4);
  expect(d.por_cobrar_cop).toBeCloseTo(porCobrar, 4);
  expect(d.utilidad_real_cop).toBeCloseTo(sum(reales.map((v) => totales.get(v.id)!.utilidad_cop)), 4);
  expect(d.potencial_cop).toBeCloseTo(ventaReal + porCobrar + valorInv, 3);
  expect(d.unidades_disponibles).toBe(sum(inv.map((f) => f.disponibles)));
  return { items: vInv.length, ventas: vVen.length };
}

const disponibles = async (id: string) => (await todas<{ d: number }>("SELECT disponibles AS d FROM v_inventario WHERE id = ?", id))[0]!.d;

describe("seed", () => {
  it("carga los totales del Excel", async () => {
    const [t] = await todas<{ items: number; unidades: number; usd: number }>(
      "SELECT count(*) AS items, sum(unidades) AS unidades, sum(unidades * (precio_unitario_usd_c + tax_unitario_usd_c)) / 100.0 AS usd FROM compra_items",
    );
    expect(t).toEqual({ items: 40, unidades: 159, usd: 879.27 });
    const d = (await leerDashboard(db, null, null, "mes")).acumulado;
    expect(d.envios_cop).toBe(535330);
    expect(d.invertido_cop).toBeCloseTo(879.27 * 3149 + 535330, 4);
    expect(d.unidades_disponibles).toBe(159);
  });

  it("las vistas coinciden con shared/calc.ts", async () => {
    expect(await compararVistasConCalc()).toEqual({ items: 40, ventas: 0 });
  });
});

describe("escrituras del Worker", () => {
  let tienda: string, cliente: string, compra: string, A: string, B: string, v1: string, v3: string;
  const compraBase = (): CompraInput => ({
    tienda_id: tienda,
    fecha: "2026-01-15",
    trm: 4000,
    notas: null,
    items: [
      { nombre: "Prueba A", unidades: 3, precio_unitario_usd: 10, tax_unitario_usd: 0.5 },
      { nombre: "Prueba B", unidades: 2, precio_unitario_usd: 5, tax_unitario_usd: 0 },
    ],
  });
  const venta = (items: VentaInput["items"], extra: Partial<VentaInput> = {}): VentaInput => ({
    fecha: "2026-01-20",
    vendedor: "prueba",
    cliente_id: cliente,
    metodo_pago: "nequi",
    descuento_cop: 5000,
    estado: "pagada",
    notas: null,
    items,
    ...extra,
  });
  const deA = (unidades: number) => [{ compra_item_id: A, unidades, precio_unitario_cop: 70000 }];

  beforeAll(async () => {
    tienda = crypto.randomUUID();
    cliente = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO tiendas (id, nombre) VALUES (?, 'Tienda de prueba')").bind(tienda),
      db.prepare("INSERT INTO clientes (id, nombre) VALUES (?, 'Cliente de prueba')").bind(cliente),
    ]);
    compra = await guardarCompra(db, compraBase());
    const its = await todas<{ id: string; nombre: string }>("SELECT id, nombre FROM compra_items WHERE compra_id = ?", compra);
    A = its.find((i) => i.nombre === "Prueba A")!.id;
    B = its.find((i) => i.nombre === "Prueba B")!.id;
  });

  it("una venta descuenta el stock y recibe su consecutivo", async () => {
    v1 = await guardarVenta(db, venta(deA(2)));
    expect(await disponibles(A)).toBe(1);
    const [v] = await todas<{ numero: string }>("SELECT numero FROM ventas WHERE id = ?", v1);
    expect(v!.numero).toBe("V-0001");
  });

  it("rechaza la sobreventa sin dejar rastro ni gastar el consecutivo", async () => {
    await expect(guardarVenta(db, venta(deA(2)))).rejects.toThrow(/No hay suficientes unidades/);
    expect(await disponibles(A)).toBe(1);
    expect(await todas("SELECT id FROM ventas")).toHaveLength(1);
  });

  it("una venta pendiente también aparta unidades", async () => {
    v3 = await guardarVenta(db, venta(deA(1), { estado: "pendiente", descuento_cop: 0 }));
    expect(await disponibles(A)).toBe(0);
    expect((await todas<{ numero: string }>("SELECT numero FROM ventas WHERE id = ?", v3))[0]!.numero).toBe("V-0002");
  });

  it("anular devuelve las unidades", async () => {
    await cambiarEstadoVenta(db, v1, "anulada");
    expect(await disponibles(A)).toBe(2);
  });

  it("editar una venta recalcula el stock", async () => {
    await guardarVenta(db, venta(deA(2), { estado: "pendiente", descuento_cop: 0 }), v3);
    expect(await disponibles(A)).toBe(1);
    await expect(guardarVenta(db, venta(deA(4), { estado: "pendiente", descuento_cop: 0 }), v3)).rejects.toThrow(/No hay suficientes unidades/);
    expect(await disponibles(A)).toBe(1); // la edición rechazada no cambió nada
  });

  it("reactivar una venta anulada sin stock se rechaza", async () => {
    await expect(cambiarEstadoVenta(db, v1, "pagada")).rejects.toThrow(/No hay suficientes unidades/);
    expect((await todas<{ estado: string }>("SELECT estado FROM ventas WHERE id = ?", v1))[0]!.estado).toBe("anulada");
  });

  it("rechaza un descuento mayor que el subtotal", async () => {
    await expect(guardarVenta(db, venta([{ compra_item_id: B, unidades: 1, precio_unitario_cop: 1000 }]))).rejects.toThrow(/descuento/);
  });

  it("acepta un envío parcial y rechaza pasarse de las unidades compradas", async () => {
    const base = { fecha: "2026-01-18", descripcion: "prueba", valor_usd: 10, valor_cop: 40000, notas: null };
    const envio = await guardarEnvio(db, { ...base, items: [{ compra_item_id: A, unidades: 2 }, { compra_item_id: B, unidades: 2 }] });
    await expect(guardarEnvio(db, { ...base, items: [{ compra_item_id: A, unidades: 2 }] })).rejects.toThrow(/más unidades de las que se compraron/);
    expect(await todas("SELECT id FROM envios WHERE descripcion = 'prueba'")).toHaveLength(1);
    // Editar el mismo envío no cuenta sus propias unidades dos veces.
    await guardarEnvio(db, { ...base, items: [{ compra_item_id: A, unidades: 3 }, { compra_item_id: B, unidades: 2 }] }, envio);
    await guardarEnvio(db, { ...base, items: [{ compra_item_id: A, unidades: 2 }, { compra_item_id: B, unidades: 2 }] }, envio);
  });

  it("no deja quitar, reducir ni borrar lo que ya tiene ventas o envíos", async () => {
    const c = compraBase();
    await expect(guardarCompra(db, { ...c, items: [{ ...c.items[1]!, id: B }] }, compra)).rejects.toThrow(/Prueba A.*ventas o envíos/);
    await expect(guardarCompra(db, { ...c, items: [{ ...c.items[0]!, id: A, unidades: 1 }, { ...c.items[1]!, id: B }] }, compra)).rejects.toThrow(
      /menos unidades de las que ya (están en envíos|se vendieron)/,
    );
    await expect(borrarCompra(db, compra)).rejects.toThrow(/ventas o envíos/);
    expect(await todas("SELECT id FROM compra_items WHERE compra_id = ?", compra)).toHaveLength(2);
  });

  it("editar una compra conserva los ítems y agrega los nuevos", async () => {
    const c = compraBase();
    await guardarCompra(db, { ...c, trm: 4100, items: [{ ...c.items[0]!, id: A }, { ...c.items[1]!, id: B }, { nombre: "Prueba C", unidades: 1, precio_unitario_usd: 2, tax_unitario_usd: 0 }] }, compra);
    const its = await todas<{ id: string; nombre: string; orden: number }>("SELECT id, nombre, orden FROM compra_items WHERE compra_id = ? ORDER BY orden", compra);
    expect(its.map((i) => i.nombre)).toEqual(["Prueba A", "Prueba B", "Prueba C"]);
    expect(its[0]!.id).toBe(A);
  });

  it("las vistas siguen coincidiendo con calc.ts con ventas, envío parcial y precio manual", async () => {
    await db.prepare("UPDATE compra_items SET precio_venta_cop_c = 6500000 WHERE id = ?").bind(B).run();
    await cambiarEstadoVenta(db, v3, "entregada");
    expect(await compararVistasConCalc()).toEqual({ items: 43, ventas: 2 });
  });

  it("el dashboard filtra ventas por fecha y agrupa por mes o semana", async () => {
    const enero = await leerDashboard(db, "2026-01-01", "2026-01-31", "mes");
    expect(enero.periodo.num_ventas).toBe(1);
    expect(enero.periodo.venta_real_cop).toBe(140000);
    expect(enero.serie).toEqual([expect.objectContaining({ periodo: "2026-01-01", venta_cop: 140000 })]);
    expect(enero.top_vendidos[0]).toMatchObject({ nombre: "Prueba A", unidades: 2 });
    // 20 de enero de 2026 es martes: su semana empieza el lunes 19.
    expect((await leerDashboard(db, null, null, "semana")).serie[0]!.periodo).toBe("2026-01-19");
    expect((await leerDashboard(db, "2026-02-01", null, "mes")).periodo.num_ventas).toBe(0);
  });
});
