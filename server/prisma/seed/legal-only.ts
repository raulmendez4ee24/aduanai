/**
 * Standalone runner para sembrar/reseed solo los documentos legales del RAG.
 * Se invoca desde POST /api/admin/legal-docs/reseed o manualmente:
 *   npx tsx prisma/seed/legal-only.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { seedLegalDocuments } from './legal-documents';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('[legal-only] Reseeding legal documents…');
  const r = await seedLegalDocuments(prisma);
  console.log(`[legal-only] Done: inserted/updated=${r.inserted}, skipped=${r.skipped}`);
}

main()
  .catch((e) => { console.error('[legal-only] Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
