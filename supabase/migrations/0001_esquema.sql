-- Esquema base. Solo se guardan los datos que escribe la usuaria;
-- todos los costos derivados salen de las vistas (0003_vistas.sql).

create extension if not exists pgcrypto;

create type canal_cliente as enum ('instagram', 'tiktok', 'whatsapp', 'facebook', 'referido', 'otro');
create type metodo_pago   as enum ('efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta', 'otro');
create type estado_venta  as enum ('pendiente', 'pagada', 'entregada', 'anulada');

create or replace function hoy_bogota() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

-- ---------------------------------------------------------------- tiendas
create table tiendas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  created_at timestamptz not null default now()
);
create unique index tiendas_nombre_unico on tiendas (lower(trim(nombre)));

-- ---------------------------------------------------------------- compras
create table compras (
  id         uuid primary key default gen_random_uuid(),
  tienda_id  uuid not null references tiendas (id) on delete restrict,
  fecha      date not null default hoy_bogota(),
  trm        numeric(10,2) not null check (trm > 0),
  notas      text,
  created_at timestamptz not null default now()
);
create index compras_tienda_idx on compras (tienda_id);
create index compras_fecha_idx on compras (fecha desc);

create table compra_items (
  id                  uuid primary key default gen_random_uuid(),
  compra_id           uuid not null references compras (id) on delete cascade,
  nombre              text not null check (length(trim(nombre)) > 0),
  unidades            integer not null check (unidades > 0),
  precio_unitario_usd numeric(12,2) not null check (precio_unitario_usd >= 0),
  tax_unitario_usd    numeric(12,2) not null default 0 check (tax_unitario_usd >= 0),
  -- null = usar el precio sugerido
  precio_venta_cop    numeric(14,2) check (precio_venta_cop is null or precio_venta_cop >= 0),
  orden               integer not null default 0,
  created_at          timestamptz not null default now()
);
create index compra_items_compra_idx on compra_items (compra_id);

-- ---------------------------------------------------------------- envios
create table envios (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default hoy_bogota(),
  descripcion text,
  valor_usd   numeric(12,2) not null check (valor_usd >= 0),
  valor_cop   numeric(14,2) not null check (valor_cop >= 0),
  notas       text,
  created_at  timestamptz not null default now()
);

create table envio_items (
  id             uuid primary key default gen_random_uuid(),
  envio_id       uuid not null references envios (id) on delete cascade,
  compra_item_id uuid not null references compra_items (id) on delete restrict,
  unidades       integer not null check (unidades > 0),
  unique (envio_id, compra_item_id)
);
create index envio_items_item_idx on envio_items (compra_item_id);

-- ---------------------------------------------------------------- config (una sola fila)
create table config (
  id           boolean primary key default true check (id),
  utilidad_pct numeric(6,2) not null default 40 check (utilidad_pct >= 0)
);
insert into config (id) values (true);

-- ---------------------------------------------------------------- clientes
create table clientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  telefono    text,
  canal       canal_cliente not null default 'otro',
  usuario_red text,
  notas       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- ventas
create sequence ventas_consecutivo_seq;

create table ventas (
  id            uuid primary key default gen_random_uuid(),
  consecutivo   bigint not null unique default nextval('ventas_consecutivo_seq'),
  numero        text generated always as (
                  'V-' || case when consecutivo < 10000
                               then lpad(consecutivo::text, 4, '0')
                               else consecutivo::text end
                ) stored,
  fecha         date not null default hoy_bogota(),
  vendedor      text not null default '',
  cliente_id    uuid not null references clientes (id) on delete restrict,
  metodo_pago   metodo_pago not null default 'efectivo',
  descuento_cop numeric(14,2) not null default 0 check (descuento_cop >= 0),
  estado        estado_venta not null default 'pagada',
  notas         text,
  created_at    timestamptz not null default now()
);
alter sequence ventas_consecutivo_seq owned by ventas.consecutivo;
create index ventas_cliente_idx on ventas (cliente_id);
create index ventas_fecha_idx on ventas (fecha desc);

create table venta_items (
  id                  uuid primary key default gen_random_uuid(),
  venta_id            uuid not null references ventas (id) on delete cascade,
  compra_item_id      uuid not null references compra_items (id) on delete restrict,
  unidades            integer not null check (unidades > 0),
  precio_unitario_cop numeric(14,2) not null check (precio_unitario_cop >= 0)
);
create index venta_items_venta_idx on venta_items (venta_id);
create index venta_items_item_idx on venta_items (compra_item_id);

-- ---------------------------------------------------------------- RLS
-- Sin políticas: solo el service role (que usa el Worker) puede leer o escribir.
alter table tiendas      enable row level security;
alter table compras      enable row level security;
alter table compra_items enable row level security;
alter table envios       enable row level security;
alter table envio_items  enable row level security;
alter table config       enable row level security;
alter table clientes     enable row level security;
alter table ventas       enable row level security;
alter table venta_items  enable row level security;
