import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ZodTypeAny } from "zod";
import { ApiError, NO_ENCONTRADO, traducir } from "./errores";

export type AppEnv = { Bindings: { DB: D1Database } };

export const nuevaRuta = () => new Hono<AppEnv>();

type Contexto = Parameters<typeof traducir>[1];
type Param = string | number | null;

/** Todas las filas de una consulta. */
export async function filas<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  try {
    return (await db.prepare(sql).bind(...params).all<T>()).results;
  } catch (e) {
    throw traducir(e);
  }
}

/** Una fila, o 404 si no existe. */
export async function fila<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T> {
  const [f] = await filas<T>(db, sql, ...params);
  if (!f) throw new ApiError(404, NO_ENCONTRADO);
  return f;
}

/** Una sola escritura. Devuelve cuántas filas cambió. */
export async function ejecutar(db: D1Database, contexto: Contexto, sql: string, ...params: Param[]): Promise<number> {
  try {
    return (await db.prepare(sql).bind(...params).run()).meta.changes;
  } catch (e) {
    throw traducir(e, contexto);
  }
}

/** Varias escrituras en un lote atómico: o se guardan todas o ninguna. */
export async function lote(db: D1Database, sentencias: D1PreparedStatement[], contexto?: Contexto): Promise<void> {
  try {
    await db.batch(sentencias);
  } catch (e) {
    throw traducir(e, contexto);
  }
}

/** Dinero a centavos enteros, que es como se guarda (ver db/migrations/0001_esquema.sql). */
export const centavos = (n: number) => Math.round(n * 100);

/** Valida el cuerpo JSON con un esquema de shared/schemas.ts y responde 400 con el primer problema. */
export const cuerpo = <T extends ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (r, c) => {
    if (!r.success) return c.json({ error: r.error.issues[0]?.message ?? "Datos inválidos" }, 400);
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function idValido(id: string): string {
  if (!UUID.test(id)) throw new ApiError(404, NO_ENCONTRADO);
  return id;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const fechaOpcional = (v: string | undefined) => (v && FECHA.test(v) ? v : null);

export const suma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
