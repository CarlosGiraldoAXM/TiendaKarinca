// Traduce los errores de la base (D1 / SQLite) a mensajes que entienda la usuaria.

export class ApiError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 500,
    message: string,
  ) {
    super(message);
  }
}

export const NO_ENCONTRADO = "No encontramos ese registro. Puede que alguien lo haya borrado.";

// Códigos que lanzan los triggers con RAISE(ABORT, …) — ver db/migrations/0002_triggers.sql.
const NEGOCIO: Record<string, string> = {
  SIN_STOCK: "No hay suficientes unidades disponibles de alguno de los productos. Actualiza la página y revisa las cantidades.",
  EXCEDE_UNIDADES: "No puedes enviar más unidades de las que se compraron. Actualiza la página y revisa las cantidades.",
  UNIDADES_MENOR_ENVIADAS: "No puedes dejar un producto con menos unidades de las que ya están en envíos.",
  UNIDADES_MENOR_VENDIDAS: "No puedes dejar un producto con menos unidades de las que ya se vendieron.",
};

export function traducir(e: unknown, contexto?: { duplicado?: string; enUso?: string }): ApiError {
  if (e instanceof ApiError) return e;
  const texto = e instanceof Error ? e.message : String(e);

  for (const [codigo, mensaje] of Object.entries(NEGOCIO)) if (texto.includes(codigo)) return new ApiError(409, mensaje);

  if (texto.includes("UNIQUE constraint failed")) return new ApiError(409, contexto?.duplicado ?? "Ya existe un registro con esos datos.");
  if (texto.includes("FOREIGN KEY constraint failed"))
    return new ApiError(409, contexto?.enUso ?? "No se puede borrar porque otros registros dependen de este.");
  if (texto.includes("CHECK constraint failed") || texto.includes("NOT NULL constraint failed"))
    return new ApiError(400, "Hay un valor que no es válido. Revisa los números e inténtalo de nuevo.");

  console.error("Error de base de datos sin traducir:", texto);
  return new ApiError(500, "Algo salió mal al guardar. Inténtalo de nuevo en un momento.");
}
