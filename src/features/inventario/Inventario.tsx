import * as Popover from "@radix-ui/react-popover";
import { Boxes, ChevronDown, Columns3, Download, RotateCcw, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { InventarioFila } from "@shared/types";
import { NumeroInput } from "@/components/NumeroInput";
import { Badge, Button, Card, Checkbox, Encabezado, ErrorCarga, Input, ListaSkeleton, Select, Vacio } from "@/components/ui";
import { useGuardarPrecio, useInventario } from "@/lib/api";
import { cn, coincide, cop, fecha, num, pct, usd } from "@/lib/format";
import { useGuardado } from "@/lib/useGuardado";

type Totales = Record<"unidades" | "vendidas" | "disponibles" | "costoUsd" | "costoCop" | "envio" | "costoTotal" | "valorVenta", number>;

function totalizar(filas: InventarioFila[]): Totales {
  const t: Totales = { unidades: 0, vendidas: 0, disponibles: 0, costoUsd: 0, costoCop: 0, envio: 0, costoTotal: 0, valorVenta: 0 };
  for (const f of filas) {
    t.unidades += f.unidades;
    t.vendidas += f.vendidas;
    t.disponibles += f.disponibles;
    t.costoUsd += f.costo_unitario_usd * f.unidades;
    t.costoCop += f.costo_base_total_cop;
    t.envio += f.envio_total_item_cop;
    t.costoTotal += f.costo_total_unitario_cop * f.unidades;
    t.valorVenta += f.precio_venta_efectivo_cop * f.disponibles;
  }
  return t;
}

interface Columna {
  clave: string;
  titulo: string;
  /** No se puede ocultar. */
  fija?: boolean;
  izquierda?: boolean;
  celda: (f: InventarioFila) => ReactNode;
  total?: (t: Totales) => ReactNode;
  csv: (f: InventarioFila) => string | number | null;
}

const COLUMNAS: Columna[] = [
  { clave: "tienda", titulo: "Tienda", izquierda: true, celda: (f) => f.tienda, csv: (f) => f.tienda },
  { clave: "fecha", titulo: "Fecha compra", izquierda: true, celda: (f) => fecha(f.fecha_compra), csv: (f) => f.fecha_compra },
  { clave: "unidades", titulo: "Unid.", celda: (f) => f.unidades, total: (t) => t.unidades, csv: (f) => f.unidades },
  { clave: "vendidas", titulo: "Vendidas", celda: (f) => f.vendidas, total: (t) => t.vendidas, csv: (f) => f.vendidas },
  {
    clave: "disponibles",
    titulo: "Disponibles",
    fija: true,
    celda: (f) => <span className="font-semibold">{f.disponibles}</span>,
    total: (t) => t.disponibles,
    csv: (f) => f.disponibles,
  },
  { clave: "costo_usd", titulo: "Costo unit. USD", celda: (f) => usd(f.costo_unitario_usd), total: (t) => usd(t.costoUsd), csv: (f) => f.costo_unitario_usd },
  { clave: "trm", titulo: "TRM", celda: (f) => num(f.trm), csv: (f) => f.trm },
  { clave: "costo_cop", titulo: "Costo unit. COP", celda: (f) => cop(f.costo_unitario_cop), total: (t) => cop(t.costoCop), csv: (f) => f.costo_unitario_cop },
  { clave: "envio", titulo: "Envío unit.", celda: (f) => cop(f.envio_unitario_cop), total: (t) => cop(t.envio), csv: (f) => f.envio_unitario_cop },
  {
    clave: "costo_total",
    titulo: "Costo total",
    fija: true,
    celda: (f) => <span className="font-semibold">{cop(f.costo_total_unitario_cop)}</span>,
    total: (t) => cop(t.costoTotal),
    csv: (f) => f.costo_total_unitario_cop,
  },
  { clave: "sugerido", titulo: "Sugerido", celda: (f) => cop(f.precio_sugerido_cop), csv: (f) => f.precio_sugerido_cop },
  {
    clave: "precio",
    titulo: "Precio venta",
    fija: true,
    celda: (f) => <PrecioEditable fila={f} />,
    total: (t) => cop(t.valorVenta),
    csv: (f) => f.precio_venta_efectivo_cop,
  },
  { clave: "margen", titulo: "Margen", celda: (f) => <Margen valor={f.margen} />, csv: (f) => f.margen },
];

const Margen = ({ valor }: { valor: number | null }) => (
  <span className={cn(valor != null && valor < 0 && "font-semibold text-rojo")}>{pct(valor)}</span>
);

function Distintivos({ f }: { f: InventarioFila }) {
  return (
    <>
      {f.disponibles === 0 ? <Badge tono="rojo">Agotado</Badge> : f.disponibles <= 1 && <Badge tono="ambar">Stock bajo</Badge>}
      {f.unidades_enviadas === 0 ? (
        <Badge tono="azul">Sin envío asignado</Badge>
      ) : (
        f.pendientes_envio > 0 && <Badge tono="azul">{f.pendientes_envio} sin envío</Badge>
      )}
    </>
  );
}

/** Precio de venta editable en la misma celda. Vacío o «Usar sugerido» = vuelve al sugerido. */
function PrecioEditable({ fila, className }: { fila: InventarioFila; className?: string }) {
  const guardar = useGuardarPrecio();
  const manual = fila.precio_venta_cop !== null;
  const [valor, setValor] = useState<number | null>(Math.round(fila.precio_venta_efectivo_cop));
  const [clave, setClave] = useState(0);
  // Si el precio cambia por fuera (otro % de utilidad, un envío nuevo), el campo se pone al día.
  useEffect(() => setValor(Math.round(fila.precio_venta_efectivo_cop)), [fila.precio_venta_efectivo_cop]);

  const confirmar = () => {
    const actual = Math.round(fila.precio_venta_efectivo_cop);
    if (valor === actual) return;
    guardar.mutate(
      { id: fila.id, precio_venta_cop: valor },
      { onError: () => (setValor(actual), setClave((k) => k + 1)) },
    );
  };

  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      <div className="w-[6.5rem]">
        <NumeroInput
          key={`${fila.precio_venta_efectivo_cop}-${clave}`}
          tipo="cop"
          valor={valor}
          onValor={setValor}
          onBlur={confirmar}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={`Precio de venta de ${fila.nombre}`}
          className={cn("h-9 font-semibold", !manual && "border-dashed font-normal text-suave")}
          disabled={guardar.isPending}
        />
      </div>
      <Button
        variante="fantasma"
        tam="iconoSm"
        className={cn(!manual && "invisible")}
        onClick={() => guardar.mutate({ id: fila.id, precio_venta_cop: null })}
        aria-label="Usar sugerido"
        title={`Usar sugerido (${cop(fila.precio_sugerido_cop)})`}
      >
        <RotateCcw className="size-4" />
      </Button>
    </div>
  );
}

function exportarCsv(filas: InventarioFila[]) {
  const cols: Columna[] = [{ clave: "nombre", titulo: "Producto", celda: () => null, csv: (f) => f.nombre }, ...COLUMNAS];
  const celda = (v: string | number | null) =>
    v === null ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000).replace(".", ",") : `"${v.replace(/"/g, '""')}"`;
  // Punto y coma y coma decimal: así lo abre bien Excel en español.
  const csv = [cols.map((c) => celda(c.titulo)).join(";"), ...filas.map((f) => cols.map((c) => celda(c.csv(f))).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `inventario-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function Inventario() {
  const { data, error, isPending, refetch } = useInventario();
  const [q, setQ] = useState("");
  const [tienda, setTienda] = useState("");
  const [soloStock, setSoloStock] = useGuardado("inventario.soloStock", false);
  const [ocultas, setOcultas] = useGuardado<string[]>("inventario.ocultas", ["trm", "vendidas", "fecha", "costo_usd"]);

  const tiendas = useMemo(() => [...new Set((data ?? []).map((f) => f.tienda))], [data]);
  const filas = useMemo(
    () => (data ?? []).filter((f) => (!tienda || f.tienda === tienda) && (!soloStock || f.disponibles > 0) && coincide(q, f.nombre, f.tienda)),
    [data, q, tienda, soloStock],
  );
  const grupos = useMemo(() => {
    const m = new Map<string, InventarioFila[]>();
    for (const f of filas) m.set(f.tienda, [...(m.get(f.tienda) ?? []), f]);
    return [...m.entries()];
  }, [filas]);

  // Agrupado por tienda, la columna «Tienda» sobra.
  const columnas = COLUMNAS.filter((c) => c.clave !== "tienda" && (c.fija || !ocultas.includes(c.clave)));
  const general = totalizar(filas);

  if (isPending) return <ListaSkeleton filas={6} />;
  if (error) return <ErrorCarga error={error} reintentar={refetch} />;

  return (
    <>
      <Encabezado titulo="Inventario" descripcion="Todo lo comprado, lo que queda y a cuánto venderlo.">
        <Button variante="secundario" onClick={() => exportarCsv(filas)} disabled={!filas.length}>
          <Download className="size-4" aria-hidden />
          Exportar
        </Button>
      </Encabezado>

      {!data.length ? (
        <Vacio icono={<Boxes />} titulo="El inventario está vacío" texto="Los productos aparecen aquí cuando cargas una compra.">
          <Button asChild tam="lg">
            <Link to="/compras/nueva">Cargar una compra</Link>
          </Button>
        </Vacio>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-suave" aria-hidden />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="pl-9" />
            </div>
            <Select value={tienda} onChange={(e) => setTienda(e.target.value)} className="w-auto min-w-40 flex-1 sm:flex-none" aria-label="Tienda">
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-borde bg-papel px-3 text-sm font-medium">
              <Checkbox checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} />
              Solo con stock
            </label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variante="secundario" className="hidden lg:inline-flex">
                  <Columns3 className="size-4" aria-hidden />
                  Columnas
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={6} className="aparecer z-50 w-56 rounded-2xl border border-borde bg-papel p-2 shadow-lg">
                  {COLUMNAS.filter((c) => !c.fija && c.clave !== "tienda").map((c) => (
                    <label key={c.clave} className="flex h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm hover:bg-arena">
                      <Checkbox
                        checked={!ocultas.includes(c.clave)}
                        onChange={(e) => setOcultas(e.target.checked ? ocultas.filter((k) => k !== c.clave) : [...ocultas, c.clave])}
                      />
                      {c.titulo}
                    </label>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>

          {!filas.length ? (
            <Vacio icono={<Search />} titulo="Nada coincide con la búsqueda" texto="Prueba con otro nombre o quita los filtros." />
          ) : (
            <>
              {/* Escritorio: la tabla que reemplaza el Excel */}
              <Card className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-borde text-xs uppercase tracking-wide text-suave">
                      <th className="sticky left-0 bg-papel px-4 py-3 text-left font-medium">Producto</th>
                      {columnas.map((c) => (
                        <th key={c.clave} className={cn("whitespace-nowrap px-2 py-3 font-medium", c.izquierda ? "text-left" : "text-right")}>
                          {c.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map(([nombre, items]) => (
                      <Fragment key={nombre}>
                        <tr className="bg-arena/60">
                          <th colSpan={columnas.length + 1} className="px-4 py-2 text-left font-display text-base font-semibold">
                            {nombre}
                          </th>
                        </tr>
                        {items.map((f) => (
                          <tr key={f.id} className={cn("border-b border-borde/60 hover:bg-white", f.disponibles === 0 && "text-suave")}>
                            <td className="sticky left-0 min-w-52 max-w-72 bg-papel px-4 py-2">
                              <div className="font-medium">{f.nombre}</div>
                              <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                                <Distintivos f={f} />
                              </div>
                            </td>
                            {columnas.map((c) => (
                              <td key={c.clave} className={cn("whitespace-nowrap px-2 py-2", c.izquierda ? "text-left" : "text-right")}>
                                {c.celda(f)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <FilaTotal titulo={`Subtotal ${nombre}`} totales={totalizar(items)} columnas={columnas} />
                      </Fragment>
                    ))}
                  </tbody>
                  {grupos.length > 1 && (
                    <tfoot>
                      <FilaTotal titulo="Total general" totales={general} columnas={columnas} general />
                    </tfoot>
                  )}
                </table>
                <p className="border-t border-borde px-4 py-2.5 text-xs text-suave">
                  En subtotales y totales, las columnas de costo suman el lote completo (valor unitario × unidades) y «Precio venta» muestra
                  lo que valen las unidades disponibles. Un precio con borde punteado es el sugerido.
                </p>
              </Card>

              {/* Celular: tarjetas con lo esencial */}
              <div className="space-y-5 lg:hidden">
                {grupos.map(([nombre, items]) => {
                  const t = totalizar(items);
                  return (
                    <section key={nombre}>
                      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                        <h2 className="font-display text-lg font-semibold">{nombre}</h2>
                        <span className="text-sm text-suave">
                          {t.disponibles} de {t.unidades} disponibles
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((f) => (
                          <TarjetaItem key={f.id} f={f} />
                        ))}
                      </div>
                    </section>
                  );
                })}
                <Card className="grid grid-cols-2 gap-3 bg-arena/50 p-4 text-sm">
                  <Dato etiqueta="Unidades disponibles" valor={`${general.disponibles} de ${general.unidades}`} />
                  <Dato etiqueta="Costo total del lote" valor={cop(general.costoTotal)} />
                  <Dato etiqueta="Vale lo disponible" valor={cop(general.valorVenta)} />
                  <Dato etiqueta="Vendidas" valor={general.vendidas} />
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function FilaTotal({ titulo, totales, columnas, general }: { titulo: string; totales: Totales; columnas: Columna[]; general?: boolean }) {
  return (
    <tr className={cn("border-b border-borde font-semibold", general ? "bg-marca-suave/60 text-marca-oscura" : "bg-arena/30")}>
      <td className={cn("sticky left-0 px-4 py-2.5", general ? "bg-[#f9ece4]" : "bg-[#f8f3ea]")}>{titulo}</td>
      {columnas.map((c) => (
        <td key={c.clave} className={cn("whitespace-nowrap px-2 py-2.5 text-right", c.clave === "precio" && "pr-[2.875rem]")}>
          {c.total?.(totales)}
        </td>
      ))}
    </tr>
  );
}

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) => (
  <div>
    <dt className="text-xs text-suave">{etiqueta}</dt>
    <dd className="font-medium tabular-nums">{valor}</dd>
  </div>
);

function TarjetaItem({ f }: { f: InventarioFila }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <Card className={cn("p-3.5", f.disponibles === 0 && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium leading-snug">{f.nombre}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden">
            <Distintivos f={f} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl font-semibold leading-none tabular-nums">{f.disponibles}</div>
          <div className="mt-0.5 text-xs text-suave">de {f.unidades}</div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-suave">Costo total</div>
          <div className="font-semibold tabular-nums">{cop(f.costo_total_unitario_cop)}</div>
        </div>
        <div>
          <div className="mr-10 text-right text-xs text-suave">Precio de venta</div>
          <PrecioEditable fila={f} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg text-sm font-medium text-suave active:bg-arena"
      >
        {abierta ? "Ocultar detalle" : "Ver detalle"}
        <ChevronDown className={cn("size-4 transition-transform", abierta && "rotate-180")} aria-hidden />
      </button>
      {abierta && (
        <dl className="aparecer mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-borde pt-3 text-sm">
          <Dato etiqueta="Fecha de compra" valor={fecha(f.fecha_compra)} />
          <Dato etiqueta="Vendidas" valor={f.vendidas} />
          <Dato etiqueta="Costo unit. USD" valor={usd(f.costo_unitario_usd)} />
          <Dato etiqueta="TRM" valor={num(f.trm)} />
          <Dato etiqueta="Costo unit. COP" valor={cop(f.costo_unitario_cop)} />
          <Dato etiqueta="Envío por unidad" valor={cop(f.envio_unitario_cop)} />
          <Dato etiqueta="Precio sugerido" valor={cop(f.precio_sugerido_cop)} />
          <Dato etiqueta="Margen" valor={<Margen valor={f.margen} />} />
        </dl>
      )}
    </Card>
  );
}
