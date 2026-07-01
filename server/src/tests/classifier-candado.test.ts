/**
 * Test del CANDADO FINAL del Clasificador (Fase 1b.1).
 *
 * Ejecutar:  npx tsx src/tests/classifier-candado.test.ts
 *
 * Determinista — NO llama al LLM. Ejercita `enforceCatalogFraction` (el mismo
 * código que corre al final de classifyProduct) con códigos fabricados,
 * incluyendo el caso real observado en vivo: verificador emite "7318.15"
 * (truncado a subpartida). Ese caso debe quedar IMPOSIBLE de cara al usuario.
 *
 * Nota: el caso de fallback dispara logger.warn → 1 fila WARN veraz en
 * SystemLog (action=classifier_fraction_fallback) por corrida.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { enforceCatalogFraction, type ClassificationResult } from '../services/classifier';
import { FRACTION_UNVERIFIED_MESSAGE } from '../services/fraction-validator';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

function fakeResult(code: string, description = 'desc LLM'): ClassificationResult {
  return {
    fraction: { code, description, chapter: '73', section: 'XV' },
    nico: '00',
    confidence: 90,
    griApplied: [],
    tariffs: { nmf: 5, preferential: {} },
    regulations: { rrna: [], noms: [], sectoralRegistry: false },
    alternatives: [],
    explanation: { simple: '', technical: '' },
    legalBasis: { griApplied: [], legalNotes: [], discardedFractions: [] },
    useBasedAnalysis: null,
    disclaimer: '',
  };
}

async function main() {
  console.log('\n== candado final del Clasificador (Fase 1b.1) ==');

  await test('código válido 7318.15.99 → pasa intacto, sin flag', async () => {
    const r = await enforceCatalogFraction(fakeResult('7318.15.99', 'desc original LLM'), '7318.15.99');
    assert.equal(r.fraction.code, '7318.15.99');
    assert.equal(r.fraction.description, 'desc original LLM'); // no se toca cuando es válido
    assert.equal(r.verifierFallback, undefined);
  });

  await test('CASO REAL: truncado "7318.15" + pre-verificación .01 → fallback a .01 con flag y desc canónica', async () => {
    const r = await enforceCatalogFraction(fakeResult('7318.15'), '7318.15.01');
    assert.equal(r.fraction.code, '7318.15.01');
    assert.match(r.fraction.description, /inoxidable/i); // descripción del catálogo, no del LLM
    assert.ok(r.verifierFallback);
    assert.equal(r.verifierFallback!.invalidCode, '7318.15');
    assert.equal(r.verifierFallback!.usedCode, '7318.15.01');
    assert.equal(r.verifierFallback!.reason, 'malformed');
  });

  await test('inexistente 7318.15.05 + pre-verificación .99 → fallback a .99, reason not_found', async () => {
    const r = await enforceCatalogFraction(fakeResult('7318.15.05'), '73181599');
    assert.equal(r.fraction.code, '7318.15.99');
    assert.equal(r.verifierFallback!.reason, 'not_found');
  });

  await test('ambos inválidos → FALLA CERRADA con mensaje explícito (nunca fracción fabricada)', async () => {
    await assert.rejects(
      () => enforceCatalogFraction(fakeResult('7318.15'), '73181505'),
      (e: Error) => e.message.includes(FRACTION_UNVERIFIED_MESSAGE),
    );
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
