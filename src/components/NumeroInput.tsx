import { forwardRef, useEffect, useState, type ComponentProps } from "react";
import { cn, leerNumero, mostrarNumero, type TipoNumero } from "@/lib/format";
import { estiloCampo } from "./ui";

const PREFIJO: Partial<Record<TipoNumero, string>> = { cop: "$", trm: "$", usd: "US$" };

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  valor: number | null | undefined;
  onValor: (n: number | null) => void;
  tipo: TipoNumero;
  sinPrefijo?: boolean;
};

/**
 * Campo numérico: acepta coma o punto decimal mientras se escribe
 * y muestra el número con formato al salir.
 */
export const NumeroInput = forwardRef<HTMLInputElement, Props>(
  ({ valor, onValor, tipo, sinPrefijo, className, onBlur, onFocus, ...props }, ref) => {
    const [texto, setTexto] = useState(() => mostrarNumero(valor, tipo));
    const [enfocado, setEnfocado] = useState(false);

    // Si el valor cambia desde fuera (duplicar fila, aplicar a seleccionadas…), se refleja.
    useEffect(() => {
      if (!enfocado) setTexto(mostrarNumero(valor, tipo));
    }, [valor, tipo, enfocado]);

    const prefijo = sinPrefijo ? undefined : PREFIJO[tipo];
    const sufijo = tipo === "pct" ? "%" : undefined;

    return (
      <div className="relative">
        {prefijo && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-suave">{prefijo}</span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode={tipo === "entero" ? "numeric" : "decimal"}
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            onValor(leerNumero(e.target.value, tipo));
          }}
          onFocus={(e) => {
            setEnfocado(true);
            e.target.select();
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            setTexto(mostrarNumero(leerNumero(texto, tipo), tipo));
            onBlur?.(e);
          }}
          className={cn(estiloCampo, "text-right tabular-nums", prefijo === "$" && "pl-7", prefijo === "US$" && "pl-11", sufijo && "pr-8", className)}
          {...props}
        />
        {sufijo && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-suave">{sufijo}</span>}
      </div>
    );
  },
);
NumeroInput.displayName = "NumeroInput";
