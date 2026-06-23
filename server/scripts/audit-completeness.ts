// Auditoría de completitud del catálogo de fracciones (corre dentro de Railway)
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const pct = (n: number, t: number) => t === 0 ? '0.0' : ((n / t) * 100).toFixed(1);

async function main() {
  const total = await prisma.fraction.count();
  const active = await prisma.fraction.count({ where: { active: true } });
  const withDesc = await prisma.fraction.count({ where: { description: { not: '' } } });
  const withNico = await prisma.fraction.count({ where: { nico: { not: null } } });
  const withUnit = await prisma.fraction.count({ where: { unit: { not: null } } });
  const withTariff = await prisma.fraction.count({ where: { tariffNMF: { not: null } } });

  console.log('\n=== COMPLETITUD ===');
  console.log(`Total fracciones:     ${total}  (activas: ${active})`);
  console.log(`Con descripción:      ${withDesc}  (${pct(withDesc, total)}%)`);
  console.log(`Con NICO:             ${withNico}  (${pct(withNico, total)}%)`);
  console.log(`Con unidad (UMT):     ${withUnit}  (${pct(withUnit, total)}%)`);
  console.log(`Con arancel (IGI):    ${withTariff}  (${pct(withTariff, total)}%)`);

  const rows = await prisma.$queryRawUnsafe<{ ch: string; n: bigint }[]>(
    `SELECT substring(code,1,2) AS ch, count(*)::int AS n FROM fractions GROUP BY 1 ORDER BY 1`
  );
  const map = new Map(rows.map(r => [r.ch, Number(r.n)]));
  console.log('\n=== COBERTURA POR CAPÍTULO (01-98) ===');
  const low: string[] = [], zero: string[] = [];
  let line = '';
  for (let i = 1; i <= 98; i++) {
    if (i === 77) continue; // capítulo 77 reservado en el SA
    const ch = String(i).padStart(2, '0');
    const n = map.get(ch) ?? 0;
    if (n === 0) zero.push(ch);
    else if (n < 5) low.push(`${ch}(${n})`);
    line += `${ch}:${String(n).padStart(3)} `;
    if (i % 10 === 0) { console.log(line); line = ''; }
  }
  if (line) console.log(line);
  console.log(`\n⚠️  Capítulos en 0: ${zero.length ? zero.join(', ') : 'ninguno'}`);
  console.log(`⚠️  Capítulos con <5: ${low.length ? low.join(', ') : 'ninguno'}`);

  console.log('\n=== SPOT-CHECK (datos completos) ===');
  const codes = ['87032301', '73181599', '61091001'];
  for (const code of codes) {
    const f = await prisma.fraction.findUnique({ where: { code } });
    if (!f) { console.log(`\n${code}: ❌ NO ENCONTRADA`); continue; }
    console.log(`\n${f.codeFormatted} (${f.code})`);
    console.log(`  desc:    ${f.description}`);
    console.log(`  nico:    ${f.nico}   unit: ${f.unit}   IGI: ${f.tariffNMF}%`);
    console.log(`  permiso: ${f.requiresPermit} (${f.permitType ?? '—'})   padrón: ${f.sectoralRegistry}`);
    console.log(`  noms:    ${JSON.stringify(f.noms)}`);
    console.log(`  keywords:${JSON.stringify(f.keywords).slice(0, 120)}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
