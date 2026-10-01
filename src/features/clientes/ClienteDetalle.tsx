import { Pencil, Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, Encabezado, ErrorCarga, EstadoChip, ListaSkeleton, Vacio } from "@/components/ui";
import { useCliente } from "@/lib/api";
import { cop, ETIQUETA_CANAL, fecha } from "@/lib/format";
import { ClienteDialogo } from "./ClienteForm";

export function ClienteDetalle() {
  const { id } = useParams();
  const { data: c, error, isPending, refetch } = useCliente(id);
  const [editando, setEditando] = useState(false);

  if (isPending) return <ListaSkeleton />;
  if (error) return <ErrorCarga error={error} reintentar={refetch} />;

  return (
    <>
      <Encabezado titulo={c.nombre} volver="/clientes">
        <Button variante="secundario" onClick={() => setEditando(true)}>
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      </Encabezado>

      <Card className="mb-6 grid gap-4 p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-4">
        <div>
          <div className="text-sm text-suave">Total comprado</div>
          <div className="font-display text-2xl font-semibold tabular-nums">{cop(c.total_comprado_cop ?? 0)}</div>
          <div className="text-sm text-suave">
            en {c.num_ventas} {c.num_ventas === 1 ? "compra" : "compras"}
          </div>
        </div>
        <div>
          <div className="text-sm text-suave">Teléfono</div>
          <div className="font-medium">{c.telefono || "—"}</div>
        </div>
        <div>
          <div className="text-sm text-suave">Llegó por</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge tono="marca">{ETIQUETA_CANAL[c.canal]}</Badge>
            {c.usuario_red && <span className="font-medium">{c.usuario_red}</span>}
          </div>
        </div>
        <div>
          <div className="text-sm text-suave">Notas</div>
          <div className="whitespace-pre-wrap">{c.notas || "—"}</div>
        </div>
      </Card>

      <h2 className="mb-3 font-display text-lg font-semibold">Historial de compras</h2>
      {!c.ventas.length ? (
        <Vacio icono={<Receipt />} titulo="Todavía no ha comprado" texto="Cuando le registres una venta aparecerá aquí.">
          <Button asChild>
            <Link to="/ventas/nueva" state={{ cliente_id: c.id }}>
              <Plus className="size-5" aria-hidden />
              Registrar venta
            </Link>
          </Button>
        </Vacio>
      ) : (
        <div className="space-y-2.5">
          {c.ventas.map((v) => (
            <Link key={v.id} to={`/ventas/${v.id}`} className="block">
              <Card className="flex items-center gap-4 p-4 transition-colors hover:border-[#d4c6b2] hover:bg-white">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{v.numero}</span>
                    <EstadoChip estado={v.estado} />
                  </div>
                  <p className="mt-0.5 text-sm text-suave">
                    {fecha(v.fecha)} · {v.unidades} {v.unidades === 1 ? "unidad" : "unidades"}
                  </p>
                </div>
                <div className="font-semibold tabular-nums">{cop(v.total_cop)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ClienteDialogo abierto={editando} onCerrar={() => setEditando(false)} cliente={c} />
    </>
  );
}
