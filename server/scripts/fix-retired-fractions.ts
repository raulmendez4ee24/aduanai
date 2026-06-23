// Migración de datos: corrige códigos de fracción retirados en TIGIE 2026.
//   7318.15.05 (acero al carbono)  -> 7318.15.99 «los demás»
//   7318.15.01 (tornillos madera)  -> 7318.12.91 «los demás tornillos para madera»
//   7318.15.01 (catálogo, retirada) -> active=false
// Idempotente: re-correrla no causa daño (los WHERE ya no matchean).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function fixArray(model: 'legalPrecedent' | 'legalDocument', field: 'fractionCodes' | 'fractionRefs') {
  // @ts-ignore acceso dinámico
  const rows = await prisma[model].findMany();
  let changed = 0;
  for (const r of rows) {
    const arr: string[] = r[field] || [];
    if (!arr.some(c => c === '73181505' || c === '73181501')) continue;
    const next = [...new Set(arr.map(c => (c === '73181505' || c === '73181501') ? '73181599' : c))];
    // @ts-ignore
    await prisma[model].update({ where: { id: r.id }, data: { [field]: next } });
    changed++;
  }
  return changed;
}

async function main() {
  const adCarbon = await prisma.antidumpingDuty.updateMany({ where: { fractionCode: '73181505' }, data: { fractionCode: '73181599' } });
  const adWood = await prisma.antidumpingDuty.updateMany({ where: { fractionCode: '73181501' }, data: { fractionCode: '73181291' } });
  const ep505 = await prisma.estimatedPrice.updateMany({ where: { fractionCode: '73181505' }, data: { fractionCode: '73181599' } });
  const ep501 = await prisma.estimatedPrice.updateMany({ where: { fractionCode: '73181501' }, data: { fractionCode: '73181599' } });
  const deact = await prisma.fraction.updateMany({ where: { code: '73181501' }, data: { active: false } });
  const lp = await fixArray('legalPrecedent', 'fractionCodes').catch(() => -1);
  const ld = await fixArray('legalDocument', 'fractionRefs').catch(() => -1);

  console.log('✅ Updates:', JSON.stringify({
    antidumping_carbon_505to599: adCarbon.count,
    antidumping_wood_501to1291: adWood.count,
    estPrice_505to599: ep505.count,
    estPrice_501to599: ep501.count,
    fraction_501_deactivated: deact.count,
    legalPrecedent_rows_fixed: lp,
    legalDocument_rows_fixed: ld,
  }, null, 2));

  const leftAd = await prisma.antidumpingDuty.count({ where: { fractionCode: { in: ['73181505', '73181501'] } } });
  const activeRetired = await prisma.fraction.count({ where: { code: '73181501', active: true } });
  console.log(`\n🔎 Verificación — antidumping en códigos retirados: ${leftAd} (esperado 0)`);
  console.log(`🔎 Verificación — fracción 73181501 activa: ${activeRetired} (esperado 0)`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
