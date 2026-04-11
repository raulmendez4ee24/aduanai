import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { generateDemoAlerts } from '../../src/services/dof-alerts';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Secciones del Sistema Armonizado
const SECTIONS = [
  { number: 'I', title: 'Animales vivos y productos del reino animal', chapters: ['01','02','03','04','05'] },
  { number: 'II', title: 'Productos del reino vegetal', chapters: ['06','07','08','09','10','11','12','13','14'] },
  { number: 'III', title: 'Grasas y aceites animales o vegetales', chapters: ['15'] },
  { number: 'IV', title: 'Productos de las industrias alimentarias; bebidas, líquidos alcohólicos y vinagre; tabaco', chapters: ['16','17','18','19','20','21','22','23','24'] },
  { number: 'V', title: 'Productos minerales', chapters: ['25','26','27'] },
  { number: 'VI', title: 'Productos de las industrias químicas o de las industrias conexas', chapters: ['28','29','30','31','32','33','34','35','36','37','38'] },
  { number: 'VII', title: 'Plástico y sus manufacturas; caucho y sus manufacturas', chapters: ['39','40'] },
  { number: 'VIII', title: 'Pieles, cueros, peletería y manufacturas', chapters: ['41','42','43'] },
  { number: 'IX', title: 'Madera, carbón vegetal y manufacturas de madera; corcho; espartería', chapters: ['44','45','46'] },
  { number: 'X', title: 'Pasta de madera, papel o cartón y sus aplicaciones', chapters: ['47','48','49'] },
  { number: 'XI', title: 'Materias textiles y sus manufacturas', chapters: ['50','51','52','53','54','55','56','57','58','59','60','61','62','63'] },
  { number: 'XII', title: 'Calzado, sombreros y demás tocados, paraguas, plumas preparadas, flores artificiales', chapters: ['64','65','66','67'] },
  { number: 'XIII', title: 'Manufacturas de piedra, yeso, cemento, cerámica, vidrio', chapters: ['68','69','70'] },
  { number: 'XIV', title: 'Perlas, piedras preciosas, metales preciosos, bisutería, monedas', chapters: ['71'] },
  { number: 'XV', title: 'Metales comunes y manufacturas de estos metales', chapters: ['72','73','74','75','76','78','79','80','81','82','83'] },
  { number: 'XVI', title: 'Máquinas y aparatos, material eléctrico y sus partes', chapters: ['84','85'] },
  { number: 'XVII', title: 'Material de transporte', chapters: ['86','87','88','89'] },
  { number: 'XVIII', title: 'Instrumentos y aparatos de óptica, fotografía, medida, control, médicos; relojería; instrumentos musicales', chapters: ['90','91','92'] },
  { number: 'XIX', title: 'Armas, municiones, y sus partes y accesorios', chapters: ['93'] },
  { number: 'XX', title: 'Mercancías y productos diversos', chapters: ['94','95','96'] },
  { number: 'XXI', title: 'Objetos de arte o colección y antigüedades', chapters: ['97'] },
  { number: 'XXII', title: 'Operaciones especiales', chapters: ['98'] },
];

// Importar todas las fuentes de fracciones
async function loadAllFractions() {
  const allFractions: FractionData[] = [];

  // Cargar desde el seed original
  try {
    const { FRACTIONS: original } = await import('./tigie-data');
    allFractions.push(...original);
    console.log(`   📄 tigie-data.ts: ${original.length} fracciones`);
  } catch (e) {
    console.warn('   ⚠️  tigie-data.ts no encontrado');
  }

  // Cargar desde archivos de capítulos
  const chapterFiles = [
    'cap_84_85',
    'cap_61_62_64_87',
    'cap_28_29_30_39_72_73_76',
    'cap_01_24',
    'cap_25_60',
    'cap_63_98',
  ];

  for (const file of chapterFiles) {
    try {
      const mod = await import(`./chapters/${file}`);
      const fracs = mod.FRACTIONS || mod.default || [];
      allFractions.push(...fracs);
      console.log(`   📄 ${file}.ts: ${fracs.length} fracciones`);
    } catch {
      console.warn(`   ⚠️  ${file}.ts no encontrado o con errores`);
    }
  }

  // Deduplicar por código
  const seen = new Set<string>();
  const unique = allFractions.filter(f => {
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });

  console.log(`\n   📊 Total: ${allFractions.length} fracciones cargadas, ${unique.length} únicas\n`);
  return unique;
}

interface FractionData {
  code: string;
  formatted: string;
  description: string;
  chapter: string;
  heading: string;
  subheading: string;
  unit?: string;
  tariffNMF: number;
  tariffTMEC?: number;
  keywords?: string[];
  noms?: string[];
  iepsRate?: number;
  requiresPermit?: boolean;
  permitType?: string;
  sectoralRegistry?: boolean;
  sectoralType?: string;
}

function getSectionForChapter(chapter: string): string {
  for (const s of SECTIONS) {
    if (s.chapters.includes(chapter)) return s.number;
  }
  return 'XXII';
}

// Nombres de capítulos
const CHAPTER_NAMES: Record<string, string> = {
  '01': 'Animales vivos', '02': 'Carne y despojos comestibles', '03': 'Pescados y crustáceos',
  '04': 'Leche y productos lácteos; huevos; miel natural', '05': 'Los demás productos de origen animal',
  '06': 'Plantas vivas y productos de la floricultura', '07': 'Hortalizas, plantas, raíces y tubérculos alimenticios',
  '08': 'Frutas y frutos comestibles', '09': 'Café, té, yerba mate y especias', '10': 'Cereales',
  '11': 'Productos de la molinería; malta; almidón; gluten de trigo', '12': 'Semillas y frutos oleaginosos',
  '13': 'Gomas, resinas y demás jugos y extractos vegetales', '14': 'Materias trenzables',
  '15': 'Grasas y aceites animales o vegetales', '16': 'Preparaciones de carne, pescado',
  '17': 'Azúcares y artículos de confitería', '18': 'Cacao y sus preparaciones',
  '19': 'Preparaciones a base de cereales, harina, almidón o leche; pastelería',
  '20': 'Preparaciones de hortalizas, frutas u otros frutos', '21': 'Preparaciones alimenticias diversas',
  '22': 'Bebidas, líquidos alcohólicos y vinagre', '23': 'Residuos de industrias alimentarias; alimentos para animales',
  '24': 'Tabaco y sucedáneos del tabaco elaborados', '25': 'Sal; azufre; tierras y piedras; yesos, cales y cementos',
  '26': 'Minerales metalíferos, escorias y cenizas', '27': 'Combustibles minerales, aceites minerales',
  '28': 'Productos químicos inorgánicos', '29': 'Productos químicos orgánicos', '30': 'Productos farmacéuticos',
  '31': 'Abonos', '32': 'Extractos curtientes o tintóreos; taninos; pigmentos; pinturas y barnices',
  '33': 'Aceites esenciales y resinoides; preparaciones de perfumería, tocador o cosmética',
  '34': 'Jabón; agentes de superficie orgánicos; preparaciones para lavar; velas',
  '35': 'Materias albuminoideas; productos a base de almidón o fécula modificados; colas; enzimas',
  '36': 'Pólvoras y explosivos; artículos de pirotecnia; fósforos; aleaciones pirofóricas',
  '37': 'Productos fotográficos o cinematográficos', '38': 'Productos diversos de las industrias químicas',
  '39': 'Plástico y sus manufacturas', '40': 'Caucho y sus manufacturas',
  '41': 'Pieles (excepto la peletería) y cueros', '42': 'Manufacturas de cuero; artículos de viaje',
  '43': 'Peletería y confecciones de peletería; peletería facticia',
  '44': 'Madera, carbón vegetal y manufacturas de madera', '45': 'Corcho y sus manufacturas',
  '46': 'Manufacturas de espartería o cestería', '47': 'Pasta de madera o de las demás materias fibrosas celulósicas',
  '48': 'Papel y cartón; manufacturas de pasta de celulosa, de papel o cartón',
  '49': 'Productos editoriales, de la prensa; textos manuscritos o mecanografiados',
  '50': 'Seda', '51': 'Lana y pelo fino u ordinario', '52': 'Algodón',
  '53': 'Las demás fibras textiles vegetales', '54': 'Filamentos sintéticos o artificiales',
  '55': 'Fibras sintéticas o artificiales discontinuas', '56': 'Guata, fieltro y tela sin tejer',
  '57': 'Alfombras y demás revestimientos para el suelo', '58': 'Tejidos especiales; superficies textiles con mechón',
  '59': 'Telas impregnadas, recubiertas, revestidas o estratificadas', '60': 'Tejidos de punto',
  '61': 'Prendas y complementos de vestir, de punto', '62': 'Prendas y complementos de vestir, excepto los de punto',
  '63': 'Los demás artículos textiles confeccionados', '64': 'Calzado, polainas y artículos análogos',
  '65': 'Sombreros, demás tocados y sus partes', '66': 'Paraguas, sombrillas, quitasoles, bastones',
  '67': 'Plumas y plumón preparados; flores artificiales', '68': 'Manufacturas de piedra, yeso, cemento',
  '69': 'Productos cerámicos', '70': 'Vidrio y sus manufacturas',
  '71': 'Perlas finas o cultivadas, piedras preciosas, metales preciosos, bisutería, monedas',
  '72': 'Fundición, hierro y acero', '73': 'Manufacturas de fundición, hierro o acero',
  '74': 'Cobre y sus manufacturas', '75': 'Níquel y sus manufacturas', '76': 'Aluminio y sus manufacturas',
  '78': 'Plomo y sus manufacturas', '79': 'Cinc y sus manufacturas', '80': 'Estaño y sus manufacturas',
  '81': 'Los demás metales comunes; cermets', '82': 'Herramientas y útiles, artículos de cuchillería',
  '83': 'Manufacturas diversas de metal común', '84': 'Reactores nucleares, calderas, máquinas y aparatos mecánicos',
  '85': 'Máquinas, aparatos y material eléctrico; aparatos de grabación o reproducción',
  '86': 'Vehículos y material para vías férreas', '87': 'Vehículos automóviles, tractores, velocípedos',
  '88': 'Aeronaves, vehículos espaciales', '89': 'Barcos y demás artefactos flotantes',
  '90': 'Instrumentos y aparatos de óptica, fotografía, medida, control, médicos',
  '91': 'Aparatos de relojería y sus partes', '92': 'Instrumentos musicales',
  '93': 'Armas, municiones, y sus partes y accesorios',
  '94': 'Muebles; mobiliario medicoquirúrgico; artículos de cama; aparatos de alumbrado; construcciones prefabricadas',
  '95': 'Juguetes, juegos y artículos para recreo o deporte', '96': 'Manufacturas diversas',
  '97': 'Objetos de arte o colección y antigüedades', '98': 'Operaciones especiales',
};

async function main() {
  console.log('🌱 ADUANAI — Seed completo de la TIGIE 2026\n');

  // 1. Limpiar DB
  console.log('🧹 Limpiando base de datos...');
  await prisma.document.deleteMany();
  await prisma.operation.deleteMany();
  await prisma.classification.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.copilotMessage.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.fraction.deleteMany();
  await prisma.subheading.deleteMany();
  await prisma.heading.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.section.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  console.log('   ✅ DB limpia\n');

  // 2. Secciones
  console.log('📦 Creando secciones...');
  const sectionMap = new Map<string, string>();
  for (const s of SECTIONS) {
    const created = await prisma.section.create({
      data: { number: s.number, title: s.title },
    });
    sectionMap.set(s.number, created.id);
  }
  console.log(`   ✅ ${SECTIONS.length} secciones\n`);

  // 3. Cargar fracciones
  console.log('📄 Cargando archivos de fracciones...');
  const fractions = await loadAllFractions();

  // 4. Crear capítulos, partidas, subpartidas y fracciones
  const chapterMap = new Map<string, string>();
  const headingMap = new Map<string, string>();
  const subheadingMap = new Map<string, string>();
  let created = 0;
  let errors = 0;

  // Extraer capítulos únicos
  const uniqueChapters = [...new Set(fractions.map(f => f.chapter))].sort();
  console.log(`\n📖 Creando ${uniqueChapters.length} capítulos...`);
  for (const ch of uniqueChapters) {
    const sectionNumber = getSectionForChapter(ch);
    const sectionId = sectionMap.get(sectionNumber);
    if (!sectionId) continue;

    const chap = await prisma.chapter.create({
      data: {
        number: ch,
        title: CHAPTER_NAMES[ch] || `Capítulo ${ch}`,
        sectionId,
      },
    });
    chapterMap.set(ch, chap.id);
  }
  console.log(`   ✅ ${uniqueChapters.length} capítulos\n`);

  console.log(`🏷️  Creando ${fractions.length} fracciones...`);
  for (const frac of fractions) {
    try {
      const chapterId = chapterMap.get(frac.chapter);
      if (!chapterId) continue;

      // Heading
      let headingId = headingMap.get(frac.heading);
      if (!headingId) {
        const h = await prisma.heading.create({
          data: { code: frac.heading, description: `Partida ${frac.heading}`, chapterId },
        });
        headingId = h.id;
        headingMap.set(frac.heading, headingId);
      }

      // Subheading
      let subheadingId = subheadingMap.get(frac.subheading);
      if (!subheadingId) {
        const sh = await prisma.subheading.create({
          data: { code: frac.subheading, description: `Subpartida ${frac.subheading}`, headingId },
        });
        subheadingId = sh.id;
        subheadingMap.set(frac.subheading, subheadingId);
      }

      // Fraction
      await prisma.fraction.create({
        data: {
          code: frac.code,
          codeFormatted: frac.formatted,
          description: frac.description,
          unit: frac.unit || 'Kg',
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

      if (created % 500 === 0) {
        console.log(`   ... ${created} fracciones creadas`);
      }
    } catch (e) {
      errors++;
    }
  }
  console.log(`   ✅ ${created} fracciones creadas (${errors} errores)\n`);

  // 5. Usuario demo
  console.log('👤 Creando usuario demo...');
  const hashedPassword = await bcrypt.hash('demo1234', 12);
  await prisma.tenant.create({
    data: {
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
  console.log('   ✅ demo@aduanai.mx / demo1234\n');

  // 6. Alertas demo
  console.log('📢 Generando alertas demo...');
  await generateDemoAlerts(prisma, 'demo-tenant');
  console.log('   ✅ Alertas creadas\n');

  // Resumen
  const counts = {
    sections: await prisma.section.count(),
    chapters: await prisma.chapter.count(),
    headings: await prisma.heading.count(),
    subheadings: await prisma.subheading.count(),
    fractions: await prisma.fraction.count(),
  };

  console.log('📊 Resumen final:');
  console.log(`   Secciones:    ${counts.sections}`);
  console.log(`   Capítulos:    ${counts.chapters}`);
  console.log(`   Partidas:     ${counts.headings}`);
  console.log(`   Subpartidas:  ${counts.subheadings}`);
  console.log(`   Fracciones:   ${counts.fractions}`);
  console.log(`\n🚀 Seed completo!`);
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
