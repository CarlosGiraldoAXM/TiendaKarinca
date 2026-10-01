import { Check, Merge, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { precioSugerido } from "@shared/calc";
import type { Tienda } from "@shared/types";
import { NumeroInput } from "@/components/NumeroInput";
import { Button, Card, Confirmar, Dialogo, Encabezado, ErrorCarga, Input, ListaSkeleton, Select } from "@/components/ui";
import { useBorrarTienda, useConfig, useCrearTienda, useFusionarTiendas, useGuardarConfig, useRenombrarTienda, useTiendas } from "@/lib/api";
import { cop } from "@/lib/format";

export function Configuracion() {
  return (
    <>
      <Encabezado titulo="Configuración" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Utilidad />
        <Tiendas />
      </div>
    </>
  );
}

function Utilidad() {
  const config = useConfig();
  const guardar = useGuardarConfig();
  const [valor, setValor] = useState<number | null>(null);
  useEffect(() => {
    if (config.data) setValor(config.data.utilidad_pct);
  }, [config.data]);

  if (config.isPending) return <ListaSkeleton filas={1} />;
  if (config.error) return <ErrorCarga error={config.error} reintentar={config.refetch} />;

  const valido = valor !== null && valor >= 0;
  return (
    <Card className="p-4 md:p-5">
      <h2 className="font-display text-lg font-semibold">Utilidad que quieres ganar</h2>
      <p className="mt-1 text-sm text-suave">
        Con este porcentaje se calcula el precio sugerido de cada producto, sobre su costo total (producto + envío). Los precios que hayas
        escrito a mano no cambian.
      </p>
      <form
        className="mt-4 flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) guardar.mutate(valor);
        }}
      >
        <label className="w-32">
          <span className="mb-1.5 block text-sm font-medium">Porcentaje</span>
          <NumeroInput tipo="pct" valor={valor} onValor={setValor} aria-invalid={!valido} />
        </label>
        <Button type="submit" cargando={guardar.isPending} disabled={!valido || valor === config.data.utilidad_pct}>
          Guardar
        </Button>
      </form>
      {valido && (
        <p className="mt-4 rounded-xl bg-arena/70 px-3.5 py-3 text-sm">
          Un producto que cuesta <strong className="tabular-nums">{cop(10_000)}</strong> se sugeriría a{" "}
          <strong className="tabular-nums text-marca-oscura">{cop(precioSugerido(10_000, valor))}</strong>.
        </p>
      )}
    </Card>
  );
}

function Tiendas() {
  const tiendas = useTiendas();
  const renombrar = useRenombrarTienda();
  const fusionar = useFusionarTiendas();
  const borrar = useBorrarTienda();
  const crear = useCrearTienda();
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [fusion, setFusion] = useState<{ origen: Tienda; destino: string } | null>(null);
  const [aBorrar, setABorrar] = useState<Tienda | null>(null);

  if (tiendas.isPending) return <ListaSkeleton filas={3} />;
  if (tiendas.error) return <ErrorCarga error={tiendas.error} reintentar={tiendas.refetch} />;

  const guardarNombre = () => {
    if (!editando?.nombre.trim()) return;
    renombrar.mutate(editando, { onSuccess: () => setEditando(null) });
  };

  return (
    <Card className="p-4 md:p-5">
      <h2 className="font-display text-lg font-semibold">Tiendas</h2>
      <p className="mt-1 text-sm text-suave">Agrega una tienda, cámbiale el nombre o junta dos que en realidad son la misma.</p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nueva.trim()) crear.mutate(nueva.trim(), { onSuccess: () => setNueva("") });
        }}
      >
        <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva tienda…" aria-label="Nombre de la nueva tienda" autoComplete="off" />
        <Button type="submit" cargando={crear.isPending} disabled={!nueva.trim()}>
          {!crear.isPending && <Plus className="size-5" aria-hidden />}
          Agregar
        </Button>
      </form>

      {!tiendas.data.length ? (
        <p className="mt-4 rounded-xl bg-arena/70 px-3.5 py-3 text-sm text-suave">Aún no hay tiendas. Agrega la primera aquí arriba, o créala al cargar una compra.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borde/70">
          {tiendas.data.map((t) => (
            <li key={t.id} className="flex min-h-14 items-center gap-2 py-1.5">
              {editando?.id === t.id ? (
                <>
                  <Input
                    autoFocus
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    onKeyDown={(e) => (e.key === "Enter" ? guardarNombre() : e.key === "Escape" && setEditando(null))}
                    aria-label="Nombre de la tienda"
                    className="h-10"
                  />
                  <Button tam="iconoSm" onClick={guardarNombre} cargando={renombrar.isPending} aria-label="Guardar nombre">
                    {!renombrar.isPending && <Check className="size-4" />}
                  </Button>
                  <Button variante="fantasma" tam="iconoSm" onClick={() => setEditando(null)} aria-label="Cancelar">
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.nombre}</div>
                    <div className="text-xs text-suave">
                      {t.num_compras} {t.num_compras === 1 ? "compra" : "compras"}
                    </div>
                  </div>
                  <Button variante="fantasma" tam="iconoSm" onClick={() => setEditando({ id: t.id, nombre: t.nombre })} aria-label={`Renombrar ${t.nombre}`} title="Renombrar">
                    <Pencil className="size-4" />
                  </Button>
                  {tiendas.data.length > 1 && (
                    <Button variante="fantasma" tam="iconoSm" onClick={() => setFusion({ origen: t, destino: "" })} aria-label={`Fusionar ${t.nombre}`} title="Fusionar con otra">
                      <Merge className="size-4" />
                    </Button>
                  )}
                  {t.num_compras === 0 && (
                    <Button variante="fantasma" tam="iconoSm" className="hover:bg-rojo-suave hover:text-rojo" onClick={() => setABorrar(t)} aria-label={`Borrar ${t.nombre}`} title="Borrar">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialogo
        abierto={!!fusion}
        onCerrar={() => setFusion(null)}
        titulo={`Fusionar «${fusion?.origen.nombre ?? ""}»`}
        descripcion="Todas sus compras pasarán a la tienda que elijas y esta desaparecerá. No se puede deshacer."
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Pasar todo a</span>
          <Select value={fusion?.destino ?? ""} onChange={(e) => fusion && setFusion({ ...fusion, destino: e.target.value })}>
            <option value="">Elige una tienda…</option>
            {tiendas.data
              .filter((t) => t.id !== fusion?.origen.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
          </Select>
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variante="secundario" onClick={() => setFusion(null)}>
            Cancelar
          </Button>
          <Button
            variante="peligro"
            disabled={!fusion?.destino}
            cargando={fusionar.isPending}
            onClick={() => fusion && fusionar.mutate({ id: fusion.origen.id, destino_id: fusion.destino }, { onSuccess: () => setFusion(null) })}
          >
            Fusionar
          </Button>
        </div>
      </Dialogo>

      <Confirmar
        abierto={!!aBorrar}
        onCerrar={() => setABorrar(null)}
        onConfirmar={() => aBorrar && borrar.mutate(aBorrar.id, { onSettled: () => setABorrar(null) })}
        cargando={borrar.isPending}
        titulo={`¿Borrar «${aBorrar?.nombre ?? ""}»?`}
        texto="Esta tienda no tiene compras, así que no se pierde nada."
        accion="Sí, borrar"
      />
    </Card>
  );
}
