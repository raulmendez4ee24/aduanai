/**
 * Risk Scorer P1-1 — etiquetado veraz y cobertura (función pura, sin DB).
 *
 * Ejecutar: npm run test:risk-labeling
 */

import { strict as assert } from 'node:assert';
import { evaluate } from '../services/risk-scorer/engine';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { DeclaradoInput, OperacionInput, Signals, VerificadoSignals } from '../services/risk-scorer/types';

function construirSignals({
  operacion = {},
  declarado = {},
  verificado = {},
}: {
  operacion?: OperacionInput;
  declarado?: DeclaradoInput;
  verificado?: VerificadoSignals;
} = {}): Signals {
  return { tipoSujeto: 'agente', operacion, declarado, verificado };
}

function buscarRegla(resultado: ReturnType<typeof evaluate>, id: string) {
  const regla = resultado.factores.flatMap(f => f.reglas).find(r => r.id === id);
  assert.ok(regla, `No se encontró la regla ${id}`);
  return regla;
}

async function main(): Promise<void> {
  const sinRfc = evaluate(construirSignals(), DEFAULT_WEIGHTS);
  const regla69BSinRfc = buscarRegla(sinRfc, 'F2-PER-01');
  assert.equal(regla69BSinRfc.origenEfectivo, 'no_evaluado');
  assert.equal(regla69BSinRfc.puntos, 0);
  console.log('  ✓ Sin RFC, F2-PER-01 queda no_evaluado con 0 puntos');

  const definitivo = evaluate(construirSignals({
    operacion: { importadorRfc: 'AAA120730823' },
    verificado: {
      en69B: { situacion: 'DEFINITIVO', listaAl: '2026-07-19' },
      lista69BDisponible: true,
    },
  }), DEFAULT_WEIGHTS);
  const regla69BDefinitivo = buscarRegla(definitivo, 'F2-PER-01');
  assert.equal(regla69BDefinitivo.origenEfectivo, 'verificado');
  assert.equal(regla69BDefinitivo.puntos, 22);
  assert.ok(definitivo.banderas.includes('LISTADO_69B'));
  assert.equal(definitivo.banda, 'ROJO_CRITICO');
  console.log('  ✓ Lista 69-B vigente: F2-PER-01 verificado, 22 puntos y banda con bandera');

  const listaVencida = evaluate(construirSignals({
    operacion: { importadorRfc: 'AAA120730823' },
    verificado: {
      en69B: { situacion: 'DEFINITIVO', listaAl: '2026-01-01' },
      lista69BDisponible: false,
    },
  }), DEFAULT_WEIGHTS);
  assert.equal(buscarRegla(listaVencida, 'F2-PER-01').origenEfectivo, 'no_evaluado');
  console.log('  ✓ Lista 69-B vencida no se etiqueta como verificación');

  const temporalNoDerivable = evaluate(construirSignals({
    verificado: { temporalesFueraDomicilio: 3 },
  }), DEFAULT_WEIGHTS);
  assert.equal(buscarRegla(temporalNoDerivable, 'F5-TMP-01').origenEfectivo, 'no_evaluado');
  console.log('  ✓ F5-TMP-01 siempre queda no_evaluado');

  for (const regla of sinRfc.factores.flatMap(f => f.reglas).filter(r => r.origenSenal === 'declarado')) {
    assert.equal(regla.origenEfectivo, 'declarado', `${regla.id} debía conservar origen declarado`);
  }
  console.log('  ✓ Todas las reglas declaradas conservan origenEfectivo declarado');

  // Baseline v1.0.1 calculado antes del cambio para exactamente este input puro.
  assert.equal(sinRfc.exposicion, 30);
  assert.equal(sinRfc.banda, 'ROJO');
  assert.equal(sinRfc.escudoPct, 0);
  console.log('  ✓ Paridad de scoring vacía: exposición 30, banda ROJO, escudo 0%');

  assert.deepEqual(sinRfc.cobertura, {
    verificadas: 0,
    declaradas: 15,
    noEvaluadas: 11,
    identificadoresFaltantes: [
      'fracción arancelaria',
      'RFC del importador',
      'número de pedimento',
    ],
  });
  assert.ok(sinRfc.faltantes.length <= 6);
  assert.equal(
    sinRfc.faltantes.at(-1),
    'Proporciona fracción arancelaria, RFC del importador y número de pedimento para verificación completa',
  );
  console.log('  ✓ Cobertura e identificadores faltantes se cuentan y reportan correctamente');

  console.log('\nResumen: 7/7 pruebas pasaron.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
