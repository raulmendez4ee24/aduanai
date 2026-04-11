import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import xlsx from 'xlsx';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseIGI(raw: unknown): { rate: number | null; prohibited: boolean; exempt: boolean; mixed: string | null } {
  const val = String(raw || '').trim();

  if (!val || val === 'undefined' || val === 'null') return { rate: null, prohibited: false, exempt: false, mixed: null };
  if (val === 'Ex.' || val === 'Ex' || val === 'Exento') return { rate: 0, prohibited: false, exempt: true, mixed: null };
  if (val === 'Prohibida') return { rate: null, prohibited: true, exempt: false, mixed: null };
  if (val.startsWith('AMX')) return { rate: null, prohibited: false, exempt: false, mixed: val };

  const num = parseFloat(val);
  if (!isNaN(num)) return { rate: num, prohibited: false, exempt: false, mixed: null };

  return { rate: null, prohibited: false, exempt: false, mixed: val };
}

async function main() {
  console.log('🔧 Enriqueciendo fracciones con aranceles OFICIALES de LIGIE 2026\n');

  const excelPath = '/Users/raulaldairmendezalvarez/Downloads/kanaduana /BASEUNICA-LIGIE_20260330-20260330.xlsb';
  console.log(`📄 Leyendo ${excelPath}...`);

  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  console.log(`   ${rows.length} filas\n`);

  // Parsear aranceles del Excel
  const tariffMap = new Map<string, {
    igi: number | null;
    ige: string;
    nico: string;
    prohibited: boolean;
    exempt: boolean;
    mixed: string | null;
    description: string;
    section: string;
    unit: string;
  }>();

  let parsed = 0;
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const rawCode = String(row[1] || '').trim();
    const nico = String(row[2] || '00').trim() || '00';
    const desc = String(row[3] || '').trim();
    const rawIGI = row[7];
    const rawIGE = String(row[8] || 'Ex.').trim();
    const section = String(row[9] || '').trim();
    const umt = String(row[6] || '').trim();

    const digits = rawCode.replace(/\./g, '');
    if (digits.length < 8 || !/^\d+$/.test(digits)) continue;

    const code8 = digits.substring(0, 8);
    const { rate, prohibited, exempt, mixed } = parseIGI(rawIGI);

    // Solo guardamos la primera entrada por code8 (la más específica)
    if (!tariffMap.has(code8)) {
      tariffMap.set(code8, {
        igi: rate,
        ige: rawIGE,
        nico,
        prohibited,
        exempt,
        mixed,
        description: desc,
        section,
        unit: umt || 'Kg',
      });
      parsed++;
    }
  }

  console.log(`   ${parsed} fracciones con aranceles parseados\n`);

  // Stats de aranceles
  let exempt = 0, numeric = 0, prohibited = 0, mixed = 0, noRate = 0;
  for (const v of tariffMap.values()) {
    if (v.exempt) exempt++;
    else if (v.prohibited) prohibited++;
    else if (v.mixed) mixed++;
    else if (v.igi !== null) numeric++;
    else noRate++;
  }
  console.log('📊 Distribución de aranceles:');
  console.log(`   Exentos (0%):     ${exempt}`);
  console.log(`   Con tasa (%):     ${numeric}`);
  console.log(`   Prohibidas:       ${prohibited}`);
  console.log(`   Arancel mixto:    ${mixed}`);
  console.log(`   Sin dato:         ${noRate}`);
  console.log('');

  // Actualizar fracciones en DB
  const fractions = await prisma.fraction.findMany({
    select: { id: true, code: true, description: true },
  });
  console.log(`🏷️  Actualizando ${fractions.length} fracciones...\n`);

  let updated = 0;
  let matched = 0;
  let unmatched = 0;

  for (const frac of fractions) {
    const data = tariffMap.get(frac.code);

    if (data) {
      matched++;
      const updateData: Record<string, unknown> = {
        tariffNMF: data.igi ?? (data.exempt ? 0 : null),
        tariffTMEC: 0, // TMEC preferencial generalmente 0
        nico: data.nico,
        unit: data.unit,
      };

      // Actualizar descripción si la del LIGIE es más completa
      if (data.description && data.description.length > 5) {
        updateData.description = data.description;
      }

      await prisma.fraction.update({
        where: { id: frac.id },
        data: updateData,
      });
    } else {
      unmatched++;
    }

    updated++;
    if (updated % 1000 === 0) {
      console.log(`   ... ${updated} procesadas (${matched} actualizadas)`);
    }
  }

  console.log(`\n✅ Resultado:`);
  console.log(`   ${matched} fracciones actualizadas con aranceles oficiales`);
  console.log(`   ${unmatched} sin match en LIGIE (mantienen arancel anterior)`);

  // Verificación final
  const withTariff = await prisma.fraction.count({ where: { tariffNMF: { not: null } } });
  const totalFracs = await prisma.fraction.count();
  console.log(`\n📊 Cobertura final: ${withTariff}/${totalFracs} (${Math.round(withTariff/totalFracs*100)}%)`);

  // Muestra de verificación
  console.log('\n=== MUESTRA DE VERIFICACIÓN ===');
  const samples = [
    { code: '84713001', name: 'Laptops' },
    { code: '85171401', name: 'Smartphones' },
    { code: '61012003', name: 'Textil punto' },
    { code: '87032399', name: 'Autos' },
    { code: '72082501', name: 'Acero laminado' },
    { code: '30049099', name: 'Medicamentos' },
    { code: '22030001', name: 'Cerveza' },
    { code: '64039901', name: 'Calzado' },
  ];

  for (const s of samples) {
    const f = await prisma.fraction.findFirst({ where: { code: s.code } });
    if (f) {
      console.log(`${s.name.padEnd(15)} ${f.codeFormatted} → IGI: ${f.tariffNMF !== null ? f.tariffNMF + '%' : 'N/A'} | ${(f.description || '').substring(0, 50)}`);
    }
  }
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
