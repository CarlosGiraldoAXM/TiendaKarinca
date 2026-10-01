// Cliente de la API del Worker y hooks de TanStack Query.
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClienteInput, CompraInput, EnvioInput, VentaInput } from "@shared/schemas";
import type {
  Cliente,
  ClienteDetalle,
  CompraDetalle,
  CompraResumen,
  Config,
  Dashboard,
  EnvioDetalle,
  EnvioResumen,
  EstadoVenta,
  InventarioFila,
  Tienda,
  VentaDetalle,
  VentaResumen,
} from "@shared/types";

async function api<T>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? "Algo salió mal. Inténtalo de nuevo.");
  return json as T;
}

const qs = (p: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : "";
};

const leer = <T>(key: QueryKey, ruta: string, enabled = true) => useQuery({ queryKey: key, queryFn: () => api<T>(ruta), enabled });

/**
 * Mutación genérica. Casi todo lo que se ve en pantalla se deriva de varias tablas
 * (un envío cambia costos, ventas y dashboard), así que al guardar se refresca todo.
 */
function escribir<V, R = unknown>(fn: (v: V) => Promise<R>, exito?: string | ((r: R, v: V) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (exito) toast.success(typeof exito === "function" ? exito(r, v) : exito);
      return qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ------------------------------------------------------------------ lecturas
export const useTiendas = () => leer<Tienda[]>(["tiendas"], "/tiendas");
export const useCompras = () => leer<CompraResumen[]>(["compras"], "/compras");
export const useCompra = (id?: string) => leer<CompraDetalle>(["compras", id], `/compras/${id}`, !!id);
export const useNombresItems = () => leer<string[]>(["compras", "nombres"], "/compras/nombres-items");
export const useInventario = () => leer<InventarioFila[]>(["inventario"], "/inventario");
export const useEnvios = () => leer<EnvioResumen[]>(["envios"], "/envios");
export const useEnvio = (id?: string) => leer<EnvioDetalle>(["envios", id], `/envios/${id}`, !!id);
export const useVentas = (f: { estado?: string; desde?: string; hasta?: string; cliente_id?: string } = {}) =>
  leer<VentaResumen[]>(["ventas", f], `/ventas${qs(f)}`);
export const useVenta = (id?: string) => leer<VentaDetalle>(["ventas", id], `/ventas/${id}`, !!id);
export const useClientes = () => leer<Cliente[]>(["clientes"], "/clientes");
export const useCliente = (id?: string) => leer<ClienteDetalle>(["clientes", id], `/clientes/${id}`, !!id);
export const useConfig = () => leer<Config>(["config"], "/config");
export const useDashboard = (f: { desde?: string | null; hasta?: string | null; granularidad: "semana" | "mes" }) =>
  leer<Dashboard>(["dashboard", f], `/dashboard${qs(f)}`);

// ------------------------------------------------------------------ escrituras
type Id = { id: string };

export const useCrearTienda = () =>
  escribir((nombre: string) => api<Tienda>("/tiendas", "POST", { nombre }), (t) => `Tienda «${t.nombre}» creada`);
export const useRenombrarTienda = () =>
  escribir((v: Id & { nombre: string }) => api(`/tiendas/${v.id}`, "PATCH", { nombre: v.nombre }), "Tienda renombrada");
export const useFusionarTiendas = () =>
  escribir((v: Id & { destino_id: string }) => api(`/tiendas/${v.id}/fusionar`, "POST", { destino_id: v.destino_id }), "Tiendas fusionadas");
export const useBorrarTienda = () => escribir((id: string) => api(`/tiendas/${id}`, "DELETE"), "Tienda borrada");

export const useGuardarCompra = () =>
  escribir(
    (v: { id?: string; datos: CompraInput }) => api<Id>(v.id ? `/compras/${v.id}` : "/compras", v.id ? "PUT" : "POST", v.datos),
    (_, v) => (v.id ? "Compra actualizada" : "¡Compra guardada!"),
  );
export const useBorrarCompra = () => escribir((id: string) => api(`/compras/${id}`, "DELETE"), "Compra borrada");

export const useGuardarPrecio = () =>
  escribir((v: Id & { precio_venta_cop: number | null }) =>
    api<InventarioFila>(`/inventario/${v.id}/precio`, "PATCH", { precio_venta_cop: v.precio_venta_cop }),
  );

export const useGuardarEnvio = () =>
  escribir(
    (v: { id?: string; datos: EnvioInput }) => api<Id>(v.id ? `/envios/${v.id}` : "/envios", v.id ? "PUT" : "POST", v.datos),
    (_, v) => (v.id ? "Envío actualizado" : "¡Envío guardado!"),
  );
export const useBorrarEnvio = () => escribir((id: string) => api(`/envios/${id}`, "DELETE"), "Envío borrado");

export const useGuardarVenta = () =>
  escribir(
    (v: { id?: string; datos: VentaInput }) => api<Id>(v.id ? `/ventas/${v.id}` : "/ventas", v.id ? "PUT" : "POST", v.datos),
    (_, v) => (v.id ? "Venta actualizada" : "¡Venta registrada!"),
  );
export const useCambiarEstadoVenta = () =>
  escribir(
    (v: Id & { estado: EstadoVenta }) => api(`/ventas/${v.id}/estado`, "PATCH", { estado: v.estado }),
    (_, v) => (v.estado === "anulada" ? "Venta anulada. Las unidades volvieron al inventario." : "Estado actualizado"),
  );

export const useGuardarCliente = () =>
  escribir(
    (v: { id?: string; datos: ClienteInput }) => api<Cliente>(v.id ? `/clientes/${v.id}` : "/clientes", v.id ? "PATCH" : "POST", v.datos),
    (_, v) => (v.id ? "Cliente actualizado" : "Cliente creado"),
  );

export const useGuardarConfig = () =>
  escribir((utilidad_pct: number) => api<Config>("/config", "PATCH", { utilidad_pct }), "Porcentaje de utilidad actualizado");
