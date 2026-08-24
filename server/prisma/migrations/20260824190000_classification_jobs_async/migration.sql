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
