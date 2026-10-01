import { Compass } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Button, ListaSkeleton, Vacio } from "./components/ui";
import { ClienteDetalle } from "./features/clientes/ClienteDetalle";
import { ClientesLista } from "./features/clientes/ClientesLista";
import { CompraForm } from "./features/compras/CompraForm";
import { ComprasLista } from "./features/compras/ComprasLista";
import { Configuracion } from "./features/configuracion/Configuracion";
import { EnvioForm } from "./features/envios/EnvioForm";
import { EnviosLista } from "./features/envios/EnviosLista";
import { Inventario } from "./features/inventario/Inventario";
import { VentaDetalle } from "./features/ventas/VentaDetalle";
import { VentaForm } from "./features/ventas/VentaForm";
import { VentasLista } from "./features/ventas/VentasLista";

// Las gráficas pesan: se cargan aparte para que el resto de pantallas abra rápido.
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<ListaSkeleton />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="compras" element={<ComprasLista />} />
        <Route path="compras/nueva" element={<CompraForm />} />
        <Route path="compras/:id" element={<CompraForm />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="envios" element={<EnviosLista />} />
        <Route path="envios/nuevo" element={<EnvioForm />} />
        <Route path="envios/:id" element={<EnvioForm />} />
        <Route path="ventas" element={<VentasLista />} />
        <Route path="ventas/nueva" element={<VentaForm />} />
        <Route path="ventas/:id" element={<VentaDetalle />} />
        <Route path="ventas/:id/editar" element={<VentaForm />} />
        <Route path="clientes" element={<ClientesLista />} />
        <Route path="clientes/:id" element={<ClienteDetalle />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route
          path="*"
          element={
            <Vacio icono={<Compass />} titulo="Esta página no existe" texto="Puede que el enlace esté mal escrito.">
              <Button asChild>
                <Link to="/">Ir al inicio</Link>
              </Button>
            </Vacio>
          }
        />
      </Route>
    </Routes>
  );
}
