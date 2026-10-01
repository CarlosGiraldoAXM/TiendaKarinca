// Piezas básicas de la interfaz, al estilo shadcn/ui pero con la paleta propia.
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/format";

// ------------------------------------------------------------------ Button
const boton = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variante: {
        primario: "bg-marca text-white hover:bg-marca-oscura shadow-sm",
        secundario: "bg-papel text-tinta border border-borde hover:bg-arena",
        suave: "bg-marca-suave text-marca-oscura hover:bg-[#f1d5c5]",
        fantasma: "text-suave hover:bg-arena hover:text-tinta",
        peligro: "bg-rojo text-white hover:bg-[#992f27]",
      },
      tam: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-[0.9375rem]",
        lg: "h-13 px-6 text-base",
        icono: "h-11 w-11 shrink-0",
        iconoSm: "h-9 w-9 shrink-0",
      },
    },
    defaultVariants: { variante: "primario", tam: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof boton> & { asChild?: boolean; cargando?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante, tam, asChild, cargando, children, disabled, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(boton({ variante, tam }), className)}
        disabled={disabled || cargando}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

// ------------------------------------------------------------------ Campos
export const estiloCampo =
  "h-11 w-full rounded-xl border border-borde bg-papel px-3 text-tinta placeholder:text-suave/60 transition-colors hover:border-[#d4c6b2] focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20 disabled:opacity-60 aria-[invalid=true]:border-rojo";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(estiloCampo, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea ref={ref} rows={2} className={cn(estiloCampo, "h-auto py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

// Select nativo: en el celular abre el selector del sistema, que es lo más cómodo.
export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(estiloCampo, "appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9", className)}
    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2375665a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
    {...props}
  />
));
Select.displayName = "Select";

export const Checkbox = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(({ className, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn("size-5 shrink-0 cursor-pointer rounded-md accent-marca", className)} {...props} />
));
Checkbox.displayName = "Checkbox";

export function Campo({
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-tinta">{etiqueta}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-sm text-rojo">
          {error}
        </span>
      ) : (
        ayuda && <span className="mt-1 block text-sm text-suave">{ayuda}</span>
      )}
    </label>
  );
}

// ------------------------------------------------------------------ Contenedores
export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("rounded-2xl border border-borde bg-papel shadow-[0_1px_2px_rgba(43,33,26,0.04)]", className)} {...props} />
);

const insignia = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tono: {
      neutro: "bg-arena text-suave",
      verde: "bg-verde-suave text-verde",
      ambar: "bg-ambar-suave text-ambar",
      rojo: "bg-rojo-suave text-rojo",
      azul: "bg-azul-suave text-azul",
      marca: "bg-marca-suave text-marca-oscura",
    },
  },
  defaultVariants: { tono: "neutro" },
});
export const Badge = ({ className, tono, ...props }: ComponentProps<"span"> & VariantProps<typeof insignia>) => (
  <span className={cn(insignia({ tono }), className)} {...props} />
);

const TONO_ESTADO = { pendiente: "ambar", pagada: "verde", entregada: "azul", anulada: "rojo" } as const;
const NOMBRE_ESTADO = { pendiente: "Pendiente", pagada: "Pagada", entregada: "Entregada", anulada: "Anulada" } as const;
export const EstadoChip = ({ estado }: { estado: keyof typeof TONO_ESTADO }) => (
  <Badge tono={TONO_ESTADO[estado]}>{NOMBRE_ESTADO[estado]}</Badge>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-xl bg-arena", className)} />
);
export const ListaSkeleton = ({ filas = 4 }: { filas?: number }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Cargando">
    {Array.from({ length: filas }, (_, i) => (
      <Skeleton key={i} className="h-20" />
    ))}
  </div>
);

export function Encabezado({
  titulo,
  descripcion,
  volver,
  children,
}: {
  titulo: string;
  descripcion?: string;
  volver?: string;
  children?: ReactNode;
}) {
  return (
    <header className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {volver && (
          <Button asChild variante="fantasma" tam="icono" className="-ml-2">
            <Link to={volver} aria-label="Volver">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight md:text-[1.75rem]">{titulo}</h1>
          {descripcion && <p className="mt-0.5 text-sm text-suave">{descripcion}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Vacio({ icono, titulo, texto, children }: { icono: ReactNode; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-marca-suave text-marca [&_svg]:size-7">{icono}</div>
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      {texto && <p className="mt-1 max-w-sm text-sm text-suave">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </Card>
  );
}

export const ErrorCarga = ({ error, reintentar }: { error: Error; reintentar: () => void }) => (
  <Card className="border-rojo/30 bg-rojo-suave/40 p-6 text-center">
    <p className="font-medium text-rojo">{error.message}</p>
    <Button variante="secundario" className="mt-4" onClick={reintentar}>
      Reintentar
    </Button>
  </Card>
);

// ------------------------------------------------------------------ Diálogos
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-tinta/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="aparecer fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-fondo p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:p-6"
          {...(descripcion ? {} : { "aria-describedby": undefined })}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-semibold">{titulo}</DialogPrimitive.Title>
              {descripcion && <DialogPrimitive.Description className="mt-1 text-sm text-suave">{descripcion}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variante="fantasma" tam="iconoSm" aria-label="Cerrar" className="-mr-2 -mt-1">
                <X className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Confirmar({
  abierto,
  onCerrar,
  onConfirmar,
  titulo,
  texto,
  accion,
  peligro = true,
  cargando,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
  titulo: string;
  texto: string;
  accion: string;
  peligro?: boolean;
  cargando?: boolean;
}) {
  return (
    <AlertDialog.Root open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-tinta/40 backdrop-blur-[2px]" />
        <AlertDialog.Content className="aparecer fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-fondo p-6 shadow-xl">
          <AlertDialog.Title className="font-display text-xl font-semibold">{titulo}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-suave">{texto}</AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variante="secundario">Cancelar</Button>
            </AlertDialog.Cancel>
            <Button variante={peligro ? "peligro" : "primario"} cargando={cargando} onClick={onConfirmar}>
              {accion}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
