import { ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Encabezado, ErrorCarga, ListaSkeleton, Vacio } from "@/components/ui";
import { useCompras } from "@/lib/api";
import { cop, fecha, num, usd } from "@/lib/format";

export function ComprasLista() {
  const { data, error, isPending, refetch } = useCompras();

  return (
    <>
      <Encabezado titulo="Compras" descripcion="Lo que se ha comprado en cada tienda.">
        <Button asChild>
          <Link to="/compras/nueva">
            <Plus className="size-5" aria-hidden />
            Nueva compra
          </Link>
        </Button>
      </Encabezado>

      {isPending ? (
        <ListaSkeleton />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : !data.length ? (
        <Vacio icono={<ShoppingCart />} titulo="Aún no tienes compras" texto="Carga la primera y empieza a armar tu inventario.">
          <Button asChild tam="lg">
            <Link to="/compras/nueva">¡Cargar la primera!</Link>
          </Button>
        </Vacio>
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <Link key={c.id} to={`/compras/${c.id}`} className="block">
              <Card className="flex items-center gap-4 p-4 transition-colors hover:border-[#d4c6b2] hover:bg-white">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="truncate text-base font-semibold">{c.tienda}</h2>
                    <span className="text-sm text-suave">{fecha(c.fecha)}</span>
                  </div>
                  <p className="mt-1 text-sm text-suave">
                    {c.num_items} {c.num_items === 1 ? "producto" : "productos"} · {c.unidades} unidades · TRM {num(c.trm)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{cop(c.total_cop)}</div>
                  <div className="text-sm tabular-nums text-suave">{usd(c.total_usd)}</div>
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
