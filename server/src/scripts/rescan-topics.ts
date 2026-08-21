/**
 * CORPUS ÍNTEGRO · RESCAN DE TOPICS (pasada de metadata, orden Raúl 20-ago)
 *
 * Ejecutar:  npx tsx src/scripts/rescan-topics.ts [--dry]
 *            (en prod: node dist/scripts/rescan-topics.js)
 *
 * Recalcula `topics` de TODOS los docs texto_integro con la taxonomía vigente
 * (rag-search.topicsDeTexto sobre title+content). Solo escribe los que
 * cambian. NO toca content, embeddings ni fechas — es metadata determinista.
 * Corrección de taxonomía, no de documentos sueltos.
 */

import { prisma } from '../lib/prisma';
import { topicsDeTexto } from '../services/rag-search';

async function main() {
  const dry = process.argv.includes('--dry');
  const docs = await prisma.legalDocument.findMany({
    where: { claseTexto: 'texto_integro' },
    select: { id: true, reference: true, title: true, content: true, topics: true },
  });
  let cambiados = 0, sinTopics = 0, sinTopicsAntes = 0;
  for (const d of docs) {
    if (d.topics.length === 0) sinTopicsAntes++;
    const nuevos = topicsDeTexto(`${d.title}\n${d.content}`);
    if (nuevos.length === 0) sinTopics++;
    if (JSON.stringify([...nuevos].sort()) !== JSON.stringify([...d.topics].sort())) {
      cambiados++;
      if (!dry) await prisma.legalDocument.update({ where: { id: d.id }, data: { topics: nuevos } });
    }
  }
  console.log(`Rescan: ${docs.length} docs íntegros · ${cambiados} actualizados${dry ? ' (dry)' : ''} · sin topics: ${sinTopicsAntes} → ${sinTopics}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
