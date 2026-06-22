// Seeder del catálogo TIGIE completo (LIGIE 2026)
// Fuente: server/prisma/seed/data/ligie-fractions-2026.json
//   generado desde data/BASEUNICA-LIGIE_20260330-20260330.xlsb (DOF 2026-03-30)
//
// Construye la jerarquía Section -> Chapter -> Heading -> Subheading -> Fraction
// con aranceles IGI oficiales. ADITIVO y seguro: usa createMany({ skipDuplicates }),
// por lo que NO borra nada y NO modifica fracciones ya existentes (preserva sus
// NOMs/IEPS/keywords curados). Solo inserta las que faltan. Idempotente.
//
// Uso:  npm run db:seed-ligie     (desde server/)
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { SECTIONS, CHAPTER_NAMES, getSectionForChapter } from './tigie-sections';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface LigieFraction {
  code: string;
  codeFormatted: string;
  description: string;
  nico: string | null;
  unit: string | null;
  tariffNMF: number | null;
  igiProhibited: boolean;
  igiMixed: string | null;
  requiresPermit: boolean;
  permitType: string | null;
  noms: boolean;
  sectoralRegistry: boolean;
  cuotaCompensatoria: boolean;
  keywords: string[];
  chapter: string;
  heading: string;
  subheading: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🌱 ADUANAI — Seed catálogo TIGIE completo (LIGIE 2026)\n');

  const dataPath = path.join(__dirname, 'data', 'ligie-fractions-2026.json');
  const { meta, fractions } = JSON.parse(readFileSync(dataPath, 'utf-8')) as {
    meta: { version: string; count: number };
    fractions: LigieFraction[];
  };
  console.log(`📄 ${dataPath}`);
  console.log(`   Versión: ${meta.version} — ${fractions.length} fracciones\n`);

  // 1) Secciones (createMany skipDuplicates)
  await prisma.section.createMany({
    data: SECTIONS.map(s => ({ number: s.number, title: s.title })),
    skipDuplicates: true,
  });
  const sectionMap = new Map((await prisma.section.findMany({ select: { id: true, number: true } })).map(s => [s.number, s.id]));
  console.log(`📦 Secciones: ${sectionMap.size}`);

  // 2) Capítulos presentes en los datos
  const chapters = [...new Set(fractions.map(f => f.chapter))].sort();
  await prisma.chapter.createMany({
    data: chapters
      .map(ch => ({ number: ch, title: CHAPTER_NAMES[ch] || `Capítulo ${ch}`, sectionId: sectionMap.get(getSectionForChapter(ch))! }))
      .filter(c => c.sectionId),
    skipDuplicates: true,
  });
  const chapterMap = new Map((await prisma.chapter.findMany({ select: { id: true, number: true } })).map(c => [c.number, c.id]));
  console.log(`📖 Capítulos: ${chapterMap.size}`);

  // 3) Partidas (headings)
  const headings = [...new Set(fractions.map(f => f.heading))];
  await prisma.heading.createMany({
    data: headings
      .map(h => ({ code: h, description: `Partida ${h}`, chapterId: chapterMap.get(h.slice(0, 2))! }))
      .filter(h => h.chapterId),
    skipDuplicates: true,
  });
  const headingMap = new Map((await prisma.heading.findMany({ select: { id: true, code: true } })).map(h => [h.code, h.id]));
  console.log(`📑 Partidas: ${headingMap.size}`);

  // 4) Subpartidas (subheadings)
  const subheadings = [...new Set(fractions.map(f => f.subheading))];
  await prisma.subheading.createMany({
    data: subheadings
      .map(sh => ({ code: sh, description: `Subpartida ${sh}`, headingId: headingMap.get(sh.slice(0, 4))! }))
      .filter(sh => sh.headingId),
    skipDuplicates: true,
  });
  const subheadingMap = new Map((await prisma.subheading.findMany({ select: { id: true, code: true } })).map(sh => [sh.code, sh.id]));
  console.log(`📋 Subpartidas: ${subheadingMap.size}`);

  // 5) Fracciones (createMany por lotes, skipDuplicates -> NO toca existentes)
  const rows = fractions
    .map(f => {
      const subheadingId = subheadingMap.get(f.subheading);
      if (!subheadingId) return null;
      return {
        code: f.code,
        codeFormatted: f.codeFormatted,
        description: f.description,
        nico: f.nico ?? undefined,
        unit: f.unit ?? undefined,
        keywords: f.keywords,
        tariffNMF: f.tariffNMF ?? undefined,
        requiresPermit: f.requiresPermit,
        permitType: f.permitType ?? undefined,
        noms: f.noms ? ['Sujeta a NOM — ver Acuerdo de NOMs (DOF)'] : [],
        sectoralRegistry: f.sectoralRegistry,
        subheadingId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`🏷️  Insertando fracciones (${rows.length}) por lotes...`);
  let inserted = 0;
  for (const batch of chunk(rows, 1000)) {
    const res = await prisma.fraction.createMany({ data: batch, skipDuplicates: true });
    inserted += res.count;
    console.log(`   ... +${res.count} (acumulado nuevas: ${inserted})`);
  }

  const counts = {
    sections: await prisma.section.count(),
    chapters: await prisma.chapter.count(),
    headings: await prisma.heading.count(),
    subheadings: await prisma.subheading.count(),
    fractions: await prisma.fraction.count(),
    fractionsActive: await prisma.fraction.count({ where: { active: true } }),
  };
  console.log('\n📊 Resumen:');
  console.log(`   Secciones:        ${counts.sections}`);
  console.log(`   Capítulos:        ${counts.chapters}`);
  console.log(`   Partidas:         ${counts.headings}`);
  console.log(`   Subpartidas:      ${counts.subheadings}`);
  console.log(`   Fracciones:       ${counts.fractions} (activas: ${counts.fractionsActive})`);
  console.log(`   Nuevas insertadas: ${inserted}`);
  console.log('\n🚀 Seed LIGIE 2026 completo!');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
