-- Esquema base (Cloudflare D1 / SQLite).
-- Solo se guardan los datos que escribe la usuaria; todos los costos derivados salen de las vistas.
--
-- Dinero: SQLite no tiene tipo decimal, así que lo que se escribe se guarda como ENTERO en
-- centavos (columnas *_c): 6.99 USD → 699, TRM 3149 → 314900, 23456 COP → 2345600.
-- Las vistas devuelven los valores ya en unidades; el Worker convierte al guardar.

-- ---------------------------------------------------------------- tiendas
CREATE TABLE tiendas (
  id         TEXT PRIMARY KEY DEFAULT (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + abs(random()) % 4, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX tiendas_nombre_unico ON tiendas (lower(trim(nombre)));

-- ---------------------------------------------------------------- compras
CREATE TABLE compras (
  id         TEXT PRIMARY KEY DEFAULT (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + abs(random()) % 4, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  tienda_id  TEXT NOT NULL REFERENCES tiendas (id) ON DELETE RESTRICT,
  -- "hoy" en Bogotá (UTC-5, sin horario de verano)
  fecha      TEXT NOT NULL DEFAULT (date('now', '-5 hours')) CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  trm_c      INTEGER NOT NULL CHECK (trm_c > 0),
  notas      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX compras_tienda_idx ON compras (tienda_id);
CREATE INDEX compras_fecha_idx ON compras (fecha DESC);

CREATE TABLE compra_items (
  id                    TEXT PRIMARY KEY DEFAULT (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + abs(random()) % 4, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  compra_id             TEXT NOT NULL REFERENCES compras (id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  unidades              INTEGER NOT NULL CHECK (unidades > 0),
  precio_unitario_usd_c INTEGER NOT NULL CHECK (precio_unitario_usd_c >= 0),
  tax_unitario_usd_c    INTEGER NOT NULL DEFAULT 0 CHECK (tax_unitario_usd_c >= 0),
  -- NULL = usar el precio sugerido
  precio_venta_cop_c    INTEGER CHECK (precio_venta_cop_c IS NULL OR precio_venta_cop_c >= 0),
  orden                 INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX compra_items_compra_idx ON compra_items (compra_id);

-- ---------------------------------------------------------------- envios
CREATE TABLE envios (
  id          TEXT PRIMARY KEY DEFAULT (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + abs(random()) % 4, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  fecha       TEXT NOT NULL DEFAULT (date('now', '-5 hours')) CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  descripcion TEXT,
  valor_usd_c INTEGER NOT NULL CHECK (valor_usd_c >= 0),
  valor_cop_c INTEGER NOT NULL CHECK (valor_cop_c >= 0),
  notas       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE envio_items (
  id             TEXT PRIMARY KEY DEFAULT (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + abs(random()) % 4, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  envio_id       TEXT NOT NULL REFERENCES envios (id) ON DELETE CASCADE,
  compra_item_id TEXT NOT NULL REFERENCES compra_items (id) ON DELETE RESTRICT,
  unidades       INTEGER NOT NULL CHECK (unidades > 0),
  UNIQUE (envio_id, compra_item_id)
);
CREATE INDEX envio_items_item_idx ON envio_items (compra_item_id);

-- ---------------------------------------------------------------- config (una sola fila)
CREATE TABLE config (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  -- % de utilidad en centésimas: 40 % → 4000
  utilidad_pct_c INTEGER NOT NULL DEFAULT 4000 CHECK (utilidad_pct_c >= 0)
);
INSERT INTO config (id) VALUES (1);

-- ---------------------------------------------------------------- clientes
CREATE TABLE clientes (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  telefono    TEXT,
  canal       TEXT NOT NULL DEFAULT 'otro' CHECK (canal IN ('instagram', 'tiktok', 'whatsapp', 'facebook', 'referido', 'otro')),
  usuario_red TEXT,
  notas       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------- ventas
CREATE TABLE ventas (
  id              TEXT PRIMARY KEY,
  consecutivo     INTEGER NOT NULL UNIQUE,
  numero          TEXT GENERATED ALWAYS AS ('V-' || CASE WHEN consecutivo < 10000 THEN substr('0000' || consecutivo, -4) ELSE consecutivo END) VIRTUAL,
  fecha           TEXT NOT NULL DEFAULT (date('now', '-5 hours')) CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  vendedor        TEXT NOT NULL DEFAULT '',
  cliente_id      TEXT NOT NULL REFERENCES clientes (id) ON DELETE RESTRICT,
  metodo_pago     TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta', 'otro')),
  descuento_cop_c INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cop_c >= 0),
  estado          TEXT NOT NULL DEFAULT 'pagada' CHECK (estado IN ('pendiente', 'pagada', 'entregada', 'anulada')),
  notas           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ventas_cliente_idx ON ventas (cliente_id);
CREATE INDEX ventas_fecha_idx ON ventas (fecha DESC);

CREATE TABLE venta_items (
  id                    TEXT PRIMARY KEY,
  venta_id              TEXT NOT NULL REFERENCES ventas (id) ON DELETE CASCADE,
  compra_item_id        TEXT NOT NULL REFERENCES compra_items (id) ON DELETE RESTRICT,
  unidades              INTEGER NOT NULL CHECK (unidades > 0),
  precio_unitario_cop_c INTEGER NOT NULL CHECK (precio_unitario_cop_c >= 0)
);
CREATE INDEX venta_items_venta_idx ON venta_items (venta_id);
CREATE INDEX venta_items_item_idx ON venta_items (compra_item_id);
