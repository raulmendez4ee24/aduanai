/**
 * COPILOT — retrieval de las preguntas sugeridas de la UI.
 *
 * Requiere una DB local accesible y el corpus LegalDocument seedeado.
 * Ejecutar: npm run test:copilot-sugeridas
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { smartRetrieval } from '../services/rag-search';

const QUESTIONS = [
  { query: '¿Qué excepciones al cumplimiento de NOMs aplican en el punto de entrada?', expectedReference: /NOM/i },
  { query: '¿Necesito permiso para importar textiles?' },
  { query: 'Explica la GRI 3', expectedReference: /GRI/i },
];

async function main(): Promise<void> {
  for (const { query, expectedReference } of QUESTIONS) {
    const candidates = await smartRetrieval(query, { rerank: false, topK: 12 });
    let finalResult = candidates;
    console.log(`\n${query}`);
    if (process.env.ANTHROPIC_API_KEY) {
      finalResult = await smartRetrieval(query, { rerank: true });
    } else {
      console.log('  rerank saltado (sin ANTHROPIC_API_KEY)');
    }

    console.log(`  candidatos: ${candidates.docs.length}`);
    console.log(`  docs finales: ${finalResult.docs.length}`);
    console.log(`  shouldRespond: ${finalResult.shouldRespond}`);
    console.log(`  top reference: ${finalResult.docs[0]?.reference ?? '(sin documentos)'}`);

    assert.ok(candidates.docs.length > 0, `${query}: debe recuperar al menos un candidato`);
    assert.ok(
      candidates.docs.some(doc => doc.keywordScore > 0 || doc.similarity > 0),
      `${query}: al menos un candidato debe tener keywordScore o similarity positivo`,
    );
    if (expectedReference) {
      assert.ok(
        candidates.docs.some(doc => expectedReference.test(doc.reference)),
        `${query}: debe recuperar un documento cuya reference contenga GRI`,
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      assert.equal(finalResult.shouldRespond, true, `${query}: el reranker debe permitir responder`);
    }
  }

  console.log('\nCOPILOT SUGERIDAS: 3/3 preguntas recuperaron documentos.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
