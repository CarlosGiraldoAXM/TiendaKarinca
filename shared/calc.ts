// Lógica de cálculo pura. Es la referencia de las vistas SQL (db/migrations/0003_vistas.sql)
// y la usa el frontend para las vistas previas en vivo. Sin redondeos: solo se formatea en pantalla.

export interface ItemCompra {
  id: string;
  nombre?: string;
  unidades: number;
  precio_unitario_usd: number;
  tax_unitario_usd: number;
  /** TRM de la compra a la que pertenece el ítem. */
  trm: number;
  /** null o undefined = usar el precio sugerido. */
  precio_venta_cop?: number | null;
}

export interface Envio {
  id: string;
  valor_usd: number;
  valor_cop: number;
  items: { compra_item_id: string; unidades: number }[];
}

export type EstadoVenta = "pendiente" | "pagada" | "entregada" | "anulada";

export interface Venta {
  id: string;
  estado: EstadoVenta;
  descuento_cop: number;
  items: { compra_item_id: string; unidades: number; precio_unitario_cop: number }[];
}

export interface LineaEnvio {
  clave: string;
  unidades: number;
  costo_unitario_cop: number;
}

export interface LineaProrrateada extends LineaEnvio {
  valor_linea_cop: number;
  participacion: number;
  envio_asignado_cop: number;
  envio_asignado_usd: number;
  envio_por_unidad_cop: number;
}

export interface FilaInventario {
  id: string;
  unidades: number;
  vendidas: number;
  disponibles: number;
  unidades_enviadas: number;
  pendientes_envio: number;
  costo_unitario_usd: number;
  costo_unitario_cop: number;
  costo_base_total_cop: number;
  envio_total_item_cop: number;
  envio_unitario_cop: number;
  costo_total_unitario_cop: number;
  precio_sugerido_cop: number;
  precio_venta_efectivo_cop: number;
  margen: number | null;
}

export interface TotalesVenta {
  subtotal_cop: number;
  total_cop: number;
  costo_cop: number;
  utilidad_cop: number;
}

export const costoUnitarioUsd = (i: Pick<ItemCompra, "precio_unitario_usd" | "tax_unitario_usd">) =>
  i.precio_unitario_usd + i.tax_unitario_usd;

export const costoUnitarioCop = (i: Pick<ItemCompra, "precio_unitario_usd" | "tax_unitario_usd" | "trm">) =>
  costoUnitarioUsd(i) * i.trm;

export const precioSugerido = (costoTotalUnitarioCop: number, utilidadPct: number) =>
  costoTotalUnitarioCop * (1 + utilidadPct / 100);

/** Reparte el valor del envío entre sus líneas según la participación de cada una en el valor total. */
export function prorratearEnvio(
  envio: { valor_cop: number; valor_usd: number },
  lineas: LineaEnvio[],
): LineaProrrateada[] {
  const valores = lineas.map((l) => l.unidades * l.costo_unitario_cop);
  const total = valores.reduce((a, b) => a + b, 0);
  return lineas.map((l, i) => {
    const valor = valores[i]!;
    const asignadoCop = total > 0 ? (valor * envio.valor_cop) / total : 0;
    return {
      ...l,
      valor_linea_cop: valor,
      participacion: total > 0 ? valor / total : 0,
      envio_asignado_cop: asignadoCop,
      envio_asignado_usd: total > 0 ? (valor * envio.valor_usd) / total : 0,
      envio_por_unidad_cop: l.unidades > 0 ? asignadoCop / l.unidades : 0,
    };
  });
}

/** Unidades vendidas por ítem. Las ventas anuladas no cuentan. */
export function unidadesVendidas(ventas: Venta[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of ventas) {
    if (v.estado === "anulada") continue;
    for (const it of v.items) m.set(it.compra_item_id, (m.get(it.compra_item_id) ?? 0) + it.unidades);
  }
  return m;
}

/** Equivalente a la vista v_inventario. */
export function calcularInventario(
  items: ItemCompra[],
  envios: Envio[],
  ventas: Venta[],
  utilidadPct: number,
): FilaInventario[] {
  const porId = new Map(items.map((i) => [i.id, i]));
  const envioCop = new Map<string, number>();
  const enviadas = new Map<string, number>();

  for (const e of envios) {
    const lineas = e.items.map((l) => {
      const item = porId.get(l.compra_item_id);
      if (!item) throw new Error("Ítem desconocido en el envío: " + l.compra_item_id);
      return { clave: l.compra_item_id, unidades: l.unidades, costo_unitario_cop: costoUnitarioCop(item) };
    });
    for (const l of prorratearEnvio(e, lineas)) {
      envioCop.set(l.clave, (envioCop.get(l.clave) ?? 0) + l.envio_asignado_cop);
      enviadas.set(l.clave, (enviadas.get(l.clave) ?? 0) + l.unidades);
    }
  }

  const vendidas = unidadesVendidas(ventas);

  return items.map((i) => {
    const cUsd = costoUnitarioUsd(i);
    const cCop = costoUnitarioCop(i);
    const envioTotal = envioCop.get(i.id) ?? 0;
    // Se divide entre todas las unidades del ítem: es el costo promedio del lote.
    const envioUnit = envioTotal / i.unidades;
    const costoTotal = cCop + envioUnit;
    const sugerido = precioSugerido(costoTotal, utilidadPct);
    const efectivo = i.precio_venta_cop ?? sugerido;
    const vend = vendidas.get(i.id) ?? 0;
    const env = enviadas.get(i.id) ?? 0;
    return {
      id: i.id,
      unidades: i.unidades,
      vendidas: vend,
      disponibles: i.unidades - vend,
      unidades_enviadas: env,
      pendientes_envio: i.unidades - env,
      costo_unitario_usd: cUsd,
      costo_unitario_cop: cCop,
      costo_base_total_cop: cCop * i.unidades,
      envio_total_item_cop: envioTotal,
      envio_unitario_cop: envioUnit,
      costo_total_unitario_cop: costoTotal,
      precio_sugerido_cop: sugerido,
      precio_venta_efectivo_cop: efectivo,
      margen: costoTotal > 0 ? (efectivo - costoTotal) / costoTotal : null,
    };
  });
}

/** Totales de una venta. `costoUnitario` devuelve el costo total unitario vigente del ítem. */
export function totalesVenta(
  venta: Pick<Venta, "descuento_cop" | "items">,
  costoUnitario: (compraItemId: string) => number,
): TotalesVenta {
  let subtotal = 0;
  let costo = 0;
  for (const it of venta.items) {
    subtotal += it.unidades * it.precio_unitario_cop;
    costo += it.unidades * costoUnitario(it.compra_item_id);
  }
  const total = subtotal - venta.descuento_cop;
  return { subtotal_cop: subtotal, total_cop: total, costo_cop: costo, utilidad_cop: total - costo };
}

export interface FaltanteStock {
  compra_item_id: string;
  unidades: number;
  vendidas: number;
}

/** Ítems que quedarían con disponibles < 0. Vacío = las ventas caben en el inventario. */
export function validarStock(items: Pick<ItemCompra, "id" | "unidades">[], ventas: Venta[]): FaltanteStock[] {
  const vendidas = unidadesVendidas(ventas);
  return items
    .filter((i) => (vendidas.get(i.id) ?? 0) > i.unidades)
    .map((i) => ({ compra_item_id: i.id, unidades: i.unidades, vendidas: vendidas.get(i.id)! }));
}

/** Ítems cuyas unidades en envíos superan las compradas. Vacío = todo cabe. */
export function validarEnvios(items: Pick<ItemCompra, "id" | "unidades">[], envios: Envio[]): string[] {
  const enviadas = new Map<string, number>();
  for (const e of envios)
    for (const l of e.items) enviadas.set(l.compra_item_id, (enviadas.get(l.compra_item_id) ?? 0) + l.unidades);
  return items.filter((i) => (enviadas.get(i.id) ?? 0) > i.unidades).map((i) => i.id);
}
