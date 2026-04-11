import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import xlsx from 'xlsx';
import bcrypt from 'bcryptjs';
import { generateDemoAlerts } from '../../src/services/dof-alerts';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://aduanai:aduanai123@localhost:5433/aduanai';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Secciones del Sistema Armonizado
const SECTIONS: { number: string; title: string; chapters: string[] }[] = [
  { number: 'I', title: 'Animales vivos y productos del reino animal', chapters: ['01','02','03','04','05'] },
  { number: 'II', title: 'Productos del reino vegetal', chapters: ['06','07','08','09','10','11','12','13','14'] },
  { number: 'III', title: 'Grasas y aceites animales o vegetales', chapters: ['15'] },
  { number: 'IV', title: 'Productos de las industrias alimentarias; bebidas; tabaco', chapters: ['16','17','18','19','20','21','22','23','24'] },
  { number: 'V', title: 'Productos minerales', chapters: ['25','26','27'] },
  { number: 'VI', title: 'Productos de las industrias químicas', chapters: ['28','29','30','31','32','33','34','35','36','37','38'] },
  { number: 'VII', title: 'Plástico y caucho y sus manufacturas', chapters: ['39','40'] },
  { number: 'VIII', title: 'Pieles, cueros y sus manufacturas', chapters: ['41','42','43'] },
  { number: 'IX', title: 'Madera, corcho y sus manufacturas', chapters: ['44','45','46'] },
  { number: 'X', title: 'Pasta de madera, papel y cartón', chapters: ['47','48','49'] },
  { number: 'XI', title: 'Materias textiles y sus manufacturas', chapters: ['50','51','52','53','54','55','56','57','58','59','60','61','62','63'] },
  { number: 'XII', title: 'Calzado, sombreros, paraguas, plumas, flores artificiales', chapters: ['64','65','66','67'] },
  { number: 'XIII', title: 'Manufacturas de piedra, cerámica, vidrio', chapters: ['68','69','70'] },
  { number: 'XIV', title: 'Perlas, piedras preciosas, metales preciosos, bisutería', chapters: ['71'] },
  { number: 'XV', title: 'Metales comunes y sus manufacturas', chapters: ['72','73','74','75','76','78','79','80','81','82','83'] },
  { number: 'XVI', title: 'Máquinas, aparatos y material eléctrico', chapters: ['84','85'] },
  { number: 'XVII', title: 'Material de transporte', chapters: ['86','87','88','89'] },
  { number: 'XVIII', title: 'Instrumentos de óptica, medida, médicos; relojería; musicales', chapters: ['90','91','92'] },
  { number: 'XIX', title: 'Armas y municiones', chapters: ['93'] },
  { number: 'XX', title: 'Mercancías y productos diversos', chapters: ['94','95','96'] },
  { number: 'XXI', title: 'Objetos de arte o colección y antigüedades', chapters: ['97'] },
  { number: 'XXII', title: 'Operaciones especiales', chapters: ['98'] },
];

const CHAPTER_NAMES: Record<string, string> = {
  '01': 'Animales vivos', '02': 'Carne y despojos comestibles', '03': 'Pescados y crustáceos',
  '04': 'Leche y productos lácteos; huevos; miel', '05': 'Los demás productos de origen animal',
  '06': 'Plantas vivas y floricultura', '07': 'Hortalizas, plantas, raíces y tubérculos',
  '08': 'Frutas y frutos comestibles', '09': 'Café, té, yerba mate y especias', '10': 'Cereales',
  '11': 'Productos de la molinería; malta; almidón', '12': 'Semillas y frutos oleaginosos',
  '13': 'Gomas, resinas y extractos vegetales', '14': 'Materias trenzables',
  '15': 'Grasas y aceites', '16': 'Preparaciones de carne, pescado',
  '17': 'Azúcares y confitería', '18': 'Cacao y sus preparaciones',
  '19': 'Preparaciones de cereales, harina, almidón; pastelería',
  '20': 'Preparaciones de hortalizas, frutas', '21': 'Preparaciones alimenticias diversas',
  '22': 'Bebidas, líquidos alcohólicos y vinagre', '23': 'Alimentos para animales',
  '24': 'Tabaco y sucedáneos', '25': 'Sal; piedras; yesos, cales y cementos',
  '26': 'Minerales metalíferos, escorias y cenizas', '27': 'Combustibles minerales, aceites minerales',
  '28': 'Productos químicos inorgánicos', '29': 'Productos químicos orgánicos',
  '30': 'Productos farmacéuticos', '31': 'Abonos', '32': 'Extractos curtientes; pinturas y barnices',
  '33': 'Aceites esenciales; perfumería, cosmética', '34': 'Jabón; preparaciones para lavar; velas',
  '35': 'Materias albuminoideas; colas; enzimas', '36': 'Pólvoras y explosivos; pirotecnia',
  '37': 'Productos fotográficos o cinematográficos', '38': 'Productos diversos de las industrias químicas',
  '39': 'Plástico y sus manufacturas', '40': 'Caucho y sus manufacturas',
  '41': 'Pieles y cueros', '42': 'Manufacturas de cuero; artículos de viaje',
  '43': 'Peletería y confecciones', '44': 'Madera y sus manufacturas',
  '45': 'Corcho y sus manufacturas', '46': 'Manufacturas de espartería o cestería',
  '47': 'Pasta de madera', '48': 'Papel y cartón', '49': 'Productos editoriales; textos',
  '50': 'Seda', '51': 'Lana y pelo fino', '52': 'Algodón',
  '53': 'Las demás fibras textiles vegetales', '54': 'Filamentos sintéticos o artificiales',
  '55': 'Fibras sintéticas discontinuas', '56': 'Guata, fieltro y tela sin tejer',
  '57': 'Alfombras', '58': 'Tejidos especiales', '59': 'Telas impregnadas',
  '60': 'Tejidos de punto', '61': 'Prendas de vestir, de punto',
  '62': 'Prendas de vestir, excepto de punto', '63': 'Artículos textiles confeccionados',
  '64': 'Calzado', '65': 'Sombreros y tocados', '66': 'Paraguas y bastones',
  '67': 'Plumas preparadas; flores artificiales', '68': 'Manufacturas de piedra, yeso, cemento',
  '69': 'Productos cerámicos', '70': 'Vidrio y sus manufacturas',
  '71': 'Perlas, piedras preciosas, metales preciosos, bisutería',
  '72': 'Fundición, hierro y acero', '73': 'Manufacturas de hierro o acero',
  '74': 'Cobre y sus manufacturas', '75': 'Níquel y sus manufacturas',
  '76': 'Aluminio y sus manufacturas', '78': 'Plomo y sus manufacturas',
  '79': 'Cinc y sus manufacturas', '80': 'Estaño y sus manufacturas',
  '81': 'Los demás metales comunes; cermets', '82': 'Herramientas y cuchillería',
  '83': 'Manufacturas diversas de metal común',
  '84': 'Máquinas, aparatos y artefactos mecánicos',
  '85': 'Máquinas, aparatos y material eléctrico',
  '86': 'Vehículos y material para vías férreas', '87': 'Vehículos automóviles, tractores',
  '88': 'Aeronaves y vehículos espaciales', '89': 'Barcos y artefactos flotantes',
  '90': 'Instrumentos de óptica, medida, médicos', '91': 'Aparatos de relojería',
  '92': 'Instrumentos musicales', '93': 'Armas, municiones',
  '94': 'Muebles; artículos de cama; iluminación; construcciones prefabricadas',
  '95': 'Juguetes, juegos y artículos para recreo o deporte', '96': 'Manufacturas diversas',
  '97': 'Objetos de arte o colección y antigüedades', '98': 'Operaciones especiales',
};

function getSectionForChapter(ch: string): string {
  for (const s of SECTIONS) {
    if (s.chapters.includes(ch)) return s.number;
  }
  return 'XXII';
}

function generateKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-záéíóúñü\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 8);
}

async function main() {
  console.log('🌱 ADUANAI — Seed desde Excel TIGIE\n');

  const excelPath = '/Users/raulaldairmendezalvarez/Downloads/kanaduana /tabla-correlacion-actualizacion-2025.xlsx';
  console.log(`📄 Leyendo ${excelPath}...`);

  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  console.log(`   ${rows.length} filas encontradas\n`);

  // Parsear fracciones
  const fractions: {
    code8: string;
    code10: string;
    formatted8: string;
    formatted10: string;
    nico: string;
    chapter: string;
    heading: string;
    subheading: string;
    description: string;
  }[] = [];

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const rawCode = String(row[0] || '').trim();
    const desc = String(row[1] || '').trim();

    if (!rawCode || !desc) continue;

    // Format: 0101.21.01.00 (10 digits) or 0301.99.01 (8 digits)
    const digits = rawCode.replace(/\./g, '');
    if (digits.length < 8 || !/^\d+$/.test(digits)) continue;

    const code8 = digits.substring(0, 8);
    const nico = digits.length >= 10 ? digits.substring(8, 10) : '00';
    const chapter = digits.substring(0, 2);
    const heading = digits.substring(0, 4);
    const subheading = digits.substring(0, 6);
    const formatted8 = `${heading}.${digits.substring(4, 6)}.${digits.substring(6, 8)}`;
    const formatted10 = rawCode;

    fractions.push({
      code8, code10: digits, formatted8, formatted10, nico,
      chapter, heading, subheading, description: desc,
    });
  }

  console.log(`   ${fractions.length} fracciones parseadas\n`);

  // Deduplicar por code8 (tomar la primera de cada fracción de 8 dígitos)
  const seen = new Set<string>();
  const unique = fractions.filter(f => {
    if (seen.has(f.code8)) return false;
    seen.add(f.code8);
    return true;
  });

  console.log(`   ${unique.length} fracciones únicas (8 dígitos)\n`);

  // Limpiar DB
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

  // Crear secciones
  console.log('📦 Creando secciones...');
  const sectionMap = new Map<string, string>();
  for (const s of SECTIONS) {
    const created = await prisma.section.create({
      data: { number: s.number, title: s.title },
    });
    sectionMap.set(s.number, created.id);
  }
  console.log(`   ✅ ${SECTIONS.length} secciones\n`);

  // Crear capítulos
  const uniqueChapters = [...new Set(unique.map(f => f.chapter))].sort();
  console.log(`📖 Creando ${uniqueChapters.length} capítulos...`);
  const chapterMap = new Map<string, string>();
  for (const ch of uniqueChapters) {
    const sectionNumber = getSectionForChapter(ch);
    const sectionId = sectionMap.get(sectionNumber);
    if (!sectionId) continue;
    const chap = await prisma.chapter.create({
      data: { number: ch, title: CHAPTER_NAMES[ch] || `Capítulo ${ch}`, sectionId },
    });
    chapterMap.set(ch, chap.id);
  }
  console.log(`   ✅ ${uniqueChapters.length} capítulos\n`);

  // Crear fracciones
  console.log(`🏷️  Creando ${unique.length} fracciones...`);
  const headingMap = new Map<string, string>();
  const subheadingMap = new Map<string, string>();
  let created = 0;
  let errors = 0;

  for (const frac of unique) {
    try {
      const chapterId = chapterMap.get(frac.chapter);
      if (!chapterId) continue;

      let headingId = headingMap.get(frac.heading);
      if (!headingId) {
        const h = await prisma.heading.create({
          data: { code: frac.heading, description: `Partida ${frac.heading}`, chapterId },
        });
        headingId = h.id;
        headingMap.set(frac.heading, headingId);
      }

      let subheadingId = subheadingMap.get(frac.subheading);
      if (!subheadingId) {
        const sh = await prisma.subheading.create({
          data: { code: frac.subheading, description: `Subpartida ${frac.subheading}`, headingId },
        });
        subheadingId = sh.id;
        subheadingMap.set(frac.subheading, subheadingId);
      }

      await prisma.fraction.create({
        data: {
          code: frac.code8,
          codeFormatted: frac.formatted8,
          nico: frac.nico,
          description: frac.description,
          unit: 'Kg',
          keywords: generateKeywords(frac.description),
          subheadingId,
        },
      });
      created++;

      if (created % 1000 === 0) {
        console.log(`   ... ${created} fracciones creadas`);
      }
    } catch {
      errors++;
    }
  }
  console.log(`   ✅ ${created} fracciones creadas (${errors} errores)\n`);

  // Usuario demo
  console.log('👤 Creando usuario demo...');
  const hashedPassword = await bcrypt.hash('demo1234', 12);
  await prisma.tenant.create({
    data: {
      id: 'demo-tenant', name: 'Empresa Demo', plan: 'STARTER',
      users: { create: { email: 'demo@aduanai.mx', password: hashedPassword, name: 'Usuario Demo', role: 'ADMIN' } },
    },
  });
  console.log('   ✅ demo@aduanai.mx / demo1234\n');

  // Alertas demo
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
