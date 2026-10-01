import { BarChart3, ShoppingCart } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@shared/types";
import { Badge, Button, Card, Encabezado, ErrorCarga, Input, Skeleton, Vacio } from "@/components/ui";
import { useDashboard } from "@/lib/api";
import { cn, cop, copCorto, fechaCorta, hoy, inicioDeMes, mes, pct, sumarMeses } from "@/lib/format";

// Un color por concepto, el mismo en todas las gráficas. Paleta validada para daltonismo.
const COLOR = { invertido: "#b4532a", potencial: "#3b6ea5", venta: "#1f9e6a", utilidad: "#8a5a9e" };
const EJE = { fontSize: 12, fill: "#75665a" };
const REJILLA = "#ebe2d4";

type Rango = "mes" | "3m" | "todo" | "personalizado";
const RANGOS: { clave: Rango; nombre: string }[] = [
  { clave: "mes", nombre: "Este mes" },
  { clave: "3m", nombre: "Últimos 3 meses" },
  { clave: "todo", nombre: "Todo" },
  { clave: "personalizado", nombre: "Personalizado" },
];

function TooltipCop({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: { fill?: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-borde bg-papel px-3 py-2 text-sm shadow-lg">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-2.5 rounded-sm" style={{ background: p.payload?.fill ?? p.color }} />
          <span className="text-suave">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold">{cop(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [rango, setRango] = useState<Rango>("todo");
  const [propio, setPropio] = useState({ desde: inicioDeMes(hoy()), hasta: hoy() });

  const filtro = (() => {
    const h = hoy();
    switch (rango) {
      case "mes":
        return { desde: inicioDeMes(h), hasta: null, granularidad: "semana" as const };
      case "3m":
        return { desde: sumarMeses(h, -3), hasta: null, granularidad: "semana" as const };
      case "todo":
        return { desde: null, hasta: null, granularidad: "mes" as const };
      case "personalizado": {
        const dias = (Date.parse(propio.hasta) - Date.parse(propio.desde)) / 86_400_000;
        return { desde: propio.desde || null, hasta: propio.hasta || null, granularidad: dias <= 100 ? ("semana" as const) : ("mes" as const) };
      }
    }
  })();
  const { data, error, isPending, refetch } = useDashboard(filtro);

  return (
    <>
      <Encabezado titulo="¿Cómo va el negocio?" />

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
          <Skeleton className="h-72 sm:col-span-2 xl:col-span-4" />
        </div>
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : data.acumulado.unidades_totales === 0 ? (
        <Vacio icono={<ShoppingCart />} titulo="Aún no tienes compras" texto="Carga tu primera compra y aquí verás cuánto has invertido y cuánto puedes ganar.">
          <Button asChild tam="lg">
            <Link to="/compras/nueva">¡Carga la primera!</Link>
          </Button>
        </Vacio>
      ) : (
        <Contenido d={data} granularidad={filtro.granularidad} filtros={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rango de fechas">
              {RANGOS.map((r) => (
                <button
                  key={r.clave}
                  type="button"
                  aria-pressed={rango === r.clave}
                  onClick={() => setRango(r.clave)}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                    rango === r.clave ? "border-marca bg-marca text-white" : "border-borde bg-papel text-suave hover:bg-arena",
                  )}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
            {rango === "personalizado" && (
              <div className="flex items-center gap-2">
                <Input type="date" className="h-10 w-auto" value={propio.desde} max={propio.hasta} onChange={(e) => setPropio({ ...propio, desde: e.target.value })} aria-label="Desde" />
                <span className="text-suave">a</span>
                <Input type="date" className="h-10 w-auto" value={propio.hasta} min={propio.desde} onChange={(e) => setPropio({ ...propio, hasta: e.target.value })} aria-label="Hasta" />
              </div>
            )}
          </div>
        } esTodo={rango === "todo"} />
      )}
    </>
  );
}

function Kpi({ titulo, valor, texto, color, pie, acumulado }: { titulo: string; valor: string; texto: string; color: string; pie?: ReactNode; acumulado?: boolean }) {
  return (
    <Card className="relative overflow-hidden p-4 pl-5 md:p-5 md:pl-6">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">{titulo}</h2>
        {acumulado && <Badge>Acumulado</Badge>}
      </div>
      <div className="mt-1.5 font-display text-[1.75rem] font-semibold leading-tight tabular-nums md:text-3xl">{valor}</div>
      <p className="mt-1 text-sm text-suave">{texto}</p>
      {pie && <div className="mt-2.5 border-t border-borde pt-2.5 text-sm">{pie}</div>}
    </Card>
  );
}

const Panel = ({ titulo, texto, className, children }: { titulo: string; texto?: string; className?: string; children: ReactNode }) => (
  <Card className={cn("min-w-0 p-4 md:p-5", className)}>
    <h2 className="font-display text-lg font-semibold">{titulo}</h2>
    {texto && <p className="mt-0.5 text-sm text-suave">{texto}</p>}
    <div className="mt-4">{children}</div>
  </Card>
);

function Contenido({ d, granularidad, filtros, esTodo }: { d: Dashboard; granularidad: "semana" | "mes"; filtros: ReactNode; esTodo: boolean }) {
  const a = d.acumulado;
  const p = d.periodo;
  const comparacion = [
    { nombre: "Invertido", valor: a.invertido_cop, fill: COLOR.invertido },
    { nombre: "Potencial", valor: a.potencial_cop, fill: COLOR.potencial },
    { nombre: "Venta real", valor: a.venta_real_cop, fill: COLOR.venta },
  ];
  const serie = d.serie.map((s) => ({
    periodo: granularidad === "semana" ? `Sem. ${fechaCorta(s.periodo)}` : mes(s.periodo),
    Ventas: s.venta_cop,
    Utilidad: s.utilidad_cop,
  }));
  const fraccionVendida = a.unidades_totales ? a.unidades_vendidas / a.unidades_totales : 0;
  const maxTop = Math.max(1, ...d.top_vendidos.map((t) => t.unidades));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi acumulado titulo="Invertido" color={COLOR.invertido} valor={cop(a.invertido_cop)} texto="Lo que hemos gastado en mercancía y envíos." />
        <Kpi
          acumulado
          titulo="Potencial de retorno"
          color={COLOR.potencial}
          valor={cop(a.potencial_cop)}
          texto="Lo que recibiríamos si vendemos todo lo que queda al precio configurado."
          pie={
            <span className="text-suave">
              Inventario disponible: <strong className="font-semibold tabular-nums text-tinta">{cop(a.valor_inventario_cop)}</strong>
            </span>
          }
        />
        <Kpi
          titulo="Venta real"
          color={COLOR.venta}
          valor={cop(p.venta_real_cop)}
          texto="Plata que ya entró."
          pie={
            <span className="text-suave">
              Por cobrar: <strong className="font-semibold tabular-nums text-tinta">{cop(p.por_cobrar_cop)}</strong>
            </span>
          }
        />
        <Kpi
          titulo="Utilidad real"
          color={COLOR.utilidad}
          valor={cop(p.utilidad_real_cop)}
          texto="Lo que ganamos de verdad."
          pie={
            p.venta_real_cop > 0 && (
              <span className="text-suave">
                Es el <strong className="font-semibold tabular-nums text-tinta">{pct(p.utilidad_real_cop / p.venta_real_cop)}</strong> de lo vendido
              </span>
            )
          }
        />
      </div>

      <div>
        {filtros}
        <p className="mt-2 text-sm text-suave">
          Las fechas aplican a <strong className="font-medium text-tinta">Venta real</strong>, <strong className="font-medium text-tinta">Utilidad real</strong> y a
          la gráfica de ventas. Lo marcado como «Acumulado» siempre muestra todo el histórico.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel titulo="Invertido, potencial y venta real" texto="De un vistazo: cuánto pusimos, cuánto puede volver y cuánto ha vuelto. Todo el histórico.">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={comparacion} margin={{ top: 24, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={REJILLA} />
                <XAxis dataKey="nombre" tick={{ ...EJE, fontSize: 13 }} tickLine={false} axisLine={{ stroke: REJILLA }} />
                <YAxis hide />
                <Tooltip content={<TooltipCop />} cursor={{ fill: "#f3ebdf", opacity: 0.6 }} />
                <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={96} isAnimationActive={false}>
                  {comparacion.map((c) => (
                    <Cell key={c.nombre} fill={c.fill} />
                  ))}
                  <LabelList dataKey="valor" position="top" formatter={(v) => copCorto(Number(v))} style={{ fill: "#2b211a", fontSize: 13, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          titulo={granularidad === "semana" ? "Ventas por semana" : "Ventas por mes"}
          texto={esTodo ? "Ventas pagadas o entregadas, y lo que dejaron de ganancia." : "Dentro de las fechas elegidas."}
        >
          {!serie.length ? (
            <div className="grid h-64 place-items-center text-center text-sm text-suave">
              <div>
                <BarChart3 className="mx-auto mb-2 size-8 opacity-50" aria-hidden />
                Aún no hay ventas pagadas en estas fechas.
              </div>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart data={serie} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke={REJILLA} />
                  <XAxis dataKey="periodo" tick={EJE} tickLine={false} axisLine={{ stroke: REJILLA }} minTickGap={12} />
                  <YAxis tick={EJE} tickLine={false} axisLine={false} tickFormatter={copCorto} width={84} />
                  <Tooltip content={<TooltipCop />} cursor={{ fill: "#f3ebdf", opacity: 0.6 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 13, color: "#75665a", paddingTop: 4 }} />
                  <Bar dataKey="Ventas" fill={COLOR.venta} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                  <Line dataKey="Utilidad" stroke={COLOR.utilidad} strokeWidth={2} dot={{ r: 4, fill: COLOR.utilidad, stroke: "#fffdf9", strokeWidth: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Unidades vendidas y disponibles" texto="De todo lo que se ha comprado.">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="font-display text-3xl font-semibold tabular-nums">{a.unidades_vendidas}</span>
              <span className="ml-1.5 text-sm text-suave">vendidas</span>
            </div>
            <div className="text-right">
              <span className="font-display text-3xl font-semibold tabular-nums">{a.unidades_disponibles}</span>
              <span className="ml-1.5 text-sm text-suave">disponibles</span>
            </div>
          </div>
          <div
            className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-arena"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={a.unidades_totales}
            aria-valuenow={a.unidades_vendidas}
            aria-label="Unidades vendidas"
          >
            <div className="rounded-full" style={{ width: `${fraccionVendida * 100}%`, background: COLOR.venta }} />
          </div>
          <p className="mt-2 text-sm text-suave">
            Se ha vendido el <strong className="font-semibold text-tinta">{pct(fraccionVendida)}</strong> de {a.unidades_totales} unidades.
          </p>
        </Panel>

        <Panel titulo="Invertido por tienda" texto="Mercancía más su parte del envío.">
          <div style={{ height: Math.max(120, d.por_tienda.length * 40 + 8) }}>
            <ResponsiveContainer>
              <BarChart data={d.por_tienda} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap="28%">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="tienda" tick={{ ...EJE, fontSize: 13, fill: "#2b211a" }} tickLine={false} axisLine={false} width={112} />
                <Tooltip content={<TooltipCop />} cursor={{ fill: "#f3ebdf", opacity: 0.6 }} />
                <Bar dataKey="invertido_cop" name="Invertido" fill={COLOR.invertido} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="invertido_cop" position="right" formatter={(v) => copCorto(Number(v))} style={{ fill: "#75665a", fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel titulo="Los 5 más vendidos" texto={esTodo ? "Por unidades vendidas." : "Por unidades vendidas en las fechas elegidas."}>
          {!d.top_vendidos.length ? (
            <p className="py-6 text-center text-sm text-suave">Cuando registres ventas, aquí verás qué se mueve más.</p>
          ) : (
            <ol className="space-y-3">
              {d.top_vendidos.map((t) => (
                <li key={`${t.nombre}-${t.tienda}`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{t.nombre}</span>
                    <span className="shrink-0 tabular-nums text-suave">
                      <strong className="font-semibold text-tinta">{t.unidades}</strong> und. · {cop(t.venta_cop)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-arena">
                    <div className="h-full rounded-full" style={{ width: `${(t.unidades / maxTop) * 100}%`, background: COLOR.venta }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel titulo="Se están acabando" texto="Los productos con menos unidades disponibles.">
          {!d.menor_stock.length ? (
            <p className="py-6 text-center text-sm text-suave">No queda nada disponible.</p>
          ) : (
            <ul className="divide-y divide-borde/70">
              {d.menor_stock.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.nombre}</div>
                    <div className="text-xs text-suave">{m.tienda}</div>
                  </div>
                  <Badge tono={m.disponibles <= 1 ? "ambar" : "neutro"}>
                    {m.disponibles === 1 ? "Queda 1" : `Quedan ${m.disponibles}`} de {m.unidades}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
