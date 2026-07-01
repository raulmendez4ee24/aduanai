/**
 * Test de paridad del resolver canónico de fracciones.
 *
 * Ejecutar:  npx tsx src/tests/fraction-validator.test.ts
 *
 * Read-only contra el catálogo `Fraction` (Base Única SNICE vigente).
 * Verifica que el candado falla cerrado para códigos inexistentes/inactivos.
 */

import { strict as assert } from 'node:assert';
import { prisma } from '../lib/prisma';
import { validateFraction, validateFractions, normalizeFractionCode } from '../services/fraction-validator';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log('\n== fraction-validator (paridad Paso 1) ==');

  await test('normaliza puntos: "7318.15.99" → "73181599"', async () => {
    assert.equal(normalizeFractionCode('7318.15.99'), '73181599');
  });

  await test('73181599 (los demás) → VÁLIDO con descripción', async () => {
    const r = await validateFraction('73181599');
    assert.equal(r.valid, true);
    assert.equal(r.reason, 'ok');
    assert.ok(r.description && r.description.length > 0);
  });

  await test('acepta con puntos "7318.15.99" → VÁLIDO', async () => {
    const r = await validateFraction('7318.15.99');
    assert.equal(r.valid, true);
    assert.equal(r.code, '73181599');
  });

  await test('73181501 (inoxidable) → VÁLIDO (prueba: .01 está ACTIVO, no retirado)', async () => {
    const r = await validateFraction('73181501');
    assert.equal(r.valid, true);
    assert.match(r.description ?? '', /inoxidable/i);
  });

  await test('73181504 (<6.4mm) → VÁLIDO', async () => {
    const r = await validateFraction('73181504');
    assert.equal(r.valid, true);
  });

  await test('73181505 (el .05 del auditor) → INVÁLIDO not_found, sin descripción', async () => {
    const r = await validateFraction('73181505');
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'not_found');
    assert.equal(r.description, null); // falla cerrado
  });

  await test('código malformado "" → INVÁLIDO malformed', async () => {
    const r = await validateFraction('');
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'malformed');
  });

  await test('código malformado "abc" → INVÁLIDO malformed', async () => {
    const r = await validateFraction('abc');
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'malformed');
  });

  await test('ruta inactive: una fracción con active=false → INVÁLIDO inactive', async () => {
    const inactive = await prisma.fraction.findFirst({ where: { active: false }, select: { code: true } });
    if (!inactive) {
      console.log('     (nota: no hay fracciones inactivas en el catálogo; ruta inactive no ejercitada)');
      return;
    }
    const r = await validateFraction(inactive.code);
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'inactive');
    assert.equal(r.description, null);
  });

  await test('batch validateFractions preserva orden y falla cerrado por item', async () => {
    const rs = await validateFractions(['73181599', '73181505', '7318.15.01', 'xyz']);
    assert.equal(rs.length, 4);
    assert.equal(rs[0].valid, true);          // .99
    assert.equal(rs[1].valid, false);         // .05 inexistente
    assert.equal(rs[1].reason, 'not_found');
    assert.equal(rs[2].valid, true);          // .01 inoxidable
    assert.equal(rs[3].valid, false);         // malformado
    assert.equal(rs[3].reason, 'malformed');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
