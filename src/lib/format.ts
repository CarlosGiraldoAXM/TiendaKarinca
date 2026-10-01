// Formato de moneda, números y fechas. Todo en es-CO y zona America/Bogota.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const fCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fUsd = new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const fPct = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 });

/** $ 23.456 (sin decimales en pantalla). */
export const cop = (n: number | null | undefined) => (n == null ? "—" : fCop.format(n));
/** US$ 7,45 */
export const usd = (n: number | null | undefined) => (n == null ? "—" : fUsd.format(n));
export const num = (n: number | null | undefined) => (n == null ? "—" : fNum.format(n));
/** Recibe una fracción: 0.4 → 40 % */
export const pct = (n: number | null | undefined) => (n == null ? "—" : fPct.format(n));

/** $ 1,2 M — para ejes de gráficas, donde no cabe el número completo. */
export function copCorto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$ ${fNum.format(Math.round(n / 100_000) / 10)} M`;
  if (abs >= 1_000) return `$ ${fNum.format(Math.round(n / 1_000))} mil`;
  return `$ ${fNum.format(Math.round(n))}`;
}

/** Fecha de hoy en Bogotá como YYYY-MM-DD. */
export const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

// Las fechas llegan como YYYY-MM-DD (sin hora): se arman a mano para que no se corran un día.
const aDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const fFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const fFechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const fMes = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit" });

export const fecha = (iso: string | null | undefined) => (iso ? fFecha.format(aDate(iso)) : "—");
export const fechaCorta = (iso: string) => fFechaCorta.format(aDate(iso));
export const mes = (iso: string) => fMes.format(aDate(iso));

/** Suma (o resta) meses a una fecha YYYY-MM-DD. */
export function sumarMeses(iso: string, meses: number): string {
  const d = aDate(iso);
  d.setMonth(d.getMonth() + meses);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
export const inicioDeMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export type TipoNumero = "cop" | "usd" | "trm" | "entero" | "pct";

/**
 * Convierte lo que escribe la usuaria en un número. Acepta coma o punto decimal.
 * Un único separador seguido de exactamente 3 dígitos es ambiguo ("3.149"):
 * en pesos y TRM se lee como miles (3149); en dólares, como decimal (3,149).
 */
export function leerNumero(texto: string, tipo: TipoNumero): number | null {
  let t = texto.replace(/[^\d.,-]/g, "");
  if (!t || t === "-") return null;
  const puntos = (t.match(/\./g) ?? []).length;
  const comas = (t.match(/,/g) ?? []).length;

  if (puntos && comas) {
    // El último separador que aparece es el decimal; el otro, de miles.
    const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    t = t.split(decimal === "," ? "." : ",").join("").replace(",", ".");
  } else if (puntos + comas > 1) {
    t = t.replace(/[.,]/g, "");
  } else if (puntos + comas === 1) {
    const esMiles = tipo !== "usd" && tipo !== "pct" && /^-?\d{1,3}[.,]\d{3}$/.test(t);
    t = esMiles ? t.replace(/[.,]/g, "") : t.replace(",", ".");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return tipo === "entero" ? Math.trunc(n) : n;
}

const fEdicion: Record<TipoNumero, Intl.NumberFormat> = {
  cop: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }),
  trm: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }),
  usd: new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  entero: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }),
  pct: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }),
};
/** Cómo se muestra un número dentro de un campo al salir de él. */
export const mostrarNumero = (n: number | null | undefined, tipo: TipoNumero) => (n == null ? "" : fEdicion[tipo].format(n));

export const ETIQUETA_CANAL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  referido: "Referido",
  otro: "Otro",
};
export const ETIQUETA_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};
export const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  entregada: "Entregada",
  anulada: "Anulada",
};

/** Búsqueda sin tildes ni mayúsculas. */
export const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
export const coincide = (busqueda: string, ...campos: (string | null | undefined)[]) => {
  const q = normalizar(busqueda.trim());
  return !q || q.split(/\s+/).every((p) => campos.some((c) => c && normalizar(c).includes(p)));
};
