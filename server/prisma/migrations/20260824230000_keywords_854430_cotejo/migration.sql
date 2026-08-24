-- D1 (re-verificación 24-ago-2026): keywords legacy pre-HS2022 pegadas a
-- fracciones cuyo SIGNIFICADO cambió en la recodificación 2022/2026.
-- El caso venenoso: 8544.30.01 hoy es "Reconocibles para naves aéreas."
-- (Base Única 2026) pero conservaba keywords del viejo 8544.30.01
-- ("juegos de cables... arneses automotrices"): ['arnés','cables','bujías',
-- 'automotriz','wiring harness']. Un arnés automotriz recuperaba esta
-- fracción con descripción de aeronaves (el modelo la descarta) y 8544.42.01
-- —que también traía 'arnés' en keywords legacy— se leía perfecta.
-- Resultado: 8544.30 nunca entraba al análisis con sentido.
--
-- Cotejo (24-ago-2026, Base Única LIGIE DOF 30-mar-2026):
--   8544.30    = "Juegos de cables para bujías de encendido y demás juegos de
--                 cables de los tipos utilizados en los medios de transporte"
--   8544.30.01 = "Reconocibles para naves aéreas."
--   8544.30.99 = "Los demás." (residual: los juegos de cables NO aeronáuticos
--                 — ahí viven los arneses automotrices; 'arnés/harness' es el
--                 sinónimo comercial del texto oficial, anclado a ESTA fracción)
--   8544.42.01 = "Los demás conductores eléctricos ... provistos de piezas de
--                 conexión" (NO menciona arneses — se le quita el keyword legacy)
--
-- Idempotente: UPDATE con IS DISTINCT FROM. No toca ninguna otra fila.
UPDATE "fractions"
SET "keywords" = ARRAY['naves','aeronaves','aeronáutico','aviones','bujías','juegos','cables']
WHERE code = '85443001'
  AND "keywords" IS DISTINCT FROM ARRAY['naves','aeronaves','aeronáutico','aviones','bujías','juegos','cables'];

UPDATE "fractions"
SET "keywords" = ARRAY['juegos','cables','bujías','encendido','transporte','vehículos','automotriz','arnés','arneses','harness']
WHERE code = '85443099'
  AND "keywords" IS DISTINCT FROM ARRAY['juegos','cables','bujías','encendido','transporte','vehículos','automotriz','arnés','arneses','harness'];

UPDATE "fractions"
SET "keywords" = ARRAY['cable','cables','conductor','conductores','conector','conectores','conexión']
WHERE code = '85444201'
  AND "keywords" IS DISTINCT FROM ARRAY['cable','cables','conductor','conductores','conector','conectores','conexión'];
