/**
 * Regresiones estáticas para datos legales hardcodeados en prompts/salidas.
 * No usa DB ni LLM: evita reintroducir huérfanos ya corregidos en el corpus.
 *
 * Ejecutar tras build: node dist/tests/prompt-authority-guards.test.js
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
const copilot = read('src/services/copilot.ts');
const classifier = read('src/services/classifier.ts');
const padron = read('src/services/padron-checker.ts');
const fiscal = read('src/services/fiscal-guardian.ts');

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nPrompt authority guards');

test('Copilot no conserva vigencia AAA de 3 años', () => {
  assert.doesNotMatch(copilot, /AAA.{0,80}(?:3|tres)\s+años/is);
});

test('Copilot fija un año para A/AA/AAA con regla 7.1.6 RGCE 2026', () => {
  assert.match(copilot, /UN AÑO renovable para TODOS los rubros A\/AA\/AAA conforme a la regla 7\.1\.6/i);
});

test('Clasificador no fija 8517.14.01 de memoria para smartphones', () => {
  assert.doesNotMatch(classifier, /Smartphones\s*→\s*8517\.14\.01/i);
});

test('Clasificador no afirma precedentes SAT/OMA sin contexto', () => {
  assert.doesNotMatch(classifier, /hay precedentes donde el SAT y la OMA reclasifican/i);
});

test('Switch de precedentes también limpia ClassificationKnowledge y output LLM', () => {
  assert.match(classifier, /k\.type === 'PRECEDENTE' \|\| k\.type === 'CRITERIO_SAT'/);
  assert.match(classifier, /result\.useBasedAnalysis\.precedents = \[\]/);
});

test('Conocimiento contradictorio de smartphones queda fuera del prompt', () => {
  assert.match(classifier, /smartphone\|tel\[eé\]fono inteligente/);
  assert.match(classifier, /8517\[\.\\s\]\?1\[34\]/);
});

test('Flag PROSEC sectoralRegistry ya no se etiqueta como Padrón sectorial', () => {
  assert.doesNotMatch(classifier, /f\.sectoralRegistry\) extras\.push\('Padrón sectorial'\)/);
});

test('Salida de padrones no conserva multa genérica 70–100%', () => {
  assert.doesNotMatch(padron, /Multa del 70% al 100%/i);
  assert.match(padron, /130% al 150% de los impuestos omitidos/);
});

test('Fiscal Guardian no presenta el crédito como IVA diferido ni mezcla USD como MXN en el prompt', () => {
  assert.doesNotMatch(fiscal, /IVA diferido pendiente|pago IVA diferido/i);
  assert.match(fiscal, /Credito fiscal IVA\/IEPS pendiente de descargo/);
  assert.match(fiscal, /Costo adicional mensual preliminar sin conversion:.*USD/);
});

console.log(`\n${passed} passed, 0 failed\n`);
