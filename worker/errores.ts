// Traduce los errores de Postgres/PostgREST a mensajes que entienda la usuaria.

export class ApiError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 500,
    message: string,
  ) {
    super(message);
  }
}

interface ErrorPg {
  code?: string;
  message: string;
  details?: string | null;
}

// Códigos que lanzan los triggers y funciones (errcode P0001, ver supabase/migrations).
const NEGOCIO: Record<string, (detalle: string) => string> = {
  SIN_STOCK: (d) => `No hay suficientes unidades disponibles. ${d}`,
  EXCEDE_UNIDADES: (d) => `No puedes enviar más unidades de las que se compraron. ${d}`,
  UNIDADES_MENOR_ENVIADAS: (d) => `No puedes dejar menos unidades de las que ya están en envíos. ${d}`,
  UNIDADES_MENOR_VENDIDAS: (d) => `No puedes dejar menos unidades de las que ya se vendieron. ${d}`,
  ITEM_EN_USO: (d) => `No se puede quitar «${d}» porque ya tiene ventas o envíos.`,
  DESCUENTO_EXCEDE: () => "El descuento no puede ser mayor que el total de la venta.",
  VENTA_SIN_ITEMS: () => "Agrega al menos un producto a la venta.",
  COMPRA_SIN_ITEMS: () => "Agrega al menos un producto a la compra.",
  ENVIO_SIN_ITEMS: () => "Selecciona al menos un producto para el envío.",
  FUSION_MISMA_TIENDA: () => "Elige una tienda diferente para fusionar.",
  NO_ENCONTRADO: () => "No encontramos ese registro. Puede que alguien lo haya borrado.",
};

export function traducir(e: ErrorPg, contexto?: { duplicado?: string; enUso?: string }): ApiError {
  const negocio = NEGOCIO[e.message];
  if (negocio) return new ApiError(e.message === "NO_ENCONTRADO" ? 404 : 409, negocio(e.details ?? "").trim());

  switch (e.code) {
    case "23505":
      return new ApiError(409, contexto?.duplicado ?? "Ya existe un registro con esos datos.");
    case "23503":
      return new ApiError(409, contexto?.enUso ?? "No se puede borrar porque otros registros dependen de este.");
    case "23514":
    case "22P02":
    case "22003":
      return new ApiError(400, "Hay un valor que no es válido. Revisa los números e inténtalo de nuevo.");
    case "PGRST116":
      return new ApiError(404, NEGOCIO.NO_ENCONTRADO!(""));
  }
  console.error("Error de base de datos sin traducir:", e);
  return new ApiError(500, "Algo salió mal al guardar. Inténtalo de nuevo en un momento.");
}
