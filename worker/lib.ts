import { zValidator } from "@hono/zod-validator";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { ZodTypeAny } from "zod";
import { ApiError, traducir } from "./errores";

export type AppEnv = {
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { db: SupabaseClient };
};

export const nuevaRuta = () => new Hono<AppEnv>();

/** Cliente con service role: solo vive en el Worker, nunca llega al navegador. */
export function crearDb(env: AppEnv["Bindings"]): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(500, "Falta configurar la conexión a la base de datos (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Resultado = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

/**
 * Devuelve `data` o lanza el error ya traducido.
 * El cliente no tiene tipos generados de la base, así que la forma de la fila la declara quien llama.
 */
export async function datos<T = unknown>(consulta: PromiseLike<Resultado>, contexto?: Parameters<typeof traducir>[1]): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw traducir(error, contexto);
  return data as T;
}

/** Valida el cuerpo JSON con un esquema de shared/schemas.ts y responde 400 con el primer problema. */
export const cuerpo = <T extends ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (r, c) => {
    if (!r.success) return c.json({ error: r.error.issues[0]?.message ?? "Datos inválidos" }, 400);
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function idValido(id: string): string {
  if (!UUID.test(id)) throw new ApiError(404, "No encontramos ese registro.");
  return id;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const fechaOpcional = (v: string | undefined) => (v && FECHA.test(v) ? v : null);

export const suma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
