// Actualiza en producción los 2 docs del corpus que enumeraban sectores fabricados
// y los re-embeba con Voyage (1024 dim). Identifica por título.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const KEY = process.env.VOYAGE_API_KEY!;
const MODEL = process.env.EMBEDDING_MODEL || 'voyage-4';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ANEXO10_URL = 'https://www.sat.gob.mx/normatividad/EYTYE5/reglas-generales-de-comercio-exterior';

const DOCS = [
  {
    title: 'Anexo 10 RGCE — Padrones Sectoriales',
    content: 'El Anexo 10 de las RGCE (Apartado A) establece el Padrón de Importadores de Sectores Específicos: la importación de ciertas fracciones exige, además del Padrón General de Importadores, la inscripción en el padrón SECTORIAL correspondiente. El padrón general se tramita ante AGACE (trámite 5/LA) y los sectoriales según el sector aplicable; vigencia típica 12 meses con renovación. IMPORTANTE: el número de sector que corresponde a cada fracción NO debe citarse de memoria (la numeración se ha reestructurado en versiones recientes); consulta el Anexo 10 vigente en el DOF, o el módulo de Padrones de la plataforma, para el sector exacto de una fracción.',
    keywords: ['Anexo 10', 'padrón sectorial', 'sectores específicos', 'AGACE', 'inscripción', 'trámite 5/LA'],
  },
  {
    title: 'Anexo 10 — Padrones sectoriales',
    content: 'El Anexo 10 de las RGCE lista las fracciones arancelarias sujetas a inscripción en padrones sectoriales de importación (Padrón de Importadores de Sectores Específicos). La omisión de la inscripción, cuando es exigible para la fracción, configura infracción. Para identificar el sector específico que aplica a una fracción dada, consulta el Anexo 10 vigente en el DOF o el módulo de Padrones de la plataforma; la numeración oficial de sectores no debe citarse de memoria.',
    keywords: ['Anexo 10', 'padrón sectorial', 'sectores específicos', 'hierro acero', 'textil', 'inscripción'],
  },
];

async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, input: texts, input_type: 'document', output_dimension: 1024 }),
    });
    if (res.status === 429) { const w = Math.min(60000, 4000 * 2 ** attempt); console.log(`  429 backoff ${w}ms`); await sleep(w); continue; }
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }
  throw new Error('rate limit');
}

async function main() {
  const rows = [];
  for (const d of DOCS) {
    const row = await prisma.legalDocument.findFirst({ where: { source: 'Anexo_10_RGCE', title: d.title } });
    if (!row) { console.log('⚠️ no encontrado en prod:', d.title); continue; }
    rows.push({ id: row.id, reference: row.reference, ...d });
  }
  console.log(`Actualizando ${rows.length} docs...`);
  // texto a embedar = title\nreference\ncontent (convención del seed)
  const embs = await embedBatch(rows.map(r => `${r.title}\n${r.reference}\n${r.content}`));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    await prisma.legalDocument.update({
      where: { id: r.id },
      data: { content: r.content, keywords: r.keywords, officialUrl: ANEXO10_URL, embedding: embs[i]! },
    });
    console.log(`  ✓ ${r.title} — re-embedado dim ${embs[i]!.length}`);
  }
  // verificación: ¿algún doc del corpus aún enumera "Sector N (" fabricado?
  const all = await prisma.legalDocument.findMany({ select: { title: true, content: true, embedding: true } });
  const conNumero = all.filter(d => /Sector\s+\d+\s*\(/.test(d.content));
  const dims = new Set(all.map(d => d.embedding.length));
  console.log(`\nVerif — docs que aún enumeran 'Sector N (': ${conNumero.length} ${conNumero.map(d => d.title).join(', ')}`);
  console.log(`Verif — dimensiones en el corpus: ${[...dims].join(', ')} (debe ser solo 1024)`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
