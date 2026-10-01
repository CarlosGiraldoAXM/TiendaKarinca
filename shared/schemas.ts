// Validación compartida entre el Worker y el frontend.
import { z } from "zod";

export const CANALES = ["instagram", "tiktok", "whatsapp", "facebook", "referido", "otro"] as const;
export const METODOS_PAGO = ["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "otro"] as const;
export const ESTADOS_VENTA = ["pendiente", "pagada", "entregada", "anulada"] as const;

const texto = (msg: string) => z.string().trim().min(1, msg);
const opcional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const id = z.string().uuid("Identificador inválido");
const dinero = (msg = "No puede ser negativo") => z.number({ invalid_type_error: "Escribe un número" }).min(0, msg);
const unidades = z
  .number({ invalid_type_error: "Escribe un número" })
  .int("Debe ser un número entero")
  .positive("Debe ser mayor que 0");

export const tiendaSchema = z.object({ nombre: texto("Escribe el nombre de la tienda") });

export const fusionSchema = z.object({ destino_id: id });

export const compraItemSchema = z.object({
  id: id.nullish(),
  nombre: texto("Escribe el nombre del producto"),
  unidades,
  precio_unitario_usd: dinero(),
  tax_unitario_usd: dinero(),
});

export const compraSchema = z.object({
  tienda_id: id,
  fecha,
  trm: z.number({ invalid_type_error: "Escribe la TRM" }).positive("La TRM debe ser mayor que 0"),
  notas: opcional,
  items: z.array(compraItemSchema).min(1, "Agrega al menos un producto"),
});

export const envioSchema = z.object({
  fecha,
  descripcion: opcional,
  valor_usd: dinero(),
  valor_cop: dinero(),
  notas: opcional,
  items: z
    .array(z.object({ compra_item_id: id, unidades }))
    .min(1, "Selecciona al menos un producto"),
});

export const clienteSchema = z.object({
  nombre: texto("Escribe el nombre"),
  telefono: opcional,
  canal: z.enum(CANALES),
  usuario_red: opcional,
  notas: opcional,
});

export const ventaSchema = z.object({
  fecha,
  vendedor: z.string().trim().default(""),
  cliente_id: id,
  metodo_pago: z.enum(METODOS_PAGO),
  descuento_cop: dinero().default(0),
  estado: z.enum(ESTADOS_VENTA).default("pagada"),
  notas: opcional,
  items: z
    .array(z.object({ compra_item_id: id, unidades, precio_unitario_cop: dinero() }))
    .min(1, "Agrega al menos un producto"),
});

export const estadoVentaSchema = z.object({ estado: z.enum(ESTADOS_VENTA) });

export const precioVentaSchema = z.object({ precio_venta_cop: dinero().nullable() });

export const configSchema = z.object({
  utilidad_pct: z.number({ invalid_type_error: "Escribe un número" }).min(0, "No puede ser negativo").max(1000),
});

export type TiendaInput = z.infer<typeof tiendaSchema>;
export type CompraInput = z.infer<typeof compraSchema>;
export type EnvioInput = z.infer<typeof envioSchema>;
export type ClienteInput = z.infer<typeof clienteSchema>;
export type VentaInput = z.infer<typeof ventaSchema>;
