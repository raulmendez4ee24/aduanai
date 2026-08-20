/**
 * CORPUS ÍNTEGRO · SEED POR LOTE (plan aprobado 19-ago, §4)
 *
 * Ejecutar:  npx tsx src/scripts/seed-corpus-integro.ts <lote.json> [--dry]
 *
 * Flujo fail-closed:
 *  1. Lee el lote (JSON verbatim versionado en prisma/seed/corpus-integro/).
 *  2. VALIDA TODO el lote (corpus-validador): un doc inválido → aborta el
 *     lote entero, exit 1, cero escrituras.
 *  3. --dry termina aquí (reporte de qué entraría).
 *  4. Embeddings vía lib existente (Voyage 1024, assertCorpusEmbedding guard,
 *     backoff en 429/5xx). Cualquier fallo de embed → aborta ANTES de escribir.
 *  5. Upsert por (reference, claseTexto='texto_integro'): re-sembrar un lote
 *     corregido actualiza en lugar de duplicar. contentHash = sha256(content).
 *
 * Los resúmenes existentes NO se tocan (conviven; el retrieval prioriza
 * íntegro — rag-search.priorizarTextoIntegro).
 */

import * as fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { generateEmbedding, assertCorpusEmbedding } from '../lib/embeddings';
import { validarLote, urlCheckHttp, type DocCorpusIntegro } from '../lib/corpus-validador';

async function main() {
  const archivo = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!archivo) {
    console.error('Uso: npx tsx src/scripts/seed-corpus-integro.ts <lote.json> [--dry]');
    process.exit(1);
  }

  const docs: DocCorpusIntegro[] = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log(`Lote: ${archivo} — ${docs.length} documentos`);

  // 1. Validación total (URL check real, cacheado)
  const resultado = await validarLote(docs, urlCheckHttp());
  if (!resultado.ok) {
    console.error(`LOTE RECHAZADO — ${resultado.errores.length} error(es):`);
    for (const e of resultado.errores) console.error(`  ✗ ${e}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Validación: OK (referencias parseables, URLs vivas, verbatim, fechas)');

  if (dry) {
    for (const d of docs.slice(0, 5)) console.log(`  · ${d.reference} — ${d.title.slice(0, 60)}`);
    if (docs.length > 5) console.log(`  … y ${docs.length - 5} más`);
    console.log('(--dry: sin embeddings ni escrituras)');
    await prisma.$disconnect();
    return;
  }

  // 2. Embeddings ANTES de cualquier escritura (falla → cero cambios en DB)
  const embeddings: number[][] = [];
  for (let i = 0; i < docs.length; i++) {
    const emb = await generateEmbedding(docs[i]!.content, 'document');
    assertCorpusEmbedding(emb); // guard dims 1024 / proveedor real
    embeddings.push(emb);
    if ((i + 1) % 25 === 0) console.log(`  embeddings ${i + 1}/${docs.length}`);
  }
  console.log(`Embeddings: ${embeddings.length}/${docs.length} OK (guard 1024 activo)`);

  // 3. Upsert por (reference, claseTexto)
  let creados = 0, actualizados = 0;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    const data = {
      type: d.type,
      source: d.source,
      title: d.title,
      reference: d.reference,
      content: d.content,
      officialUrl: d.officialUrl,
      publishedDate: new Date(d.publishedDate),
      effectiveDate: new Date(d.publishedDate),
      claseTexto: 'texto_integro',
      fechaCotejo: new Date(d.fechaCotejo),
      keywords: d.keywords ?? [],
      topics: d.topics,
      fractionRefs: [] as string[],
      embedding: embeddings[i]!,
      contentHash: crypto.createHash('sha256').update(d.content).digest('hex'),
      isActive: true,
    };
    const existente = await prisma.legalDocument.findFirst({
      where: { reference: d.reference, claseTexto: 'texto_integro' },
      select: { id: true },
    });
    if (existente) {
      await prisma.legalDocument.update({ where: { id: existente.id }, data });
      actualizados++;
    } else {
      await prisma.legalDocument.create({ data });
      creados++;
    }
  }
  const total = await prisma.legalDocument.count({ where: { isActive: true } });
  console.log(`Sembrado: ${creados} creados, ${actualizados} actualizados · corpus activo total: ${total}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
