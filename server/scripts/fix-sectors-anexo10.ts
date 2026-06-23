// Migración de datos FIX #2 — Sectores del Padrón de Importadores de Sectores
// Específicos. Fuente OFICIAL: Anexo 10 RGCE, Apartado A, DOF 19-ene-2024.
// 1) Reemplaza la tabla SATPadron sectorial (17 mal → 16 oficiales).
// 2) Remapea las 5 reglas padron_sectorial que se conservan; borra 2 (39, 2208).
// 3) Limpia el sectoralType fabricado de la fracción de queso (04069099).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SECTORS: { code: string; name: string; patterns: string[]; auth: string }[] = [
  { code: '1', name: 'Productos químicos', patterns: ['28', '29', '38'], auth: 'SAT-AGACE' },
  { code: '2', name: 'Radiactivos y nucleares', patterns: ['2844', '2845'], auth: 'SAT-AGACE + CNSNS' },
  { code: '3', name: 'Precursores químicos y químicos esenciales', patterns: ['2914.1', '2932.91', '2939.4'], auth: 'SAT-AGACE + COFEPRIS' },
  { code: '4', name: 'Armas de fuego y sus partes, refacciones, accesorios y municiones', patterns: ['93'], auth: 'SAT-AGACE + SEDENA' },
  { code: '5', name: 'Explosivos y material relacionado con explosivos', patterns: ['3601', '3602', '3603'], auth: 'SAT-AGACE + SEDENA' },
  { code: '6', name: 'Sustancias químicas, materiales para usos pirotécnicos y artificios relacionados con el empleo de explosivos', patterns: ['3604'], auth: 'SAT-AGACE + SEDENA' },
  { code: '7', name: 'Las demás armas y accesorios. Armas blancas y accesorios. Explosores', patterns: ['9307'], auth: 'SAT-AGACE + SEDENA' },
  { code: '8', name: 'Máquinas, aparatos, dispositivos y artefactos, relacionados con armas y otros', patterns: [], auth: 'SAT-AGACE + SEDENA' },
  { code: '9', name: 'Cigarros', patterns: ['24'], auth: 'SAT-AGACE' },
  { code: '10', name: 'Calzado', patterns: ['64'], auth: 'SAT-AGACE' },
  { code: '11', name: 'Textil y confección', patterns: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'], auth: 'SAT-AGACE' },
  { code: '12', name: 'Alcohol etílico', patterns: ['2207'], auth: 'SAT-AGACE' },
  { code: '13', name: 'Hidrocarburos y combustibles', patterns: ['2709', '2710', '2711'], auth: 'SAT-AGACE + CRE' },
  { code: '14', name: 'Siderúrgico', patterns: ['72'], auth: 'SAT-AGACE' },
  { code: '15', name: 'Productos siderúrgicos', patterns: ['73'], auth: 'SAT-AGACE' },
  { code: '16', name: 'Automotriz', patterns: ['87'], auth: 'SAT-AGACE' },
];

// Remapeo de fractionRegulation (padron_sectorial). null = borrar la regla.
const RULE_REMAP: Record<string, { code: string; desc: string } | null> = {
  '72': { code: 'Sector 14 — Siderúrgico', desc: 'Padrón de Importadores de Sectores Específicos — Sector 14 (siderúrgico). Aproximación por capítulo 72.' },
  '73': { code: 'Sector 15 — Productos siderúrgicos', desc: 'Padrón de Importadores de Sectores Específicos — Sector 15 (productos siderúrgicos). Aproximación por capítulo 73.' },
  '64': { code: 'Sector 10 — Calzado', desc: 'Padrón de Importadores de Sectores Específicos — Sector 10 (calzado).' },
  '24': { code: 'Sector 9 — Cigarros', desc: 'Padrón de Importadores de Sectores Específicos — Sector 9 (cigarros).' },
  '2207': { code: 'Sector 12 — Alcohol etílico', desc: 'Padrón de Importadores de Sectores Específicos — Sector 12 (alcohol etílico).' },
  '39': null,   // plástico no es sector de importador del Anexo 10
  '2208': null, // licores: sector correcto pendiente de verificar (DEFERRED_WORK)
};

async function main() {
  console.log('🔧 FIX #2 — Sectores Anexo 10 RGCE (DOF 19-ene-2024)\n');

  // 1) SATPadron sectorial: borrar todos y recrear los 16 oficiales
  const del = await prisma.sATPadron.deleteMany({ where: { type: 'sectorial' } });
  console.log(`SATPadron sectorial borrados: ${del.count}`);
  for (const s of SECTORS) {
    await prisma.sATPadron.create({
      data: {
        type: 'sectorial', sectorialCode: s.code, sectorialName: s.name,
        fractionPatterns: s.patterns,
        description: `Sector ${s.code} del Padrón de Importadores de Sectores Específicos (Anexo 10 RGCE).`,
        legalBasis: `Anexo 10 RGCE Sector ${s.code} (DOF 19-ene-2024)`,
        authority: s.auth, estimatedDays: 30, validityMonths: 12,
      },
    });
  }
  console.log(`SATPadron sectoriales creados: ${SECTORS.length}`);

  // 2) Reglas padron_sectorial
  for (const [frac, target] of Object.entries(RULE_REMAP)) {
    if (target === null) {
      const d = await prisma.fractionRegulation.deleteMany({ where: { type: 'padron_sectorial', fractionCode: frac } });
      console.log(`  regla ${frac}: BORRADA (${d.count})`);
    } else {
      const u = await prisma.fractionRegulation.updateMany({
        where: { type: 'padron_sectorial', fractionCode: frac },
        data: { code: target.code, description: target.desc },
      });
      console.log(`  regla ${frac} → ${target.code} (${u.count})`);
    }
  }

  // 3) Queso 04069099: limpiar sectoralType/sectoralRegistry fabricados
  const q = await prisma.fraction.updateMany({ where: { code: '04069099' }, data: { sectoralType: null, sectoralRegistry: false } });
  console.log(`Fracción queso 04069099 limpiada: ${q.count}`);

  // 4) Estado final
  console.log('\n=== TABLA SATPadron sectorial (final) ===');
  const sect = await prisma.sATPadron.findMany({ where: { type: 'sectorial' }, orderBy: { sectorialCode: 'asc' } });
  for (const r of sect.sort((a, b) => Number(a.sectorialCode) - Number(b.sectorialCode))) {
    console.log(`  Sector ${r.sectorialCode}: ${r.sectorialName}`);
  }
  console.log(`  TOTAL: ${sect.length} sectores`);

  console.log('\n=== Reglas padron_sectorial (final) ===');
  const rules = await prisma.fractionRegulation.findMany({ where: { type: 'padron_sectorial' }, orderBy: { fractionCode: 'asc' } });
  for (const r of rules) console.log(`  prefijo ${r.fractionCode} → ${r.code}`);
  console.log(`  TOTAL: ${rules.length} reglas`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
