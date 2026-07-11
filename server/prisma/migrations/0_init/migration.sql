-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PILOT', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'PILOT', 'ACTIVE', 'SUSPENDED', 'CHURNED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIEWER', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('CASO_CLASIFICACION', 'CRITERIO_SAT', 'RESOLUCION_SCJN', 'NOTA_EXPLICATIVA_OMA', 'NOTA_LEGAL', 'REGLA_SECTOR', 'ERROR_COMUN', 'PRECEDENTE', 'CONSULTA_SAT');

-- CreateEnum
CREATE TYPE "PedimentoStatus" AS ENUM ('DRAFT', 'VALIDATING', 'WITH_ERRORS', 'VALIDATED', 'TRANSMITTED');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('IMPORT', 'EXPORT', 'TRANSIT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('ACTIVE', 'PARTIALLY_DISCHARGED', 'FULLY_DISCHARGED', 'EXPIRED', 'REGULARIZED');

-- CreateEnum
CREATE TYPE "DischargeType" AS ENUM ('RETURN_EXPORT', 'DOMESTIC_SALE', 'REGIME_CHANGE', 'WASTE', 'SCRAP', 'DESTRUCTION', 'DONATION', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'GENERATED', 'TRANSMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('ACTIVE', 'PARTIALLY_USED', 'FULLY_USED', 'EXPIRED', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('FIANZA', 'CARTA_CREDITO', 'DEPOSITO', 'OTRO');

-- CreateEnum
CREATE TYPE "GuaranteeStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('ACTIVE', 'RENEWAL_PENDING', 'AT_RISK', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MVEStatus" AS ENUM ('DRAFT', 'VALIDATED', 'SIGNED', 'TRANSMITTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('CONTAINER_20FT', 'CONTAINER_40FT', 'CONTAINER_40FT_HC', 'TRUCK_53FT', 'TRUCK_48FT', 'VAN_CLOSED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('DETECTED', 'ANALYZED', 'APPROVED', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "rfc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pilotStartedAt" TIMESTAMP(3),
    "pilotEndsAt" TIMESTAMP(3),
    "classificationLimit" INTEGER,
    "userLimit" INTEGER,
    "pilot15DaySentAt" TIMESTAMP(3),
    "pilot25DaySentAt" TIMESTAMP(3),
    "pilotExpiredSentAt" TIMESTAMP(3),
    "contractStartedAt" TIMESTAMP(3),
    "contractEndsAt" TIMESTAMP(3),
    "monthlyPrice" DOUBLE PRECISION,
    "contractModules" TEXT[],
    "lastActivityAt" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "plan" "Plan" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "modules" TEXT[],
    "conditions" TEXT,
    "supportTier" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "rfc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'email_verify',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "legalNotes" TEXT,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "headings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,

    CONSTRAINT "headings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subheadings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "headingId" TEXT NOT NULL,

    CONSTRAINT "subheadings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fractions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeFormatted" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nico" TEXT,
    "nicos" TEXT[],
    "unit" TEXT,
    "keywords" TEXT[],
    "tariffNMF" DOUBLE PRECISION,
    "tariffTMEC" DOUBLE PRECISION,
    "tariffTLCUE" DOUBLE PRECISION,
    "tariffCPTPP" DOUBLE PRECISION,
    "iepsRate" DOUBLE PRECISION,
    "requiresPermit" BOOLEAN NOT NULL DEFAULT false,
    "permitType" TEXT,
    "noms" TEXT[],
    "sectoralRegistry" BOOLEAN NOT NULL DEFAULT false,
    "sectoralType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subheadingId" TEXT NOT NULL,

    CONSTRAINT "fractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_knowledge" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "fractionCode" TEXT,
    "chapterCode" TEXT,
    "sectionCode" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3),
    "keywords" JSONB NOT NULL,
    "products" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classification_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classifications" (
    "id" TEXT NOT NULL,
    "inputDescription" TEXT NOT NULL,
    "inputContext" TEXT,
    "inputCountryOfOrigin" TEXT,
    "inputDeclaredValueUSD" DOUBLE PRECISION,
    "inputUseCase" TEXT,
    "inputSector" TEXT,
    "inputImporterType" TEXT,
    "useBasedAnalysis" JSONB,
    "fractionCode" TEXT NOT NULL,
    "fractionDescription" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "griApplied" TEXT[],
    "alternatives" TEXT,
    "legalBasis" JSONB,
    "fullResponse" TEXT,
    "feedback" TEXT,
    "feedbackNote" TEXT,
    "tigieVersion" TEXT,
    "ligieVersion" TEXT,
    "consultHash" TEXT,
    "consultedAt" TIMESTAMP(3),
    "alertsJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "customsValue" DOUBLE PRECISION NOT NULL,
    "origin" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL DEFAULT 'CIF',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "result" TEXT NOT NULL,
    "name" TEXT,
    "client" TEXT,
    "destination" TEXT,
    "exchangeRate" DOUBLE PRECISION,
    "exchangeRateDate" TIMESTAMP(3),
    "honorariosAgente" DOUBLE PRECISION DEFAULT 0,
    "prevalidacion" DOUBLE PRECISION DEFAULT 321,
    "almacenaje" DOUBLE PRECISION DEFAULT 0,
    "estiba" DOUBLE PRECISION DEFAULT 0,
    "fleteInterno" DOUBLE PRECISION DEFAULT 0,
    "otrosGastos" JSONB,
    "totalLandedCost" DOUBLE PRECISION,
    "totalDispatch" DOUBLE PRECISION,
    "totalAll" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "numeroPartida" INTEGER NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "description" TEXT,
    "countryOfOrigin" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unitValueUSD" DOUBLE PRECISION NOT NULL,
    "totalValueUSD" DOUBLE PRECISION NOT NULL,
    "freightUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insuranceUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customsValueUSD" DOUBLE PRECISION NOT NULL,
    "customsValueMXN" DOUBLE PRECISION NOT NULL,
    "igiRate" DOUBLE PRECISION NOT NULL,
    "dtaRate" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "ivaRate" DOUBLE PRECISION NOT NULL DEFAULT 16,
    "iepsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countervailingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igi" DOUBLE PRECISION NOT NULL,
    "dta" DOUBLE PRECISION NOT NULL,
    "ieps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countervailing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iva" DOUBLE PRECISION NOT NULL,
    "totalDuties" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "hasAntidumping" BOOLEAN NOT NULL DEFAULT false,
    "antidumpingDecree" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedimentos" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "clave" TEXT NOT NULL,
    "aduana" TEXT NOT NULL,
    "patenteAduanal" TEXT NOT NULL,
    "rfcImportador" TEXT NOT NULL,
    "curp" TEXT,
    "tipoOperacion" TEXT NOT NULL,
    "regimen" TEXT NOT NULL,
    "destino" TEXT,
    "origen" TEXT,
    "pesoBruto" DOUBLE PRECISION NOT NULL,
    "pesoNeto" DOUBLE PRECISION NOT NULL,
    "bultos" INTEGER NOT NULL,
    "valorAduana" DOUBLE PRECISION NOT NULL,
    "valorComercial" DOUBLE PRECISION NOT NULL,
    "valorDolares" DOUBLE PRECISION NOT NULL,
    "tipoCambio" DOUBLE PRECISION NOT NULL,
    "incoterm" TEXT NOT NULL,
    "transporte" TEXT NOT NULL,
    "medioTransporte" TEXT,
    "factura" TEXT,
    "cove" TEXT,
    "bl" TEXT,
    "errors" JSONB,
    "warnings" JSONB,
    "aiNotes" JSONB,
    "status" "PedimentoStatus" NOT NULL DEFAULT 'DRAFT',
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "pedimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedimento_partidas" (
    "id" TEXT NOT NULL,
    "pedimentoId" TEXT NOT NULL,
    "numeroPartida" INTEGER NOT NULL,
    "fraccion" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidadMedida" TEXT NOT NULL,
    "unidadMedidaCom" TEXT,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "valorAduana" DOUBLE PRECISION NOT NULL,
    "pais" TEXT NOT NULL,
    "paisVendedor" TEXT,
    "igi" DOUBLE PRECISION,
    "dta" DOUBLE PRECISION,
    "iva" DOUBLE PRECISION,
    "ieps" DOUBLE PRECISION,
    "permisos" JSONB,
    "identificadores" JSONB,
    "vinculacion" BOOLEAN NOT NULL DEFAULT false,
    "vinculacionDesc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedimento_partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'synthetic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "fractionCodes" TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "affectedFraction" TEXT,
    "affectedOperations" TEXT[],
    "estimatedImpactMXN" DOUBLE PRECISION,
    "impactType" TEXT,
    "actionRequired" TEXT,
    "suggestedAction" JSONB,
    "dueDate" TIMESTAMP(3),
    "daysToDue" INTEGER,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "fingerprint" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "before" JSONB,
    "after" JSONB,
    "diff" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "metadata" JSONB,
    "hash" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "OperationType" NOT NULL DEFAULT 'IMPORT',
    "status" "OperationStatus" NOT NULL DEFAULT 'DRAFT',
    "fractionCode" TEXT,
    "description" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "customsValue" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "customsBroker" TEXT,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "operationDate" TIMESTAMP(3),
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "filePath" TEXT,
    "fileUrl" TEXT,
    "fileHash" TEXT,
    "docType" TEXT,
    "confidence" DOUBLE PRECISION,
    "extractedData" JSONB,
    "rawText" TEXT,
    "aiErrors" JSONB,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "operationId" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_imports" (
    "id" TEXT NOT NULL,
    "pedimento" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "customsValue" DOUBLE PRECISION NOT NULL,
    "valueMXN" DOUBLE PRECISION,
    "supplier" TEXT,
    "originCountry" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "expirationMonths" INTEGER NOT NULL DEFAULT 18,
    "quantityDischarged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "temporary_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharges" (
    "id" TEXT NOT NULL,
    "type" "DischargeType" NOT NULL,
    "pedimento" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "customsValue" DOUBLE PRECISION,
    "dischargeDate" TIMESTAMP(3) NOT NULL,
    "destinationCountry" TEXT,
    "buyerName" TEXT,
    "taxesPaid" DOUBLE PRECISION,
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "temporaryImportId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "discharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annex24_reports" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalImports" INTEGER NOT NULL DEFAULT 0,
    "totalDischarges" INTEGER NOT NULL DEFAULT 0,
    "totalValueUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reportData" TEXT,
    "transmissionDate" TIMESTAMP(3),
    "transmissionRef" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "annex24_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annex30_accounts" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGuarantees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDebits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igiDeferred" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dtaDeferred" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaDeferred" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accountData" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "annex30_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_credits" (
    "id" TEXT NOT NULL,
    "pedimento" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "iepsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "dischargeDeadline" TIMESTAMP(3) NOT NULL,
    "discharged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL,
    "relatedImportId" TEXT,
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "tax_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_usages" (
    "id" TEXT NOT NULL,
    "pedimentoDescargo" TEXT NOT NULL,
    "ivaApplied" DOUBLE PRECISION NOT NULL,
    "iepsApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "credit_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantees" (
    "id" TEXT NOT NULL,
    "type" "GuaranteeType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "institution" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "GuaranteeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_profiles" (
    "id" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "certNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "renewalDeadline" TIMESTAMP(3),
    "status" "CertStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "certification_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifestaciones_valor" (
    "id" TEXT NOT NULL,
    "pedimento" TEXT,
    "providerName" TEXT NOT NULL,
    "providerCountry" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "incoterm" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DOUBLE PRECISION,
    "invoiceValue" DOUBLE PRECISION NOT NULL,
    "freightValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insuranceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherIncrements" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customsValue" DOUBLE PRECISION NOT NULL,
    "hasVinculacion" BOOLEAN NOT NULL DEFAULT false,
    "vinculacionDesc" TEXT,
    "formatoE2" JSONB,
    "aiValidation" JSONB,
    "riskLevel" TEXT,
    "status" "MVEStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "transmittedAt" TIMESTAMP(3),
    "invoiceFileUrl" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "manifestaciones_valor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coves" (
    "id" TEXT NOT NULL,
    "eDocument" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "providerTaxId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validationDate" TIMESTAMP(3),
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mveId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "coves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "containerType" "ContainerType" NOT NULL,
    "containerLength" DOUBLE PRECISION NOT NULL,
    "containerWidth" DOUBLE PRECISION NOT NULL,
    "containerHeight" DOUBLE PRECISION NOT NULL,
    "maxWeight" DOUBLE PRECISION NOT NULL,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "totalVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumeUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiOptimization" JSONB,
    "costAnalysis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "load_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_items" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadPlanId" TEXT NOT NULL,

    CONSTRAINT "load_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tigie_updates" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "decree" TEXT,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "fractionsCreated" INTEGER NOT NULL DEFAULT 0,
    "fractionsModified" INTEGER NOT NULL DEFAULT 0,
    "fractionsSuppressed" INTEGER NOT NULL DEFAULT 0,
    "nomsUpdated" INTEGER NOT NULL DEFAULT 0,
    "changes" JSONB NOT NULL,
    "status" "UpdateStatus" NOT NULL DEFAULT 'DETECTED',
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "usersNotified" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tigie_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_notifications" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "update_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_accounts" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "products" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "status" TEXT NOT NULL DEFAULT 'new',
    "rfc" TEXT,
    "industry" TEXT,
    "monthlyOps" TEXT,
    "hasIMMEX" BOOLEAN,
    "currentSoftware" TEXT,
    "problems" TEXT[],
    "referralSource" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_blacklist" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fractionCode" TEXT,
    "unit" TEXT NOT NULL,
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_components" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "scrapPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assemblies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "assemblyDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_consumptions" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "fractionCode" TEXT,
    "quantityRequired" DOUBLE PRECISION NOT NULL,
    "quantityWithScrap" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "importIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assembly_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "antidumping_duties" (
    "id" TEXT NOT NULL,
    "resolutionType" TEXT NOT NULL DEFAULT 'definitiva',
    "resolutionNumber" TEXT,
    "expedienteUPCI" TEXT,
    "fractionCode" TEXT NOT NULL,
    "countryOfOrigin" TEXT NOT NULL,
    "productDesc" TEXT,
    "specificProducer" TEXT,
    "rateType" TEXT NOT NULL DEFAULT 'percentage',
    "rate" DOUBLE PRECISION NOT NULL,
    "rateUnit" TEXT NOT NULL DEFAULT '%',
    "publishDateDOF" TIMESTAMP(3),
    "publishDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'vigente',
    "investigationType" TEXT,
    "decree" TEXT,
    "dofUrl" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "antidumping_duties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prosec_eligibility" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "sector" TEXT NOT NULL,
    "prosecRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "decree" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prosec_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regla_8va_mappings" (
    "id" TEXT NOT NULL,
    "vehicleFraction" TEXT NOT NULL,
    "vehicleDesc" TEXT NOT NULL,
    "partsAllowed" JSONB NOT NULL,
    "preferentialRate" DOUBLE PRECISION NOT NULL,
    "conditions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regla_8va_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ieps_rates" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "productCategory" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateType" TEXT NOT NULL,
    "unit" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "decree" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ieps_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "isan_rates" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "priceRangeMin" DOUBLE PRECISION NOT NULL,
    "priceRangeMax" DOUBLE PRECISION,
    "fixedAmount" DOUBLE PRECISION NOT NULL,
    "marginalRate" DOUBLE PRECISION NOT NULL,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fiscalYear" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isan_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimated_prices" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "countryOfOrigin" TEXT,
    "estimatedValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "decree" TEXT,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'internal',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimated_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraction_regulations" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "type" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraction_regulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_data" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "officialUrl" TEXT,
    "publishedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededBy" TEXT,
    "keywords" TEXT[],
    "topics" TEXT[],
    "fractionRefs" TEXT[],
    "embedding" DOUBLE PRECISION[],
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_consults" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citedDocuments" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "consultHash" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_consults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_profiles" (
    "id" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "longDescription" TEXT,
    "companyName" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "primarySector" TEXT NOT NULL,
    "immexModality" TEXT,
    "certifications" JSONB,
    "fractionsRange" JSONB NOT NULL,
    "countriesOfOrigin" JSONB NOT NULL,
    "productCatalog" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "storageProvider" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "sizeBytes" BIGINT,
    "recordCount" INTEGER,
    "checksumSHA256" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "retentionDays" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "triggeredBy" TEXT,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_logs" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "scope" JSONB,
    "recordsRestored" INTEGER,
    "triggeredBy" TEXT NOT NULL,
    "reason" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "restore_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "components" TEXT[],
    "description" TEXT NOT NULL,
    "updates" JSONB[],
    "affectedUsers" INTEGER,
    "rootCause" TEXT,
    "resolution" TEXT,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "incident_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalType" TEXT,
    "agentPatente" TEXT,
    "agentSocialName" TEXT,
    "agentPort" TEXT,
    "agentVerified" BOOLEAN NOT NULL DEFAULT false,
    "agentExpiry" TIMESTAMP(3),
    "patenteDocUrl" TEXT,
    "rfcDocUrl" TEXT,
    "cspDocUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_registry" (
    "id" TEXT NOT NULL,
    "patente" TEXT NOT NULL,
    "socialName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiry" TIMESTAMP(3),
    "port" TEXT,
    "professionalType" TEXT NOT NULL DEFAULT 'agent_customs',
    "source" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timestamp_proofs" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "otsProof" BYTEA NOT NULL,
    "otsProofHex" TEXT,
    "bitcoinBlock" INTEGER,
    "bitcoinTxId" TEXT,
    "bitcoinTimestamp" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "calendarUrl" TEXT,

    CONSTRAINT "timestamp_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "ip" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "endpoint" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_ips" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unblockedAt" TIMESTAMP(3),
    "unblockedBy" TEXT,

    CONSTRAINT "blocked_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "userId" TEXT,
    "requestId" TEXT,
    "method" TEXT,
    "endpoint" TEXT,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "action" TEXT,
    "metadata" JSONB,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "userId" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costUSD" DOUBLE PRECISION NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "classificationId" TEXT,
    "consultHash" TEXT,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_precedents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fractionCodes" TEXT[],
    "chapterCodes" TEXT[],
    "topic" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ruling" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "applicability" TEXT,
    "yearPublished" INTEGER NOT NULL,
    "isVigente" BOOLEAN NOT NULL DEFAULT true,
    "litigated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_precedents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_snapshots" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_consults" (
    "id" TEXT NOT NULL,
    "classificationId" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "inputHash" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "outputHash" TEXT NOT NULL,
    "outputs" JSONB NOT NULL,
    "tigieVersion" TEXT NOT NULL,
    "ligieVersion" TEXT NOT NULL,
    "rgceVersion" TEXT,
    "acuerdoNomsVersion" TEXT,
    "tmecVersion" TEXT,
    "knowledgeBaseHash" TEXT NOT NULL,
    "knowledgeUsed" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "consultHash" TEXT NOT NULL,
    "consultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_consults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nom_exceptions" (
    "id" TEXT NOT NULL,
    "nomCode" TEXT,
    "nomScope" TEXT,
    "exceptionCode" TEXT NOT NULL,
    "fraction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "requiredDoc" TEXT,
    "legalBasis" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nom_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origin_rules" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "agreement" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rvcRequired" DOUBLE PRECISION,
    "rvcMethod" TEXT,
    "tariffShift" TEXT,
    "tariffShiftCode" TEXT,
    "specificProcess" TEXT,
    "annex" TEXT,
    "isAutomotive" BOOLEAN NOT NULL DEFAULT false,
    "autoCategory" TEXT,
    "laborValueContent" DOUBLE PRECISION,
    "steelAluminumPercent" DOUBLE PRECISION,
    "textileRule" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "origin_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origin_analyses" (
    "id" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "agreement" TEXT NOT NULL,
    "productDescription" TEXT,
    "productValue" DOUBLE PRECISION NOT NULL,
    "originatingValue" DOUBLE PRECISION NOT NULL,
    "nonOriginatingValue" DOUBLE PRECISION NOT NULL,
    "originatingMaterials" JSONB,
    "nonOriginatingMaterials" JSONB,
    "laborCost" DOUBLE PRECISION,
    "highWageLaborCost" DOUBLE PRECISION,
    "overheadCost" DOUBLE PRECISION,
    "profit" DOUBLE PRECISION,
    "packagingCost" DOUBLE PRECISION,
    "royalties" DOUBLE PRECISION,
    "rvcMethod" TEXT NOT NULL DEFAULT 'transaction_value',
    "totalSteelAluminumValue" DOUBLE PRECISION,
    "northAmericanSteelAluminumValue" DOUBLE PRECISION,
    "rvcCalculated" DOUBLE PRECISION,
    "rvcTransactionValue" DOUBLE PRECISION,
    "rvcNetCost" DOUBLE PRECISION,
    "rvcBuildUp" DOUBLE PRECISION,
    "rvcBuildDown" DOUBLE PRECISION,
    "tariffShiftCompliance" BOOLEAN,
    "tariffShiftDetails" JSONB,
    "laborValueContentPct" DOUBLE PRECISION,
    "lvcCompliance" BOOLEAN,
    "steelAluminumNAPct" DOUBLE PRECISION,
    "saCompliance" BOOLEAN,
    "ruleApplied" TEXT,
    "qualifies" BOOLEAN NOT NULL,
    "qualifyingMethod" TEXT,
    "reason" TEXT NOT NULL,
    "reasons" TEXT[],
    "recommendations" JSONB,
    "consultHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "origin_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origin_certificates" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "exporterName" TEXT NOT NULL,
    "exporterAddress" TEXT,
    "exporterTaxId" TEXT,
    "importerName" TEXT,
    "importerAddress" TEXT,
    "importerTaxId" TEXT,
    "producerName" TEXT,
    "producerAddress" TEXT,
    "producerTaxId" TEXT,
    "originCountry" TEXT NOT NULL,
    "preferenceCriterion" TEXT NOT NULL,
    "blanketPeriodFrom" TIMESTAMP(3),
    "blanketPeriodTo" TIMESTAMP(3),
    "signedDate" TIMESTAMP(3) NOT NULL,
    "signedBy" TEXT NOT NULL,
    "signedByRole" TEXT NOT NULL,
    "originAnalysisId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "pdfUrl" TEXT,
    "contentHash" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "origin_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sat_padrones" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sectorialCode" TEXT,
    "sectorialName" TEXT,
    "fractionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fractionPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "requiresEFirma" BOOLEAN NOT NULL DEFAULT true,
    "estimatedDays" INTEGER,
    "costMXN" DOUBLE PRECISION,
    "validityMonths" INTEGER NOT NULL DEFAULT 12,
    "renewalRequired" BOOLEAN NOT NULL DEFAULT true,
    "renewalAdvance" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sat_padrones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_padron_status" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "padronId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "registrationDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "lastVerified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextVerification" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "evidence" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_padron_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "conflictsWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenant_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeRestrictions" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_audit_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "roleId" TEXT,
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "initialRoleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glosa_simulations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pedimentoData" JSONB NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "countryOrigin" TEXT NOT NULL,
    "countryProvider" TEXT NOT NULL,
    "customsCode" TEXT NOT NULL,
    "regimenCode" TEXT NOT NULL,
    "valueUSD" DOUBLE PRECISION NOT NULL,
    "valueMXN" DOUBLE PRECISION NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "units" INTEGER,
    "unitMeasure" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "raProbability" DOUBLE PRECISION NOT NULL,
    "cotejoProb" DOUBLE PRECISION NOT NULL,
    "glosaProb" DOUBLE PRECISION NOT NULL,
    "riskFlags" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "industryAverage" DOUBLE PRECISION,
    "yourHistory" DOUBLE PRECISION,
    "actualOutcome" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "feedbackNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glosa_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glosa_risk_rules" (
    "id" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectionLogic" JSONB NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "legalBasis" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glosa_risk_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padron_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fractionCode" TEXT NOT NULL,
    "requiredPadrones" JSONB NOT NULL,
    "canOperate" BOOLEAN NOT NULL,
    "blockingPadrones" JSONB NOT NULL,
    "warningPadrones" JSONB NOT NULL,
    "context" TEXT,
    "resourceId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "padron_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factor_weights" (
    "id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "risk_factor_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "exposicion" INTEGER NOT NULL,
    "escudoPct" INTEGER NOT NULL,
    "banda" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "pesosSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sat_69b" (
    "rfc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "situacion" TEXT NOT NULL,
    "fechaOficio" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sat_69b_pkey" PRIMARY KEY ("rfc")
);

-- CreateIndex
CREATE INDEX "tenants_plan_idx" ON "tenants"("plan");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_pilotEndsAt_idx" ON "tenants"("pilotEndsAt");

-- CreateIndex
CREATE INDEX "tenants_contractEndsAt_idx" ON "tenants"("contractEndsAt");

-- CreateIndex
CREATE INDEX "proposals_tenantId_idx" ON "proposals"("tenantId");

-- CreateIndex
CREATE INDEX "proposals_leadId_idx" ON "proposals"("leadId");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "verification_codes_userId_idx" ON "verification_codes"("userId");

-- CreateIndex
CREATE INDEX "verification_codes_code_idx" ON "verification_codes"("code");

-- CreateIndex
CREATE INDEX "verification_codes_expiresAt_idx" ON "verification_codes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sections_number_key" ON "sections"("number");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_number_key" ON "chapters"("number");

-- CreateIndex
CREATE INDEX "chapters_sectionId_idx" ON "chapters"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "headings_code_key" ON "headings"("code");

-- CreateIndex
CREATE INDEX "headings_chapterId_idx" ON "headings"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "subheadings_code_key" ON "subheadings"("code");

-- CreateIndex
CREATE INDEX "subheadings_headingId_idx" ON "subheadings"("headingId");

-- CreateIndex
CREATE UNIQUE INDEX "fractions_code_key" ON "fractions"("code");

-- CreateIndex
CREATE INDEX "fractions_code_idx" ON "fractions"("code");

-- CreateIndex
CREATE INDEX "fractions_description_idx" ON "fractions"("description");

-- CreateIndex
CREATE INDEX "fractions_keywords_idx" ON "fractions"("keywords");

-- CreateIndex
CREATE INDEX "classification_knowledge_type_idx" ON "classification_knowledge"("type");

-- CreateIndex
CREATE INDEX "classification_knowledge_fractionCode_idx" ON "classification_knowledge"("fractionCode");

-- CreateIndex
CREATE INDEX "classification_knowledge_chapterCode_idx" ON "classification_knowledge"("chapterCode");

-- CreateIndex
CREATE INDEX "classification_knowledge_priority_idx" ON "classification_knowledge"("priority");

-- CreateIndex
CREATE INDEX "classification_knowledge_verified_idx" ON "classification_knowledge"("verified");

-- CreateIndex
CREATE INDEX "classifications_tenantId_idx" ON "classifications"("tenantId");

-- CreateIndex
CREATE INDEX "classifications_userId_idx" ON "classifications"("userId");

-- CreateIndex
CREATE INDEX "classifications_fractionCode_idx" ON "classifications"("fractionCode");

-- CreateIndex
CREATE INDEX "classifications_createdAt_idx" ON "classifications"("createdAt");

-- CreateIndex
CREATE INDEX "classifications_isDemoData_idx" ON "classifications"("isDemoData");

-- CreateIndex
CREATE INDEX "classifications_consultHash_idx" ON "classifications"("consultHash");

-- CreateIndex
CREATE INDEX "classifications_tenantId_status_idx" ON "classifications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "quotes_tenantId_idx" ON "quotes"("tenantId");

-- CreateIndex
CREATE INDEX "quotes_createdAt_idx" ON "quotes"("createdAt");

-- CreateIndex
CREATE INDEX "quotes_isDemoData_idx" ON "quotes"("isDemoData");

-- CreateIndex
CREATE INDEX "quotes_tenantId_status_idx" ON "quotes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- CreateIndex
CREATE INDEX "quote_items_fractionCode_idx" ON "quote_items"("fractionCode");

-- CreateIndex
CREATE INDEX "pedimentos_tenantId_idx" ON "pedimentos"("tenantId");

-- CreateIndex
CREATE INDEX "pedimentos_status_idx" ON "pedimentos"("status");

-- CreateIndex
CREATE INDEX "pedimentos_numero_idx" ON "pedimentos"("numero");

-- CreateIndex
CREATE INDEX "pedimentos_rfcImportador_idx" ON "pedimentos"("rfcImportador");

-- CreateIndex
CREATE INDEX "pedimento_partidas_pedimentoId_idx" ON "pedimento_partidas"("pedimentoId");

-- CreateIndex
CREATE INDEX "pedimento_partidas_fraccion_idx" ON "pedimento_partidas"("fraccion");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_date_key" ON "exchange_rates"("date");

-- CreateIndex
CREATE INDEX "exchange_rates_date_idx" ON "exchange_rates"("date");

-- CreateIndex
CREATE INDEX "copilot_messages_tenantId_idx" ON "copilot_messages"("tenantId");

-- CreateIndex
CREATE INDEX "copilot_messages_conversationId_idx" ON "copilot_messages"("conversationId");

-- CreateIndex
CREATE INDEX "copilot_messages_createdAt_idx" ON "copilot_messages"("createdAt");

-- CreateIndex
CREATE INDEX "alerts_tenantId_idx" ON "alerts"("tenantId");

-- CreateIndex
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");

-- CreateIndex
CREATE INDEX "alerts_isDemoData_idx" ON "alerts"("isDemoData");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_affectedFraction_idx" ON "alerts"("affectedFraction");

-- CreateIndex
CREATE INDEX "alerts_dueDate_idx" ON "alerts"("dueDate");

-- CreateIndex
CREATE INDEX "alerts_fingerprint_idx" ON "alerts"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_tenantId_fingerprint_key" ON "alerts"("tenantId", "fingerprint");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_hash_idx" ON "audit_logs"("hash");

-- CreateIndex
CREATE INDEX "operations_tenantId_idx" ON "operations"("tenantId");

-- CreateIndex
CREATE INDEX "operations_reference_idx" ON "operations"("reference");

-- CreateIndex
CREATE INDEX "operations_status_idx" ON "operations"("status");

-- CreateIndex
CREATE INDEX "operations_createdAt_idx" ON "operations"("createdAt");

-- CreateIndex
CREATE INDEX "operations_isDemoData_idx" ON "operations"("isDemoData");

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX "documents_operationId_idx" ON "documents"("operationId");

-- CreateIndex
CREATE INDEX "documents_type_idx" ON "documents"("type");

-- CreateIndex
CREATE INDEX "documents_docType_idx" ON "documents"("docType");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_expiresAt_idx" ON "documents"("expiresAt");

-- CreateIndex
CREATE INDEX "documents_fileHash_idx" ON "documents"("fileHash");

-- CreateIndex
CREATE INDEX "temporary_imports_tenantId_idx" ON "temporary_imports"("tenantId");

-- CreateIndex
CREATE INDEX "temporary_imports_fractionCode_idx" ON "temporary_imports"("fractionCode");

-- CreateIndex
CREATE INDEX "temporary_imports_pedimento_idx" ON "temporary_imports"("pedimento");

-- CreateIndex
CREATE INDEX "temporary_imports_status_idx" ON "temporary_imports"("status");

-- CreateIndex
CREATE INDEX "temporary_imports_expirationDate_idx" ON "temporary_imports"("expirationDate");

-- CreateIndex
CREATE INDEX "temporary_imports_entryDate_idx" ON "temporary_imports"("entryDate");

-- CreateIndex
CREATE INDEX "temporary_imports_isDemoData_idx" ON "temporary_imports"("isDemoData");

-- CreateIndex
CREATE INDEX "discharges_tenantId_idx" ON "discharges"("tenantId");

-- CreateIndex
CREATE INDEX "discharges_temporaryImportId_idx" ON "discharges"("temporaryImportId");

-- CreateIndex
CREATE INDEX "discharges_type_idx" ON "discharges"("type");

-- CreateIndex
CREATE INDEX "discharges_dischargeDate_idx" ON "discharges"("dischargeDate");

-- CreateIndex
CREATE INDEX "discharges_isDemoData_idx" ON "discharges"("isDemoData");

-- CreateIndex
CREATE INDEX "annex24_reports_tenantId_idx" ON "annex24_reports"("tenantId");

-- CreateIndex
CREATE INDEX "annex24_reports_period_idx" ON "annex24_reports"("period");

-- CreateIndex
CREATE INDEX "annex24_reports_status_idx" ON "annex24_reports"("status");

-- CreateIndex
CREATE INDEX "annex30_accounts_tenantId_idx" ON "annex30_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "annex30_accounts_period_idx" ON "annex30_accounts"("period");

-- CreateIndex
CREATE INDEX "tax_credits_tenantId_idx" ON "tax_credits"("tenantId");

-- CreateIndex
CREATE INDEX "tax_credits_status_idx" ON "tax_credits"("status");

-- CreateIndex
CREATE INDEX "tax_credits_fractionCode_idx" ON "tax_credits"("fractionCode");

-- CreateIndex
CREATE INDEX "tax_credits_dischargeDeadline_idx" ON "tax_credits"("dischargeDeadline");

-- CreateIndex
CREATE INDEX "tax_credits_pedimento_idx" ON "tax_credits"("pedimento");

-- CreateIndex
CREATE INDEX "tax_credits_isDemoData_idx" ON "tax_credits"("isDemoData");

-- CreateIndex
CREATE INDEX "credit_usages_tenantId_idx" ON "credit_usages"("tenantId");

-- CreateIndex
CREATE INDEX "credit_usages_creditId_idx" ON "credit_usages"("creditId");

-- CreateIndex
CREATE INDEX "credit_usages_usageDate_idx" ON "credit_usages"("usageDate");

-- CreateIndex
CREATE INDEX "credit_usages_isDemoData_idx" ON "credit_usages"("isDemoData");

-- CreateIndex
CREATE INDEX "guarantees_tenantId_idx" ON "guarantees"("tenantId");

-- CreateIndex
CREATE INDEX "guarantees_status_idx" ON "guarantees"("status");

-- CreateIndex
CREATE INDEX "guarantees_expiryDate_idx" ON "guarantees"("expiryDate");

-- CreateIndex
CREATE INDEX "guarantees_isDemoData_idx" ON "guarantees"("isDemoData");

-- CreateIndex
CREATE UNIQUE INDEX "certification_profiles_tenantId_key" ON "certification_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_tenantId_idx" ON "manifestaciones_valor"("tenantId");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_status_idx" ON "manifestaciones_valor"("status");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_invoiceDate_idx" ON "manifestaciones_valor"("invoiceDate");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_providerName_idx" ON "manifestaciones_valor"("providerName");

-- CreateIndex
CREATE INDEX "manifestaciones_valor_isDemoData_idx" ON "manifestaciones_valor"("isDemoData");

-- CreateIndex
CREATE INDEX "coves_tenantId_idx" ON "coves"("tenantId");

-- CreateIndex
CREATE INDEX "coves_mveId_idx" ON "coves"("mveId");

-- CreateIndex
CREATE INDEX "coves_isDemoData_idx" ON "coves"("isDemoData");

-- CreateIndex
CREATE INDEX "load_plans_tenantId_idx" ON "load_plans"("tenantId");

-- CreateIndex
CREATE INDEX "load_plans_status_idx" ON "load_plans"("status");

-- CreateIndex
CREATE INDEX "load_plans_isDemoData_idx" ON "load_plans"("isDemoData");

-- CreateIndex
CREATE INDEX "load_items_loadPlanId_idx" ON "load_items"("loadPlanId");

-- CreateIndex
CREATE INDEX "tigie_updates_status_idx" ON "tigie_updates"("status");

-- CreateIndex
CREATE INDEX "tigie_updates_publishDate_idx" ON "tigie_updates"("publishDate");

-- CreateIndex
CREATE INDEX "tigie_updates_createdAt_idx" ON "tigie_updates"("createdAt");

-- CreateIndex
CREATE INDEX "update_notifications_tenantId_idx" ON "update_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "update_notifications_userId_idx" ON "update_notifications"("userId");

-- CreateIndex
CREATE INDEX "update_notifications_updateId_idx" ON "update_notifications"("updateId");

-- CreateIndex
CREATE INDEX "update_notifications_read_idx" ON "update_notifications"("read");

-- CreateIndex
CREATE INDEX "update_notifications_fractionCode_idx" ON "update_notifications"("fractionCode");

-- CreateIndex
CREATE INDEX "demo_accounts_leadId_idx" ON "demo_accounts"("leadId");

-- CreateIndex
CREATE INDEX "demo_accounts_expiresAt_idx" ON "demo_accounts"("expiresAt");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_idx" ON "login_attempts"("email");

-- CreateIndex
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts"("ip");

-- CreateIndex
CREATE INDEX "login_attempts_createdAt_idx" ON "login_attempts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_token_key" ON "token_blacklist"("token");

-- CreateIndex
CREATE INDEX "token_blacklist_token_idx" ON "token_blacklist"("token");

-- CreateIndex
CREATE INDEX "token_blacklist_expiresAt_idx" ON "token_blacklist"("expiresAt");

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- CreateIndex
CREATE INDEX "products_isFinished_idx" ON "products"("isFinished");

-- CreateIndex
CREATE INDEX "products_fractionCode_idx" ON "products"("fractionCode");

-- CreateIndex
CREATE INDEX "products_isDemoData_idx" ON "products"("isDemoData");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_productCode_key" ON "products"("tenantId", "productCode");

-- CreateIndex
CREATE INDEX "product_components_productId_idx" ON "product_components"("productId");

-- CreateIndex
CREATE INDEX "product_components_componentId_idx" ON "product_components"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "product_components_productId_componentId_key" ON "product_components"("productId", "componentId");

-- CreateIndex
CREATE INDEX "assemblies_tenantId_idx" ON "assemblies"("tenantId");

-- CreateIndex
CREATE INDEX "assemblies_productId_idx" ON "assemblies"("productId");

-- CreateIndex
CREATE INDEX "assemblies_assemblyDate_idx" ON "assemblies"("assemblyDate");

-- CreateIndex
CREATE INDEX "assemblies_isDemoData_idx" ON "assemblies"("isDemoData");

-- CreateIndex
CREATE INDEX "assembly_consumptions_assemblyId_idx" ON "assembly_consumptions"("assemblyId");

-- CreateIndex
CREATE INDEX "assembly_consumptions_componentId_idx" ON "assembly_consumptions"("componentId");

-- CreateIndex
CREATE INDEX "antidumping_duties_fractionCode_countryOfOrigin_status_idx" ON "antidumping_duties"("fractionCode", "countryOfOrigin", "status");

-- CreateIndex
CREATE INDEX "antidumping_duties_fractionCode_idx" ON "antidumping_duties"("fractionCode");

-- CreateIndex
CREATE INDEX "antidumping_duties_countryOfOrigin_idx" ON "antidumping_duties"("countryOfOrigin");

-- CreateIndex
CREATE INDEX "antidumping_duties_active_idx" ON "antidumping_duties"("active");

-- CreateIndex
CREATE INDEX "antidumping_duties_effectiveDate_expiryDate_idx" ON "antidumping_duties"("effectiveDate", "expiryDate");

-- CreateIndex
CREATE INDEX "antidumping_duties_resolutionNumber_idx" ON "antidumping_duties"("resolutionNumber");

-- CreateIndex
CREATE INDEX "prosec_eligibility_fractionCode_active_idx" ON "prosec_eligibility"("fractionCode", "active");

-- CreateIndex
CREATE INDEX "prosec_eligibility_sector_idx" ON "prosec_eligibility"("sector");

-- CreateIndex
CREATE INDEX "regla_8va_mappings_vehicleFraction_idx" ON "regla_8va_mappings"("vehicleFraction");

-- CreateIndex
CREATE INDEX "ieps_rates_fractionCode_active_idx" ON "ieps_rates"("fractionCode", "active");

-- CreateIndex
CREATE INDEX "ieps_rates_productCategory_idx" ON "ieps_rates"("productCategory");

-- CreateIndex
CREATE INDEX "isan_rates_fractionCode_active_idx" ON "isan_rates"("fractionCode", "active");

-- CreateIndex
CREATE INDEX "isan_rates_priceRangeMin_idx" ON "isan_rates"("priceRangeMin");

-- CreateIndex
CREATE INDEX "isan_rates_fiscalYear_idx" ON "isan_rates"("fiscalYear");

-- CreateIndex
CREATE INDEX "estimated_prices_fractionCode_countryOfOrigin_idx" ON "estimated_prices"("fractionCode", "countryOfOrigin");

-- CreateIndex
CREATE INDEX "estimated_prices_active_idx" ON "estimated_prices"("active");

-- CreateIndex
CREATE INDEX "fraction_regulations_fractionCode_idx" ON "fraction_regulations"("fractionCode");

-- CreateIndex
CREATE INDEX "fraction_regulations_type_idx" ON "fraction_regulations"("type");

-- CreateIndex
CREATE INDEX "fraction_regulations_active_idx" ON "fraction_regulations"("active");

-- CreateIndex
CREATE INDEX "demo_data_category_idx" ON "demo_data"("category");

-- CreateIndex
CREATE INDEX "demo_data_active_idx" ON "demo_data"("active");

-- CreateIndex
CREATE INDEX "legal_documents_type_source_idx" ON "legal_documents"("type", "source");

-- CreateIndex
CREATE INDEX "legal_documents_reference_idx" ON "legal_documents"("reference");

-- CreateIndex
CREATE INDEX "legal_documents_isActive_idx" ON "legal_documents"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_consults_consultHash_key" ON "copilot_consults"("consultHash");

-- CreateIndex
CREATE INDEX "copilot_consults_tenantId_idx" ON "copilot_consults"("tenantId");

-- CreateIndex
CREATE INDEX "copilot_consults_userId_idx" ON "copilot_consults"("userId");

-- CreateIndex
CREATE INDEX "copilot_consults_createdAt_idx" ON "copilot_consults"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "demo_profiles_industryCode_key" ON "demo_profiles"("industryCode");

-- CreateIndex
CREATE INDEX "demo_profiles_active_idx" ON "demo_profiles"("active");

-- CreateIndex
CREATE INDEX "backup_records_type_startedAt_idx" ON "backup_records"("type", "startedAt");

-- CreateIndex
CREATE INDEX "backup_records_status_idx" ON "backup_records"("status");

-- CreateIndex
CREATE INDEX "backup_records_expiresAt_idx" ON "backup_records"("expiresAt");

-- CreateIndex
CREATE INDEX "restore_logs_backupId_idx" ON "restore_logs"("backupId");

-- CreateIndex
CREATE INDEX "restore_logs_startedAt_idx" ON "restore_logs"("startedAt");

-- CreateIndex
CREATE INDEX "system_incidents_status_startedAt_idx" ON "system_incidents"("status", "startedAt");

-- CreateIndex
CREATE INDEX "system_incidents_publicVisible_startedAt_idx" ON "system_incidents"("publicVisible", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "incident_subscriptions_email_key" ON "incident_subscriptions"("email");

-- CreateIndex
CREATE INDEX "incident_subscriptions_active_idx" ON "incident_subscriptions"("active");

-- CreateIndex
CREATE UNIQUE INDEX "user_verifications_userId_key" ON "user_verifications"("userId");

-- CreateIndex
CREATE INDEX "user_verifications_status_idx" ON "user_verifications"("status");

-- CreateIndex
CREATE INDEX "user_verifications_agentPatente_idx" ON "user_verifications"("agentPatente");

-- CreateIndex
CREATE INDEX "user_verifications_agentExpiry_idx" ON "user_verifications"("agentExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "professional_registry_patente_key" ON "professional_registry"("patente");

-- CreateIndex
CREATE INDEX "professional_registry_active_idx" ON "professional_registry"("active");

-- CreateIndex
CREATE INDEX "professional_registry_expiry_idx" ON "professional_registry"("expiry");

-- CreateIndex
CREATE INDEX "professional_registry_port_idx" ON "professional_registry"("port");

-- CreateIndex
CREATE INDEX "timestamp_proofs_resourceType_resourceId_idx" ON "timestamp_proofs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "timestamp_proofs_status_submittedAt_idx" ON "timestamp_proofs"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "timestamp_proofs_contentHash_idx" ON "timestamp_proofs"("contentHash");

-- CreateIndex
CREATE INDEX "security_events_ip_createdAt_idx" ON "security_events"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_type_createdAt_idx" ON "security_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_severity_idx" ON "security_events"("severity");

-- CreateIndex
CREATE INDEX "security_events_userId_idx" ON "security_events"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_ips_ip_key" ON "blocked_ips"("ip");

-- CreateIndex
CREATE INDEX "blocked_ips_ip_active_idx" ON "blocked_ips"("ip", "active");

-- CreateIndex
CREATE INDEX "blocked_ips_expiresAt_idx" ON "blocked_ips"("expiresAt");

-- CreateIndex
CREATE INDEX "system_logs_level_timestamp_idx" ON "system_logs"("level", "timestamp");

-- CreateIndex
CREATE INDEX "system_logs_tenantId_timestamp_idx" ON "system_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "system_logs_endpoint_timestamp_idx" ON "system_logs"("endpoint", "timestamp");

-- CreateIndex
CREATE INDEX "system_logs_requestId_idx" ON "system_logs"("requestId");

-- CreateIndex
CREATE INDEX "system_logs_statusCode_idx" ON "system_logs"("statusCode");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_timestamp_idx" ON "ai_usage_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "ai_usage_logs_model_timestamp_idx" ON "ai_usage_logs"("model", "timestamp");

-- CreateIndex
CREATE INDEX "ai_usage_logs_operation_timestamp_idx" ON "ai_usage_logs"("operation", "timestamp");

-- CreateIndex
CREATE INDEX "ai_usage_logs_success_idx" ON "ai_usage_logs"("success");

-- CreateIndex
CREATE INDEX "legal_precedents_type_idx" ON "legal_precedents"("type");

-- CreateIndex
CREATE INDEX "legal_precedents_topic_idx" ON "legal_precedents"("topic");

-- CreateIndex
CREATE INDEX "legal_precedents_yearPublished_idx" ON "legal_precedents"("yearPublished");

-- CreateIndex
CREATE INDEX "legal_precedents_isVigente_idx" ON "legal_precedents"("isVigente");

-- CreateIndex
CREATE INDEX "legal_precedents_litigated_idx" ON "legal_precedents"("litigated");

-- CreateIndex
CREATE INDEX "version_snapshots_type_active_idx" ON "version_snapshots"("type", "active");

-- CreateIndex
CREATE INDEX "version_snapshots_effectiveDate_idx" ON "version_snapshots"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "version_snapshots_type_version_key" ON "version_snapshots"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "classification_consults_consultHash_key" ON "classification_consults"("consultHash");

-- CreateIndex
CREATE INDEX "classification_consults_classificationId_idx" ON "classification_consults"("classificationId");

-- CreateIndex
CREATE INDEX "classification_consults_tenantId_idx" ON "classification_consults"("tenantId");

-- CreateIndex
CREATE INDEX "classification_consults_consultHash_idx" ON "classification_consults"("consultHash");

-- CreateIndex
CREATE INDEX "classification_consults_consultedAt_idx" ON "classification_consults"("consultedAt");

-- CreateIndex
CREATE INDEX "classification_consults_tigieVersion_idx" ON "classification_consults"("tigieVersion");

-- CreateIndex
CREATE INDEX "nom_exceptions_nomCode_idx" ON "nom_exceptions"("nomCode");

-- CreateIndex
CREATE INDEX "nom_exceptions_nomScope_idx" ON "nom_exceptions"("nomScope");

-- CreateIndex
CREATE INDEX "nom_exceptions_active_idx" ON "nom_exceptions"("active");

-- CreateIndex
CREATE INDEX "origin_rules_fractionCode_agreement_idx" ON "origin_rules"("fractionCode", "agreement");

-- CreateIndex
CREATE INDEX "origin_rules_agreement_idx" ON "origin_rules"("agreement");

-- CreateIndex
CREATE INDEX "origin_rules_active_idx" ON "origin_rules"("active");

-- CreateIndex
CREATE INDEX "origin_rules_isAutomotive_idx" ON "origin_rules"("isAutomotive");

-- CreateIndex
CREATE INDEX "origin_analyses_tenantId_idx" ON "origin_analyses"("tenantId");

-- CreateIndex
CREATE INDEX "origin_analyses_fractionCode_idx" ON "origin_analyses"("fractionCode");

-- CreateIndex
CREATE INDEX "origin_analyses_agreement_idx" ON "origin_analyses"("agreement");

-- CreateIndex
CREATE INDEX "origin_analyses_createdAt_idx" ON "origin_analyses"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "origin_certificates_certificateNumber_key" ON "origin_certificates"("certificateNumber");

-- CreateIndex
CREATE INDEX "origin_certificates_tenantId_idx" ON "origin_certificates"("tenantId");

-- CreateIndex
CREATE INDEX "origin_certificates_fractionCode_idx" ON "origin_certificates"("fractionCode");

-- CreateIndex
CREATE INDEX "origin_certificates_status_idx" ON "origin_certificates"("status");

-- CreateIndex
CREATE INDEX "origin_certificates_originCountry_idx" ON "origin_certificates"("originCountry");

-- CreateIndex
CREATE INDEX "sat_padrones_type_sectorialCode_idx" ON "sat_padrones"("type", "sectorialCode");

-- CreateIndex
CREATE INDEX "sat_padrones_active_idx" ON "sat_padrones"("active");

-- CreateIndex
CREATE INDEX "tenant_padron_status_tenantId_status_idx" ON "tenant_padron_status"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenant_padron_status_status_expirationDate_idx" ON "tenant_padron_status"("status", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_padron_status_tenantId_padronId_key" ON "tenant_padron_status"("tenantId", "padronId");

-- CreateIndex
CREATE INDEX "tenant_roles_tenantId_active_idx" ON "tenant_roles"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_tenantId_code_key" ON "tenant_roles"("tenantId", "code");

-- CreateIndex
CREATE INDEX "user_tenant_roles_userId_tenantId_active_idx" ON "user_tenant_roles"("userId", "tenantId", "active");

-- CreateIndex
CREATE INDEX "user_tenant_roles_tenantId_active_idx" ON "user_tenant_roles"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_roles_userId_tenantId_roleId_key" ON "user_tenant_roles"("userId", "tenantId", "roleId");

-- CreateIndex
CREATE INDEX "permission_audit_log_tenantId_createdAt_idx" ON "permission_audit_log"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "permission_audit_log_userId_createdAt_idx" ON "permission_audit_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "permission_audit_log_action_createdAt_idx" ON "permission_audit_log"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_tenantId_status_idx" ON "invitations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "glosa_simulations_tenantId_createdAt_idx" ON "glosa_simulations"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "glosa_simulations_fractionCode_idx" ON "glosa_simulations"("fractionCode");

-- CreateIndex
CREATE INDEX "glosa_simulations_riskLevel_idx" ON "glosa_simulations"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "glosa_risk_rules_ruleCode_key" ON "glosa_risk_rules"("ruleCode");

-- CreateIndex
CREATE INDEX "glosa_risk_rules_category_idx" ON "glosa_risk_rules"("category");

-- CreateIndex
CREATE INDEX "glosa_risk_rules_active_idx" ON "glosa_risk_rules"("active");

-- CreateIndex
CREATE INDEX "padron_checks_tenantId_fractionCode_idx" ON "padron_checks"("tenantId", "fractionCode");

-- CreateIndex
CREATE INDEX "padron_checks_tenantId_checkedAt_idx" ON "padron_checks"("tenantId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "risk_factor_weights_factor_key" ON "risk_factor_weights"("factor");

-- CreateIndex
CREATE INDEX "risk_assessments_tenantId_createdAt_idx" ON "risk_assessments"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "sat_69b_situacion_idx" ON "sat_69b"("situacion");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headings" ADD CONSTRAINT "headings_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subheadings" ADD CONSTRAINT "subheadings_headingId_fkey" FOREIGN KEY ("headingId") REFERENCES "headings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fractions" ADD CONSTRAINT "fractions_subheadingId_fkey" FOREIGN KEY ("subheadingId") REFERENCES "subheadings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedimentos" ADD CONSTRAINT "pedimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedimentos" ADD CONSTRAINT "pedimentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedimento_partidas" ADD CONSTRAINT "pedimento_partidas_pedimentoId_fkey" FOREIGN KEY ("pedimentoId") REFERENCES "pedimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_imports" ADD CONSTRAINT "temporary_imports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_imports" ADD CONSTRAINT "temporary_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharges" ADD CONSTRAINT "discharges_temporaryImportId_fkey" FOREIGN KEY ("temporaryImportId") REFERENCES "temporary_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharges" ADD CONSTRAINT "discharges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharges" ADD CONSTRAINT "discharges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annex24_reports" ADD CONSTRAINT "annex24_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annex30_accounts" ADD CONSTRAINT "annex30_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_credits" ADD CONSTRAINT "tax_credits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_usages" ADD CONSTRAINT "credit_usages_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "tax_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_usages" ADD CONSTRAINT "credit_usages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_profiles" ADD CONSTRAINT "certification_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifestaciones_valor" ADD CONSTRAINT "manifestaciones_valor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coves" ADD CONSTRAINT "coves_mveId_fkey" FOREIGN KEY ("mveId") REFERENCES "manifestaciones_valor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coves" ADD CONSTRAINT "coves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_plans" ADD CONSTRAINT "load_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_items" ADD CONSTRAINT "load_items_loadPlanId_fkey" FOREIGN KEY ("loadPlanId") REFERENCES "load_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_notifications" ADD CONSTRAINT "update_notifications_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "tigie_updates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_notifications" ADD CONSTRAINT "update_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_consumptions" ADD CONSTRAINT "assembly_consumptions_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_logs" ADD CONSTRAINT "restore_logs_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "backup_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_analyses" ADD CONSTRAINT "origin_analyses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_analyses" ADD CONSTRAINT "origin_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_certificates" ADD CONSTRAINT "origin_certificates_originAnalysisId_fkey" FOREIGN KEY ("originAnalysisId") REFERENCES "origin_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_padron_status" ADD CONSTRAINT "tenant_padron_status_padronId_fkey" FOREIGN KEY ("padronId") REFERENCES "sat_padrones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

