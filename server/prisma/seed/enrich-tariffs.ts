import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Cargar todos los aranceles de nuestros archivos generados
async function loadTariffData() {
  const allData = new Map<string, {
    tariffNMF: number;
    tariffTMEC?: number | null;
    keywords?: string[];
    noms?: string[];
    iepsRate?: number | null;
    requiresPermit?: boolean;
    permitType?: string | null;
    sectoralRegistry?: boolean;
    sectoralType?: string | null;
    unit?: string;
  }>();

  const files = [
    '../seed/tigie-data',
    '../seed/chapters/cap_84_85',
    '../seed/chapters/cap_61_62_64_87',
    '../seed/chapters/cap_28_29_30_39_72_73_76',
    '../seed/chapters/cap_01_24',
    '../seed/chapters/cap_25_60',
    '../seed/chapters/cap_63_98',
  ];

  for (const file of files) {
    try {
      const mod = await import(file);
      const fracs = mod.FRACTIONS || [];
      for (const f of fracs) {
        allData.set(f.code, {
          tariffNMF: f.tariffNMF,
          tariffTMEC: f.tariffTMEC,
          keywords: f.keywords,
          noms: f.noms,
          iepsRate: f.iepsRate,
          requiresPermit: f.requiresPermit,
          permitType: f.permitType,
          sectoralRegistry: f.sectoralRegistry,
          sectoralType: f.sectoralType,
          unit: f.unit,
        });
      }
    } catch { /* skip */ }
  }

  return allData;
}

// Aranceles default por capítulo cuando no tenemos data específica
const DEFAULT_TARIFFS: Record<string, { nmf: number; tmec: number; unit?: string; permit?: string; noms?: string[] }> = {
  '01': { nmf: 10, tmec: 0, unit: 'Pza', permit: 'SENASICA' },
  '02': { nmf: 20, tmec: 0, unit: 'Kg', permit: 'SENASICA' },
  '03': { nmf: 15, tmec: 0, unit: 'Kg', permit: 'SENASICA' },
  '04': { nmf: 20, tmec: 0, unit: 'Kg' },
  '05': { nmf: 10, tmec: 0, unit: 'Kg' },
  '06': { nmf: 10, tmec: 0, unit: 'Kg' },
  '07': { nmf: 15, tmec: 0, unit: 'Kg', permit: 'SENASICA' },
  '08': { nmf: 20, tmec: 0, unit: 'Kg' },
  '09': { nmf: 15, tmec: 0, unit: 'Kg' },
  '10': { nmf: 15, tmec: 0, unit: 'Kg' },
  '11': { nmf: 10, tmec: 0, unit: 'Kg' },
  '12': { nmf: 10, tmec: 0, unit: 'Kg' },
  '13': { nmf: 10, tmec: 0, unit: 'Kg' },
  '14': { nmf: 10, tmec: 0, unit: 'Kg' },
  '15': { nmf: 15, tmec: 0, unit: 'L' },
  '16': { nmf: 20, tmec: 0, unit: 'Kg' },
  '17': { nmf: 20, tmec: 0, unit: 'Kg' },
  '18': { nmf: 15, tmec: 0, unit: 'Kg' },
  '19': { nmf: 20, tmec: 0, unit: 'Kg' },
  '20': { nmf: 20, tmec: 0, unit: 'Kg' },
  '21': { nmf: 20, tmec: 0, unit: 'Kg' },
  '22': { nmf: 20, tmec: 0, unit: 'L' },
  '23': { nmf: 5, tmec: 0, unit: 'Kg' },
  '24': { nmf: 20, tmec: 0, unit: 'Kg', permit: 'COFEPRIS' },
  '25': { nmf: 5, tmec: 0, unit: 'Kg' },
  '26': { nmf: 0, tmec: 0, unit: 'Kg' },
  '27': { nmf: 0, tmec: 0, unit: 'L', permit: 'SENER' },
  '28': { nmf: 5, tmec: 0, unit: 'Kg' },
  '29': { nmf: 5, tmec: 0, unit: 'Kg' },
  '30': { nmf: 0, tmec: 0, unit: 'Kg', permit: 'COFEPRIS' },
  '31': { nmf: 0, tmec: 0, unit: 'Kg' },
  '32': { nmf: 10, tmec: 0, unit: 'Kg' },
  '33': { nmf: 15, tmec: 0, unit: 'Kg', permit: 'COFEPRIS' },
  '34': { nmf: 15, tmec: 0, unit: 'Kg' },
  '35': { nmf: 10, tmec: 0, unit: 'Kg' },
  '36': { nmf: 10, tmec: 0, unit: 'Kg', permit: 'SEDENA' },
  '37': { nmf: 5, tmec: 0, unit: 'Kg' },
  '38': { nmf: 10, tmec: 0, unit: 'Kg' },
  '39': { nmf: 7, tmec: 0, unit: 'Kg' },
  '40': { nmf: 10, tmec: 0, unit: 'Kg' },
  '41': { nmf: 5, tmec: 0, unit: 'Kg' },
  '42': { nmf: 20, tmec: 0, unit: 'Pza' },
  '43': { nmf: 15, tmec: 0, unit: 'Pza' },
  '44': { nmf: 10, tmec: 0, unit: 'Kg', permit: 'SEMARNAT' },
  '45': { nmf: 10, tmec: 0, unit: 'Kg' },
  '46': { nmf: 10, tmec: 0, unit: 'Kg' },
  '47': { nmf: 0, tmec: 0, unit: 'Kg' },
  '48': { nmf: 10, tmec: 0, unit: 'Kg' },
  '49': { nmf: 0, tmec: 0, unit: 'Kg' },
  '50': { nmf: 5, tmec: 0, unit: 'Kg' },
  '51': { nmf: 10, tmec: 0, unit: 'Kg' },
  '52': { nmf: 10, tmec: 0, unit: 'Kg' },
  '53': { nmf: 5, tmec: 0, unit: 'Kg' },
  '54': { nmf: 10, tmec: 0, unit: 'Kg' },
  '55': { nmf: 10, tmec: 0, unit: 'Kg' },
  '56': { nmf: 10, tmec: 0, unit: 'Kg' },
  '57': { nmf: 15, tmec: 0, unit: 'm²' },
  '58': { nmf: 10, tmec: 0, unit: 'Kg' },
  '59': { nmf: 10, tmec: 0, unit: 'Kg' },
  '60': { nmf: 10, tmec: 0, unit: 'Kg' },
  '61': { nmf: 30, tmec: 0, unit: 'Pza', noms: ['NOM-004-SE-2021'] },
  '62': { nmf: 30, tmec: 0, unit: 'Pza', noms: ['NOM-004-SE-2021'] },
  '63': { nmf: 20, tmec: 0, unit: 'Pza' },
  '64': { nmf: 30, tmec: 0, unit: 'Par', noms: ['NOM-004-SE-2021'] },
  '65': { nmf: 20, tmec: 0, unit: 'Pza' },
  '66': { nmf: 15, tmec: 0, unit: 'Pza' },
  '67': { nmf: 15, tmec: 0, unit: 'Pza' },
  '68': { nmf: 10, tmec: 0, unit: 'Kg' },
  '69': { nmf: 15, tmec: 0, unit: 'Kg' },
  '70': { nmf: 10, tmec: 0, unit: 'Kg' },
  '71': { nmf: 5, tmec: 0, unit: 'Kg' },
  '72': { nmf: 5, tmec: 0, unit: 'Kg' },
  '73': { nmf: 10, tmec: 0, unit: 'Kg' },
  '74': { nmf: 5, tmec: 0, unit: 'Kg' },
  '75': { nmf: 5, tmec: 0, unit: 'Kg' },
  '76': { nmf: 10, tmec: 0, unit: 'Kg' },
  '78': { nmf: 5, tmec: 0, unit: 'Kg' },
  '79': { nmf: 5, tmec: 0, unit: 'Kg' },
  '80': { nmf: 5, tmec: 0, unit: 'Kg' },
  '81': { nmf: 5, tmec: 0, unit: 'Kg' },
  '82': { nmf: 10, tmec: 0, unit: 'Pza' },
  '83': { nmf: 15, tmec: 0, unit: 'Kg' },
  '84': { nmf: 5, tmec: 0, unit: 'Pza' },
  '85': { nmf: 5, tmec: 0, unit: 'Pza' },
  '86': { nmf: 5, tmec: 0, unit: 'Pza' },
  '87': { nmf: 15, tmec: 0, unit: 'Pza' },
  '88': { nmf: 0, tmec: 0, unit: 'Pza' },
  '89': { nmf: 10, tmec: 0, unit: 'Pza' },
  '90': { nmf: 5, tmec: 0, unit: 'Pza' },
  '91': { nmf: 10, tmec: 0, unit: 'Pza' },
  '92': { nmf: 10, tmec: 0, unit: 'Pza' },
  '93': { nmf: 15, tmec: 0, unit: 'Pza', permit: 'SEDENA' },
  '94': { nmf: 15, tmec: 0, unit: 'Pza' },
  '95': { nmf: 15, tmec: 0, unit: 'Pza' },
  '96': { nmf: 10, tmec: 0, unit: 'Pza' },
  '97': { nmf: 0, tmec: 0, unit: 'Pza' },
};

async function main() {
  console.log('🔧 Enriqueciendo fracciones con aranceles...\n');

  // Cargar datos de aranceles de nuestros archivos
  const tariffData = await loadTariffData();
  console.log(`📄 ${tariffData.size} fracciones con aranceles específicos\n`);

  // Obtener todas las fracciones de la DB
  const fractions = await prisma.fraction.findMany({
    select: { id: true, code: true },
  });
  console.log(`📊 ${fractions.length} fracciones en la DB\n`);

  let updated = 0;
  let fromFile = 0;
  let fromDefault = 0;

  for (const frac of fractions) {
    const chapter = frac.code.substring(0, 2);
    const specific = tariffData.get(frac.code);
    const defaults = DEFAULT_TARIFFS[chapter] || { nmf: 5, tmec: 0, unit: 'Kg' };

    if (specific) {
      await prisma.fraction.update({
        where: { id: frac.id },
        data: {
          tariffNMF: specific.tariffNMF,
          tariffTMEC: specific.tariffTMEC ?? 0,
          keywords: specific.keywords && specific.keywords.length > 0 ? specific.keywords : undefined,
          noms: specific.noms && specific.noms.length > 0 ? specific.noms : undefined,
          iepsRate: specific.iepsRate,
          requiresPermit: specific.requiresPermit ?? false,
          permitType: specific.permitType,
          sectoralRegistry: specific.sectoralRegistry ?? false,
          sectoralType: specific.sectoralType,
          unit: specific.unit || defaults.unit,
        },
      });
      fromFile++;
    } else {
      await prisma.fraction.update({
        where: { id: frac.id },
        data: {
          tariffNMF: defaults.nmf,
          tariffTMEC: defaults.tmec,
          unit: defaults.unit,
          requiresPermit: !!defaults.permit,
          permitType: defaults.permit || null,
          noms: defaults.noms || [],
        },
      });
      fromDefault++;
    }

    updated++;
    if (updated % 1000 === 0) {
      console.log(`   ... ${updated} actualizadas`);
    }
  }

  console.log(`\n✅ ${updated} fracciones enriquecidas:`);
  console.log(`   ${fromFile} con aranceles específicos`);
  console.log(`   ${fromDefault} con aranceles default por capítulo`);

  // Verificación
  const withTariff = await prisma.fraction.count({ where: { tariffNMF: { not: null } } });
  const totalFracs = await prisma.fraction.count();
  console.log(`\n📊 Cobertura: ${withTariff}/${totalFracs} (${Math.round(withTariff/totalFracs*100)}%)`);
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
