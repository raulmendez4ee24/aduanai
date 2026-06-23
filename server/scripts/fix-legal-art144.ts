// Migración de datos: corrige el documento legal fabricado del "Art. 144" y la
// descripción del Padrón General. Embargo precautorio = Art. 151 LA (no 144);
// multa por omisión = 130-150% (Art. 178 LA, no 70-100%).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const NEW_CONTENT =
  'RESUMEN (no es el texto literal — consulta la redacción y las fracciones exactas en el DOF): ' +
  'el Art. 151 de la Ley Aduanera establece los supuestos en que la autoridad aduanera practica el ' +
  'embargo precautorio de la mercancía, entre ellos la omisión del pago de cuotas compensatorias y la ' +
  'falta de inscripción en el Padrón de Importadores o en el Padrón Sectorial cuando éste es exigible ' +
  '(operar una fracción del Anexo 10 sin inscripción sectorial activa). El procedimiento se sustancia ' +
  'mediante PAMA. La multa por omisión de contribuciones o cuotas compensatorias es de 130-150% de lo ' +
  'omitido conforme al Art. 178 LA.';

async function main() {
  // 1) LegalDocument fabricado del Art. 144
  const docs = await prisma.legalDocument.findMany({
    where: { source: 'Ley_Aduanera', OR: [{ reference: { contains: '144' } }, { title: { contains: '144' } }, { content: { contains: 'Art. 144' } }] },
  });
  for (const d of docs) {
    await prisma.legalDocument.update({
      where: { id: d.id },
      data: {
        title: 'Ley Aduanera Art. 151 — Causales de embargo precautorio',
        reference: 'Art. 151 Ley Aduanera',
        content: NEW_CONTENT,
        keywords: ['embargo', 'Art. 151', 'Art. 178', 'PAMA', 'padrón', 'sanción', 'Anexo 10'],
      },
    });
    console.log('LegalDocument corregido:', d.id);
  }

  // 2) SATPadron general — descripción
  const gen = await prisma.sATPadron.updateMany({
    where: { type: 'general' },
    data: {
      description: 'Inscripción obligatoria para toda persona física o moral que pretenda importar mercancías al territorio nacional (Art. 59 fr. IV LA). Sin esta inscripción, el SAT puede embargar la mercancía y aplicar multa del 130-150% del valor (Art. 151 LA).',
    },
  });
  console.log('SATPadron general actualizado:', gen.count);

  // 3) Verificación
  const left144 = await prisma.legalDocument.count({ where: { content: { contains: 'Art. 144' } } });
  const left70 = await prisma.legalDocument.count({ where: { content: { contains: '70-100' } } });
  const pad70 = await prisma.sATPadron.count({ where: { description: { contains: '70-100' } } });
  console.log(`\nVerif — legalDoc con 'Art. 144': ${left144} | con '70-100': ${left70} | SATPadron '70-100': ${pad70} (esperado 0/0/0)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
