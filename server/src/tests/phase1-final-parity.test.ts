/**
 * PARIDAD FINAL — Fase 1 (Paso 5).
 *
 * Ejecutar:  npx tsx src/tests/phase1-final-parity.test.ts
 *
 * Criterio del usuario:
 *  1. Tornillo M8 de carbono → 7318.15.99 en el Clasificador (aterrizado vs catálogo).
 *  2. MVE NO emite fracción ("no determinada — usa el Clasificador").
 *  3. Inventario RECHAZA cualquier código inexistente (p. ej. .05 / 73181505).
 *
 * El Clasificador hace UNA llamada real al LLM (aterrizada), SIN escribir en la BD
 * (usa el servicio classifyProduct, no la ruta que persiste). El resto es determinista.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { classifyProduct } from '../services/classifier';
import { sanitizeInvoiceItems } from '../services/auto-mve';
import { validateFraction } from '../services/fraction-validator';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

async function main() {
  console.log('\n== PARIDAD FINAL Fase 1 ==');

  await test('1) Clasificador: tornillo M8 carbono → 73181599', async () => {
    const result = await classifyProduct('Tornillo hexagonal M8x25 acero al carbono galvanizado');
    console.log(`     → clasificó: ${result.fraction.code} (conf ${result.confidence}) — ${result.fraction.description?.slice(0, 50)}`);
    assert.equal(result.fraction.code.replace(/[.\-\s]/g, ''), '73181599');
  });

  await test('2) MVE: no emite fracción (campo omitido tras sanitizar)', async () => {
    const clean = sanitizeInvoiceItems([
      { description: 'Tornillo hexagonal M8x25 acero al carbono', quantity: 100, unitPrice: 4.6, totalPrice: 460, fractionCode: '73181501' },
    ] as never);
    assert.equal('fractionCode' in clean[0], false);
  });

  await test('3) Inventario: rechaza .05 (73181505 inexistente)', async () => {
    const fx = await validateFraction('73181505');
    assert.equal(fx.valid, false);
    assert.equal(fx.reason, 'not_found');
    assert.equal(fx.description, null);
  });

  await test('bonus) Inventario: acepta .99 vigente', async () => {
    const fx = await validateFraction('73181599');
    assert.equal(fx.valid, true);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
