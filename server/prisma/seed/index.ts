import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { SECTIONS, CHAPTERS, FRACTIONS } from './tigie-data';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding ADUANAI database...\n');

  // 1. Secciones
  console.log(`📦 Creando ${SECTIONS.length} secciones...`);
  const sectionMap = new Map<string, string>();
  for (const section of SECTIONS) {
    const created = await prisma.section.upsert({
      where: { number: section.number },
      update: { title: section.title },
      create: { number: section.number, title: section.title },
    });
    sectionMap.set(section.number, created.id);
  }
  console.log(`   ✅ ${SECTIONS.length} secciones creadas\n`);

  // 2. Capítulos
  console.log(`📖 Creando ${CHAPTERS.length} capítulos...`);
  const chapterMap = new Map<string, string>();
  for (const chapter of CHAPTERS) {
    const sectionId = sectionMap.get(chapter.sectionNumber);
    if (!sectionId) {
      console.warn(`   ⚠️  Sección ${chapter.sectionNumber} no encontrada para capítulo ${chapter.number}`);
      continue;
    }
    const created = await prisma.chapter.upsert({
      where: { number: chapter.number },
      update: { title: chapter.title, legalNotes: chapter.legalNotes },
      create: {
        number: chapter.number,
        title: chapter.title,
        legalNotes: chapter.legalNotes,
        sectionId,
      },
    });
    chapterMap.set(chapter.number, created.id);
  }
  console.log(`   ✅ ${CHAPTERS.length} capítulos creados\n`);

  // 3. Headings, Subheadings y Fracciones
  console.log(`🏷️  Creando ${FRACTIONS.length} fracciones arancelarias...`);
  const headingMap = new Map<string, string>();
  const subheadingMap = new Map<string, string>();
  let created = 0;

  for (const frac of FRACTIONS) {
    const chapterId = chapterMap.get(frac.chapter);
    if (!chapterId) {
      console.warn(`   ⚠️  Capítulo ${frac.chapter} no encontrado para fracción ${frac.formatted}`);
      continue;
    }

    // Crear/obtener heading
    let headingId = headingMap.get(frac.heading);
    if (!headingId) {
      const heading = await prisma.heading.upsert({
        where: { code: frac.heading },
        update: {},
        create: {
          code: frac.heading,
          description: `Partida ${frac.heading}`,
          chapterId,
        },
      });
      headingId = heading.id;
      headingMap.set(frac.heading, headingId);
    }

    // Crear/obtener subheading
    let subheadingId = subheadingMap.get(frac.subheading);
    if (!subheadingId) {
      const subheading = await prisma.subheading.upsert({
        where: { code: frac.subheading },
        update: {},
        create: {
          code: frac.subheading,
          description: `Subpartida ${frac.subheading}`,
          headingId,
        },
      });
      subheadingId = subheading.id;
      subheadingMap.set(frac.subheading, subheadingId);
    }

    // Crear fracción
    await prisma.fraction.upsert({
      where: { code: frac.code },
      update: {
        description: frac.description,
        codeFormatted: frac.formatted,
        unit: frac.unit,
        tariffNMF: frac.tariffNMF,
        tariffTMEC: frac.tariffTMEC ?? null,
        keywords: frac.keywords ?? [],
        noms: frac.noms ?? [],
        requiresPermit: frac.requiresPermit ?? false,
        permitType: frac.permitType ?? null,
        sectoralRegistry: frac.sectoralRegistry ?? false,
        sectoralType: frac.sectoralType ?? null,
        iepsRate: frac.iepsRate ?? null,
      },
      create: {
        code: frac.code,
        codeFormatted: frac.formatted,
        description: frac.description,
        unit: frac.unit,
        tariffNMF: frac.tariffNMF,
        tariffTMEC: frac.tariffTMEC ?? null,
        keywords: frac.keywords ?? [],
        noms: frac.noms ?? [],
        requiresPermit: frac.requiresPermit ?? false,
        permitType: frac.permitType ?? null,
        sectoralRegistry: frac.sectoralRegistry ?? false,
        sectoralType: frac.sectoralType ?? null,
        iepsRate: frac.iepsRate ?? null,
        subheadingId,
      },
    });
    created++;
  }
  console.log(`   ✅ ${created} fracciones creadas\n`);

  // 4. Crear usuario demo
  console.log('👤 Creando usuario demo...');
  const bcrypt = await import('bcryptjs');
  const hashedPassword = await bcrypt.hash('demo1234', 12);

  await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: {
      id: 'demo-tenant',
      name: 'Empresa Demo',
      plan: 'STARTER',
      users: {
        create: {
          email: 'demo@aduanai.mx',
          password: hashedPassword,
          name: 'Usuario Demo',
          role: 'ADMIN',
        },
      },
    },
  });
  console.log('   ✅ Usuario demo creado: demo@aduanai.mx / demo1234\n');

  // Resumen
  const counts = {
    sections: await prisma.section.count(),
    chapters: await prisma.chapter.count(),
    headings: await prisma.heading.count(),
    subheadings: await prisma.subheading.count(),
    fractions: await prisma.fraction.count(),
    users: await prisma.user.count(),
  };

  console.log('📊 Resumen de la base de datos:');
  console.log(`   Secciones:    ${counts.sections}`);
  console.log(`   Capítulos:    ${counts.chapters}`);
  console.log(`   Partidas:     ${counts.headings}`);
  console.log(`   Subpartidas:  ${counts.subheadings}`);
  console.log(`   Fracciones:   ${counts.fractions}`);
  console.log(`   Usuarios:     ${counts.users}`);
  console.log('\n🚀 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
