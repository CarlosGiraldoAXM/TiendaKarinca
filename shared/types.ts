// Formas de los datos que devuelve la API (filas de tablas y vistas).
import type { CANALES, ESTADOS_VENTA, METODOS_PAGO } from "./schemas";

export type Canal = (typeof CANALES)[number];
export type MetodoPago = (typeof METODOS_PAGO)[number];
export type EstadoVenta = (typeof ESTADOS_VENTA)[number];

export interface Tienda {
  id: string;
  nombre: string;
  num_compras?: number;
}

export interface CompraItem {
  id: string;
  compra_id: string;
  nombre: string;
  unidades: number;
  precio_unitario_usd: number;
  tax_unitario_usd: number;
  precio_venta_cop: number | null;
  orden: number;
}

export interface CompraResumen {
  id: string;
  tienda_id: string;
  tienda: string;
  fecha: string;
  trm: number;
  notas: string | null;
  num_items: number;
  unidades: number;
  total_usd: number;
  total_cop: number;
}

export interface CompraDetalle extends CompraResumen {
  items: CompraItem[];
}

/** Fila de v_inventario. */
export interface InventarioFila {
  id: string;
  compra_id: string;
  tienda_id: string;
  tienda: string;
  fecha_compra: string;
  nombre: string;
  orden: number;
  unidades: number;
  vendidas: number;
  disponibles: number;
  unidades_enviadas: number;
  pendientes_envio: number;
  precio_unitario_usd: number;
  tax_unitario_usd: number;
  costo_unitario_usd: number;
  trm: number;
  costo_unitario_cop: number;
  costo_base_total_cop: number;
  envio_total_item_cop: number;
  envio_total_item_usd: number;
  envio_unitario_cop: number;
  costo_total_unitario_cop: number;
  precio_sugerido_cop: number;
  precio_venta_cop: number | null;
  precio_venta_efectivo_cop: number;
  margen: number | null;
}

/** Fila de v_envio_detalle. */
export interface EnvioLinea {
  id: string;
  envio_id: string;
  compra_item_id: string;
  compra_id: string;
  tienda_id: string;
  tienda: string;
  nombre: string;
  unidades: number;
  costo_unitario_cop: number;
  valor_linea_cop: number;
  participacion: number;
  envio_asignado_cop: number;
  envio_asignado_usd: number;
  envio_por_unidad_cop: number;
}

export interface EnvioResumen {
  id: string;
  fecha: string;
  descripcion: string | null;
  valor_usd: number;
  valor_cop: number;
  notas: string | null;
  num_items: number;
  unidades: number;
}

export interface EnvioDetalle extends EnvioResumen {
  lineas: EnvioLinea[];
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  canal: Canal;
  usuario_red: string | null;
  notas: string | null;
  created_at: string;
  num_ventas?: number;
  total_comprado_cop?: number;
}

/** Fila de v_ventas_resumen. */
export interface VentaResumen {
  id: string;
  consecutivo: number;
  numero: string;
  fecha: string;
  vendedor: string;
  cliente_id: string;
  cliente: string;
  cliente_telefono: string | null;
  metodo_pago: MetodoPago;
  estado: EstadoVenta;
  notas: string | null;
  created_at: string;
  num_items: number;
  unidades: number;
  subtotal_cop: number;
  descuento_cop: number;
  total_cop: number;
  costo_cop: number;
  utilidad_cop: number;
}

/** Fila de v_venta_items_detalle. */
export interface VentaLinea {
  id: string;
  venta_id: string;
  compra_item_id: string;
  nombre: string;
  tienda: string;
  unidades: number;
  precio_unitario_cop: number;
  subtotal_cop: number;
  costo_total_unitario_cop: number;
  costo_cop: number;
  disponibles: number;
}

export interface VentaDetalle extends VentaResumen {
  lineas: VentaLinea[];
}

export interface ClienteDetalle extends Cliente {
  ventas: VentaResumen[];
}

export interface Config {
  utilidad_pct: number;
}

export interface Dashboard {
  acumulado: {
    mercancia_cop: number;
    envios_cop: number;
    invertido_cop: number;
    valor_inventario_cop: number;
    venta_real_cop: number;
    por_cobrar_cop: number;
    costo_vendido_cop: number;
    utilidad_real_cop: number;
    potencial_cop: number;
    unidades_totales: number;
    unidades_vendidas: number;
    unidades_disponibles: number;
  };
  periodo: {
    venta_real_cop: number;
    costo_vendido_cop: number;
    utilidad_real_cop: number;
    por_cobrar_cop: number;
    num_ventas: number;
  };
  serie: { periodo: string; venta_cop: number; utilidad_cop: number }[];
  por_tienda: { tienda: string; invertido_cop: number }[];
  top_vendidos: { nombre: string; tienda: string; unidades: number; venta_cop: number }[];
  menor_stock: { id: string; nombre: string; tienda: string; disponibles: number; unidades: number }[];
}
