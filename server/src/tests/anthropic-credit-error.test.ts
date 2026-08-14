/**
 * Test del manejo explícito de errores de crédito/cuota de la API de Anthropic.
 *
 * Ejecutar:  npx tsx src/tests/anthropic-credit-error.test.ts
 *
 * Determinista — NO llama al LLM ni a la DB (la alerta se dispara fire-and-forget
 * y aquí solo se verifica la clasificación del error y la respuesta HTTP).
 */
import { strict as assert } from 'node:assert';
import Anthropic from '@anthropic-ai/sdk';
import { tipoDeErrorAnthropic } from '../lib/anthropic';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

function apiError(status: number, message: string): Error {
  const err = Object.create(Anthropic.APIError.prototype) as Error;
  Object.assign(err, { status, message });
  return err;
}

console.log('== manejo de errores crédito/cuota Anthropic ==');

test('400 con "credit balance" → credito', () => {
  const e = apiError(400, 'Your credit balance is too low to access the Anthropic API.');
  assert.equal(tipoDeErrorAnthropic(e), 'credito');
});

test('429 → cuota (tras reintentos del SDK)', () => {
  assert.equal(tipoDeErrorAnthropic(apiError(429, 'Number of requests has exceeded your rate limit')), 'cuota');
});

test('400 sin "credit balance" (request malformado) → null', () => {
  assert.equal(tipoDeErrorAnthropic(apiError(400, 'max_tokens is required')), null);
});

test('500 de la API → null (error genérico, no crédito)', () => {
  assert.equal(tipoDeErrorAnthropic(apiError(500, 'Internal server error')), null);
});

test('Error normal (no APIError) → null', () => {
  assert.equal(tipoDeErrorAnthropic(new Error('Your credit balance is too low')), null);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
