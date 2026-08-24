-- BUG-12 (fidelidad de la regla): el T-MEC típico pide VCR 60% por valor de
-- transacción O 50% por costo neto — el modelo solo tenía UN rvcRequired y
-- 'either'+60 exigía 60% también por costo neto (rechazaba operaciones que
-- SÍ califican por CN). Columna opcional: null conserva el comportamiento
-- previo (rvcRequired para todos los métodos).
ALTER TABLE "origin_rules" ADD COLUMN "rvcRequiredNetCost" DOUBLE PRECISION;
