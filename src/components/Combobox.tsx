import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn, coincide } from "@/lib/format";
import { estiloCampo } from "./ui";

export interface Opcion {
  valor: string;
  etiqueta: string;
  /** Texto extra para buscar (teléfono, usuario…) */
  buscar?: string;
  detalle?: ReactNode;
  deshabilitada?: boolean;
}

/**
 * Buscador con lista desplegable. Si se pasa `onCrear`, ofrece «Crear "X"»
 * cuando lo escrito no coincide exactamente con ninguna opción.
 */
export function Combobox({
  opciones,
  valor,
  onValor,
  onCrear,
  placeholder = "Selecciona…",
  buscarPlaceholder = "Buscar…",
  vacio = "Sin resultados",
  invalido,
  mantenerAbierto,
  disparador,
}: {
  opciones: Opcion[];
  valor?: string | null;
  onValor: (valor: string) => void;
  onCrear?: (texto: string) => void;
  placeholder?: string;
  buscarPlaceholder?: string;
  vacio?: string;
  invalido?: boolean;
  /** No cierra al elegir: útil para agregar varios productos seguidos. */
  mantenerAbierto?: boolean;
  disparador?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const actual = opciones.find((o) => o.valor === valor);
  const filtradas = opciones.filter((o) => coincide(q, o.etiqueta, o.buscar));
  const texto = q.trim();
  const puedeCrear = !!onCrear && !!texto && !opciones.some((o) => o.etiqueta.trim().toLowerCase() === texto.toLowerCase());

  return (
    <Popover.Root
      open={abierto}
      onOpenChange={(o) => {
        setAbierto(o);
        if (!o) setQ("");
      }}
    >
      <Popover.Trigger asChild>
        {disparador ?? (
          <button
            type="button"
            role="combobox"
            aria-expanded={abierto}
            aria-invalid={invalido}
            className={cn(estiloCampo, "flex items-center justify-between gap-2 text-left")}
          >
            <span className={cn("truncate", !actual && "text-suave/70")}>{actual?.etiqueta ?? placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-suave" aria-hidden />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="aparecer z-50 w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-borde bg-papel shadow-lg"
        >
          <Command shouldFilter={false}>
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder={buscarPlaceholder}
              className="h-12 w-full border-b border-borde bg-transparent px-4 outline-none placeholder:text-suave/60"
            />
            <Command.List className="max-h-[min(18rem,45dvh)] overflow-y-auto p-1.5">
              {!filtradas.length && !puedeCrear && <div className="px-3 py-6 text-center text-sm text-suave">{vacio}</div>}
              {filtradas.map((o) => (
                <Command.Item
                  key={o.valor}
                  value={o.valor}
                  disabled={o.deshabilitada}
                  onSelect={() => {
                    onValor(o.valor);
                    if (!mantenerAbierto) setAbierto(false);
                  }}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 data-[disabled=true]:cursor-default data-[disabled=true]:opacity-45 data-[selected=true]:bg-arena"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{o.etiqueta}</div>
                    {o.detalle && <div className="truncate text-sm text-suave">{o.detalle}</div>}
                  </div>
                  {o.valor === valor && <Check className="size-4 shrink-0 text-marca" aria-hidden />}
                </Command.Item>
              ))}
              {puedeCrear && (
                <Command.Item
                  value={`__crear__${texto}`}
                  onSelect={() => {
                    onCrear!(texto);
                    setAbierto(false);
                  }}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 font-medium text-marca-oscura data-[selected=true]:bg-marca-suave"
                >
                  <Plus className="size-4" aria-hidden />
                  Crear «{texto}»
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
