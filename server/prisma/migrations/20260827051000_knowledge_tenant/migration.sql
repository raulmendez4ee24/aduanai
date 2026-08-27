-- Bloque 3 (26-ago-2026): ClassificationKnowledge sin contaminación entre tenants.
-- El feedback "incorrecta" creaba filas globales no verificadas que el retrieval
-- consumía para TODOS los tenants. Ahora cada fila de feedback lleva tenantId y
-- solo su tenant la consume mientras no esté verificada; null = global (staff).
-- Las filas existentes quedan null: como NO están verificadas, dejan de entrar
-- al prompt de nadie hasta que staff las verifique (comportamiento deseado).
-- Idempotente.
ALTER TABLE "classification_knowledge" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
CREATE INDEX IF NOT EXISTS "classification_knowledge_tenantId_idx" ON "classification_knowledge"("tenantId");
