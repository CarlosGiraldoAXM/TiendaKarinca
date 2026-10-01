import { Ban, Check, Copy, PackageCheck, Pencil, Printer, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { EstadoVenta, VentaDetalle as Venta } from "@shared/types";
import { Button, Card, Confirmar, Encabezado, ErrorCarga, EstadoChip, ListaSkeleton } from "@/components/ui";
import { useCambiarEstadoVenta, useVenta } from "@/lib/api";
import { cn, cop, ETIQUETA_ESTADO, ETIQUETA_PAGO, fecha } from "@/lib/format";

/** Texto del comprobante para pegar en WhatsApp. Sin costos ni utilidad. */
function resumenWhatsApp(v: Venta): string {
  const lineas = v.lineas.map((l) => `• ${l.unidades} × ${l.nombre} — ${cop(l.subtotal_cop)}`);
  return [
    `*Comprobante ${v.numero}*`,
    `${fecha(v.fecha)}`,
    `Cliente: ${v.cliente}`,
    "",
    ...lineas,
    "",
    ...(v.descuento_cop > 0 ? [`Subtotal: ${cop(v.subtotal_cop)}`, `Descuento: − ${cop(v.descuento_cop)}`] : []),
    `*Total: ${cop(v.total_cop)}*`,
    `Pago: ${ETIQUETA_PAGO[v.metodo_pago]}${v.estado === "pendiente" ? " (pendiente)" : ""}`,
    "",
    "¡Gracias por tu compra! 💛",
  ].join("\n");
}

export function VentaDetalle() {
  const { id } = useParams();
  const { data: v, error, isPending, refetch } = useVenta(id);
  const cambiar = useCambiarEstadoVenta();
  const [anular, setAnular] = useState(false);

  if (isPending) return <ListaSkeleton />;
  if (error) return <ErrorCarga error={error} reintentar={refetch} />;

  const pasarA = (estado: EstadoVenta) => cambiar.mutate({ id: v.id, estado });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resumenWhatsApp(v));
      toast.success("Resumen copiado. Pégalo en WhatsApp.");
    } catch {
      toast.error("No se pudo copiar. Inténtalo de nuevo.");
    }
  };

  return (
    <>
      <Encabezado titulo={`Venta ${v.numero}`} volver="/ventas">
        <Button asChild variante="secundario">
          <Link to={`/ventas/${v.id}/editar`}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Link>
        </Button>
      </Encabezado>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Comprobante: es lo único que se imprime. */}
        <Card className={cn("p-5 md:p-7 print:border-0 print:p-0 print:shadow-none", v.estado === "anulada" && "opacity-70")}>
          <div className="flex items-start justify-between gap-4 border-b border-borde pb-4">
            <div>
              <div className="font-display text-2xl font-semibold">Karinca</div>
              <div className="text-sm text-suave">Comprobante de venta</div>
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-semibold tabular-nums">{v.numero}</div>
              <div className="text-sm text-suave">{fecha(v.fecha)}</div>
              <div className="mt-1 print:hidden">
                <EstadoChip estado={v.estado} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-b border-borde py-4 text-sm">
            <div>
              <dt className="text-suave">Cliente</dt>
              <dd className="font-medium">
                <Link to={`/clientes/${v.cliente_id}`} className="underline-offset-2 hover:underline print:no-underline">
                  {v.cliente}
                </Link>
              </dd>
              {v.cliente_telefono && <dd className="text-suave">{v.cliente_telefono}</dd>}
            </div>
            <div className="text-right">
              <dt className="text-suave">Vendedor</dt>
              <dd className="font-medium">{v.vendedor || "—"}</dd>
            </div>
          </dl>

          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-suave">
                <th className="py-3 font-medium">Producto</th>
                <th className="px-2 py-3 text-right font-medium">Cant.</th>
                <th className="hidden px-2 py-3 text-right font-medium sm:table-cell print:table-cell">Precio</th>
                <th className="py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.lineas.map((l) => (
                <tr key={l.id} className="border-t border-borde/60">
                  <td className="py-2.5 pr-2">
                    <div className="font-medium">{l.nombre}</div>
                    <div className="text-xs text-suave sm:hidden print:hidden">{cop(l.precio_unitario_cop)} c/u</div>
                  </td>
                  <td className="px-2 py-2.5 text-right">{l.unidades}</td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell print:table-cell">{cop(l.precio_unitario_cop)}</td>
                  <td className="py-2.5 text-right font-medium">{cop(l.subtotal_cop)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-2 space-y-1.5 border-t border-borde pt-4 tabular-nums">
            {v.descuento_cop > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <dt className="text-suave">Subtotal</dt>
                  <dd>{cop(v.subtotal_cop)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-suave">Descuento</dt>
                  <dd>− {cop(v.descuento_cop)}</dd>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between">
              <dt className="font-semibold">Total</dt>
              <dd className="font-display text-3xl font-semibold">{cop(v.total_cop)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-suave">Método de pago</dt>
              <dd className="font-medium">{ETIQUETA_PAGO[v.metodo_pago]}</dd>
            </div>
          </dl>
          {v.notas && <p className="mt-4 whitespace-pre-wrap border-t border-borde pt-3 text-sm text-suave print:hidden">{v.notas}</p>}
        </Card>

        <aside className="no-print space-y-4">
          <Card className="grid gap-2 p-4">
            <Button onClick={copiar}>
              <Copy className="size-4" aria-hidden />
              Copiar resumen para WhatsApp
            </Button>
            <Button variante="secundario" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Imprimir comprobante
            </Button>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Estado: {ETIQUETA_ESTADO[v.estado]}</h2>
            <p className="mb-3 text-sm text-suave">
              {
                {
                  pendiente: "Aún no ha pagado. Las unidades ya están apartadas.",
                  pagada: "Ya pagó. Falta entregar.",
                  entregada: "Pagó y ya se entregó.",
                  anulada: "No cuenta para nada. Las unidades volvieron al inventario.",
                }[v.estado]
              }
            </p>
            <div className="grid gap-2">
              {v.estado === "pendiente" && (
                <Button variante="suave" cargando={cambiar.isPending} onClick={() => pasarA("pagada")}>
                  <Check className="size-4" aria-hidden />
                  Marcar como pagada
                </Button>
              )}
              {(v.estado === "pendiente" || v.estado === "pagada") && (
                <Button variante="suave" cargando={cambiar.isPending} onClick={() => pasarA("entregada")}>
                  <PackageCheck className="size-4" aria-hidden />
                  Marcar como entregada
                </Button>
              )}
              {v.estado === "entregada" && (
                <Button variante="secundario" cargando={cambiar.isPending} onClick={() => pasarA("pagada")}>
                  Volver a «pagada»
                </Button>
              )}
              {v.estado === "anulada" ? (
                <Button variante="secundario" cargando={cambiar.isPending} onClick={() => pasarA("pendiente")}>
                  <RotateCcw className="size-4" aria-hidden />
                  Reactivar como pendiente
                </Button>
              ) : (
                <Button variante="fantasma" className="text-rojo hover:bg-rojo-suave hover:text-rojo" onClick={() => setAnular(true)}>
                  <Ban className="size-4" aria-hidden />
                  Anular venta
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Solo para ti</h2>
            <dl className="space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-suave">Costo de lo vendido</dt>
                <dd>{cop(v.costo_cop)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-suave">Utilidad</dt>
                <dd className={cn("font-semibold", v.utilidad_cop < 0 ? "text-rojo" : "text-verde")}>{cop(v.utilidad_cop)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-suave">Se recalcula si cambia el costo de envío de estos productos.</p>
          </Card>
        </aside>
      </div>

      <Confirmar
        abierto={anular}
        onCerrar={() => setAnular(false)}
        onConfirmar={() => cambiar.mutate({ id: v.id, estado: "anulada" }, { onSettled: () => setAnular(false) })}
        cargando={cambiar.isPending}
        titulo={`¿Anular la venta ${v.numero}?`}
        texto="Dejará de contar en las ventas y sus unidades volverán al inventario. Podrás reactivarla después si aún hay unidades."
        accion="Sí, anular"
      />
    </>
  );
}
