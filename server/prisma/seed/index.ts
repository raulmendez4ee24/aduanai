import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { SECTIONS, CHAPTERS, FRACTIONS } from './tigie-data';
import { KNOWLEDGE_BASE } from './knowledge-base';
import { seedDemoFixtures, loadDemoIntoTenant, clearDemoFromTenant, DEMO_TENANT_ID } from '../../src/services/demo-loader';
import { seedRegulations } from './regulations';
import { seedSyntheticHistory } from '../../src/services/exchange-rate';

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

  // 4. Crear usuario demo (Maquiladora Ejemplo SA de CV)
  console.log('👤 Creando tenant demo + usuario...');
  const bcrypt = await import('bcryptjs');
  const hashedPassword = await bcrypt.hash('demo1234', 12);

  await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: { name: 'Maquiladora Ejemplo SA de CV', rfc: 'MEJ010203AB1' },
    create: {
      id: DEMO_TENANT_ID,
      name: 'Maquiladora Ejemplo SA de CV',
      plan: 'PROFESSIONAL',
      rfc: 'MEJ010203AB1',
      users: {
        create: {
          email: 'demo@aduanai.mx',
          password: hashedPassword,
          name: 'Usuario Demo',
          role: 'ADMIN',
          status: 'VERIFIED',
          emailVerified: true,
        },
      },
    },
  });
  // Garantizar credenciales conocidas si el usuario ya existía
  await prisma.user.updateMany({
    where: { email: 'demo@aduanai.mx' },
    data: { password: hashedPassword, status: 'VERIFIED', emailVerified: true, active: true },
  });
  console.log('   ✅ Tenant demo: Maquiladora Ejemplo SA de CV');
  console.log('   ✅ Login: demo@aduanai.mx / demo1234\n');

  // 4.b Sembrar fixtures de demo en tabla DemoData
  console.log('📦 Sembrando DemoData fixtures...');
  await seedDemoFixtures(prisma);
  console.log('   ✅ Fixtures registrados (13 categorías)\n');

  // 4.b.2 Cuotas compensatorias + regulaciones (NOMs / padrones)
  console.log('⚖️  Sembrando cuotas compensatorias y regulaciones...');
  const regs = await seedRegulations(prisma);
  console.log(`   ✅ ${regs.antidumping} cuotas compensatorias, ${regs.regulations} regulaciones\n`);

  // 4.b.3 Histórico sintético de TC (90 días) para selector "TC histórico"
  console.log('💱 Sembrando histórico de tipo de cambio (90 días)...');
  const tcCount = await seedSyntheticHistory(90);
  console.log(`   ✅ ${tcCount} días de TC en cache\n`);

  // 4.c Cargar dataset al tenant demo (idempotente: limpia y recarga)
  console.log('🚚 Materializando dataset en tenant demo...');
  const demoUser = await prisma.user.findFirst({
    where: { tenantId: DEMO_TENANT_ID, role: 'ADMIN' },
  });
  if (demoUser) {
    await clearDemoFromTenant(prisma, DEMO_TENANT_ID);
    const loaded = await loadDemoIntoTenant(prisma, DEMO_TENANT_ID, demoUser.id, { replaceExisting: false });
    console.log(`   ✅ ${loaded.imports} imports, ${loaded.discharges} descargos, ${loaded.taxCredits} créditos,`);
    console.log(`      ${loaded.guarantees} garantías, ${loaded.classifications} clasificaciones, ${loaded.quotes} quotes,`);
    console.log(`      ${loaded.operations} expedientes, ${loaded.mves} MVE, ${loaded.coves} COVE, ${loaded.loadPlans} planes carga, ${loaded.alerts} alertas\n`);
  } else {
    console.warn('   ⚠️  No se encontró usuario admin del tenant demo\n');
  }

  // 5. Base de conocimiento
  console.log(`📚 Sembrando ${KNOWLEDGE_BASE.length} registros de conocimiento...`);
  const existingKnowledgeCount = await prisma.classificationKnowledge.count();
  if (existingKnowledgeCount === 0) {
    for (const k of KNOWLEDGE_BASE) {
      await prisma.classificationKnowledge.create({
        data: {
          type: k.type,
          fractionCode: k.fractionCode,
          chapterCode: k.chapterCode,
          sectionCode: k.sectionCode,
          title: k.title,
          content: k.content,
          source: k.source,
          keywords: k.keywords,
          products: k.products,
          priority: k.priority ?? 5,
          verified: true,
          verifiedBy: 'seed',
        },
      });
    }
    console.log(`   ✅ ${KNOWLEDGE_BASE.length} registros sembrados\n`);
  } else {
    console.log(`   ⏭️  Saltado (ya existen ${existingKnowledgeCount})\n`);
  }

  // Resumen
  const counts = {
    sections: await prisma.section.count(),
    chapters: await prisma.chapter.count(),
    headings: await prisma.heading.count(),
    subheadings: await prisma.subheading.count(),
    fractions: await prisma.fraction.count(),
    knowledge: await prisma.classificationKnowledge.count(),
    users: await prisma.user.count(),
  };

  console.log('📊 Resumen de la base de datos:');
  console.log(`   Secciones:    ${counts.sections}`);
  console.log(`   Capítulos:    ${counts.chapters}`);
  console.log(`   Partidas:     ${counts.headings}`);
  console.log(`   Subpartidas:  ${counts.subheadings}`);
  console.log(`   Fracciones:   ${counts.fractions}`);
  console.log(`   Conocimiento: ${counts.knowledge}`);
  console.log(`   Usuarios:     ${counts.users}`);
  console.log('\n🚀 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
