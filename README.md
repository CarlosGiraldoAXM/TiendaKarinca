# Karinca · Inventario y ventas

App web para llevar el inventario y las ventas de una reventa USA → Colombia: compras en USD con su TRM, envíos prorrateados por valor, precio sugerido, ventas, clientes y un tablero para ver cómo va el negocio.

Todo corre en Cloudflare:

- **Frontend:** React + Vite + TypeScript + Tailwind, TanStack Query, react-hook-form + zod, Recharts.
- **Backend:** un solo Worker que sirve el frontend como assets y expone `/api/*` con Hono.
- **Base de datos:** Cloudflare D1 (SQLite), conectada al Worker como binding `DB`. No hay claves ni secrets que configurar, y el navegador nunca habla con la base.
- **Acceso:** sin login propio. El dominio se protege con Cloudflare Access (ver abajo).

## Estructura

```
src/            Frontend (features/ por pantalla, components/, lib/)
worker/         API Hono: index.ts, routes/, operaciones.ts (escrituras en lote), errores.ts
shared/         calc.ts (lógica de cálculo pura + tests), schemas.ts (zod), types.ts
db/             migrations/ (esquema, triggers, vistas) y seed.sql
tests/          integracion.test.ts (vistas SQL vs shared/calc.ts y reglas de stock)
```

Ningún costo derivado se guarda. El prorrateo del envío, el costo total, el precio sugerido, el stock y la utilidad salen de vistas SQL (`v_inventario`, `v_envio_detalle`, `v_ventas_resumen`, `v_dashboard`) y siempre se recalculan. `shared/calc.ts` replica esas fórmulas en TypeScript para las vistas previas del frontend y para los tests.

Las escrituras que tocan varias tablas (guardar una venta, una compra, un envío) van en un lote atómico de D1. Los triggers de `db/migrations/0002_triggers.sql` abortan el lote completo si se intenta vender más de lo disponible o enviar más unidades de las compradas.

## Setup local

Requisitos: Node 20+. No hace falta Docker ni cuenta de Cloudflare para desarrollar.

```bash
npm install
npm run db:migrar    # crea la base D1 local (en .wrangler/) y corre las migraciones
npm run db:seed      # opcional: carga los datos del Excel
npm run dev          # frontend + Worker en http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | TypeScript en frontend, Worker y tests |
| `npm test` | Tests de cálculo y de integración (Vitest) |
| `npm run db:reset` | Borra la base local y vuelve a correr migraciones + seed |
| `npm run build` | Build de producción en `dist/` |
| `npm run deploy` | Build + migraciones en la base remota + `wrangler deploy` |
| `npm run db:migrar:remoto` | Corre las migraciones pendientes en la base de producción |
| `npm run db:seed:remoto` | Carga el seed en la base de producción |

### Seed (datos del Excel)

`db/seed.sql` carga 6 tiendas, 6 compras, 40 productos y un envío con todas las unidades. Las constantes están al inicio del archivo: TRM `3149`, fecha `2026-09-30`, envío `170` USD / `535330` COP. Córrelo una sola vez sobre una base recién migrada; si las tiendas ya existen, falla sin cargar nada. Al terminar muestra los totales para cotejar con el Excel:

| | |
|---|---|
| Ítems / unidades | 40 / 159 |
| Total mercancía | US$ 879,27 |
| Envío | US$ 170,00 |
| **Total gastado en USA** | **US$ 1.049,27** |
| Total invertido | $ 3.304.151,23 COP |

### Tests

`npm test` corre dos grupos:

- **`shared/calc.test.ts`**: la lógica de cálculo (prorrateo, costo del lote, precio sugerido, totales de venta, stock).
- **`tests/integracion.test.ts`**: crea una base D1 nueva en memoria (no toca la de desarrollo), aplica migraciones y seed, compara las vistas SQL fila por fila con `shared/calc.ts` y ejercita las escrituras reales del Worker: sobreventa rechazada, anulación que devuelve stock, reactivación sin stock, límite de unidades por envío y protección de compras con ventas o envíos.

## Despliegue en Cloudflare

1. **Crea la base de datos** (una sola vez):
   ```bash
   npx wrangler login
   npx wrangler d1 create karinca
   ```
   Copia el `database_id` que devuelve y pégalo en `wrangler.jsonc`, en `d1_databases[0].database_id`. Haz commit de ese cambio: el id no es secreto.
2. **Conecta el repo.** En Cloudflare: Workers & Pages → Create → Import a repository. Configuración de build:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler d1 migrations apply karinca --remote && npx wrangler deploy`

   Así cada push corre primero las migraciones pendientes y luego publica el Worker.
3. **Carga los datos iniciales** (una sola vez, después del primer deploy): `npm run db:seed:remoto`.
4. **Dominio.** En el Worker: Settings → Domains & Routes → Add → Custom domain.

No hay variables ni secrets que configurar.

**Copias de seguridad.** D1 guarda el historial de los últimos días (Time Travel) y permite volver a un punto anterior con `npx wrangler d1 time-travel restore karinca --timestamp=<fecha>`. Para una copia propia: `npx wrangler d1 export karinca --remote --output=respaldo.sql`.

## Proteger el dominio con Cloudflare Access

La app no tiene login: **quien llegue a la URL puede ver y cambiar todo**, así que este paso no es opcional. Cloudflare Access (Zero Trust, gratis hasta 50 usuarios) pide un código que llega por correo antes de dejar pasar.

1. Cloudflare → Zero Trust → Access → Applications → Add an application → **Self-hosted**.
2. Application domain: el dominio de la app (ej. `karinca.tudominio.com`). Deja la ruta vacía para cubrir también `/api/*`.
3. Crea una política **Allow** con Include → *Emails* y los correos autorizados.
4. En Authentication deja activo **One-time PIN** (viene por defecto).
5. Session duration: `1 month` es cómodo para usarla desde el celular.

**Cierra las otras puertas.** El Worker también responde en `tiendakarinca.<cuenta>.workers.dev` y en las URLs de preview, que no pasan por la política anterior. En el Worker, Settings → Domains & Routes: desactiva `workers.dev` y las Preview URLs, o actívales Cloudflare Access desde ahí mismo.

## Decisiones tomadas

1. **Base de datos en D1 en lugar de Supabase**, para tener todo en Cloudflare. Consecuencias:
   - **El dinero se guarda como enteros en centavos** (columnas `*_c`), porque SQLite no tiene tipo decimal: 6,99 USD → `699`, TRM 3.149 → `314900`. Lo que ella escribe queda exacto; los derivados (prorrateo, costo total, sugerido) se calculan con decimales de doble precisión, igual que en el navegador.
   - **No hay funciones en la base.** Guardar ventas, compras y envíos es código del Worker (`worker/operaciones.ts`) en lotes atómicos; el stock y el límite de unidades por envío los hacen cumplir triggers.
   - **Los mensajes de esas reglas son genéricos** (no nombran el producto) cuando las rechaza la base. En el uso normal el formulario ya avisa antes, con el nombre del producto; el mensaje genérico solo aparece si dos personas guardan a la vez.
2. **El "potencial de retorno" incluye lo que está por cobrar.** Es venta real + ventas pendientes + (disponibles × precio de venta). Las unidades de una venta pendiente ya no están disponibles; sin sumarlas, el potencial bajaría cada vez que alguien queda debiendo.
3. **El potencial usa todo el histórico**, no el rango de fechas, para que sea comparable con el invertido acumulado. Las fechas solo filtran venta real, utilidad real, por cobrar, la gráfica de ventas y el top 5.
4. **Las ventas cuentan por su fecha de venta**, no por la fecha en que se pagaron (ese dato no existe).
5. **Consecutivo de ventas sin huecos.** Cada venta toma el siguiente número al guardarse; una venta rechazada no gasta número. Las anuladas conservan el suyo y las ventas nunca se borran.
6. **Editar una compra** no permite quitar un producto que ya tenga ventas o envíos, ni dejarle menos unidades de las ya enviadas o vendidas. Borrar una compra completa tiene la misma restricción.
7. **El envío por unidad se divide entre todas las unidades del lote**, tengan envío o no (costo promedio del lote, como pide la regla 2).
8. **Envío sin valor que repartir** (todas sus líneas cuestan 0): participación 0 y no se asigna nada, sin error.
9. **Punto o coma al escribir números.** Con un solo separador seguido de exactamente tres dígitos (`3.149`), en pesos y TRM se lee como miles (3149) y en dólares como decimal (3,149). En cualquier otro caso el último separador es el decimal.
10. **El precio se precarga en pesos enteros** al agregar un producto a una venta y al editarlo en el inventario. El precio sugerido en sí no se redondea; solo se muestra sin decimales.
11. **Stock bajo** = queda 1 unidad. **Agotado** = 0. "Se están acabando" en el inicio no lista los agotados.
12. **Una venta pendiente aparta unidades** igual que una pagada. Solo la anulada las devuelve.
13. **Ruta de detalle = formulario de edición** en compras y envíos (`/compras/:id`, `/envios/:id`). En ventas el detalle es el comprobante y la edición está en `/ventas/:id/editar`.
14. **Subtotales del inventario:** las columnas de costo suman el lote completo (unitario × unidades) y "Precio venta" muestra lo que valen las unidades disponibles.
15. **El CSV** usa punto y coma y coma decimal para que Excel en español lo abra bien.
16. **Preferencias por dispositivo** (último vendedor, columnas visibles, "solo con stock", ver ganancia) se guardan en el navegador, no en la base.
17. **Además de renombrar y fusionar**, una tienda sin compras se puede borrar.
18. **Los filtros de inventario, envíos y clientes** se aplican en el navegador: con el volumen esperado es instantáneo y evita viajes a la base.
19. **"Hoy" es la fecha de Bogotá** (UTC−5 fijo, sin horario de verano).
