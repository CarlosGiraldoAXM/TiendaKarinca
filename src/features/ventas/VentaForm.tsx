import { Eye, EyeOff, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { totalesVenta } from "@shared/calc";
import { ESTADOS_VENTA, METODOS_PAGO, ventaSchema } from "@shared/schemas";
import type { Cliente, InventarioFila, VentaDetalle } from "@shared/types";
import { Combobox } from "@/components/Combobox";
import { NumeroInput } from "@/components/NumeroInput";
import { Button, Campo, Card, Encabezado, ErrorCarga, Input, ListaSkeleton, Select, Textarea } from "@/components/ui";
import { ClienteDialogo } from "@/features/clientes/ClienteForm";
import { useClientes, useGuardarVenta, useInventario, useVenta } from "@/lib/api";
import { cn, cop, ETIQUETA_CANAL, ETIQUETA_ESTADO, ETIQUETA_PAGO, hoy } from "@/lib/format";
import { useGuardado } from "@/lib/useGuardado";

interface Linea {
  compra_item_id: string;
  unidades: number | null;
  precio_unitario_cop: number | null;
}

export function VentaForm() {
  const { id } = useParams();
  const venta = useVenta(id);
  const inventario = useInventario();
  const clientes = useClientes();

  if (inventario.isPending || clientes.isPending || (id && venta.isPending)) return <ListaSkeleton />;
  const error = inventario.error ?? clientes.error ?? (id ? venta.error : null);
  if (error) return <ErrorCarga error={error} reintentar={() => (inventario.refetch(), clientes.refetch(), venta.refetch())} />;

  return <Formulario key={id ?? "nueva"} id={id} venta={id ? venta.data : undefined} inventario={inventario.data!} clientes={clientes.data!} />;
}

function Formulario({ id, venta, inventario, clientes }: { id?: string; venta?: VentaDetalle; inventario: InventarioFila[]; clientes: Cliente[] }) {
  const navegar = useNavigate();
  const { state } = useLocation() as { state: { cliente_id?: string } | null };
  const guardar = useGuardarVenta();
  const [ultimoVendedor, setUltimoVendedor] = useGuardado("ventas.vendedor", "");
  const [verCostos, setVerCostos] = useGuardado("ventas.verCostos", false);
  const [nuevoCliente, setNuevoCliente] = useState<string | null>(null);

  const [cab, setCab] = useState({
    cliente_id: venta?.cliente_id ?? state?.cliente_id ?? "",
    vendedor: venta?.vendedor ?? ultimoVendedor,
    fecha: venta?.fecha ?? hoy(),
    metodo_pago: venta?.metodo_pago ?? "efectivo",
    estado: venta?.estado ?? "pagada",
    descuento_cop: venta?.descuento_cop ?? (0 as number | null),
    notas: venta?.notas ?? "",
  });
  const [lineas, setLineas] = useState<Linea[]>(
    venta?.lineas.map((l) => ({ compra_item_id: l.compra_item_id, unidades: l.unidades, precio_unitario_cop: l.precio_unitario_cop })) ?? [],
  );

  const porId = useMemo(() => new Map(inventario.map((f) => [f.id, f])), [inventario]);
  // Al editar, las unidades que esta misma venta ya ocupa siguen estando disponibles para ella.
  const propias = useMemo(() => {
    const m = new Map<string, number>();
    if (venta && venta.estado !== "anulada") for (const l of venta.lineas) m.set(l.compra_item_id, (m.get(l.compra_item_id) ?? 0) + l.unidades);
    return m;
  }, [venta]);
  const maximo = (itemId: string) => (porId.get(itemId)?.disponibles ?? 0) + (propias.get(itemId) ?? 0);

  const enVenta = new Set(lineas.map((l) => l.compra_item_id));
  const opcionesProducto = inventario
    .filter((f) => maximo(f.id) > 0 && !enVenta.has(f.id))
    .map((f) => ({
      valor: f.id,
      etiqueta: f.nombre,
      buscar: f.tienda,
      detalle: `${f.tienda} — disponibles ${maximo(f.id)} — ${cop(f.precio_venta_efectivo_cop)}`,
    }));

  const agregar = (itemId: string) => {
    const f = porId.get(itemId)!;
    // Se precarga en pesos enteros; ella puede cambiarlo para esta venta.
    setLineas((ls) => [...ls, { compra_item_id: itemId, unidades: 1, precio_unitario_cop: Math.round(f.precio_venta_efectivo_cop) }]);
  };
  const cambiar = (i: number, cambio: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));

  const totales = totalesVenta(
    {
      descuento_cop: cab.descuento_cop ?? 0,
      items: lineas.map((l) => ({ compra_item_id: l.compra_item_id, unidades: l.unidades ?? 0, precio_unitario_cop: l.precio_unitario_cop ?? 0 })),
    },
    (itemId) => porId.get(itemId)?.costo_total_unitario_cop ?? 0,
  );

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!cab.cliente_id) return toast.error("Elige el cliente de esta venta.");
    if (!lineas.length) return toast.error("Agrega al menos un producto.");
    const pasada = lineas.find((l) => (l.unidades ?? 0) > maximo(l.compra_item_id));
    if (pasada && cab.estado !== "anulada")
      return toast.error(`De «${porId.get(pasada.compra_item_id)?.nombre}» solo quedan ${maximo(pasada.compra_item_id)} unidades.`);
    if (totales.total_cop < 0) return toast.error("El descuento no puede ser mayor que el total de la venta.");

    const r = ventaSchema.safeParse({ ...cab, descuento_cop: cab.descuento_cop ?? 0, items: lineas });
    if (!r.success) {
      const [campo] = r.error.issues[0]!.path;
      return toast.error(campo === "items" ? "Revisa las unidades y el precio de cada producto." : r.error.issues[0]!.message);
    }
    setUltimoVendedor(r.data.vendedor);
    guardar.mutate({ id, datos: r.data }, { onSuccess: (v) => navegar(`/ventas/${v.id}`, { replace: true }) });
  };

  return (
    <form onSubmit={enviar} noValidate>
      <Encabezado titulo={id ? `Editar venta ${venta?.numero ?? ""}` : "Nueva venta"} volver={id ? `/ventas/${id}` : "/ventas"} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="grid gap-4 p-4 sm:grid-cols-2 md:p-5">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Cliente</span>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Combobox
                    opciones={clientes.map((c) => ({
                      valor: c.id,
                      etiqueta: c.nombre,
                      buscar: `${c.telefono ?? ""} ${c.usuario_red ?? ""}`,
                      detalle: [c.telefono, c.usuario_red, ETIQUETA_CANAL[c.canal]].filter(Boolean).join(" · "),
                    }))}
                    valor={cab.cliente_id}
                    onValor={(cliente_id) => setCab({ ...cab, cliente_id })}
                    onCrear={(nombre) => setNuevoCliente(nombre)}
                    placeholder="Buscar cliente…"
                    buscarPlaceholder="Nombre, teléfono o usuario…"
                    vacio="No hay clientes todavía. Escribe un nombre para crearlo."
                  />
                </div>
                <Button variante="secundario" onClick={() => setNuevoCliente("")} aria-label="Nuevo cliente">
                  <UserPlus className="size-5" aria-hidden />
                  <span className="hidden sm:inline">Nuevo</span>
                </Button>
              </div>
            </div>
            <Campo etiqueta="Vendedor">
              <Input value={cab.vendedor} onChange={(e) => setCab({ ...cab, vendedor: e.target.value })} placeholder="¿Quién vendió?" autoComplete="off" />
            </Campo>
            <Campo etiqueta="Fecha">
              <Input type="date" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} />
            </Campo>
          </Card>

          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Productos</h2>
            <Combobox
              opciones={opcionesProducto}
              onValor={agregar}
              mantenerAbierto
              buscarPlaceholder="Buscar producto o tienda…"
              vacio={inventario.some((f) => f.disponibles > 0) ? "Sin resultados" : "No hay productos con unidades disponibles."}
              disparador={
                <button
                  type="button"
                  className="flex h-13 w-full items-center gap-3 rounded-xl border-2 border-dashed border-marca/40 bg-marca-suave/40 px-4 font-medium text-marca-oscura hover:bg-marca-suave"
                >
                  <Search className="size-5" aria-hidden />
                  Agregar producto…
                </button>
              }
            />

            <div className="mt-3 space-y-2.5">
              {lineas.map((l, i) => {
                const f = porId.get(l.compra_item_id);
                const max = maximo(l.compra_item_id);
                const u = l.unidades ?? 0;
                const pasada = u > max && cab.estado !== "anulada";
                return (
                  <Card key={l.compra_item_id} className={cn("p-3.5", pasada && "border-rojo/50")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium leading-snug">{f?.nombre ?? "Producto"}</h3>
                        <p className={cn("text-sm text-suave", pasada && "font-medium text-rojo")}>
                          {f?.tienda} · {pasada ? `solo quedan ${max}` : `${max} disponibles`}
                        </p>
                      </div>
                      <Button
                        variante="fantasma"
                        tam="iconoSm"
                        className="-mr-1.5 -mt-1 hover:bg-rojo-suave hover:text-rojo"
                        onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                        aria-label={`Quitar ${f?.nombre}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Button variante="secundario" tam="icono" onClick={() => cambiar(i, { unidades: Math.max(1, u - 1) })} disabled={u <= 1} aria-label="Quitar una unidad">
                          <Minus className="size-4" />
                        </Button>
                        <div className="w-14">
                          <NumeroInput tipo="entero" valor={l.unidades} onValor={(unidades) => cambiar(i, { unidades })} className="text-center" aria-label="Unidades" aria-invalid={pasada || u < 1} />
                        </div>
                        <Button variante="secundario" tam="icono" onClick={() => cambiar(i, { unidades: Math.min(max, u + 1) })} disabled={u >= max} aria-label="Agregar una unidad">
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <div className="flex items-end gap-3">
                        <label className="w-32">
                          <span className="mb-1 block text-xs text-suave">Precio c/u</span>
                          <NumeroInput tipo="cop" valor={l.precio_unitario_cop} onValor={(precio_unitario_cop) => cambiar(i, { precio_unitario_cop })} />
                        </label>
                        <div className="min-w-24 pb-2.5 text-right font-semibold tabular-nums">{cop(u * (l.precio_unitario_cop ?? 0))}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card className="grid gap-4 p-4 sm:grid-cols-3 md:p-5">
            <Campo etiqueta="Método de pago">
              <Select value={cab.metodo_pago} onChange={(e) => setCab({ ...cab, metodo_pago: e.target.value as typeof cab.metodo_pago })}>
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_PAGO[m]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Estado">
              <Select value={cab.estado} onChange={(e) => setCab({ ...cab, estado: e.target.value as typeof cab.estado })}>
                {ESTADOS_VENTA.filter((e) => e !== "anulada" || venta?.estado === "anulada").map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETA_ESTADO[e]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Descuento">
              <NumeroInput tipo="cop" valor={cab.descuento_cop} onValor={(descuento_cop) => setCab({ ...cab, descuento_cop })} />
            </Campo>
            <Campo etiqueta="Notas (opcional)" className="sm:col-span-3">
              <Textarea value={cab.notas} onChange={(e) => setCab({ ...cab, notas: e.target.value })} />
            </Campo>
          </Card>
        </div>

        {/* Resumen en vivo */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Resumen</h2>
              <Button variante="fantasma" tam="sm" onClick={() => setVerCostos(!verCostos)} aria-pressed={verCostos}>
                {verCostos ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                {verCostos ? "Ocultar ganancia" : "Ver ganancia"}
              </Button>
            </div>
            <dl className="space-y-2 tabular-nums">
              <Renglon etiqueta="Subtotal" valor={cop(totales.subtotal_cop)} />
              {!!cab.descuento_cop && <Renglon etiqueta="Descuento" valor={`− ${cop(cab.descuento_cop)}`} />}
              <div className="flex items-baseline justify-between border-t border-borde pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="font-display text-3xl font-semibold">{cop(totales.total_cop)}</dd>
              </div>
              {verCostos && (
                <div className="aparecer space-y-2 border-t border-dashed border-borde pt-3 text-sm">
                  <Renglon etiqueta="Costo" valor={cop(totales.costo_cop)} suave />
                  <div className="flex items-baseline justify-between">
                    <dt className="text-suave">Utilidad estimada</dt>
                    <dd className={cn("text-base font-semibold", totales.utilidad_cop < 0 ? "text-rojo" : "text-verde")}>{cop(totales.utilidad_cop)}</dd>
                  </div>
                </div>
              )}
            </dl>
            <Button type="submit" tam="lg" className="mt-5 w-full" cargando={guardar.isPending}>
              {id ? "Guardar cambios" : "Registrar venta"}
            </Button>
          </Card>
        </aside>
      </div>

      <ClienteDialogo
        abierto={nuevoCliente !== null}
        nombreInicial={nuevoCliente ?? ""}
        onCerrar={() => setNuevoCliente(null)}
        onGuardado={(c) => setCab((actual) => ({ ...actual, cliente_id: c.id }))}
      />
    </form>
  );
}

const Renglon = ({ etiqueta, valor, suave }: { etiqueta: string; valor: string; suave?: boolean }) => (
  <div className="flex items-baseline justify-between">
    <dt className="text-suave">{etiqueta}</dt>
    <dd className={cn(!suave && "font-medium")}>{valor}</dd>
  </div>
);
