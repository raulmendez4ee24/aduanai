-- Frontera Canónica Fase 2 — Pre-Glosa fail-closed (docs/FRONTERA_CANONICA_DESIGN.md §5)
-- Aditivo, sin pérdida de datos.

-- AlterTable
ALTER TABLE "glosa_simulations" ADD COLUMN     "exchangeRateUsed" JSONB,
ADD COLUMN     "revision" JSONB,
ALTER COLUMN "valueMXN" DROP NOT NULL;

-- AlterTable
ALTER TABLE "glosa_risk_rules" ADD COLUMN     "fechaCotejo" TIMESTAMP(3),
ADD COLUMN     "fuenteNombre" TEXT,
ADD COLUMN     "fuenteUrl" TEXT;
