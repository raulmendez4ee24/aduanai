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

  // 1.5 Re-seed incremental: los docs cuyo contentHash YA está en DB con el
  // mismo contenido no se re-embeden ni se re-escriben (los embeddings son
  // caros bajo el 429 de Voyage; re-sembrar un lote corregido solo paga el
  // delta). El hash es del content verbatim: cualquier cambio re-entra.
  const existentes = await prisma.legalDocument.findMany({
    where: { claseTexto: 'texto_integro', reference: { in: docs.map(d => d.reference) } },
    select: { id: true, reference: true, contentHash: true, version: true, keywords: true, fechaCotejo: true },
  });
  const porRef = new Map(existentes.map(e => [e.reference, e]));
  const versionDe = (d: DocCorpusIntegro) => d.vigenciaCondicionada ? `${d.version ?? ''} · VIGENCIA CONDICIONADA: ${d.vigenciaCondicionada}` : (d.version ?? null);
  const cotejoDe = (d: DocCorpusIntegro) => d.vigenciaCondicionada ? null : new Date(d.fechaCotejo);
  const pendientes = docs.filter(d =>
    porRef.get(d.reference)?.contentHash !== crypto.createHash('sha256').update(d.content).digest('hex'));
  console.log(`Incremental: ${docs.length - pendientes.length} sin cambios (skip) · ${pendientes.length} a sembrar`);
  const aSembrar = pendientes;

  // 1.6 Refresco de METADATA sin re-embeber: contenido idéntico pero cambió
  // la etiqueta de instrumento (`version`), las `keywords` o la fecha de
  // cotejo. No toca `topics` (en prod los gobierna rescan-topics) ni el
  // texto. Cero llamadas a Voyage.
  let refrescados = 0;
  for (const d of docs) {
    if (pendientes.includes(d)) continue;
    const ex = porRef.get(d.reference);
    if (!ex) continue;
    const v = versionDe(d);
    const kw = d.keywords ?? [];
    const fc = cotejoDe(d);
    const mismaFecha = (fc?.getTime() ?? null) === (ex.fechaCotejo?.getTime() ?? null);
    if ((ex.version ?? null) === v && JSON.stringify(ex.keywords ?? []) === JSON.stringify(kw) && mismaFecha) continue;
    await prisma.legalDocument.update({ where: { id: ex.id }, data: { version: v, keywords: kw, fechaCotejo: fc } });
    refrescados++;
    console.log(`  metadata refrescada: ${d.reference}`);
  }
  if (refrescados) console.log(`Metadata: ${refrescados} doc(s) actualizados sin re-embeber`);

  // 2. Embeddings ANTES de cualquier escritura (falla → cero cambios en DB).
  // Voyage bajo carga sostenida puede agotar el backoff interno y la lib cae
  // al fallback hash-256: el guard lo detecta y AQUÍ se reintenta el DOC con
  // espera larga (no se aborta al primer fallback) + paso entre requests
  // para respetar el RPM. Persistente tras 5 intentos → aborta sin escribir.
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const embeddings: number[][] = [];
  for (let i = 0; i < aSembrar.length; i++) {
    let emb: number[] | null = null;
    for (let intento = 1; intento <= 5 && !emb; intento++) {
      const e = await generateEmbedding(aSembrar[i]!.content, 'document');
      try {
        assertCorpusEmbedding(e); // guard dims 1024 / proveedor real
        emb = e;
      } catch (err) {
        const espera = 20000 * intento;
        console.log(`  doc ${i + 1} (${aSembrar[i]!.reference}): embedding rechazado por el guard — espera ${espera / 1000}s y reintenta (${intento}/5)`);
        await sleep(espera);
      }
    }
    if (!emb) {
      console.error(`✗ doc ${i + 1} (${aSembrar[i]!.reference}): Voyage no entregó 1024 dims tras 5 intentos — LOTE ABORTADO sin escrituras.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    embeddings.push(emb);
    await sleep(350); // paso entre docs (RPM)
    if ((i + 1) % 25 === 0) console.log(`  embeddings ${i + 1}/${aSembrar.length}`);
  }
  console.log(`Embeddings: ${embeddings.length}/${aSembrar.length} OK (guard 1024 activo)`);

  // 3. Upsert por (reference, claseTexto)
  let creados = 0, actualizados = 0;
  for (let i = 0; i < aSembrar.length; i++) {
    const d = aSembrar[i]!;
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
      fechaCotejo: cotejoDe(d),
      version: versionDe(d),
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
