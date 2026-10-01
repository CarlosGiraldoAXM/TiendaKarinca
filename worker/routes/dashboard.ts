import type { D1Database } from "@cloudflare/workers-types";
import type { Dashboard } from "../../shared/types";
import { traducir } from "../errores";
import { fechaOpcional, nuevaRuta } from "../lib";

/**
 * Todo lo que necesita la pantalla principal en un solo viaje a la base.
 * El rango de fechas aplica a ventas y utilidad; lo acumulado no se filtra.
 */
export async function leerDashboard(db: D1Database, desde: string | null, hasta: string | null, granularidad: "semana" | "mes"): Promise<Dashboard> {
  const RANGO = "(?1 IS NULL OR fecha >= ?1) AND (?2 IS NULL OR fecha <= ?2)";
  // Semana = su lunes; mes = su día 1.
  const periodo = granularidad === "semana" ? "date(fecha, 'weekday 0', '-6 days')" : "substr(fecha, 1, 7) || '-01'";
  const q = (sql: string, conRango = true) => (conRango ? db.prepare(sql).bind(desde, hasta) : db.prepare(sql));

  try {
    const [acumulado, enPeriodo, serie, porTienda, top, menorStock] = await db.batch([
      q("SELECT * FROM v_dashboard", false),
      q(`SELECT
           coalesce(sum(total_cop)    FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS venta_real_cop,
           coalesce(sum(costo_cop)    FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS costo_vendido_cop,
           coalesce(sum(utilidad_cop) FILTER (WHERE estado IN ('pagada', 'entregada')), 0.0) AS utilidad_real_cop,
           coalesce(sum(total_cop)    FILTER (WHERE estado = 'pendiente'), 0.0)              AS por_cobrar_cop,
           count(*) FILTER (WHERE estado <> 'anulada')                                       AS num_ventas
         FROM v_ventas_resumen WHERE ${RANGO}`),
      q(`SELECT ${periodo} AS periodo, sum(total_cop) AS venta_cop, sum(utilidad_cop) AS utilidad_cop
         FROM v_ventas_resumen
         WHERE estado IN ('pagada', 'entregada') AND ${RANGO}
         GROUP BY 1 ORDER BY 1`),
      q("SELECT tienda, sum(costo_base_total_cop + envio_total_item_cop) AS invertido_cop FROM v_inventario GROUP BY tienda ORDER BY 2 DESC", false),
      q(`SELECT d.nombre, d.tienda, sum(d.unidades) AS unidades, sum(d.subtotal_cop) AS venta_cop
         FROM v_venta_items_detalle d
         JOIN ventas v ON v.id = d.venta_id
         WHERE v.estado <> 'anulada' AND (?1 IS NULL OR v.fecha >= ?1) AND (?2 IS NULL OR v.fecha <= ?2)
         GROUP BY d.nombre, d.tienda
         ORDER BY 3 DESC, 4 DESC LIMIT 5`),
      q("SELECT id, nombre, tienda, disponibles, unidades FROM v_inventario WHERE disponibles > 0 ORDER BY disponibles, nombre COLLATE NOCASE LIMIT 5", false),
    ]);
    return {
      acumulado: acumulado!.results[0] as Dashboard["acumulado"],
      periodo: enPeriodo!.results[0] as Dashboard["periodo"],
      serie: serie!.results as Dashboard["serie"],
      por_tienda: porTienda!.results as Dashboard["por_tienda"],
      top_vendidos: top!.results as Dashboard["top_vendidos"],
      menor_stock: menorStock!.results as Dashboard["menor_stock"],
    };
  } catch (e) {
    throw traducir(e);
  }
}

export const dashboard = nuevaRuta().get("/", async (c) => {
  const { desde, hasta, granularidad } = c.req.query();
  return c.json(await leerDashboard(c.env.DB, fechaOpcional(desde), fechaOpcional(hasta), granularidad === "semana" ? "semana" : "mes"));
});
