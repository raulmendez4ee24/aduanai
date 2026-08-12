/**
 * Risk Scorer P1-3 — vigencia temporal de E2 (función pura, sin DB).
 *
 * Ejecutar: npm run test:e2
 */

import { strict as assert } from 'node:assert';
import { RISK_RULES } from '../services/risk-scorer/rules';
import type { Signals } from '../services/risk-scorer/types';
import { e2Exigible, PRORROGA_E2 } from '../services/risk-scorer/vigencias';

function construirSignals(fechaEvaluacion?: string): Signals {
  return {
    tipoSujeto: 'agente',
    ...(fechaEvaluacion ? { fechaEvaluacion } : {}),
    operacion: {},
    declarado: { mveTransmitida: false },
    verificado: {},
  };
}

async function main(): Promise<void> {
  assert.equal(e2Exigible('2026-08-12'), false);
  assert.equal(e2Exigible('2026-09-30'), false);
  assert.equal(e2Exigible('2026-10-01'), true);
  console.log('  ✓ La prórroga E2 cubre hasta 2026-09-30 inclusive (2a RM RGCE 2026, 3a VA)');

  const regla = RISK_RULES.find(r => r.id === 'F1-VAL-02');
  assert.ok(regla, 'No se encontró la regla F1-VAL-02');
  assert.equal(regla.evaluar(construirSignals('2026-08-12')), 0);
  assert.equal(regla.evaluar(construirSignals('2026-10-01')), 8);
  assert.equal(regla.evaluar(construirSignals()), 8);
  console.log('  ✓ F1-VAL-02 da 0 durante la prórroga, 8 después y 8 sin fecha (fail-safe)');

  assert.equal(PRORROGA_E2.estado, 'VERSION_ANTICIPADA');
  assert.equal(PRORROGA_E2.dofFecha, null);
  console.log('  ✓ El instrumento conserva estado VERSION_ANTICIPADA y dofFecha null');

  console.log('\nResumen: 8/8 pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
