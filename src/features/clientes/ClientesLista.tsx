import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Encabezado, ErrorCarga, Input, ListaSkeleton, Vacio } from "@/components/ui";
import { useClientes } from "@/lib/api";
import { coincide, cop, ETIQUETA_CANAL } from "@/lib/format";
import { ClienteDialogo } from "./ClienteForm";

export function ClientesLista() {
  const { data, error, isPending, refetch } = useClientes();
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const filtrados = (data ?? []).filter((c) => coincide(q, c.nombre, c.telefono, c.usuario_red));

  return (
    <>
      <Encabezado titulo="Clientes" descripcion="Tu directorio de compradores.">
        <Button onClick={() => setNuevo(true)}>
          <Plus className="size-5" aria-hidden />
          Nuevo cliente
        </Button>
      </Encabezado>

      {isPending ? (
        <ListaSkeleton />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : !data.length ? (
        <Vacio icono={<Users />} titulo="Aún no tienes clientes" texto="Puedes crearlos aquí o al momento de registrar una venta.">
          <Button tam="lg" onClick={() => setNuevo(true)}>
            Crear el primero
          </Button>
        </Vacio>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-suave" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o usuario…" className="pl-9" />
          </div>
          <div className="space-y-2.5">
            {filtrados.map((c) => (
              <Link key={c.id} to={`/clientes/${c.id}`} className="block">
                <Card className="flex items-center gap-4 p-4 transition-colors hover:border-[#d4c6b2] hover:bg-white">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-marca-suave font-display text-lg font-semibold text-marca-oscura">
                    {c.nombre.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="truncate font-semibold">{c.nombre}</h2>
                      <Badge>{ETIQUETA_CANAL[c.canal]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-suave">{[c.telefono, c.usuario_red].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{cop(c.total_comprado_cop ?? 0)}</div>
                    <div className="text-sm text-suave">
                      {c.num_ventas} {c.num_ventas === 1 ? "compra" : "compras"}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-suave" aria-hidden />
                </Card>
              </Link>
            ))}
            {!filtrados.length && <p className="py-8 text-center text-sm text-suave">Ningún cliente coincide con «{q}».</p>}
          </div>
        </>
      )}

      <ClienteDialogo abierto={nuevo} onCerrar={() => setNuevo(false)} />
    </>
  );
}
