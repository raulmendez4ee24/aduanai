-- AlterTable
ALTER TABLE "copilot_consults" ADD COLUMN     "citaDegradada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "citaModo" TEXT,
ADD COLUMN     "citaRegenerada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "citasNoRespaldadas" JSONB,
ADD COLUMN     "respuestaDescartada" TEXT;

