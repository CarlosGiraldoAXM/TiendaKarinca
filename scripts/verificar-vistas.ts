// Test de integración: compara lo que calculan las vistas SQL con shared/calc.ts
// y ejercita las funciones de ventas (sobreventa, anulación, reactivación).
// Uso: npm run verificar  (lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .dev.vars)
// Crea un cliente, dos ventas y un envío de prueba y los borra al terminar.
import { createClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import { calcularInventario, prorratearEnvio, totalesVenta, type Envio, type ItemCompra, type Venta } from "../shared/calc";

dotenv({ path: ".dev.vars", quiet: true });
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .dev.vars");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fallos = 0;
let comprobaciones = 0;
const cerca = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
function igual(etiqueta: string, sql: number | null, ts: number | null) {
  comprobaciones++;
  if (sql === null || ts === null ? sql !== ts : !cerca(Number(sql), ts)) {
    fallos++;
    console.error(`  ✗ ${etiqueta}: SQL=${sql} calc.ts=${ts}`);
  }
}
function ok(etiqueta: string, condicion: boolean, detalle = "") {
  comprobaciones++;
  if (!condicion) {
    fallos++;
    console.error(`  ✗ ${etiqueta} ${detalle}`);
  } else console.log(`  ✓ ${etiqueta}`);
}
async function filas<T = any>(tabla: string, columnas = "*"): Promise<T[]> {
  const { data, error } = await db.from(tabla).select(columnas);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return data as T[];
}

async function comparar(titulo: string) {
  console.log(`\n${titulo}`);
  const antes = fallos;
  const [compras, cItems, envios, eItems, ventas, vItems, cfg] = await Promise.all([
    filas("compras"),
    filas("compra_items"),
    filas("envios"),
    filas("envio_items"),
    filas("ventas"),
    filas("venta_items"),
    filas("config"),
  ]);
  const trm = new Map(compras.map((c) => [c.id, Number(c.trm)]));
  const items: ItemCompra[] = cItems.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    unidades: i.unidades,
    precio_unitario_usd: Number(i.precio_unitario_usd),
    tax_unitario_usd: Number(i.tax_unitario_usd),
    trm: trm.get(i.compra_id)!,
    precio_venta_cop: i.precio_venta_cop === null ? null : Number(i.precio_venta_cop),
  }));
  const enviosTs: Envio[] = envios.map((e) => ({
    id: e.id,
    valor_usd: Number(e.valor_usd),
    valor_cop: Number(e.valor_cop),
    items: eItems.filter((l) => l.envio_id === e.id).map((l) => ({ compra_item_id: l.compra_item_id, unidades: l.unidades })),
  }));
  const ventasTs: Venta[] = ventas.map((v) => ({
    id: v.id,
    estado: v.estado,
    descuento_cop: Number(v.descuento_cop),
    items: vItems
      .filter((l) => l.venta_id === v.id)
      .map((l) => ({ compra_item_id: l.compra_item_id, unidades: l.unidades, precio_unitario_cop: Number(l.precio_unitario_cop) })),
  }));

  const inv = calcularInventario(items, enviosTs, ventasTs, Number(cfg[0].utilidad_pct));
  const invPorId = new Map(inv.map((f) => [f.id, f]));

  // v_inventario
  const vInv = await filas("v_inventario");
  ok("v_inventario tiene una fila por ítem", vInv.length === inv.length, `(${vInv.length} vs ${inv.length})`);
  const campos = [
    "unidades", "vendidas", "disponibles", "unidades_enviadas", "pendientes_envio", "costo_unitario_usd",
    "costo_unitario_cop", "costo_base_total_cop", "envio_total_item_cop", "envio_unitario_cop",
    "costo_total_unitario_cop", "precio_sugerido_cop", "precio_venta_efectivo_cop", "margen",
  ] as const;
  for (const f of vInv) {
    const ts = invPorId.get(f.id)!;
    for (const c of campos) igual(`v_inventario.${c} [${f.nombre}]`, f[c], ts[c]);
  }

  // v_envio_detalle
  const vEnv = await filas("v_envio_detalle");
  const costoBase = new Map(inv.map((f) => [f.id, f.costo_unitario_cop]));
  for (const e of enviosTs) {
    const lineas = prorratearEnvio(
      e,
      e.items.map((l) => ({ clave: l.compra_item_id, unidades: l.unidades, costo_unitario_cop: costoBase.get(l.compra_item_id)! })),
    );
    for (const l of lineas) {
      const f = vEnv.find((x) => x.envio_id === e.id && x.compra_item_id === l.clave);
      for (const c of ["valor_linea_cop", "participacion", "envio_asignado_cop", "envio_asignado_usd", "envio_por_unidad_cop"] as const)
        igual(`v_envio_detalle.${c} [${f?.nombre}]`, f?.[c] ?? null, l[c]);
    }
    const suma = vEnv.filter((x) => x.envio_id === e.id).reduce((a, x) => a + Number(x.participacion), 0);
    igual("la participación del envío suma 100%", suma, 1);
  }

  // v_ventas_resumen
  const vVen = await filas("v_ventas_resumen");
  const costoTotal = (id: string) => invPorId.get(id)!.costo_total_unitario_cop;
  const totales = new Map(ventasTs.map((v) => [v.id, totalesVenta(v, costoTotal)]));
  for (const f of vVen) {
    const t = totales.get(f.id)!;
    for (const c of ["subtotal_cop", "total_cop", "costo_cop", "utilidad_cop"] as const) igual(`v_ventas_resumen.${c} [${f.numero}]`, f[c], t[c]);
  }

  // v_dashboard
  const d = (await filas("v_dashboard"))[0];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const reales = ventasTs.filter((v) => v.estado === "pagada" || v.estado === "entregada");
  const pendientes = ventasTs.filter((v) => v.estado === "pendiente");
  const invertido = sum(inv.map((f) => f.costo_base_total_cop)) + sum(enviosTs.map((e) => e.valor_cop));
  const valorInv = sum(inv.map((f) => f.disponibles * f.precio_venta_efectivo_cop));
  const ventaReal = sum(reales.map((v) => totales.get(v.id)!.total_cop));
  const porCobrar = sum(pendientes.map((v) => totales.get(v.id)!.total_cop));
  igual("v_dashboard.invertido_cop", d.invertido_cop, invertido);
  igual("v_dashboard.valor_inventario_cop", d.valor_inventario_cop, valorInv);
  igual("v_dashboard.venta_real_cop", d.venta_real_cop, ventaReal);
  igual("v_dashboard.por_cobrar_cop", d.por_cobrar_cop, porCobrar);
  igual("v_dashboard.utilidad_real_cop", d.utilidad_real_cop, sum(reales.map((v) => totales.get(v.id)!.utilidad_cop)));
  igual("v_dashboard.potencial_cop", d.potencial_cop, ventaReal + porCobrar + valorInv);
  igual("v_dashboard.unidades_disponibles", d.unidades_disponibles, sum(inv.map((f) => f.disponibles)));

  if (fallos === antes) console.log(`  ✓ vistas y calc.ts coinciden (${vInv.length} ítems, ${vEnv.length} líneas de envío, ${vVen.length} ventas)`);
  return { inv: vInv, dashboard: d };
}

const creados = { cliente: "", ventas: [] as string[], compra: "", envio: "", tienda: "" };

async function main() {
  const base = await comparar("1. Estado actual de la base");
  console.log(`  Invertido: ${Number(base.dashboard.invertido_cop).toFixed(2)} COP · Unidades: ${base.dashboard.unidades_totales}`);

  console.log("\n2. Ventas: stock, sobreventa y anulación");
  // Compra de prueba propia, para no depender de cuánto stock tenga el seed.
  const { data: tienda, error: eT } = await db.from("tiendas").insert({ nombre: `__prueba_${Date.now()}` }).select().single();
  if (eT) throw eT;
  creados.tienda = tienda.id;
  const { data: compraId, error: eC } = await db.rpc("guardar_compra", {
    p: {
      tienda_id: tienda.id, fecha: "2026-01-15", trm: 4000,
      items: [
        { nombre: "Prueba A", unidades: 3, precio_unitario_usd: 10, tax_unitario_usd: 0.5 },
        { nombre: "Prueba B", unidades: 2, precio_unitario_usd: 5, tax_unitario_usd: 0 },
      ],
    },
  });
  if (eC) throw eC;
  creados.compra = compraId;
  const its = (await filas("compra_items")).filter((i) => i.compra_id === compraId);
  const A = its.find((i) => i.nombre === "Prueba A")!;
  const B = its.find((i) => i.nombre === "Prueba B")!;

  const { data: cliente, error: eCl } = await db.from("clientes").insert({ nombre: "__cliente de prueba", canal: "otro" }).select().single();
  if (eCl) throw eCl;
  creados.cliente = cliente.id;

  const venta = (items: object[], extra: object = {}) =>
    db.rpc("guardar_venta", { p: { fecha: "2026-01-20", vendedor: "prueba", cliente_id: cliente.id, metodo_pago: "nequi", descuento_cop: 5000, estado: "pagada", items, ...extra } });

  const v1 = await venta([{ compra_item_id: A.id, unidades: 2, precio_unitario_cop: 70000 }]);
  ok("crea una venta", !v1.error && !!v1.data, v1.error?.message);
  creados.ventas.push(v1.data);
  const disp = async (id: string) => (await filas("v_inventario")).find((f) => f.id === id)!.disponibles;
  ok("la venta descuenta el stock (3 → 1)", (await disp(A.id)) === 1);

  const v2 = await venta([{ compra_item_id: A.id, unidades: 2, precio_unitario_cop: 70000 }]);
  ok("rechaza la sobreventa con SIN_STOCK", v2.error?.message === "SIN_STOCK", JSON.stringify(v2.error ?? v2.data));
  ok("la venta rechazada no dejó rastro", (await disp(A.id)) === 1);

  const v3 = await venta([{ compra_item_id: A.id, unidades: 1, precio_unitario_cop: 70000 }], { estado: "pendiente", descuento_cop: 0 });
  ok("una venta pendiente también ocupa stock (1 → 0)", !v3.error && (await disp(A.id)) === 0, v3.error?.message);
  creados.ventas.push(v3.data);

  const anular = await db.rpc("cambiar_estado_venta", { p_id: v1.data, p_estado: "anulada" });
  ok("anular devuelve las unidades (0 → 2)", !anular.error && (await disp(A.id)) === 2, anular.error?.message);

  const editar = await db.rpc("guardar_venta", {
    p: { id: v3.data, fecha: "2026-01-20", vendedor: "prueba", cliente_id: cliente.id, metodo_pago: "nequi", descuento_cop: 0, estado: "pendiente", items: [{ compra_item_id: A.id, unidades: 2, precio_unitario_cop: 70000 }] },
  });
  ok("editar una venta recalcula el stock (2 → 1)", !editar.error && (await disp(A.id)) === 1, editar.error?.message);

  const reactivar = await db.rpc("cambiar_estado_venta", { p_id: v1.data, p_estado: "pagada" });
  ok("reactivar una anulada sin stock se rechaza", reactivar.error?.message === "SIN_STOCK", JSON.stringify(reactivar.error));

  const desc = await venta([{ compra_item_id: B.id, unidades: 1, precio_unitario_cop: 1000 }]);
  ok("rechaza un descuento mayor que el subtotal", desc.error?.message === "DESCUENTO_EXCEDE", JSON.stringify(desc.error ?? desc.data));

  console.log("\n3. Envíos: límite de unidades y recálculo");
  const envio = await db.rpc("guardar_envio", {
    p: { fecha: "2026-01-18", descripcion: "__prueba", valor_usd: 10, valor_cop: 40000, items: [{ compra_item_id: A.id, unidades: 2 }, { compra_item_id: B.id, unidades: 2 }] },
  });
  ok("crea un envío parcial", !envio.error, envio.error?.message);
  creados.envio = envio.data;
  const excede = await db.rpc("guardar_envio", {
    p: { fecha: "2026-01-19", valor_usd: 1, valor_cop: 4000, items: [{ compra_item_id: A.id, unidades: 2 }] },
  });
  ok("rechaza enviar más unidades de las compradas", excede.error?.message === "EXCEDE_UNIDADES", JSON.stringify(excede.error ?? excede.data));

  const borrar = await db.rpc("guardar_compra", {
    p: { id: compraId, tienda_id: tienda.id, fecha: "2026-01-15", trm: 4000, items: [{ id: B.id, nombre: "Prueba B", unidades: 2, precio_unitario_usd: 5, tax_unitario_usd: 0 }] },
  });
  ok("no deja quitar un ítem con ventas o envíos", borrar.error?.message === "ITEM_EN_USO", JSON.stringify(borrar.error ?? borrar.data));
  const bajar = await db.from("compra_items").update({ unidades: 1 }).eq("id", A.id);
  ok("no deja bajar las unidades por debajo de lo enviado", bajar.error?.message === "UNIDADES_MENOR_ENVIADAS", JSON.stringify(bajar.error));
  const delCompra = await db.from("compras").delete().eq("id", compraId);
  ok("no deja borrar una compra con ventas o envíos", delCompra.error?.code === "23503", JSON.stringify(delCompra.error));

  await comparar("4. Con ventas (pendiente, anulada), envío parcial y precio manual");
  await db.from("compra_items").update({ precio_venta_cop: 65000 }).eq("id", B.id);
  await db.rpc("cambiar_estado_venta", { p_id: v3.data, p_estado: "entregada" });
  await comparar("5. Tras cambiar un precio y entregar la venta");

  const dash = await db.rpc("f_dashboard", { p_desde: "2026-01-01", p_hasta: "2026-01-31", p_granularidad: "mes" });
  ok("f_dashboard filtra por rango", !dash.error && dash.data.periodo.num_ventas === 1 && dash.data.serie.length === 1, JSON.stringify(dash.error ?? dash.data?.periodo));
}

async function limpiar() {
  for (const id of creados.ventas.filter(Boolean)) await db.from("ventas").delete().eq("id", id);
  if (creados.envio) await db.from("envios").delete().eq("id", creados.envio);
  if (creados.compra) await db.from("compras").delete().eq("id", creados.compra);
  if (creados.cliente) await db.from("clientes").delete().eq("id", creados.cliente);
  if (creados.tienda) await db.from("tiendas").delete().eq("id", creados.tienda);
}

main()
  .catch((e) => {
    fallos++;
    console.error("\nError inesperado:", e);
  })
  .finally(async () => {
    await limpiar();
    console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos. Datos de prueba borrados.`);
    process.exit(fallos ? 1 : 0);
  });
