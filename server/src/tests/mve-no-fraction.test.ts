/**
 * Test de paridad de MVE Opción A (Paso 3).
 *
 * Ejecutar:  npx tsx src/tests/mve-no-fraction.test.ts
 *
 * No llama al LLM. Verifica que `sanitizeInvoiceItems` (aplicado a la salida real
 * de extractInvoiceData) NUNCA deja pasar una fracción, aunque el modelo la incluya.
 */

import { strict as assert } from 'node:assert';
import { sanitizeInvoiceItems } from '../services/auto-mve';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

console.log('\n== MVE Opción A: sin fracción (paridad Paso 3) ==');

test('descarta fractionCode que el LLM cuele (incl. el .01 histórico)', () => {
  const rogue = [
    { description: 'Tornillo hexagonal M8x25 acero al carbono', quantity: 100, unitPrice: 4.6, totalPrice: 460, fractionCode: '73181501' },
    { description: 'Arandela', quantity: 50, unitPrice: 1, totalPrice: 50, fractionCode: '7318.22.99' },
  ] as never;
  const clean = sanitizeInvoiceItems(rogue);
  assert.equal(clean.length, 2);
  for (const it of clean) {
    assert.equal('fractionCode' in it, false); // NO hay campo de fracción
  }
});

test('preserva los campos de VALOR intactos', () => {
  const rogue = [{ description: 'X', quantity: 3, unitPrice: 10, totalPrice: 30, fractionCode: '99999999' }] as never;
  const [it] = sanitizeInvoiceItems(rogue);
  assert.deepEqual(it, { description: 'X', quantity: 3, unitPrice: 10, totalPrice: 30 });
});

test('maneja items undefined/vacío sin romper', () => {
  assert.deepEqual(sanitizeInvoiceItems(undefined), []);
  assert.deepEqual(sanitizeInvoiceItems([] as never), []);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
