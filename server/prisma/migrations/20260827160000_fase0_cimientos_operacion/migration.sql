-- Fase 0 (27-ago-2026): cimientos de operación — Cliente/RFC, parte versionada, lote de clasificación, Anexo 24 por pedimento-partida, cierre mensual, calendario de obligaciones, certificados de proveedor, plantillas MVE, cambios de régimen, dictamen humano, tabulador. Solo ADD/CREATE, sin DROP; columnas nuevas nullable o con default → sin pérdida de datos. Ver docs/PLAN_OPERACION_2026-08.md.

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "antidumping_duties" ADD COLUMN     "cotejadoAt" TIMESTAMP(3),
ADD COLUMN     "esAntielusion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "examenSunsetFecha" TIMESTAMP(3),
ADD COLUMN     "exportadorTasas" JSONB,
ADD COLUMN     "fuenteUrl" TEXT;

-- AlterTable
ALTER TABLE "classification_jobs" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "classifications" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "discharges" ADD COLUMN     "assemblyId" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "constanciaTransferencia" TEXT,
ADD COLUMN     "pedimentoPartidaId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "classificationId" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "glosa_simulations" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "manifestaciones_valor" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "decrementables" JSONB,
ADD COLUMN     "estadoTransmision" TEXT NOT NULL DEFAULT 'lista_para_transmitir',
ADD COLUMN     "formaPago" TEXT,
ADD COLUMN     "incrementables" JSONB,
ADD COLUMN     "metodoValoracion" TEXT,
ADD COLUMN     "pesoBrutoKg" DOUBLE PRECISION,
ADD COLUMN     "plantillaId" TEXT,
ADD COLUMN     "rfcImportador" TEXT,
ADD COLUMN     "vigenciaHasta" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "glosaDocumental" JSONB,
ADD COLUMN     "pedimentoId" TEXT,
ADD COLUMN     "retencionHasta" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "origin_analyses" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "pedimento_partidas" ADD COLUMN     "nico" TEXT,
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "pedimentos" ADD COLUMN     "archivoHash" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "layoutVersion" TEXT,
ADD COLUMN     "origenArchivo" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "nico" TEXT,
ADD COLUMN     "noms" JSONB,
ADD COLUMN     "paisOrigen" TEXT,
ADD COLUMN     "usoDestino" TEXT,
ADD COLUMN     "versionVigente" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "escenarios" JSONB,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "parentQuoteId" TEXT,
ADD COLUMN     "tabuladorId" TEXT,
ADD COLUMN     "tcFechaDOF" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "vigenciaHasta" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "risk_assessments" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "evidencia" JSONB,
ADD COLUMN     "folio" TEXT,
ADD COLUMN     "operationId" TEXT;

-- AlterTable
ALTER TABLE "tax_credits" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "temporary_imports" ADD COLUMN     "claveDocumento" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "pedimentoPartidaId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'INSUMO',
ADD COLUMN     "ubicacionId" TEXT,
ADD COLUMN     "vidaUtilMeses" INTEGER;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "digestSemanalCanal" TEXT,
ADD COLUMN     "digestUltimoEnvioAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "programaIMMEX" TEXT,
    "certificacionIVAIEPS" TEXT,
    "padronImportadores" BOOLEAN NOT NULL DEFAULT false,
    "padronesSectoriales" TEXT[],
    "contactoNombre" TEXT,
    "contactoEmail" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_classification_versions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "nico" TEXT,
    "justificacion" TEXT,
    "fuente" TEXT NOT NULL,
    "classificationId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'propuesta',
    "propuestoPor" TEXT NOT NULL,
    "aprobadoPor" TEXT,
    "aprobadoAt" TIMESTAMP(3),
    "tigieVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_classification_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "userId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "totalFilas" INTEGER NOT NULL,
    "verdes" INTEGER NOT NULL DEFAULT 0,
    "ambar" INTEGER NOT NULL DEFAULT 0,
    "rojas" INTEGER NOT NULL DEFAULT 0,
    "procesadas" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "classification_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_batch_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "productCode" TEXT,
    "descripcion" TEXT NOT NULL,
    "contexto" TEXT,
    "paisOrigen" TEXT,
    "valorUSD" DOUBLE PRECISION,
    "usoDestino" TEXT,
    "semaforo" TEXT,
    "fractionCode" TEXT,
    "confidence" DOUBLE PRECISION,
    "coincideCatalogo" BOOLEAN,
    "fraccionCatalogo" TEXT,
    "classificationId" TEXT,
    "jobId" TEXT,
    "productId" TEXT,
    "error" TEXT,
    "revisado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_batch_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PLANTA',
    "domicilio" TEXT,
    "rfcTercero" TEXT,
    "avisoSubmaquila" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_periodo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "periodo" TEXT NOT NULL,
    "cerradoPor" TEXT NOT NULL,
    "cerradoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash" TEXT,
    "resumen" JSONB,
    "notas" TEXT,

    CONSTRAINT "cierres_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligaciones_calendario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fundamento" TEXT,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "recurrencia" TEXT,
    "responsableUserId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "cumplidaAt" TIMESTAMP(3),
    "evidenciaDocumentId" TEXT,
    "consecuencia" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obligaciones_calendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados_origen_proveedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "proveedorNombre" TEXT NOT NULL,
    "proveedorPais" TEXT NOT NULL,
    "proveedorEmail" TEXT,
    "productId" TEXT,
    "fractionCode" TEXT,
    "tratado" TEXT NOT NULL DEFAULT 'TMEC',
    "vigenciaDesde" TIMESTAMP(3),
    "vigenciaHasta" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'solicitado',
    "documentId" TEXT,
    "tokenSolicitud" TEXT,
    "solicitadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibidoAt" TIMESTAMP(3),
    "notas" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "certificados_origen_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mve_plantillas_proveedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedorNombre" TEXT NOT NULL,
    "proveedorPais" TEXT,
    "campos" JSONB NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mve_plantillas_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_regimen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "temporaryImportIds" TEXT[],
    "calculo" JSONB NOT NULL,
    "quoteId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cambios_regimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_dictamen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classificationId" TEXT,
    "productId" TEXT,
    "solicitadoPor" TEXT NOT NULL,
    "asignadoA" TEXT,
    "motivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "dictamen" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMP(3),

    CONSTRAINT "solicitudes_dictamen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabuladores_honorarios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "reglas" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tabuladores_honorarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_tenantId_idx" ON "clientes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenantId_rfc_key" ON "clientes"("tenantId", "rfc");

-- CreateIndex
CREATE INDEX "product_classification_versions_productId_idx" ON "product_classification_versions"("productId");

-- CreateIndex
CREATE INDEX "product_classification_versions_fractionCode_idx" ON "product_classification_versions"("fractionCode");

-- CreateIndex
CREATE UNIQUE INDEX "product_classification_versions_productId_version_key" ON "product_classification_versions"("productId", "version");

-- CreateIndex
CREATE INDEX "classification_batches_tenantId_idx" ON "classification_batches"("tenantId");

-- CreateIndex
CREATE INDEX "classification_batches_tenantId_status_idx" ON "classification_batches"("tenantId", "status");

-- CreateIndex
CREATE INDEX "classification_batch_rows_batchId_idx" ON "classification_batch_rows"("batchId");

-- CreateIndex
CREATE INDEX "ubicaciones_tenantId_idx" ON "ubicaciones"("tenantId");

-- CreateIndex
CREATE INDEX "cierres_periodo_tenantId_idx" ON "cierres_periodo"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_periodo_tenantId_periodo_key" ON "cierres_periodo"("tenantId", "periodo");

-- CreateIndex
CREATE INDEX "obligaciones_calendario_tenantId_fechaLimite_idx" ON "obligaciones_calendario"("tenantId", "fechaLimite");

-- CreateIndex
CREATE INDEX "obligaciones_calendario_tenantId_estado_idx" ON "obligaciones_calendario"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_origen_proveedor_tokenSolicitud_key" ON "certificados_origen_proveedor"("tokenSolicitud");

-- CreateIndex
CREATE INDEX "certificados_origen_proveedor_tenantId_idx" ON "certificados_origen_proveedor"("tenantId");

-- CreateIndex
CREATE INDEX "certificados_origen_proveedor_tenantId_vigenciaHasta_idx" ON "certificados_origen_proveedor"("tenantId", "vigenciaHasta");

-- CreateIndex
CREATE UNIQUE INDEX "mve_plantillas_proveedor_tenantId_proveedorNombre_key" ON "mve_plantillas_proveedor"("tenantId", "proveedorNombre");

-- CreateIndex
CREATE INDEX "cambios_regimen_tenantId_idx" ON "cambios_regimen"("tenantId");

-- CreateIndex
CREATE INDEX "solicitudes_dictamen_tenantId_estado_idx" ON "solicitudes_dictamen"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "tabuladores_honorarios_tenantId_idx" ON "tabuladores_honorarios"("tenantId");

-- CreateIndex
CREATE INDEX "alerts_clienteId_idx" ON "alerts"("clienteId");

-- CreateIndex
CREATE INDEX "classification_jobs_clienteId_idx" ON "classification_jobs"("clienteId");

-- CreateIndex
CREATE INDEX "classifications_clienteId_idx" ON "classifications"("clienteId");

-- CreateIndex
CREATE INDEX "documents_productId_idx" ON "documents"("productId");

-- CreateIndex
CREATE INDEX "documents_classificationId_idx" ON "documents"("classificationId");

-- CreateIndex
CREATE INDEX "documents_clienteId_idx" ON "documents"("clienteId");

-- CreateIndex
CREATE INDEX "glosa_simulations_clienteId_idx" ON "glosa_simulations"("clienteId");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_clienteId_idx" ON "manifestaciones_valor"("clienteId");

-- CreateIndex
CREATE INDEX "operations_clienteId_idx" ON "operations"("clienteId");

-- CreateIndex
CREATE INDEX "origin_analyses_clienteId_idx" ON "origin_analyses"("clienteId");

-- CreateIndex
CREATE INDEX "pedimentos_archivoHash_idx" ON "pedimentos"("archivoHash");

-- CreateIndex
CREATE INDEX "pedimentos_clienteId_idx" ON "pedimentos"("clienteId");

-- CreateIndex
CREATE INDEX "products_clienteId_idx" ON "products"("clienteId");

-- CreateIndex
CREATE INDEX "quotes_clienteId_idx" ON "quotes"("clienteId");

-- CreateIndex
CREATE INDEX "risk_assessments_folio_idx" ON "risk_assessments"("folio");

-- CreateIndex
CREATE INDEX "risk_assessments_clienteId_idx" ON "risk_assessments"("clienteId");

-- CreateIndex
CREATE INDEX "tax_credits_clienteId_idx" ON "tax_credits"("clienteId");

-- CreateIndex
CREATE INDEX "temporary_imports_productId_idx" ON "temporary_imports"("productId");

-- CreateIndex
CREATE INDEX "temporary_imports_ubicacionId_idx" ON "temporary_imports"("ubicacionId");

-- CreateIndex
CREATE INDEX "temporary_imports_clienteId_idx" ON "temporary_imports"("clienteId");

-- AddForeignKey
ALTER TABLE "temporary_imports" ADD CONSTRAINT "temporary_imports_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_imports" ADD CONSTRAINT "temporary_imports_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_classification_versions" ADD CONSTRAINT "product_classification_versions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_batches" ADD CONSTRAINT "classification_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_batch_rows" ADD CONSTRAINT "classification_batch_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "classification_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_periodo" ADD CONSTRAINT "cierres_periodo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligaciones_calendario" ADD CONSTRAINT "obligaciones_calendario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_dictamen" ADD CONSTRAINT "solicitudes_dictamen_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

