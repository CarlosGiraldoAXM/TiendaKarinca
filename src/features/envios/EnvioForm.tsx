import { PackageCheck, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { prorratearEnvio } from "@shared/calc";
import { envioSchema } from "@shared/schemas";
import type { EnvioDetalle, InventarioFila } from "@shared/types";
import { NumeroInput } from "@/components/NumeroInput";
import { Button, Campo, Card, Checkbox, Confirmar, Encabezado, ErrorCarga, Input, ListaSkeleton, Select, Textarea, Vacio } from "@/components/ui";
import { useBorrarEnvio, useEnvio, useGuardarEnvio, useInventario } from "@/lib/api";
import { cn, coincide, cop, fecha, hoy, pct, usd } from "@/lib/format";

export function EnvioForm() {
  const { id } = useParams();
  const envio = useEnvio(id);
  const inventario = useInventario();

  if (inventario.isPending || (id && envio.isPending)) return <ListaSkeleton />;
  if (inventario.error) return <ErrorCarga error={inventario.error} reintentar={inventario.refetch} />;
  if (id && envio.error) return <ErrorCarga error={envio.error} reintentar={envio.refetch} />;

  return <Formulario key={id ?? "nuevo"} id={id} envio={id ? envio.data : undefined} inventario={inventario.data} />;
}

function Formulario({ id, envio, inventario }: { id?: string; envio?: EnvioDetalle; inventario: InventarioFila[] }) {
  const navegar = useNavigate();
  const guardar = useGuardarEnvio();
  const borrar = useBorrarEnvio();
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const [cab, setCab] = useState({
    fecha: envio?.fecha ?? hoy(),
    descripcion: envio?.descripcion ?? "",
    valor_usd: envio?.valor_usd ?? (null as number | null),
    valor_cop: envio?.valor_cop ?? (null as number | null),
    notas: envio?.notas ?? "",
  });
  /** compra_item_id → unidades que van en este envío */
  const [sel, setSel] = useState<Map<string, number>>(() => new Map(envio?.lineas.map((l) => [l.compra_item_id, l.unidades])));
  const [filtro, setFiltro] = useState({ q: "", tienda: "", compra: "" });

  // Lo que este mismo envío ya ocupa vuelve a estar disponible mientras se edita.
  const enEsteEnvio = useMemo(() => new Map(envio?.lineas.map((l) => [l.compra_item_id, l.unidades])), [envio]);
  const candidatos = useMemo(
    () =>
      inventario
        .map((f) => ({ ...f, maximo: f.pendientes_envio + (enEsteEnvio.get(f.id) ?? 0) }))
        .filter((f) => f.maximo > 0),
    [inventario, enEsteEnvio],
  );
  const compras = useMemo(() => {
    const m = new Map<string, { id: string; tienda: string; fecha: string }>();
    for (const f of candidatos) m.set(f.compra_id, { id: f.compra_id, tienda: f.tienda, fecha: f.fecha_compra });
    return [...m.values()];
  }, [candidatos]);
  const tiendas = [...new Set(candidatos.map((f) => f.tienda))];
  const visibles = candidatos.filter(
    (f) => (!filtro.tienda || f.tienda === filtro.tienda) && (!filtro.compra || f.compra_id === filtro.compra) && coincide(filtro.q, f.nombre, f.tienda),
  );
  const grupos = compras
    .map((c) => ({ ...c, items: visibles.filter((f) => f.compra_id === c.id) }))
    .filter((g) => g.items.length);

  const cambiar = (itemId: string, unidades: number | null) =>
    setSel((s) => {
      const n = new Map(s);
      if (unidades === null) n.delete(itemId);
      else n.set(itemId, unidades);
      return n;
    });
  const marcarGrupo = (items: typeof candidatos, marcar: boolean) =>
    setSel((s) => {
      const n = new Map(s);
      for (const f of items) marcar ? n.set(f.id, n.get(f.id) || f.maximo) : n.delete(f.id);
      return n;
    });

  // Vista previa en vivo: la misma fórmula que usa la base de datos (shared/calc.ts).
  const lineas = useMemo(() => {
    const elegidos = candidatos.filter((f) => (sel.get(f.id) ?? 0) > 0);
    const prorrateo = prorratearEnvio(
      { valor_cop: cab.valor_cop ?? 0, valor_usd: cab.valor_usd ?? 0 },
      elegidos.map((f) => ({ clave: f.id, unidades: sel.get(f.id)!, costo_unitario_cop: f.costo_unitario_cop })),
    );
    return prorrateo.map((l, i) => ({ ...l, nombre: elegidos[i]!.nombre, tienda: elegidos[i]!.tienda }));
  }, [candidatos, sel, cab.valor_cop, cab.valor_usd]);
  const total = {
    unidades: lineas.reduce((a, l) => a + l.unidades, 0),
    valor: lineas.reduce((a, l) => a + l.valor_linea_cop, 0),
    participacion: lineas.reduce((a, l) => a + l.participacion, 0),
    asignado: lineas.reduce((a, l) => a + l.envio_asignado_cop, 0),
  };
  const excedidos = candidatos.filter((f) => (sel.get(f.id) ?? 0) > f.maximo);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (excedidos.length) return toast.error(`«${excedidos[0]!.nombre}» solo tiene ${excedidos[0]!.maximo} unidades por enviar.`);
    const r = envioSchema.safeParse({
      ...cab,
      items: [...sel].filter(([, u]) => u > 0).map(([compra_item_id, unidades]) => ({ compra_item_id, unidades })),
    });
    if (!r.success) {
      const campo = r.error.issues[0]!.path[0];
      return toast.error(
        campo === "valor_usd" || campo === "valor_cop" ? "Escribe cuánto costó el envío, en dólares y en pesos." : r.error.issues[0]!.message,
      );
    }
    guardar.mutate({ id, datos: r.data }, { onSuccess: () => navegar("/envios") });
  };

  return (
    <form onSubmit={enviar} noValidate>
      <Encabezado titulo={id ? "Editar envío" : "Nuevo envío"} volver="/envios">
        {id && (
          <Button variante="fantasma" className="text-rojo hover:bg-rojo-suave hover:text-rojo" onClick={() => setConfirmarBorrar(true)}>
            <Trash2 className="size-4" aria-hidden />
            Borrar
          </Button>
        )}
      </Encabezado>

      <Card className="mb-6 grid gap-4 p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-4">
        <Campo etiqueta="Fecha">
          <Input type="date" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Descripción (opcional)" ayuda="Guía o transportadora">
          <Input value={cab.descripcion} onChange={(e) => setCab({ ...cab, descripcion: e.target.value })} placeholder="Ej.: Guía 12345" />
        </Campo>
        <Campo etiqueta="Valor en dólares">
          <NumeroInput tipo="usd" valor={cab.valor_usd} onValor={(valor_usd) => setCab({ ...cab, valor_usd })} placeholder="0,00" />
        </Campo>
        <Campo etiqueta="Valor en pesos" ayuda="Lo que pagaste de verdad en pesos">
          <NumeroInput tipo="cop" valor={cab.valor_cop} onValor={(valor_cop) => setCab({ ...cab, valor_cop })} placeholder="0" />
        </Campo>
        <Campo etiqueta="Notas (opcional)" className="sm:col-span-2 lg:col-span-4">
          <Textarea value={cab.notas} onChange={(e) => setCab({ ...cab, notas: e.target.value })} />
        </Campo>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section>
          <h2 className="font-display text-lg font-semibold">¿Qué productos vienen en este envío?</h2>
          <p className="mb-3 text-sm text-suave">Solo aparecen los que tienen unidades sin envío.</p>

          {!candidatos.length ? (
            <Vacio icono={<PackageCheck />} titulo="Todo ya tiene envío" texto="No quedan productos con unidades pendientes por enviar." />
          ) : (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <div className="relative sm:col-span-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-suave" aria-hidden />
                  <Input type="search" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} placeholder="Buscar producto…" className="pl-9" />
                </div>
                <Select value={filtro.tienda} onChange={(e) => setFiltro({ ...filtro, tienda: e.target.value, compra: "" })} aria-label="Tienda">
                  <option value="">Todas las tiendas</option>
                  {tiendas.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Select value={filtro.compra} onChange={(e) => setFiltro({ ...filtro, compra: e.target.value })} aria-label="Compra" className="sm:col-span-2">
                  <option value="">Todas las compras</option>
                  {compras
                    .filter((c) => !filtro.tienda || c.tienda === filtro.tienda)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tienda} · {fecha(c.fecha)}
                      </option>
                    ))}
                </Select>
              </div>

              <div className="space-y-3">
                {grupos.map((g) => {
                  const todos = g.items.every((f) => (sel.get(f.id) ?? 0) > 0);
                  return (
                    <Card key={g.id} className="overflow-hidden">
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-borde bg-arena/50 px-3.5 py-2">
                        <Checkbox checked={todos} onChange={(e) => marcarGrupo(g.items, e.target.checked)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{g.tienda}</span>
                          <span className="block text-xs text-suave">Compra del {fecha(g.fecha)} · seleccionar todos</span>
                        </span>
                      </label>
                      <ul className="divide-y divide-borde/60">
                        {g.items.map((f) => {
                          const u = sel.get(f.id);
                          const marcado = u !== undefined;
                          return (
                            <li key={f.id} className={cn("flex items-center gap-3 px-3.5 py-2", marcado && "bg-marca-suave/25")}>
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                                <Checkbox checked={marcado} onChange={(e) => cambiar(f.id, e.target.checked ? f.maximo : null)} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{f.nombre}</span>
                                  <span className="block text-xs text-suave">
                                    {f.maximo} por enviar · {cop(f.costo_unitario_cop)} c/u
                                  </span>
                                </span>
                              </label>
                              {marcado && (
                                <div className="w-16 shrink-0">
                                  <NumeroInput
                                    tipo="entero"
                                    valor={u}
                                    onValor={(n) => cambiar(f.id, n ?? 0)}
                                    className="h-9"
                                    aria-label={`Unidades de ${f.nombre}`}
                                    aria-invalid={(u ?? 0) > f.maximo || (u ?? 0) < 1}
                                  />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  );
                })}
                {!grupos.length && <p className="py-6 text-center text-sm text-suave">Nada coincide con la búsqueda.</p>}
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">Así se reparte el costo del envío</h2>
          <p className="mb-3 text-sm text-suave">Cada producto asume una parte según lo que vale dentro del envío.</p>
          <Card className="overflow-x-auto">
            {!lineas.length ? (
              <p className="px-4 py-10 text-center text-sm text-suave">Selecciona productos para ver cómo se reparte.</p>
            ) : (
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-borde text-xs uppercase tracking-wide text-suave">
                    <th className="px-3.5 py-2.5 text-left font-medium">Producto</th>
                    <th className="px-2 py-2.5 text-right font-medium">Unid.</th>
                    <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Valor</th>
                    <th className="px-2 py-2.5 text-right font-medium">%</th>
                    <th className="px-2 py-2.5 text-right font-medium">Envío</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">Por unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.clave} className="border-b border-borde/60">
                      <td className="max-w-44 px-3.5 py-2">
                        <div className="truncate font-medium" title={l.nombre}>
                          {l.nombre}
                        </div>
                        <div className="text-xs text-suave">{l.tienda}</div>
                      </td>
                      <td className="px-2 py-2 text-right">{l.unidades}</td>
                      <td className="hidden px-2 py-2 text-right sm:table-cell">{cop(l.valor_linea_cop)}</td>
                      <td className="px-2 py-2 text-right text-suave">{pct(l.participacion)}</td>
                      <td className="px-2 py-2 text-right">{cop(l.envio_asignado_cop)}</td>
                      <td className="px-3.5 py-2 text-right font-semibold">{cop(l.envio_por_unidad_cop)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-arena/50 font-semibold">
                    <td className="px-3.5 py-2.5">Total</td>
                    <td className="px-2 py-2.5 text-right">{total.unidades}</td>
                    <td className="hidden px-2 py-2.5 text-right sm:table-cell">{cop(total.valor)}</td>
                    <td className="px-2 py-2.5 text-right">{pct(total.participacion)}</td>
                    <td className="px-2 py-2.5 text-right">{cop(total.asignado)}</td>
                    <td className="px-3.5 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-borde bg-papel/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-suave">Productos</dt>
              <dd className="text-base font-semibold tabular-nums">{lineas.length}</dd>
            </div>
            <div>
              <dt className="text-suave">Unidades</dt>
              <dd className="text-base font-semibold tabular-nums">{total.unidades}</dd>
            </div>
            <div>
              <dt className="text-suave">Envío</dt>
              <dd className="text-base font-semibold tabular-nums text-marca-oscura">
                {cop(cab.valor_cop ?? 0)} <span className="font-normal text-suave">· {usd(cab.valor_usd ?? 0)}</span>
              </dd>
            </div>
          </dl>
          <Button type="submit" tam="lg" className="w-full sm:w-auto" cargando={guardar.isPending}>
            Guardar envío
          </Button>
        </div>
      </div>

      <Confirmar
        abierto={confirmarBorrar}
        onCerrar={() => setConfirmarBorrar(false)}
        onConfirmar={() => borrar.mutate(id!, { onSuccess: () => navegar("/envios"), onSettled: () => setConfirmarBorrar(false) })}
        cargando={borrar.isPending}
        titulo="¿Borrar este envío?"
        texto="Sus productos quedarán sin envío asignado y su costo bajará. Las ventas ya hechas se recalculan."
        accion="Sí, borrar"
      />
    </form>
  );
}
