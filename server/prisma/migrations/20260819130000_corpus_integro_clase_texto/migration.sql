-- Corpus Íntegro lote 0 (plan aprobado 19-ago): clase de texto + fecha de cotejo.
-- Aditivo. Los 44 docs existentes quedan 'resumen' por default (que es la verdad).

-- AlterTable
ALTER TABLE "legal_documents" ADD COLUMN     "claseTexto" TEXT NOT NULL DEFAULT 'resumen',
ADD COLUMN     "fechaCotejo" TIMESTAMP(3);
