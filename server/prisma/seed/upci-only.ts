/**
 * Standalone runner para sembrar/reseed solo las cuotas compensatorias UPCI.
 * Se invoca desde POST /api/admin/antidumping/reseed-upci o manualmente:
 *   npx tsx prisma/seed/upci-only.ts
 *
 * BORRA todos los registros AntidumpingDuty existentes y los recrea desde
 * UPCI_RESOLUTIONS — la nueva estructura incluye resolutionNumber,
 * productDesc, rateType, rateUnit, etc. Necesario tras feat(antidumping).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { seedAntidumpingUPCI } from './antidumping-upci';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('[upci-only] Reseeding antidumping UPCI resolutions…');
  const r = await seedAntidumpingUPCI(prisma);
  console.log(`[upci-only] Done: inserted=${r.inserted}`);
}

main()
  .catch((e) => { console.error('[upci-only] Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
