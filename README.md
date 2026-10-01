# Karinca · Inventario y ventas

App web para llevar el inventario y las ventas de una reventa USA → Colombia: compras en USD con su TRM, envíos prorrateados por valor, precio sugerido, ventas, clientes y un tablero para ver cómo va el negocio.

- **Frontend:** React + Vite + TypeScript + Tailwind, TanStack Query, react-hook-form + zod, Recharts.
- **Backend:** un solo Cloudflare Worker que sirve el frontend como assets y expone `/api/*` con Hono.
- **Base de datos:** Supabase (Postgres). El navegador **nunca** habla con Supabase: solo el Worker, con la service role key.
- **Acceso:** sin login propio. El dominio se protege con Cloudflare Access (ver abajo).

## Estructura

```
src/            Frontend (features/ por pantalla, components/, lib/)
worker/         API Hono: index.ts, routes/, errores.ts (Postgres → mensajes en español)
shared/         calc.ts (lógica de cálculo pura + tests), schemas.ts (zod), types.ts
supabase/       migrations/ (esquema, triggers, vistas, RPC, permisos) y seed.sql
scripts/        verificar-vistas.ts (vistas SQL vs shared/calc.ts)
```

Ningún costo derivado se guarda. El prorrateo del envío, el costo total, el precio sugerido, el stock y la utilidad salen de vistas SQL (`v_inventario`, `v_envio_detalle`, `v_ventas_resumen`, `v_dashboard`) y siempre se recalculan. `shared/calc.ts` replica esas fórmulas en TypeScript para las vistas previas del frontend y para los tests.

## Setup local

Requisitos: Node 20+ y Docker (para Supabase local).

```bash
npm install
npm run db:start                 # levanta Supabase local, corre migraciones y seed
cp .dev.vars.example .dev.vars   # y pega la clave que muestra `npx supabase status`
npm run dev                      # frontend + Worker en http://localhost:5173
```

En `.dev.vars`:

| Variable | Valor local |
|---|---|
| `SUPABASE_URL` | `http://127.0.0.1:54321` |
| `SUPABASE_SERVICE_ROLE_KEY` | el `SERVICE_ROLE_KEY` (o `SECRET_KEY`) de `npx supabase status` |

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | TypeScript en frontend, Worker y scripts |
| `npm test` | Tests de `shared/calc.ts` (Vitest) |
| `npm run verificar` | Test de integración contra la base de `.dev.vars` (ver abajo) |
| `npm run db:reset` | Borra la base local y vuelve a correr migraciones + seed |
| `npm run db:stop` | Apaga Supabase local |
| `npm run build` | Build de producción en `dist/` |
| `npm run deploy` | Build + `wrangler deploy` |

### Sin Docker: usar un proyecto remoto de Supabase

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push                  # corre las migraciones
npx supabase db push --include-seed   # opcional: carga el seed
```

También puedes pegar el contenido de `supabase/seed.sql` en el SQL Editor de Supabase. Luego pon en `.dev.vars` la URL del proyecto y su service role key (Project Settings → API).

### Seed (datos del Excel)

`supabase/seed.sql` carga 6 tiendas, 6 compras, 40 productos y un envío con todas las unidades. Las constantes están al inicio del archivo: TRM `3149`, fecha `2026-09-30`, envío `170` USD / `535330` COP. No hace nada si ya existen compras. Al terminar imprime (como `NOTICE`) los totales para cotejar con el Excel:

| | |
|---|---|
| Ítems / unidades | 40 / 159 |
| Total mercancía | US$ 879,27 |
| Envío | US$ 170,00 |
| **Total gastado en USA** | **US$ 1.049,27** |
| Total invertido | $ 3.304.151,23 COP |

### Test de integración

`npm run verificar` lee las tablas, recalcula todo con `shared/calc.ts` y lo compara fila por fila con las vistas SQL. Además crea una compra, un envío parcial, un cliente y dos ventas de prueba para comprobar que la base rechaza la sobreventa, que anular devuelve el stock y que no se pueden enviar más unidades de las compradas; al final borra esos datos.

Córrelo contra la base local o una de pruebas. En producción no rompe nada, pero gasta números del consecutivo de ventas (quedarían huecos en `V-0001`, `V-0002`…).

## Despliegue en Cloudflare

1. **Base de datos.** Crea el proyecto en Supabase y corre las migraciones (`npx supabase link` + `npx supabase db push`, y el seed si quieres).
2. **Worker desde GitHub.** En Cloudflare: Workers & Pages → Create → Import a repository. Configuración de build:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Secrets.** En el Worker: Settings → Variables and Secrets (tipo *Secret*), o por consola:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   La service role key da acceso total a la base. Solo va como secret del Worker; nunca en el repo ni en variables `VITE_*`.
4. **Dominio.** Settings → Domains & Routes → Add → Custom domain.

El nombre del Worker (`karinca`) y la fecha de compatibilidad están en `wrangler.jsonc`.

## Proteger el dominio con Cloudflare Access

La app no tiene login: **quien llegue a la URL puede ver y cambiar todo**, así que este paso no es opcional. Cloudflare Access (Zero Trust, gratis hasta 50 usuarios) pide un código que llega por correo antes de dejar pasar.

1. Cloudflare → Zero Trust → Access → Applications → Add an application → **Self-hosted**.
2. Application domain: el dominio de la app (ej. `karinca.tudominio.com`). Deja la ruta vacía para cubrir también `/api/*`.
3. Crea una política **Allow** con Include → *Emails* y los correos autorizados.
4. En Authentication deja activo **One-time PIN** (viene por defecto).
5. Session duration: `1 month` es cómodo para usarla desde el celular.

**Cierra las otras puertas.** El Worker también responde en `karinca.<cuenta>.workers.dev` y en las URLs de preview, que no pasan por la política anterior. En el Worker, Settings → Domains & Routes: desactiva `workers.dev` y las Preview URLs, o actívales Cloudflare Access desde ahí mismo.

Aun sin Access, la base no queda expuesta al navegador: todas las tablas tienen RLS sin políticas y los roles `anon` y `authenticated` no tienen permisos.

## Decisiones tomadas

1. **El "potencial de retorno" incluye lo que está por cobrar.** Es venta real + ventas pendientes + (disponibles × precio de venta). Las unidades de una venta pendiente ya no están disponibles; sin sumarlas, el potencial bajaría cada vez que alguien queda debiendo.
2. **El potencial usa todo el histórico**, no el rango de fechas, para que sea comparable con el invertido acumulado. Las fechas solo filtran venta real, utilidad real, por cobrar, la gráfica de ventas y el top 5.
3. **Las ventas cuentan por su fecha de venta**, no por la fecha en que se pagaron (ese dato no existe).
4. **Consecutivo de ventas por secuencia.** Si una venta se rechaza (por ejemplo, por falta de stock) su número se pierde y queda un hueco. Las anuladas conservan su número.
5. **Editar una compra** no permite quitar un producto que ya tenga ventas o envíos, ni dejarle menos unidades de las ya enviadas o vendidas. Borrar una compra completa tiene la misma restricción.
6. **El envío por unidad se divide entre todas las unidades del lote**, tengan envío o no (costo promedio del lote, como pide la regla 2).
7. **Envío sin valor que repartir** (todas sus líneas cuestan 0): participación 0 y no se asigna nada, sin error.
8. **Punto o coma al escribir números.** Con un solo separador seguido de exactamente tres dígitos (`3.149`), en pesos y TRM se lee como miles (3149) y en dólares como decimal (3,149). En cualquier otro caso el último separador es el decimal.
9. **El precio se precarga en pesos enteros** al agregar un producto a una venta y al editarlo en el inventario. El precio sugerido en sí no se redondea; solo se muestra sin decimales.
10. **Stock bajo** = queda 1 unidad. **Agotado** = 0. "Se están acabando" en el inicio no lista los agotados.
11. **Una venta pendiente aparta unidades** igual que una pagada. Solo la anulada las devuelve.
12. **Ruta de detalle = formulario de edición** en compras y envíos (`/compras/:id`, `/envios/:id`). En ventas el detalle es el comprobante y la edición está en `/ventas/:id/editar`.
13. **Subtotales del inventario:** las columnas de costo suman el lote completo (unitario × unidades) y "Precio venta" muestra lo que valen las unidades disponibles.
14. **El CSV** usa punto y coma y coma decimal para que Excel en español lo abra bien.
15. **Preferencias por dispositivo** (último vendedor, columnas visibles, "solo con stock", ver ganancia) se guardan en el navegador, no en la base.
16. **Además de renombrar y fusionar**, una tienda sin compras se puede borrar.
17. **Los filtros de inventario, envíos y clientes** se aplican en el navegador: con el volumen esperado es instantáneo y evita viajes a la base.
