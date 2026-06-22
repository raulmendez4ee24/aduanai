// Seeder del catálogo TIGIE completo (LIGIE 2026)
// Fuente: server/prisma/seed/data/ligie-fractions-2026.json
//   generado desde data/BASEUNICA-LIGIE_20260330-20260330.xlsb (DOF 2026-03-30)
//
// Construye la jerarquía Section -> Chapter -> Heading -> Subheading -> Fraction
// con aranceles IGI oficiales. Idempotente: usa upsert, NO borra datos.
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

async function main() {
  console.log('🌱 ADUANAI — Seed catálogo TIGIE completo (LIGIE 2026)\n');

  const dataPath = path.join(__dirname, 'data', 'ligie-fractions-2026.json');
  const { meta, fractions } = JSON.parse(readFileSync(dataPath, 'utf-8')) as {
    meta: { version: string; count: number };
    fractions: LigieFraction[];
  };
  console.log(`📄 ${dataPath}`);
  console.log(`   Versión: ${meta.version} — ${fractions.length} fracciones\n`);

  // 1) Secciones
  console.log('📦 Secciones...');
  const sectionMap = new Map<string, string>();
  for (const s of SECTIONS) {
    const created = await prisma.section.upsert({
      where: { number: s.number },
      update: { title: s.title },
      create: { number: s.number, title: s.title },
    });
    sectionMap.set(s.number, created.id);
  }
  console.log(`   ✅ ${sectionMap.size}\n`);

  // 2) Capítulos (sólo los presentes en los datos)
  const chapters = [...new Set(fractions.map(f => f.chapter))].sort();
  console.log(`📖 Capítulos (${chapters.length})...`);
  const chapterMap = new Map<string, string>();
  for (const ch of chapters) {
    const sectionId = sectionMap.get(getSectionForChapter(ch));
    if (!sectionId) continue;
    const c = await prisma.chapter.upsert({
      where: { number: ch },
      update: { title: CHAPTER_NAMES[ch] || `Capítulo ${ch}`, sectionId },
      create: { number: ch, title: CHAPTER_NAMES[ch] || `Capítulo ${ch}`, sectionId },
    });
    chapterMap.set(ch, c.id);
  }
  console.log(`   ✅ ${chapterMap.size}\n`);

  // 3) Partidas, subpartidas y fracciones
  console.log(`🏷️  Fracciones (${fractions.length})...`);
  const headingMap = new Map<string, string>();
  const subheadingMap = new Map<string, string>();
  let created = 0, errors = 0;

  for (const f of fractions) {
    try {
      const chapterId = chapterMap.get(f.chapter);
      if (!chapterId) { errors++; continue; }

      let headingId = headingMap.get(f.heading);
      if (!headingId) {
        const h = await prisma.heading.upsert({
          where: { code: f.heading },
          update: {},
          create: { code: f.heading, description: `Partida ${f.heading}`, chapterId },
        });
        headingId = h.id;
        headingMap.set(f.heading, headingId);
      }

      let subheadingId = subheadingMap.get(f.subheading);
      if (!subheadingId) {
        const sh = await prisma.subheading.upsert({
          where: { code: f.subheading },
          update: {},
          create: { code: f.subheading, description: `Subpartida ${f.subheading}`, headingId },
        });
        subheadingId = sh.id;
        subheadingMap.set(f.subheading, subheadingId);
      }

      const noms = f.noms ? ['Sujeta a NOM — ver Acuerdo de NOMs (DOF)'] : [];
      // updateData: campos autoritativos del LIGIE. NO incluye noms/keywords/iepsRate
      // para preservar los datos curados de las fracciones que ya existen.
      const updateData = {
        codeFormatted: f.codeFormatted,
        description: f.description,
        nico: f.nico ?? undefined,
        unit: f.unit ?? undefined,
        tariffNMF: f.tariffNMF ?? undefined,
        requiresPermit: f.requiresPermit,
        permitType: f.permitType ?? undefined,
        sectoralRegistry: f.sectoralRegistry,
        subheadingId,
      };
      await prisma.fraction.upsert({
        where: { code: f.code },
        update: updateData, // preserva noms/keywords/iepsRate curados en existentes
        create: { code: f.code, ...updateData, keywords: f.keywords, noms },
      });
      created++;
      if (created % 1000 === 0) console.log(`   ... ${created}`);
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`   ⚠️  ${f.code}:`, (e as Error).message);
    }
  }
  console.log(`   ✅ ${created} fracciones (${errors} errores)\n`);

  const counts = {
    sections: await prisma.section.count(),
    chapters: await prisma.chapter.count(),
    headings: await prisma.heading.count(),
    subheadings: await prisma.subheading.count(),
    fractions: await prisma.fraction.count(),
  };
  console.log('📊 Resumen:');
  console.log(`   Secciones:   ${counts.sections}`);
  console.log(`   Capítulos:   ${counts.chapters}`);
  console.log(`   Partidas:    ${counts.headings}`);
  console.log(`   Subpartidas: ${counts.subheadings}`);
  console.log(`   Fracciones:  ${counts.fractions}`);
  console.log('\n🚀 Seed LIGIE 2026 completo!');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
