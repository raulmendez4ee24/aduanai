import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { SECTIONS, CHAPTERS, FRACTIONS } from './tigie-data';
import { KNOWLEDGE_BASE } from './knowledge-base';
import { seedDemoFixtures, loadDemoIntoTenant, clearDemoFromTenant, DEMO_TENANT_ID } from '../../src/services/demo-loader';
import { seedRegulations } from './regulations';
import { seedEstimatedPrices } from './estimated-prices';
import { seedOriginRules } from './origin-rules';
import { seedNOMExceptions } from './nom-exceptions';
import { seedUseCaseKnowledge } from './knowledge-use-cases';
import { seedVersionSnapshots } from './version-snapshots';
import { seedLegalPrecedents } from './legal-precedents';
import { seedProfessionalRegistry } from './professional-registry';
import { seedDemoProfiles } from './demo-profiles';
import { seedLegalDocuments } from './legal-documents';
import { seedAntidumpingUPCI } from './antidumping-upci';
import { seedRegimesPrograms } from './regimes-programs';
import { seedSATPadrones } from './sat-padrones';
import { seedGlosaRiskRules } from './glosa-risk-rules';
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

  // 4.b.4 Precios estimados SAT (Art. 84-A LA)
  console.log('💵 Sembrando precios estimados SAT...');
  const ep = await seedEstimatedPrices(prisma);
  console.log(`   ✅ ${ep.inserted} precios estimados (DOF + referencia interna)\n`);

  // 4.b.5 Reglas de origen TMEC / TLCUEM / CPTPP
  console.log('🌎 Sembrando reglas de origen...');
  const orig = await seedOriginRules(prisma);
  console.log(`   ✅ ${orig.inserted} reglas de origen\n`);

  // 4.b.6 Excepciones del Anexo 2.4.1 de NOMs
  console.log('📋 Sembrando excepciones Anexo 2.4.1 NOMs...');
  const noms = await seedNOMExceptions(prisma);
  console.log(`   ✅ ${noms.inserted} excepciones de NOMs\n`);

  // 4.b.7 Conocimiento — casos de reclasificación por uso destinado
  console.log('🎯 Sembrando casos de reclasificación por uso (cap 73→87, 39→87, etc.)...');
  const useCases = await seedUseCaseKnowledge(prisma);
  console.log(`   ✅ ${useCases.inserted} casos nuevos (${useCases.skipped} ya existían)\n`);

  // 4.b.8 Snapshots de versiones normativas (TIGIE, LIGIE, RGCE, TMEC)
  console.log('📌 Sembrando snapshots de versiones normativas...');
  const versions = await seedVersionSnapshots(prisma);
  console.log(`   ✅ ${versions.inserted} versiones registradas\n`);

  // 4.b.9 Precedentes legales — TFJA, SCJN, criterios SAT, OMA, UPCI
  console.log('⚖️  Sembrando precedentes legales y criterios...');
  const precedents = await seedLegalPrecedents(prisma);
  console.log(`   ✅ ${precedents.inserted} precedentes nuevos (${precedents.skipped} ya existían)\n`);

  // 4.b.10 Registro de profesionales — patentes CAAAREM placeholder
  console.log('🪪  Sembrando registro de profesionales aduanales...');
  const reg = await seedProfessionalRegistry(prisma);
  console.log(`   ✅ ${reg.inserted + reg.updated} patentes en registro\n`);

  // 4.b.11 Perfiles demo segmentados por sector
  console.log('🎯 Sembrando perfiles demo por sector industrial...');
  const profiles = await seedDemoProfiles(prisma);
  console.log(`   ✅ ${profiles.inserted + profiles.updated} perfiles (${profiles.inserted} nuevos)\n`);

  // 4.b.12 Documentos legales para RAG del Copilot
  console.log('📚 Sembrando documentos legales (RAG Copilot)...');
  const legal = await seedLegalDocuments(prisma);
  console.log(`   ✅ ${legal.inserted} documentos indexados (${legal.skipped} sin cambios)\n`);

  // 4.b.13 Resoluciones UPCI antidumping (reemplaza al seed básico de regulations)
  console.log('🚨 Sembrando resoluciones UPCI antidumping...');
  const ad = await seedAntidumpingUPCI(prisma);
  console.log(`   ✅ ${ad.inserted} resoluciones UPCI vigentes\n`);

  // 4.b.14 PROSEC / Regla 8va / IEPS / ISAN
  console.log('🎯 Sembrando programas y regímenes (PROSEC, Regla 8va, IEPS, ISAN)...');
  const regimes = await seedRegimesPrograms(prisma);
  console.log(`   ✅ PROSEC: ${regimes.prosec} fracciones · Regla 8va: ${regimes.regla8va} mappings · IEPS: ${regimes.ieps} tasas · ISAN: ${regimes.isan} tarifas\n`);

  // 4.b.15 Padrones SAT (Anexo 10 RGCE)
  console.log('📜 Sembrando Padrones SAT (Anexo 10 RGCE)...');
  const padrones = await seedSATPadrones(prisma);
  console.log(`   ✅ ${padrones.created} creados, ${padrones.updated} actualizados (1 general + 17 sectoriales)\n`);

  // 4.b.16 Reglas de riesgo del Simulador de Glosa
  console.log('🎯 Sembrando reglas de riesgo del Simulador de Glosa...');
  const glosaRules = await seedGlosaRiskRules(prisma);
  console.log(`   ✅ ${glosaRules.created} creadas, ${glosaRules.updated} actualizadas\n`);

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
