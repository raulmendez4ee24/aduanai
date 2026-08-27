-- Bloque 3 (26-ago-2026): consultHash del Copilot acotado por tenant.
-- Antes: UNIQUE global en consultHash y hash = f(pregunta|respuesta|docs|
-- modelo). Dos tenants con la misma consulta canónica (la abstención fija)
-- colisionaban en el upsert y el feedback cruzaba tenants.
-- Ahora: el hash incluye tenantId (código) y la unicidad es (tenantId,
-- consultHash). Las filas existentes no colisionan: el índice global viejo
-- garantizaba que no hubiera dos consultHash iguales, así que el compuesto
-- se crea sin conflicto. Idempotente.
DROP INDEX IF EXISTS "copilot_consults_consultHash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "copilot_consults_tenantId_consultHash_key"
  ON "copilot_consults"("tenantId", "consultHash");
