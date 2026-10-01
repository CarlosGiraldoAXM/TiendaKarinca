import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { compraSchema, type CompraInput } from "@shared/schemas";
import { Combobox } from "@/components/Combobox";
import { NumeroInput } from "@/components/NumeroInput";
import { Button, Campo, Card, Checkbox, Confirmar, Encabezado, ErrorCarga, Input, ListaSkeleton, Textarea } from "@/components/ui";
import { useBorrarCompra, useCompra, useCrearTienda, useGuardarCompra, useNombresItems, useTiendas } from "@/lib/api";
import { cn, cop, hoy, usd } from "@/lib/format";

interface FilaForm {
  id?: string | null;
  nombre: string;
  unidades: number | null;
  precio_unitario_usd: number | null;
  tax_unitario_usd: number | null;
}
interface Form {
  tienda_id: string;
  fecha: string;
  trm: number | null;
  notas: string;
  items: FilaForm[];
}

const filaVacia = (): FilaForm => ({ nombre: "", unidades: 1, precio_unitario_usd: null, tax_unitario_usd: 0 });

export function CompraForm() {
  const { id } = useParams();
  const compra = useCompra(id);

  if (id && compra.isPending) return <ListaSkeleton />;
  if (id && compra.error) return <ErrorCarga error={compra.error} reintentar={compra.refetch} />;

  const inicial: Form = compra.data
    ? {
        tienda_id: compra.data.tienda_id,
        fecha: compra.data.fecha,
        trm: compra.data.trm,
        notas: compra.data.notas ?? "",
        items: compra.data.items.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          unidades: i.unidades,
          precio_unitario_usd: i.precio_unitario_usd,
          tax_unitario_usd: i.tax_unitario_usd,
        })),
      }
    : { tienda_id: "", fecha: hoy(), trm: null, notas: "", items: [filaVacia()] };

  // key: al cambiar de compra se rearma el formulario desde cero.
  return <Formulario key={id ?? "nueva"} id={id} inicial={inicial} />;
}

function Formulario({ id, inicial }: { id?: string; inicial: Form }) {
  const navegar = useNavigate();
  const tiendas = useTiendas();
  const nombres = useNombresItems();
  const crearTienda = useCrearTienda();
  const guardar = useGuardarCompra();
  const borrar = useBorrarCompra();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ precio: number | null; tax: number | null }>({ precio: null, tax: null });
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const enfocarFila = useRef<number | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<Form, unknown, CompraInput>({ resolver: zodResolver(compraSchema) as never, defaultValues: inicial });
  const { fields, append, insert, remove } = useFieldArray({ control, name: "items" });

  // Tras agregar o duplicar una fila, el cursor queda en su nombre para seguir escribiendo.
  useEffect(() => {
    if (enfocarFila.current !== null) {
      setFocus(`items.${enfocarFila.current}.nombre`);
      enfocarFila.current = null;
    }
  });

  const agregar = () => {
    enfocarFila.current = fields.length;
    append(filaVacia());
  };
  const duplicar = (i: number) => {
    enfocarFila.current = i + 1;
    insert(i + 1, { ...getValues(`items.${i}`), id: null });
  };
  const alPresionar = (e: KeyboardEvent, i: number) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    if (i === fields.length - 1) agregar();
    else setFocus(`items.${i + 1}.nombre`);
  };
  const aplicarLote = () => {
    fields.forEach((f, i) => {
      if (!seleccion.has(f.id)) return;
      if (lote.precio !== null) setValue(`items.${i}.precio_unitario_usd`, lote.precio, { shouldDirty: true });
      if (lote.tax !== null) setValue(`items.${i}.tax_unitario_usd`, lote.tax, { shouldDirty: true });
    });
    toast.success(`Aplicado a ${seleccion.size} ${seleccion.size === 1 ? "fila" : "filas"}`);
    setSeleccion(new Set());
    setLote({ precio: null, tax: null });
  };
  const alternar = (fid: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (!n.delete(fid)) n.add(fid);
      return n;
    });

  const enviar = handleSubmit(
    (datos) => guardar.mutate({ id, datos }, { onSuccess: () => navegar("/compras") }),
    () => toast.error("Revisa los campos marcados en rojo."),
  );

  return (
    <form onSubmit={enviar} noValidate>
      <Encabezado titulo={id ? "Editar compra" : "Nueva compra"} volver="/compras">
        {id && (
          <Button variante="fantasma" className="text-rojo hover:bg-rojo-suave hover:text-rojo" onClick={() => setConfirmarBorrar(true)}>
            <Trash2 className="size-4" aria-hidden />
            Borrar
          </Button>
        )}
      </Encabezado>

      <Card className="mb-5 grid gap-4 p-4 sm:grid-cols-3 md:p-5">
        <Campo etiqueta="Tienda" error={errors.tienda_id && "Elige o crea una tienda"}>
          <Controller
            control={control}
            name="tienda_id"
            render={({ field }) => (
              <Combobox
                opciones={(tiendas.data ?? []).map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
                valor={field.value}
                onValor={field.onChange}
                onCrear={(nombre) => crearTienda.mutate(nombre, { onSuccess: (t) => setValue("tienda_id", t.id, { shouldDirty: true }) })}
                placeholder="Elige una tienda"
                buscarPlaceholder="Buscar o crear tienda…"
                vacio="Escribe el nombre para crearla"
                invalido={!!errors.tienda_id}
              />
            )}
          />
        </Campo>
        <Campo etiqueta="Fecha" error={errors.fecha?.message}>
          <Input type="date" {...register("fecha")} aria-invalid={!!errors.fecha} />
        </Campo>
        <Campo etiqueta="TRM del día" error={errors.trm?.message} ayuda="Pesos por 1 dólar">
          <Controller
            control={control}
            name="trm"
            render={({ field }) => (
              <NumeroInput ref={field.ref} tipo="trm" valor={field.value} onValor={field.onChange} onBlur={field.onBlur} placeholder="3.149" aria-invalid={!!errors.trm} />
            )}
          />
        </Campo>
      </Card>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Productos</h2>
          <p className="text-sm text-suave">Enter en la última fila agrega otra.</p>
        </div>
      </div>

      {seleccion.size > 0 && (
        <Card className="aparecer mb-3 flex flex-wrap items-end gap-3 border-marca/30 bg-marca-suave/50 p-3">
          <span className="w-full text-sm font-medium sm:w-auto sm:pb-3">
            {seleccion.size} {seleccion.size === 1 ? "fila seleccionada" : "filas seleccionadas"}
          </span>
          <label className="w-28">
            <span className="mb-1 block text-xs font-medium text-suave">Precio USD</span>
            <NumeroInput tipo="usd" sinPrefijo valor={lote.precio} onValor={(precio) => setLote((l) => ({ ...l, precio }))} />
          </label>
          <label className="w-28">
            <span className="mb-1 block text-xs font-medium text-suave">Tax USD</span>
            <NumeroInput tipo="usd" sinPrefijo valor={lote.tax} onValor={(tax) => setLote((l) => ({ ...l, tax }))} />
          </label>
          <Button onClick={aplicarLote} disabled={lote.precio === null && lote.tax === null}>
            Aplicar
          </Button>
          <Button variante="fantasma" onClick={() => setSeleccion(new Set())}>
            Cancelar
          </Button>
        </Card>
      )}

      <datalist id="nombres-productos">{nombres.data?.map((n) => <option key={n} value={n} />)}</datalist>

      {/* Encabezados de columna: solo en escritorio, donde las filas son una tabla. */}
      <div className={cn(REJILLA, "mb-1 hidden px-3 text-xs font-medium uppercase tracking-wide text-suave lg:grid")}>
        <Checkbox
          aria-label="Seleccionar todas"
          checked={seleccion.size === fields.length && fields.length > 0}
          onChange={(e) => setSeleccion(e.target.checked ? new Set(fields.map((f) => f.id)) : new Set())}
        />
        <span>Producto</span>
        <span className="text-right">Unid.</span>
        <span className="text-right">Precio USD</span>
        <span className="text-right">Tax USD</span>
        <span className="text-right">Costo unit.</span>
        <span className="text-right">Total fila</span>
        <span />
      </div>

      <div className="space-y-3 lg:space-y-1.5">
        {fields.map((f, i) => (
          <Card key={f.id} className={cn("p-3 lg:rounded-xl lg:p-2 lg:pl-3", seleccion.has(f.id) && "border-marca/50 bg-marca-suave/30")} onKeyDown={(e) => alPresionar(e, i)}>
            <div className={cn("grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5", REJILLA)}>
              <Checkbox aria-label={`Seleccionar fila ${i + 1}`} checked={seleccion.has(f.id)} onChange={() => alternar(f.id)} />
              <Input
                {...register(`items.${i}.nombre`)}
                list="nombres-productos"
                placeholder="Nombre del producto"
                aria-label="Nombre del producto"
                aria-invalid={!!errors.items?.[i]?.nombre}
                autoComplete="off"
              />
              <div className="col-span-2 grid grid-cols-3 gap-2 lg:contents">
                {(
                  [
                    ["unidades", "Unidades", "entero"],
                    ["precio_unitario_usd", "Precio USD", "usd"],
                    ["tax_unitario_usd", "Tax USD", "usd"],
                  ] as const
                ).map(([campo, etiqueta, tipo]) => (
                  <label key={campo}>
                    <span className="mb-1 block text-xs font-medium text-suave lg:hidden">{etiqueta}</span>
                    <Controller
                      control={control}
                      name={`items.${i}.${campo}`}
                      render={({ field }) => (
                        <NumeroInput
                          ref={field.ref}
                          tipo={tipo}
                          sinPrefijo
                          valor={field.value}
                          onValor={field.onChange}
                          onBlur={field.onBlur}
                          aria-label={etiqueta}
                          aria-invalid={!!errors.items?.[i]?.[campo]}
                        />
                      )}
                    />
                  </label>
                ))}
              </div>
              <CalculoFila control={control} indice={i} />
              <div className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                <Button variante="fantasma" tam="iconoSm" onClick={() => duplicar(i)} aria-label="Duplicar fila" title="Duplicar fila">
                  <Copy className="size-4" />
                </Button>
                <Button
                  variante="fantasma"
                  tam="iconoSm"
                  className="hover:bg-rojo-suave hover:text-rojo"
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                  aria-label="Borrar fila"
                  title="Borrar fila"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button variante="suave" className="mt-3 w-full sm:w-auto" onClick={agregar}>
        <Plus className="size-5" aria-hidden />
        Agregar producto
      </Button>

      <Campo etiqueta="Notas (opcional)" className="mt-5">
        <Textarea {...register("notas")} placeholder="Algo que quieras recordar de esta compra" />
      </Campo>

      <Resumen control={control} guardando={guardar.isPending} sinCambios={!!id && !isDirty} />

      <Confirmar
        abierto={confirmarBorrar}
        onCerrar={() => setConfirmarBorrar(false)}
        onConfirmar={() => borrar.mutate(id!, { onSuccess: () => navegar("/compras"), onSettled: () => setConfirmarBorrar(false) })}
        cargando={borrar.isPending}
        titulo="¿Borrar esta compra?"
        texto="Se borrarán todos sus productos del inventario. Solo se puede si ninguno tiene ventas ni envíos."
        accion="Sí, borrar"
      />
    </form>
  );
}

const REJILLA = "lg:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_6.5rem_6rem_8rem_8rem_4.75rem] lg:items-center lg:gap-2";

function CalculoFila({ control, indice }: { control: Control<Form, unknown, CompraInput>; indice: number }) {
  const fila = useWatch({ control, name: `items.${indice}` });
  const trm = useWatch({ control, name: "trm" }) ?? 0;
  const costoUsd = (fila?.precio_unitario_usd ?? 0) + (fila?.tax_unitario_usd ?? 0);
  const costoCop = costoUsd * trm;
  const total = costoCop * (fila?.unidades ?? 0);
  return (
    <>
      <div className="col-span-2 flex items-baseline justify-between text-sm lg:col-span-1 lg:block lg:text-right">
        <span className="text-suave lg:hidden">Costo unitario</span>
        <span>
          <span className="tabular-nums">{cop(costoCop)}</span>
          <span className="ml-2 text-xs tabular-nums text-suave lg:ml-0 lg:block">{usd(costoUsd)}</span>
        </span>
      </div>
      <div className="col-span-2 flex items-baseline justify-between text-sm lg:col-span-1 lg:block lg:text-right">
        <span className="text-suave lg:hidden">Total de la fila</span>
        <span className="font-semibold tabular-nums">{cop(total)}</span>
      </div>
    </>
  );
}

function Resumen({ control, guardando, sinCambios }: { control: Control<Form, unknown, CompraInput>; guardando: boolean; sinCambios: boolean }) {
  const items = useWatch({ control, name: "items" }) ?? [];
  const trm = useWatch({ control, name: "trm" }) ?? 0;
  const unidades = items.reduce((a, i) => a + (i.unidades ?? 0), 0);
  const totalUsd = items.reduce((a, i) => a + (i.unidades ?? 0) * ((i.precio_unitario_usd ?? 0) + (i.tax_unitario_usd ?? 0)), 0);
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-borde bg-papel/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-suave">Unidades</dt>
            <dd className="text-base font-semibold tabular-nums">{unidades}</dd>
          </div>
          <div>
            <dt className="text-suave">Total USD</dt>
            <dd className="text-base font-semibold tabular-nums">{usd(totalUsd)}</dd>
          </div>
          <div>
            <dt className="text-suave">Total COP</dt>
            <dd className="text-base font-semibold tabular-nums text-marca-oscura">{cop(totalUsd * trm)}</dd>
          </div>
        </dl>
        <Button type="submit" tam="lg" className="w-full sm:w-auto" cargando={guardando} disabled={sinCambios}>
          Guardar compra
        </Button>
      </div>
    </div>
  );
}
