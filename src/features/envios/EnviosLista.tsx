import { ChevronRight, Plus, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Encabezado, ErrorCarga, ListaSkeleton, Vacio } from "@/components/ui";
import { useEnvios } from "@/lib/api";
import { cop, fecha, usd } from "@/lib/format";

export function EnviosLista() {
  const { data, error, isPending, refetch } = useEnvios();

  return (
    <>
      <Encabezado titulo="Envíos" descripcion="Lo que costó traer la mercancía. Se reparte entre los productos.">
        <Button asChild>
          <Link to="/envios/nuevo">
            <Plus className="size-5" aria-hidden />
            Nuevo envío
          </Link>
        </Button>
      </Encabezado>

      {isPending ? (
        <ListaSkeleton />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : !data.length ? (
        <Vacio icono={<Truck />} titulo="Aún no hay envíos" texto="Registra un envío para repartir su costo entre los productos que trajo.">
          <Button asChild tam="lg">
            <Link to="/envios/nuevo">Registrar un envío</Link>
          </Button>
        </Vacio>
      ) : (
        <div className="space-y-3">
          {data.map((e) => (
            <Link key={e.id} to={`/envios/${e.id}`} className="block">
              <Card className="flex items-center gap-4 p-4 transition-colors hover:border-[#d4c6b2] hover:bg-white">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="truncate text-base font-semibold">{e.descripcion || "Envío"}</h2>
                    <span className="text-sm text-suave">{fecha(e.fecha)}</span>
                  </div>
                  <p className="mt-1 text-sm text-suave">
                    {e.num_items} {e.num_items === 1 ? "producto" : "productos"} · {e.unidades} unidades
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{cop(e.valor_cop)}</div>
                  <div className="text-sm tabular-nums text-suave">{usd(e.valor_usd)}</div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-suave" aria-hidden />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
