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

// ── El job asíncrono también debe decir la verdad (28-ago-2026) ──────────
// Prod se quedó sin crédito y el usuario leía "error interno del servicio,
// intenta de nuevo": el detector existía pero solo lo usaba la ruta síncrona.
import { mapearErrorDeJob } from '../services/classification-job-runner';

test('job: crédito agotado → IA_NO_DISPONIBLE, mensaje honesto y NO retriable', () => {
  const e = apiError(400, 'Your credit balance is too low to access the Anthropic API.');
  const r = mapearErrorDeJob(e);
  assert.equal(r.code, 'IA_NO_DISPONIBLE');
  assert.equal(r.retriable, false);
  assert.match(r.message, /cr[eé]dito/i);
  assert.doesNotMatch(r.message, /error interno/i);
});

test('job: rate limit → IA_NO_DISPONIBLE y SÍ retriable', () => {
  const r = mapearErrorDeJob(apiError(429, 'rate_limit_error'));
  assert.equal(r.code, 'IA_NO_DISPONIBLE');
  assert.equal(r.retriable, true);
});

test('job: 4xx de validación sigue siendo VALIDACION no retriable', () => {
  const e = Object.assign(new Error('La descripción es insuficiente'), { statusCode: 422 });
  const r = mapearErrorDeJob(e);
  assert.equal(r.code, 'VALIDACION');
  assert.equal(r.retriable, false);
});

test('job: error desconocido sigue siendo ERROR_INTERNO retriable', () => {
  const r = mapearErrorDeJob(new Error('boom'));
  assert.equal(r.code, 'ERROR_INTERNO');
  assert.equal(r.retriable, true);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
