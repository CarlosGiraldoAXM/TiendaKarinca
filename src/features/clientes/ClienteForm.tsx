import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CANALES, clienteSchema, type ClienteInput } from "@shared/schemas";
import type { Cliente } from "@shared/types";
import { Button, Campo, Dialogo, Input, Select, Textarea } from "@/components/ui";
import { useGuardarCliente } from "@/lib/api";
import { ETIQUETA_CANAL } from "@/lib/format";

interface Form {
  nombre: string;
  telefono: string;
  canal: (typeof CANALES)[number];
  usuario_red: string;
  notas: string;
}

/** Formulario de cliente en un diálogo. Sirve para crear (también desde una venta) y para editar. */
export function ClienteDialogo({
  abierto,
  onCerrar,
  cliente,
  nombreInicial = "",
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cliente?: Cliente;
  nombreInicial?: string;
  onGuardado?: (c: Cliente) => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={cliente ? "Editar cliente" : "Nuevo cliente"}>
      {abierto && <Formulario cliente={cliente} nombreInicial={nombreInicial} onCerrar={onCerrar} onGuardado={onGuardado} />}
    </Dialogo>
  );
}

function Formulario({
  cliente,
  nombreInicial,
  onCerrar,
  onGuardado,
}: {
  cliente?: Cliente;
  nombreInicial: string;
  onCerrar: () => void;
  onGuardado?: (c: Cliente) => void;
}) {
  const guardar = useGuardarCliente();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form, unknown, ClienteInput>({
    resolver: zodResolver(clienteSchema) as never,
    defaultValues: {
      nombre: cliente?.nombre ?? nombreInicial,
      telefono: cliente?.telefono ?? "",
      canal: cliente?.canal ?? "instagram",
      usuario_red: cliente?.usuario_red ?? "",
      notas: cliente?.notas ?? "",
    },
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        // Este diálogo puede abrirse dentro del formulario de venta: que no lo envíe también.
        e.stopPropagation();
        void handleSubmit((datos) =>
          guardar.mutate(
            { id: cliente?.id, datos },
            {
              onSuccess: (c) => {
                onGuardado?.(c);
                onCerrar();
              },
            },
          ),
        )(e);
      }}
    >
      <Campo etiqueta="Nombre" error={errors.nombre?.message}>
        <Input {...register("nombre")} autoFocus autoComplete="off" aria-invalid={!!errors.nombre} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono (opcional)">
          <Input {...register("telefono")} type="tel" inputMode="tel" autoComplete="off" placeholder="300 123 4567" />
        </Campo>
        <Campo etiqueta="¿Por dónde llegó?">
          <Select {...register("canal")}>
            {CANALES.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CANAL[c]}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <Campo etiqueta="Usuario en la red (opcional)">
        <Input {...register("usuario_red")} autoComplete="off" autoCapitalize="none" placeholder="@usuario" />
      </Campo>
      {cliente && (
        <Campo etiqueta="Notas (opcional)">
          <Textarea {...register("notas")} />
        </Campo>
      )}
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundario" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={guardar.isPending}>
          {cliente ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
