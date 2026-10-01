import { ChevronRight, Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ESTADOS_VENTA } from "@shared/schemas";
import { Button, Card, Encabezado, ErrorCarga, EstadoChip, Input, ListaSkeleton, Select, Vacio } from "@/components/ui";
import { useClientes, useVentas } from "@/lib/api";
import { cn, cop, ETIQUETA_ESTADO, ETIQUETA_PAGO, fecha } from "@/lib/format";

const SIN_FILTROS = { estado: "", desde: "", hasta: "", cliente_id: "" };

export function VentasLista() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const { data, error, isPending, refetch } = useVentas(filtros);
  const clientes = useClientes();
  const filtrando = Object.values(filtros).some(Boolean);
  const total = (data ?? []).filter((v) => v.estado !== "anulada").reduce((a, v) => a + v.total_cop, 0);

  return (
    <>
      <Encabezado titulo="Ventas" descripcion="Todo lo que se ha vendido.">
        <Button asChild className="hidden md:inline-flex">
          <Link to="/ventas/nueva">
            <Plus className="size-5" aria-hidden />
            Nueva venta
          </Link>
        </Button>
      </Encabezado>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-[10rem_minmax(0,1fr)_10rem_10rem_auto]">
        <Select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS_VENTA.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </Select>
        <Select value={filtros.cliente_id} onChange={(e) => setFiltros({ ...filtros, cliente_id: e.target.value })} aria-label="Cliente">
          <option value="">Todos los clientes</option>
          {clientes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} aria-label="Desde" title="Desde" />
        <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} aria-label="Hasta" title="Hasta" />
        {filtrando && (
          <Button variante="fantasma" className="col-span-2 lg:col-span-1" onClick={() => setFiltros(SIN_FILTROS)}>
            Quitar filtros
          </Button>
        )}
      </div>

      {isPending ? (
        <ListaSkeleton />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : !data.length ? (
        filtrando ? (
          <Vacio icono={<Receipt />} titulo="No hay ventas con esos filtros" texto="Prueba con otras fechas o quita los filtros." />
        ) : (
          <Vacio icono={<Receipt />} titulo="Aún no has vendido nada" texto="Registra tu primera venta y el inventario se descuenta solo.">
            <Button asChild tam="lg">
              <Link to="/ventas/nueva">Registrar la primera venta</Link>
            </Button>
          </Vacio>
        )
      ) : (
        <>
          <p className="mb-3 px-1 text-sm text-suave">
            {data.length} {data.length === 1 ? "venta" : "ventas"} · <span className="font-semibold text-tinta">{cop(total)}</span>
            <span className="hidden sm:inline"> (sin contar anuladas)</span>
          </p>
          <div className="space-y-2.5">
            {data.map((v) => (
              <Link key={v.id} to={`/ventas/${v.id}`} className="block">
                <Card className={cn("flex items-center gap-3 p-4 transition-colors hover:border-[#d4c6b2] hover:bg-white", v.estado === "anulada" && "opacity-65")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold tabular-nums text-suave">{v.numero}</span>
                      <h2 className="truncate font-semibold">{v.cliente}</h2>
                      <EstadoChip estado={v.estado} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-suave">
                      {fecha(v.fecha)} · {ETIQUETA_PAGO[v.metodo_pago]}
                      {v.vendedor && ` · ${v.vendedor}`}
                    </p>
                  </div>
                  <div className={cn("font-semibold tabular-nums", v.estado === "anulada" && "line-through")}>{cop(v.total_cop)}</div>
                  <ChevronRight className="size-5 shrink-0 text-suave" aria-hidden />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
