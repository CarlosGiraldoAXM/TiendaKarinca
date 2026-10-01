-- Datos iniciales tomados del Excel. Córrelo UNA vez sobre una base recién migrada
-- (si ya existen las tiendas, falla sin cargar nada).

-- ====== Constantes: ajústalas aquí ======
CREATE TABLE _seed (trm REAL, fecha TEXT, envio_usd REAL, envio_cop REAL);
INSERT INTO _seed VALUES (
  3149,           -- TRM: pesos por 1 dólar
  '2026-09-30',   -- fecha de todas las compras y del envío
  170,            -- envío en USD
  535330          -- envío en COP (170 × 3.149)
);

-- tienda | nombre | unidades | precio unitario USD | tax unitario USD
CREATE TABLE _seed_items (tienda TEXT, nombre TEXT, unidades INTEGER, precio REAL, tax REAL);
INSERT INTO _seed_items VALUES
  ('DAISE', 'DAISE Rosado Mini Body Mist + Charm', 3, 6.99, 0.46),
  ('DAISE', 'DAISE Amarillo Mini Body Mist + Charm', 3, 6.99, 0.46),
  ('DAISE', 'DAISE Azul Mini Body Mist + Charm', 3, 6.99, 0.46),
  ('DAISE', 'DAISE Naranja Mini Body Mist + Charm', 3, 6.99, 0.46),
  ('PINK', 'Rich Honey Body Lotion', 4, 8.26, 0.55),
  ('PINK', 'Rich Hair & Body Mist', 4, 8.26, 0.55),
  ('PINK', 'Body Lotion', 4, 8.26, 0.55),
  ('PINK', 'Rich Honey Body Oil', 6, 8.26, 0.55),
  ('PINK', 'Coconut Hair & Body Mist', 4, 8.26, 0.55),
  ('PINK', 'Coconut Shimmer Me! Body Mist', 4, 8.26, 0.55),
  ('PINK', 'Classic Highlighting Body Oil', 6, 8.26, 0.55),
  ('PINK', 'Coconut Creamy Gelato Body Butter', 4, 8.26, 0.55),
  ('PINK', 'Coconut Body Scrub', 4, 8.26, 0.55),
  ('PINK', 'Vanilla Body Oil', 6, 8.26, 0.55),
  ('Bath & Body Works', 'Champagne Toast PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Cozy Vanilla Almond PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Sunshine & Lemons PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Pumpkin Cupcake PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Pink Peach Blossom PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'A Thousand Wishes PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Ocean PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Strawberry Pound Cake PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Crisp Morning Air PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Pumpkin Pecan Waffles PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Bath & Body Works', 'Japanese Cherry Blossom PocketBac Hand Sanitizer', 5, 1.48, 0.10),
  ('Vaseline', 'Vaseline Lip Therapy Rosy Lips', 2, 2.99, 0),
  ('Vaseline', 'Vaseline Lip Therapy Crème Brulee', 2, 2.99, 0),
  ('Vaseline', 'Vaseline Lip Therapy Original', 2, 2.99, 0),
  ('Vaseline', 'Vaseline Lip Therapy Cocoa Butter', 2, 2.99, 0),
  ('Vaseline', 'Vaseline Cocoa Radiant Oil Gel with Cocoa Butter', 6, 2.74, 0),
  ('Vaseline', 'Vaseline Cocoa Shimmer Jelly Stick', 3, 7.33, 0),
  ('Vaseline', 'Vaseline Cocoa Radiant Oil Gel Glazed', 6, 2.81, 0),
  ('EOS', 'EOS Pumpkin Chai Shea Butter', 3, 10.99, 0),
  ('EOS', 'EOS Pistachio Shea Butter', 3, 9.98, 0),
  ('EOS', 'EOS Vainilla Cashmere Shea Butter', 3, 9.97, 0),
  ('EOS', 'EOS Strawberry Dream Shea Butter', 3, 9.97, 0),
  ('Dove', 'DOVE Cedarwood + Crushed Mint Body Wash', 3, 8.87, 0),
  ('Dove', 'DOVE Cranberry + Orange Peel Body Wash', 3, 8.87, 0),
  ('Dove', 'DOVE Marshmallow + Warm Vanilla Body Wash', 3, 8.87, 0),
  ('Dove', 'DOVE Cinnamon Pumpkin', 2, 7.97, 0);

-- ====== Carga ======
-- Una tienda y una compra por cada grupo.
INSERT INTO tiendas (nombre)
SELECT tienda FROM _seed_items GROUP BY tienda ORDER BY min(rowid);

INSERT INTO compras (tienda_id, fecha, trm_c)
SELECT t.id, s.fecha, CAST(round(s.trm * 100) AS INTEGER)
FROM tiendas t, _seed s
WHERE t.nombre IN (SELECT tienda FROM _seed_items);

INSERT INTO compra_items (compra_id, nombre, unidades, precio_unitario_usd_c, tax_unitario_usd_c, orden)
SELECT c.id, i.nombre, i.unidades, CAST(round(i.precio * 100) AS INTEGER), CAST(round(i.tax * 100) AS INTEGER), i.rowid
FROM _seed_items i
JOIN tiendas t ON t.nombre = i.tienda
JOIN compras c ON c.tienda_id = t.id
ORDER BY i.rowid;

-- Un solo envío con todas las unidades de todos los ítems.
INSERT INTO envios (fecha, descripcion, valor_usd_c, valor_cop_c)
SELECT fecha, 'Envío inicial', CAST(round(envio_usd * 100) AS INTEGER), CAST(round(envio_cop * 100) AS INTEGER) FROM _seed;

INSERT INTO envio_items (envio_id, compra_item_id, unidades)
SELECT e.id, ci.id, ci.unidades
FROM compra_items ci, envios e
WHERE e.descripcion = 'Envío inicial';

DROP TABLE _seed_items;
DROP TABLE _seed;

-- ====== Verificación: coteja estos totales con el Excel ======
SELECT
  (SELECT count(*) FROM compra_items)                              AS items,
  d.unidades_totales                                               AS unidades,
  (SELECT sum(total_usd) FROM v_compras_resumen)                   AS total_mercancia_usd,
  (SELECT sum(valor_usd) FROM v_envios_resumen)                    AS envio_usd,
  (SELECT sum(total_usd) FROM v_compras_resumen) + (SELECT sum(valor_usd) FROM v_envios_resumen) AS total_gastado_en_usa_usd,
  d.invertido_cop                                                  AS total_invertido_cop
FROM v_dashboard d;
