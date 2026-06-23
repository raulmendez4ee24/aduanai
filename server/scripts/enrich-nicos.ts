// Enriquece nicos[] (y nico único) de las fracciones ya existentes en la DB,
// desde data/ligie-fractions-2026.json. Idempotente. Corre dentro de Railway.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface F { code: string; nico: string | null; nicos?: string[] }

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'prisma', 'seed', 'data', 'ligie-fractions-2026.json');
  const { fractions } = JSON.parse(readFileSync(dataPath, 'utf-8')) as { fractions: F[] };
  const withList = fractions.filter(f => (f.nicos?.length ?? 0) > 0);
  console.log(`Actualizando nicos[] en ${withList.length} fracciones...`);

  let done = 0;
  for (const batch of chunk(withList, 400)) {
    await Promise.all(batch.map(f =>
      prisma.fraction.updateMany({
        where: { code: f.code },
        data: { nicos: f.nicos ?? [], nico: f.nico ?? undefined },
      })
    ));
    done += batch.length;
    if (done % 2000 < 400) console.log(`   ... ${done}`);
  }

  const total = await prisma.fraction.count();
  const withNicos = await prisma.fraction.count({ where: { nicos: { isEmpty: false } } });
  const withNico = await prisma.fraction.count({ where: { nico: { not: null } } });
  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  console.log(`\n📊 total: ${total}`);
  console.log(`   con nicos[] (no vacío): ${withNicos} (${pct(withNicos)}%)`);
  console.log(`   con nico único:          ${withNico} (${pct(withNico)}%)`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
