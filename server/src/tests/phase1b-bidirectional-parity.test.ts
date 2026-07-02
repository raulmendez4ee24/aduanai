/**
 * PARIDAD BIDIRECCIONAL — Fase 1b (fix del sesgo anti-.99 del Clasificador).
 *
 * Ejecutar:  npx tsx src/tests/phase1b-bidirectional-parity.test.ts
 *
 * El fix reformuló la regla anti-.99 como CONDICIONAL: específica sólo si el
 * producto cumple explícitamente sus criterios; si ninguna aplica, la residual
 * .99 ES la correcta. Este test verifica AMBAS direcciones:
 *
 *  1. M8 carbono → 7318.15.99  (residual correcta — el sesgo anti-.99 ya no la evita)
 *  2. Inoxidable → 7318.15.01  (específica por material — el fix NO empuja a .99)
 *  3. 4mm × 30mm → 7318.15.04  (específica por dimensión: <6.4mm Y <50.8mm)
 *  4. Camiseta algodón hombre → 6109.10.01 (caso 1 del accuracy set, específica de
 *     OTRA partida/capítulo — no-regresión del sesgo inverso pro-.99. LÍNEA BASE
 *     VERIFICADA 2026-07-01 con prompt viejo+candado: PASA conf 98. Ejercita además
 *     la línea de textiles reformulada. Nota: el caso 52 original (compresor 100 HP
 *     → 84143001) se descartó porque su línea base YA FALLABA con el prompt viejo
 *     (8414.40.02) — hallazgo pre-existente anotado en DEFERRED_WORK.)
 *
 * Cotejo (Base Única SNICE 30-mar-2026, catálogo Fraction en prod):
 *  - 73181501: "Los demás tornillos, incluso con sus tuercas y arandelas, de acero inoxidable"
 *  - 73181504: "Tornillos con diámetro inferior a 6.4 mm (¼ pulgada) y longitud inferior a 50.8 mm (2 pulgadas)"
 *  - 73181599: "Los demás tornillos y pernos, incluso con sus tuercas y arandelas"
 *  M8 = 8mm ≥ 6.4mm → no .04; carbono → no .01 → residual .99.
 *
 * Llamadas LLM reales (aterrizado vs catálogo), SIN escribir en la BD
 * (classifyProduct no persiste; la persistencia vive en la ruta classify.ts).
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { classifyProduct } from '../services/classifier';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

async function classifyAndCheck(description: string, expected: string): Promise<void> {
  const result = await classifyProduct(description);
  const clean = result.fraction.code.replace(/[.\-\s]/g, '');
  console.log(`     → "${description.slice(0, 55)}" ⇒ ${result.fraction.code} (conf ${result.confidence})`);
  console.log(`       desc: ${result.fraction.description?.slice(0, 75)}`);
  assert.equal(clean, expected, `esperaba ${expected}, obtuvo ${clean}`);
}

async function main() {
  console.log('\n== PARIDAD BIDIRECCIONAL Fase 1b ==');

  await test('1) residual: M8 carbono → 73181599', async () => {
    await classifyAndCheck('Tornillo hexagonal M8x25 acero al carbono galvanizado', '73181599');
  });

  await test('2) específica por material: inoxidable → 73181501', async () => {
    await classifyAndCheck('Tornillo de acero inoxidable cabeza hexagonal M10x40 con tuerca', '73181501');
  });

  await test('3) específica por dimensión: 4mm×30mm → 73181504', async () => {
    await classifyAndCheck('Tornillo de acero al carbono cabeza hexagonal, diámetro 4 mm, longitud 30 mm', '73181504');
  });

  await test('4) no-regresión otra partida (baseline verificada): camiseta algodón hombre → 61091001', async () => {
    await classifyAndCheck('Camiseta de algodón 100% para hombre, tejido de punto, cuello redondo', '61091001');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
