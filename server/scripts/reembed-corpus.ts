// Re-embeda TODO el corpus LegalDocument con Voyage (voyage-4, 1024 dim).
// BATCHED: manda varios textos por request (input[]) → ~3 requests en vez de 41,
// evitando el rate limit del free tier. Retry/backoff en 429. Solo acepta 1024.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const KEY = process.env.VOYAGE_API_KEY!;
const MODEL = process.env.EMBEDDING_MODEL || 'voyage-4';
const BATCH = 16;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, input: texts.map((t) => t.slice(0, 30000)), input_type: 'document', output_dimension: 1024 }),
    });
    if (res.status === 429) {
      const wait = Math.min(60000, 4000 * 2 ** attempt);
      console.log(`   429 — backoff ${wait}ms (intento ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const sorted = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (sorted.some((e) => e.length !== 1024)) throw new Error('dim inesperada en batch');
    return sorted;
  }
  throw new Error('rate limit: agotados los reintentos');
}

async function main() {
  const docs = await prisma.legalDocument.findMany({ select: { id: true, title: true, reference: true, content: true } });
  console.log(`Re-embedando ${docs.length} docs con ${MODEL} en batches de ${BATCH}...`);
  let done = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const embs = await embedBatch(batch.map((d) => `${d.title}\n${d.reference}\n${d.content}`));
    for (let j = 0; j < batch.length; j++) {
      await prisma.legalDocument.update({ where: { id: batch[j]!.id }, data: { embedding: embs[j]! } });
      done++;
    }
    console.log(`   ... ${done}/${docs.length}`);
    if (i + BATCH < docs.length) await sleep(20000); // espaciar batches para el rate limit
  }
  const all = await prisma.legalDocument.findMany({ select: { embedding: true } });
  const dims = new Set(all.map((x) => x.embedding.length));
  console.log(`\n✅ Re-embedados: ${done} | dimensiones en el corpus: ${[...dims].join(', ')} (debe ser solo 1024)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
