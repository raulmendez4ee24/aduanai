/**
 * Test de paridad — switch de precedentes sintéticos (Fase 2.3 paso 1).
 *
 * Ejecutar:  npx tsx src/tests/phase2-precedent-switch.test.ts
 *
 * El corpus LegalPrecedent (24 filas) es sintético — referencias con placeholder
 * ("Tesis V-P-2aS-XX/2023"), 0 con fuente oficial. Mientras
 * PRECEDENT_CORPUS_VERIFIED=false, NINGÚN consumidor debe recibir precedentes:
 *  - lookupPrecedents / hasActiveLitigation → vacío (determinista, sin tocar BD)
 *  - classifyProduct (M8 en vivo) → sin precedents, sin litigationAlert, sin
 *    referencias de tesis sintéticas en NINGUNA parte de la respuesta.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { lookupPrecedents, hasActiveLitigation, PRECEDENT_CORPUS_VERIFIED } from '../services/precedent-lookup';
import { classifyProduct } from '../services/classifier';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

// Patrones de las referencias sintéticas conocidas del corpus + formato genérico de tesis
const SYNTHETIC_REFS = /V-P-2aS|VI-P-2aS|VII-CASR|VIII-P-2aS|Tesis\s+[IVXLC]+-/;

async function main() {
  console.log('\n== switch precedentes sintéticos (Fase 2.3 paso 1) ==');
  console.log(`   PRECEDENT_CORPUS_VERIFIED = ${PRECEDENT_CORPUS_VERIFIED}`);

  await test('switch está apagado (corpus no verificado)', async () => {
    assert.equal(PRECEDENT_CORPUS_VERIFIED, false);
  });

  await test('lookupPrecedents → [] aunque haya match potencial (cap 73, tornillo)', async () => {
    const r = await lookupPrecedents({ fractionCode: '73181599', chapter: '73', keywords: ['tornillo'], topics: ['reclasificación'] });
    assert.deepEqual(r, []);
  });

  await test('hasActiveLitigation(73181599) → has=false, sin casos', async () => {
    const r = await hasActiveLitigation('73181599');
    assert.deepEqual(r, { has: false, precedents: [] });
  });

  await test('EN VIVO: classifyProduct(M8) sin precedents/litigationAlert/tesis sintéticas', async () => {
    const result = await classifyProduct('Tornillo hexagonal M8x25 acero al carbono galvanizado');
    console.log(`     → fracción: ${result.fraction.code} (conf ${result.confidence})`);
    assert.equal(result.precedents?.length ?? 0, 0, 'precedents debe estar vacío');
    assert.equal(result.litigationAlert?.active ?? false, false, 'litigationAlert debe ser null/inactivo');
    const serialized = JSON.stringify(result);
    assert.equal(SYNTHETIC_REFS.test(serialized), false,
      `la respuesta NO debe citar tesis sintéticas — encontrado: ${serialized.match(SYNTHETIC_REFS)?.[0]}`);
    // Regresión de paso: la clasificación sigue correcta
    assert.equal(result.fraction.code.replace(/[.\-\s]/g, ''), '73181599');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
