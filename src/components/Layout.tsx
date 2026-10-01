import { Boxes, Home, Menu, Plus, Receipt, Settings, ShoppingCart, Truck, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/format";
import { Dialogo } from "./ui";

interface Destino {
  a: string;
  nombre: string;
  icono: LucideIcon;
}
const PRINCIPALES: Destino[] = [
  { a: "/", nombre: "Inicio", icono: Home },
  { a: "/inventario", nombre: "Inventario", icono: Boxes },
  { a: "/ventas", nombre: "Ventas", icono: Receipt },
  { a: "/compras", nombre: "Compras", icono: ShoppingCart },
];
const SECUNDARIOS: Destino[] = [
  { a: "/envios", nombre: "Envíos", icono: Truck },
  { a: "/clientes", nombre: "Clientes", icono: Users },
  { a: "/configuracion", nombre: "Configuración", icono: Settings },
];

// En los formularios se oculta la barra inferior para dejar sitio al resumen y al botón de guardar.
const ES_FORMULARIO = /^\/(compras|envios)\/.+$|^\/ventas\/(nueva|.+\/editar)$/;
const CON_BOTON_VENTA = ["/", "/inventario", "/ventas"];

export function Layout() {
  const { pathname } = useLocation();
  const [mas, setMas] = useState(false);
  const formulario = ES_FORMULARIO.test(pathname);
  const enSecundario = SECUNDARIOS.some((d) => pathname.startsWith(d.a));

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Escritorio: barra lateral */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-borde bg-papel p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-1 py-1">
          <span className="grid h-10 shrink-0 place-items-center rounded-xl bg-marca px-2 font-display text-base font-semibold tracking-tight text-white">K&amp;L</span>
          <span>
            <span className="block whitespace-nowrap font-display text-base font-semibold leading-tight">Karinca &amp; Laura</span>
            <span className="block text-xs text-suave">Inventario y ventas</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {[...PRINCIPALES, ...SECUNDARIOS].map((d) => (
            <NavLink
              key={d.a}
              to={d.a}
              end={d.a === "/"}
              className={({ isActive }) =>
                cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 font-medium text-suave transition-colors hover:bg-arena hover:text-tinta",
                  isActive && "bg-marca-suave text-marca-oscura hover:bg-marca-suave hover:text-marca-oscura",
                  d.a === "/configuracion" && "mt-auto",
                )
              }
            >
              <d.icono className="size-5" aria-hidden />
              {d.nombre}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main
        className={cn(
          "mx-auto w-full max-w-6xl px-4 pt-5 md:px-8 md:pb-10 md:pt-8",
          formulario ? "pb-6" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <Outlet />
      </main>

      {/* Celular: acceso rápido a la acción más frecuente */}
      {CON_BOTON_VENTA.includes(pathname) && (
        <Link
          to="/ventas/nueva"
          className="no-print fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-marca px-5 font-semibold text-white shadow-lg shadow-marca/30 active:bg-marca-oscura md:hidden"
        >
          <Plus className="size-5" aria-hidden />
          Nueva venta
        </Link>
      )}

      {/* Celular: navegación inferior */}
      {!formulario && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-borde bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {PRINCIPALES.map((d) => (
            <NavLink
              key={d.a}
              to={d.a}
              end={d.a === "/"}
              className={({ isActive }) =>
                cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-suave", isActive && "text-marca")
              }
            >
              <d.icono className="size-[1.375rem]" aria-hidden />
              {d.nombre}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMas(true)}
            className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-suave", enSecundario && "text-marca")}
          >
            <Menu className="size-[1.375rem]" aria-hidden />
            Más
          </button>
        </nav>
      )}

      <Dialogo abierto={mas} onCerrar={() => setMas(false)} titulo="Más opciones">
        <div className="grid gap-2">
          {SECUNDARIOS.map((d) => (
            <Link
              key={d.a}
              to={d.a}
              onClick={() => setMas(false)}
              className="flex h-14 items-center gap-3 rounded-2xl border border-borde bg-papel px-4 font-medium active:bg-arena"
            >
              <d.icono className="size-5 text-marca" aria-hidden />
              {d.nombre}
            </Link>
          ))}
        </div>
      </Dialogo>
    </div>
  );
}
