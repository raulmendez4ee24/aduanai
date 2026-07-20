/**
 * Risk Scorer P1-2 — temporales atribuibles a la operación (sin DB).
 *
 * Ejecutar: npm run test:temporales
 */

import { strict as assert } from 'node:assert';
import { evaluate } from '../services/risk-scorer/engine';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import { buildTemporalesWhere } from '../services/risk-scorer/signals';
import type { Signals } from '../services/risk-scorer/types';

const AHORA = new Date('2026-07-19T12:00:00.000Z');
const TENANT = 'tenant-temporales-test';

function buscarTmp02(resultado: ReturnType<typeof evaluate>) {
  const regla = resultado.factores.flatMap(f => f.reglas).find(r => r.id === 'F5-TMP-02');
  assert.ok(regla, 'No se encontró la regla F5-TMP-02');
  return regla;
}

function construirSignals(temporalesPorVencer?: number): Signals {
  return {
    tipoSujeto: 'agente',
    operacion: {},
    declarado: {},
    verificado: { temporalesPorVencer },
  };
}

async function main(): Promise<void> {
  assert.equal(buildTemporalesWhere(TENANT, {}, AHORA), null);
  console.log('  ✓ Sin fracción ni pedimento, la señal no es atribuible');

  const porFraccion = buildTemporalesWhere(TENANT, { fraccion: '73181501' }, AHORA);
  assert.ok(porFraccion);
  assert.equal(porFraccion.tenantId, TENANT);
  assert.equal(porFraccion.isDemoData, false);
  assert.deepEqual(porFraccion.OR, [{ fractionCode: '73181501' }]);
  console.log('  ✓ La fracción genera un OR atribuible y excluye datos demo');

  const porPedimento = buildTemporalesWhere(TENANT, { numeroPedimento: '254734614000123' }, AHORA);
  assert.ok(porPedimento);
  assert.deepEqual(porPedimento.OR, [{
    pedimento: { in: ['254734614000123', '25 47 3461 4000123'] },
  }]);
  console.log('  ✓ El pedimento genera variantes compacta y espaciada');

  const porAmbos = buildTemporalesWhere(TENANT, {
    fraccion: '73181501',
    numeroPedimento: '254734614000123',
  }, AHORA);
  assert.ok(porAmbos);
  assert.deepEqual(porAmbos.OR, [
    { fractionCode: '73181501' },
    { pedimento: { in: ['254734614000123', '25 47 3461 4000123'] } },
  ]);
  console.log('  ✓ Con ambos identificadores, el OR contiene dos entradas');

  const sinSenal = buscarTmp02(evaluate(construirSignals(), DEFAULT_WEIGHTS));
  assert.equal(sinSenal.origenEfectivo, 'no_evaluado');
  assert.equal(sinSenal.puntos, 0);

  const conTemporales = buscarTmp02(evaluate(construirSignals(2), DEFAULT_WEIGHTS));
  assert.equal(conTemporales.origenEfectivo, 'verificado');
  assert.equal(conTemporales.puntos, 4);
  console.log('  ✓ F5-TMP-02 distingue señal ausente de 2 temporales verificados');

  console.log('\nResumen: 5/5 pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
