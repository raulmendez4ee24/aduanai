/**
 * Test de paridad del candado de Inventario (Paso 2).
 *
 * Ejecutar:  npx tsx src/tests/inventory-fraction-guard.test.ts
 *
 * NOTA: no ejecuta POST reales contra la BD (DATABASE_URL = PRODUCCIÓN; un create
 * exitoso escribiría en prod). Verifica la MISMA decisión que usan las rutas
 * `POST /imports` y `POST /products`: `validateFraction(code).valid`.
 * La verificación de que las rutas realmente responden 400 se hace por inspección
 * estática (grep) + typecheck del build.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { validateFraction } from '../services/fraction-validator';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

// Réplica exacta de la decisión del candado en inventory.ts
async function importIsRejected(fractionCode: string): Promise<boolean> {
  const fx = await validateFraction(fractionCode);
  return !fx.valid;
}

async function main() {
  console.log('\n== inventory fraction guard (paridad Paso 2) ==');

  await test('Inventario RECHAZA .05 (73181505, inexistente)', async () => {
    assert.equal(await importIsRejected('73181505'), true);
  });

  await test('Inventario RECHAZA código inventado (99999999)', async () => {
    assert.equal(await importIsRejected('99999999'), true);
  });

  await test('Inventario RECHAZA malformado ("7318")', async () => {
    assert.equal(await importIsRejected('7318'), true);
  });

  await test('Inventario ACEPTA .99 (73181599, vigente)', async () => {
    assert.equal(await importIsRejected('73181599'), false);
  });

  await test('Inventario ACEPTA .99 con puntos y lo normaliza', async () => {
    const fx = await validateFraction('7318.15.99');
    assert.equal(fx.valid, true);
    assert.equal(fx.code, '73181599'); // se almacena normalizado
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
