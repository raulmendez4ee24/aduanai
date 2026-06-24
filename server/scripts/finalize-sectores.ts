// PASO 5 (final): borra fractionRegulation.padron_sectorial de prod (SOLO ese type)
// y corre el MAPA DE COHERENCIA TOTAL para el tornillo 7318.15.99 (las 5 fuentes).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveSectorsForFraction } from '../dist/services/padron-checker.js';
import { lookupCompliance } from '../dist/services/compliance-lookup.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function countByType() {
  const g = await prisma.fractionRegulation.groupBy({ by: ['type'], _count: true });
  return Object.fromEntries(g.map(x => [x.type, x._count]));
}

async function main() {
  console.log('=== fractionRegulation por tipo ANTES ===', JSON.stringify(await countByType()));

  // BORRADO: SOLO type='padron_sectorial'. NOM y RRNA intactos.
  const del = await prisma.fractionRegulation.deleteMany({ where: { type: 'padron_sectorial' } });
  console.log(`Borradas filas type='padron_sectorial': ${del.count}`);

  console.log('=== fractionRegulation por tipo DESPUÉS ===', JSON.stringify(await countByType()));

  // ── MAPA DE COHERENCIA TOTAL — tornillo 7318.15.99 ──
  const F = '73181599';
  console.log('\n════════ MAPA DE COHERENCIA — fracción 7318.15.99 ════════');

  // Fuente 1: SATPadron (catálogo + glosa + ahora compliance) vía el resolver canónico
  const r = await resolveSectorsForFraction(F);
  console.log('1. SATPadron (resolver canónico):    ', r.map((s: any) => s.code).join(', ') || '(ninguno)');

  // Fuente 2: fractionRegulation.padron_sectorial (debe estar VACÍA ya)
  const fr = await prisma.fractionRegulation.count({ where: { type: 'padron_sectorial', fractionCode: { in: ['72', '73', '731815', F] } } });
  console.log('2. fractionRegulation.padron_sectorial:', fr === 0 ? 'ELIMINADA (0 filas) → ya no es fuente' : `⚠️ AÚN ${fr} filas`);

  // Fuente 3: Fraction.sectoralRegistry (boolean, ahora DERIVADO en el route)
  const frac = await prisma.fraction.findUnique({ where: { code: F }, select: { sectoralRegistry: true } });
  console.log('3. Fraction.sectoralRegistry (col):   ', `${frac?.sectoralRegistry} — NOTA: el clasificador lo DERIVA del resolver (sectores>0=true), no usa esta columna`);

  // Fuente 4+5: corpus RAG (Copilot) — no debe enumerar números
  const docs = await prisma.legalDocument.findMany({ select: { content: true } });
  const enumeran = docs.filter(d => /Sector\s+\d+\s*\(/.test(d.content)).length;
  console.log('4-5. Corpus RAG (2 docs Anexo 10):    ', enumeran === 0 ? 'sin enumeraciones de número (remite al Anexo 10)' : `⚠️ ${enumeran} docs aún enumeran`);

  // Lectores en vivo (lo que ve el usuario): compliance-lookup → clasificador/alertas/cotizador
  const c: any = await lookupCompliance(F, 'CN');
  const padronVivo = c.regulations.filter((x: any) => x.type === 'padron_sectorial').map((x: any) => x.code);
  console.log('\nLECTORES EN VIVO (clasificador/alertas/cotizador) →', padronVivo.join(', ') || '(ninguno)');

  const allSay15 = r.every((s: any) => s.sectorialCode === '15') && r.length === 1 && padronVivo.every((p: string) => p.includes('Sector 15')) && fr === 0 && enumeran === 0;
  console.log('\n', allSay15 ? '✅ COHERENCIA TOTAL: todas las fuentes dicen Sector 15 (o ya no son fuente). CERO divergencia.' : '⚠️ revisar — alguna fuente diverge');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
