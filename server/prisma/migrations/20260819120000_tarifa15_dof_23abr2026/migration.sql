-- Cotejo LIGIE post-snapshot (lote 0.5 del Corpus Íntegro, 19-ago-2026).
-- Fuente: "DECRETO por el que se modifica la Tarifa de la LIGIE, y el Decreto
-- PROSEC", DOF 23-abr-2026 (edición vespertina), vigente desde 24-abr-2026.
-- https://www.diputados.gob.mx/LeyesBiblio/ref/ligie_2022/LIGIE_2022_tarifa15_23abr26.pdf
-- El decreto modifica ARANCELES de 185 fracciones (no crea ni suprime).
-- 181 ya coincidían con el snapshot Base Única 30-mar-2026 (renovación de
-- temporales abr-2024 al mismo nivel); estas 4 son el delta real, VERBATIM
-- de la columna "IMPUESTO DE IMP." del decreto. Idempotente.

UPDATE fractions SET "tariffNMF" = 15 WHERE code = '48010001' AND "tariffNMF" IS DISTINCT FROM 15; -- Papel prensa en bobinas (rollos) o en hojas.
UPDATE fractions SET "tariffNMF" = 35 WHERE code = '73181599' AND "tariffNMF" IS DISTINCT FROM 35; -- Los demás (tornillos).
UPDATE fractions SET "tariffNMF" = 25 WHERE code = '76042101' AND "tariffNMF" IS DISTINCT FROM 25; -- Perfiles huecos (aluminio).
UPDATE fractions SET "tariffNMF" = 35 WHERE code = '87082999' AND "tariffNMF" IS DISTINCT FROM 35; -- Los demás (autopartes).
