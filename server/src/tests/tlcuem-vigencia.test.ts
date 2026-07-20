/**
 * P1-6 — vigencia jurídica del TLCUEM (funciones puras, sin DB).
 *
 * Ejecutar: npm run test:tlcuem
 */

import { strict as assert } from 'node:assert';
import {
  preferenciaAplicable,
  TLCUEM_COUNTRIES,
  TLCUEM_VIGENCIA,
  tlcuemNota,
} from '../lib/treaties';

function main(): void {
  assert.equal(preferenciaAplicable(TLCUEM_VIGENCIA.acuerdoVigente), true);
  assert.equal(preferenciaAplicable(TLCUEM_VIGENCIA.modernizadoMGA), false);
  assert.equal(preferenciaAplicable(TLCUEM_VIGENCIA.interinoITA), false);
  console.log('  ✓ Solo el TLCUEM original tiene preferencia aplicable');

  for (const country of ['NL', 'PL', 'PT']) {
    assert.ok(TLCUEM_COUNTRIES.includes(country), `Falta ${country} en TLCUEM_COUNTRIES`);
  }
  console.log('  ✓ TLCUEM_COUNTRIES incluye NL, PL y PT');

  assert.equal(TLCUEM_VIGENCIA.instrumentoParaCalculo, 'acuerdoVigente');
  console.log('  ✓ El cálculo usa acuerdoVigente');

  const nota = tlcuemNota();
  assert.match(nota, /2000/);
  assert.match(nota, /22-may-2026/);
  console.log('  ✓ La nota jurídica menciona 2000 y 22-may-2026');

  console.log('\nResumen: 4/4 pruebas pasaron.');
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
