-- Clasificación asíncrona (BUG-1/BUG-2, auditoría 24-ago-2026).
-- POST /api/classify crea un job y responde 202; el pipeline corre server-side
-- y la UI hace polling. El resultado definitivo sigue viviendo en
-- classifications; el job guarda copia del payload de respuesta para
-- reconstruir el expediente al volver (retención 7 días, borrado perezoso).
CREATE TABLE "classification_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "inputs" JSONB NOT NULL,
    "error" JSONB,
    "result" JSONB,
    "classificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "classification_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "classification_jobs_tenantId_createdAt_idx" ON "classification_jobs"("tenantId", "createdAt");

CREATE INDEX "classification_jobs_tenantId_userId_status_idx" ON "classification_jobs"("tenantId", "userId", "status");

-- Un job ACTIVO por tenant+usuario (índice único parcial): cierra la carrera
-- de doble submit donde dos POST simultáneos pasan el findFirst y crean dos
-- jobs (dos pipelines LLM completos). El create del perdedor truena con P2002
-- y el runner devuelve el job ganador. (Prisma no expresa índices parciales
-- en el schema; vive solo en SQL — documentado en el modelo.)
CREATE UNIQUE INDEX "classification_jobs_one_active_per_user"
  ON "classification_jobs"("tenantId", "userId")
  WHERE status IN ('queued', 'running');

-- Integridad referencial: sin estas FKs la retención perezosa dejaría filas
-- huérfanas si un tenant/usuario se elimina.
ALTER TABLE "classification_jobs" ADD CONSTRAINT "classification_jobs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "classification_jobs" ADD CONSTRAINT "classification_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
