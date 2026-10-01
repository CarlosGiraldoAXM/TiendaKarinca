import { describe, expect, it } from "vitest";
import {
  calcularInventario,
  precioSugerido,
  prorratearEnvio,
  totalesVenta,
  validarEnvios,
  validarStock,
  type Envio,
  type ItemCompra,
  type Venta,
} from "./calc";

// TRM 1 y sin tax para que los números de los ejemplos se lean directo en COP.
const item = (id: string, unidades: number, precio: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({
  id,
  unidades,
  precio_unitario_usd: precio,
  tax_unitario_usd: 0,
  trm: 1,
  ...extra,
});
const fila = (filas: ReturnType<typeof calcularInventario>, id: string) => filas.find((f) => f.id === id)!;

describe("prorrateo del envío", () => {
  it("reparte por participación en valor: 1M / A 100k / B 50k / envío 100k → 10k y 5k", () => {
    const r = prorratearEnvio({ valor_cop: 100_000, valor_usd: 25 }, [
      { clave: "A", unidades: 1, costo_unitario_cop: 100_000 },
      { clave: "B", unidades: 1, costo_unitario_cop: 50_000 },
      { clave: "resto", unidades: 1, costo_unitario_cop: 850_000 },
    ]);
    expect(r[0]!.participacion).toBeCloseTo(0.1, 12);
    expect(r[1]!.participacion).toBeCloseTo(0.05, 12);
    expect(r[0]!.envio_asignado_cop).toBeCloseTo(10_000, 6);
    expect(r[1]!.envio_asignado_cop).toBeCloseTo(5_000, 6);
    expect(r[0]!.envio_asignado_usd).toBeCloseTo(2.5, 9);
    expect(r.reduce((a, l) => a + l.participacion, 0)).toBeCloseTo(1, 12);
    expect(r.reduce((a, l) => a + l.envio_asignado_cop, 0)).toBeCloseTo(100_000, 6);
  });

  it("usa unidades × costo unitario como valor de la línea", () => {
    const r = prorratearEnvio({ valor_cop: 30_000, valor_usd: 0 }, [
      { clave: "A", unidades: 2, costo_unitario_cop: 10_000 },
      { clave: "B", unidades: 1, costo_unitario_cop: 10_000 },
    ]);
    expect(r[0]!.envio_asignado_cop).toBeCloseTo(20_000, 6);
    expect(r[0]!.envio_por_unidad_cop).toBeCloseTo(10_000, 6);
    expect(r[1]!.envio_asignado_cop).toBeCloseTo(10_000, 6);
  });

  it("no falla si el envío no tiene valor que repartir", () => {
    const r = prorratearEnvio({ valor_cop: 5_000, valor_usd: 1 }, [{ clave: "A", unidades: 1, costo_unitario_cop: 0 }]);
    expect(r[0]!.participacion).toBe(0);
    expect(r[0]!.envio_asignado_cop).toBe(0);
  });
});

describe("costo total del ítem", () => {
  it("suma el envío de un ítem repartido en dos envíos", () => {
    const items = [item("A", 4, 10_000), item("B", 2, 10_000)];
    const envios: Envio[] = [
      // A aporta 20k de 40k → asume la mitad de 8k = 4k
      {
        id: "e1",
        valor_usd: 0,
        valor_cop: 8_000,
        items: [
          { compra_item_id: "A", unidades: 2 },
          { compra_item_id: "B", unidades: 2 },
        ],
      },
      // A va sola → asume los 6k
      { id: "e2", valor_usd: 0, valor_cop: 6_000, items: [{ compra_item_id: "A", unidades: 2 }] },
    ];
    const a = fila(calcularInventario(items, envios, [], 40), "A");
    expect(a.unidades_enviadas).toBe(4);
    expect(a.pendientes_envio).toBe(0);
    expect(a.envio_total_item_cop).toBeCloseTo(10_000, 6);
    expect(a.envio_unitario_cop).toBeCloseTo(2_500, 6);
    expect(a.costo_total_unitario_cop).toBeCloseTo(12_500, 6);
  });

  it("las unidades sin envío no cargan envío, pero el costo se promedia en todo el lote", () => {
    const items = [item("A", 4, 10_000)];
    const envios: Envio[] = [{ id: "e1", valor_usd: 0, valor_cop: 4_000, items: [{ compra_item_id: "A", unidades: 2 }] }];
    const a = fila(calcularInventario(items, envios, [], 40), "A");
    expect(a.pendientes_envio).toBe(2);
    expect(a.envio_total_item_cop).toBeCloseTo(4_000, 6);
    expect(a.envio_unitario_cop).toBeCloseTo(1_000, 6); // 4.000 / 4 unidades, no / 2
    expect(a.costo_total_unitario_cop).toBeCloseTo(11_000, 6);
  });

  it("un ítem sin ningún envío cuesta solo su costo base", () => {
    const a = fila(calcularInventario([item("A", 3, 2, { tax_unitario_usd: 0.5, trm: 4_000 })], [], [], 40), "A");
    expect(a.costo_unitario_usd).toBeCloseTo(2.5, 9);
    expect(a.costo_unitario_cop).toBeCloseTo(10_000, 6);
    expect(a.envio_unitario_cop).toBe(0);
    expect(a.costo_total_unitario_cop).toBeCloseTo(10_000, 6);
  });
});

describe("precio sugerido", () => {
  it("con 40% es costo × 1,4, sin redondeo", () => {
    expect(precioSugerido(10_000, 40)).toBeCloseTo(14_000, 6);
    expect(precioSugerido(5_937.3786, 40)).toBeCloseTo(8_312.33004, 4);
  });

  it("el precio de venta manual manda sobre el sugerido y define el margen real", () => {
    const [sinPrecio, conPrecio] = calcularInventario(
      [item("A", 1, 10_000), item("B", 1, 10_000, { precio_venta_cop: 12_000 })],
      [],
      [],
      40,
    );
    expect(sinPrecio!.precio_venta_efectivo_cop).toBeCloseTo(14_000, 6);
    expect(sinPrecio!.margen).toBeCloseTo(0.4, 9);
    expect(conPrecio!.precio_sugerido_cop).toBeCloseTo(14_000, 6);
    expect(conPrecio!.precio_venta_efectivo_cop).toBe(12_000);
    expect(conPrecio!.margen).toBeCloseTo(0.2, 9);
  });
});

describe("ventas", () => {
  const items = [item("A", 5, 10_000)];
  const venta: Venta = {
    id: "v1",
    estado: "pagada",
    descuento_cop: 2_000,
    items: [{ compra_item_id: "A", unidades: 2, precio_unitario_cop: 15_000 }],
  };
  const costoDe = (envios: Envio[]) => {
    const inv = calcularInventario(items, envios, [venta], 40);
    return (id: string) => fila(inv, id).costo_total_unitario_cop;
  };

  it("aplica el descuento sobre el total", () => {
    const t = totalesVenta(venta, costoDe([]));
    expect(t.subtotal_cop).toBe(30_000);
    expect(t.total_cop).toBe(28_000);
    expect(t.costo_cop).toBeCloseTo(20_000, 6);
    expect(t.utilidad_cop).toBeCloseTo(8_000, 6);
  });

  it("recalcula la utilidad de una venta ya hecha cuando después se agrega un envío", () => {
    const envio: Envio = { id: "e1", valor_usd: 0, valor_cop: 5_000, items: [{ compra_item_id: "A", unidades: 5 }] };
    const t = totalesVenta(venta, costoDe([envio]));
    expect(t.costo_cop).toBeCloseTo(22_000, 6); // 2 × (10.000 + 1.000)
    expect(t.utilidad_cop).toBeCloseTo(6_000, 6);
  });
});

describe("stock", () => {
  const items = [item("A", 3, 10_000)];
  const v = (id: string, unidades: number, estado: Venta["estado"] = "pagada"): Venta => ({
    id,
    estado,
    descuento_cop: 0,
    items: [{ compra_item_id: "A", unidades, precio_unitario_cop: 15_000 }],
  });

  it("vender descuenta y anular devuelve las unidades", () => {
    expect(fila(calcularInventario(items, [], [v("v1", 2)], 40), "A").disponibles).toBe(1);
    expect(fila(calcularInventario(items, [], [v("v1", 2, "pendiente")], 40), "A").disponibles).toBe(1);
    const anulada = fila(calcularInventario(items, [], [v("v1", 2, "anulada")], 40), "A");
    expect(anulada.vendidas).toBe(0);
    expect(anulada.disponibles).toBe(3);
  });

  it("rechaza la sobreventa", () => {
    expect(validarStock(items, [v("v1", 2), v("v2", 1)])).toEqual([]);
    expect(validarStock(items, [v("v1", 2), v("v2", 2)])).toEqual([{ compra_item_id: "A", unidades: 3, vendidas: 4 }]);
  });

  it("reactivar una venta anulada vuelve a contar y puede no caber", () => {
    expect(validarStock(items, [v("v1", 3), v("v2", 1, "anulada")])).toEqual([]);
    expect(validarStock(items, [v("v1", 3), v("v2", 1, "pagada")])).toHaveLength(1);
  });

  it("no deja enviar más unidades de las compradas", () => {
    const e = (id: string, unidades: number): Envio => ({
      id,
      valor_usd: 0,
      valor_cop: 0,
      items: [{ compra_item_id: "A", unidades }],
    });
    expect(validarEnvios(items, [e("e1", 2), e("e2", 1)])).toEqual([]);
    expect(validarEnvios(items, [e("e1", 2), e("e2", 2)])).toEqual(["A"]);
  });
});
