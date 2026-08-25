/**
 * Regresión del bug 69-B (radiografía §7.3, corregido 24-ago-2026).
 *
 * Ejecutar:  npx tsx src/tests/risk-69b-disponibilidad.test.ts
 *
 * El motor calculaba los puntos ANTES de consultar la disponibilidad de la
 * señal: un RFC en lista 69-B VENCIDA sumaba 22 puntos, activaba la bandera
 * LISTADO_69B y elevaba la banda, mientras la misma regla se etiquetaba
 * "no_evaluado". Y la ingesta deduplicaba por severidad: un desvirtuado o
 * sentencia favorable POSTERIOR quedaba eclipsado por la fila más grave.
 *
 * Tres casos exigidos:
 *  (a) RFC definitivo + lista vencida → 0 puntos del factor, no_evaluado con
 *      motivo, sin bandera;
 *  (b) lista vigente → comportamiento intacto (22 pts, bandera, verificado);
 *  (c) duplicado con resolución favorable posterior → prevalece la favorable.
 *
 * Motor puro (evaluate no toca DB) — sin servidor ni LLM.
 */
import { strict as assert } from 'node:assert';
import { evaluate } from '../services/risk-scorer/engine';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { Signals } from '../services/risk-scorer/types';
import { dedupPorRfc } from '../lib/sat69b-dedup';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function señalesBase(overrides: Partial<Signals['verificado']>): Signals {
  return {
    tipoSujeto: 'agente',
    operacion: { importadorRfc: 'ABC010101AB1' },
    declarado: {},
    verificado: { ...overrides },
  };
}

console.log('\nRisk 69-B: disponibilidad antes de puntuar');

test('(a) RFC DEFINITIVO + lista VENCIDA → 0 puntos, no_evaluado con motivo, sin bandera', () => {
  const r = evaluate(
    señalesBase({ en69B: { situacion: 'DEFINITIVO', listaAl: '2025-12-31' }, lista69BDisponible: false }),
    DEFAULT_WEIGHTS,
  );
  const regla = r.factores.flatMap(f => f.reglas).find(x => x.id === 'F2-PER-01');
  assert.ok(regla, 'regla F2-PER-01 presente');
  assert.equal(regla!.puntos, 0, `puntos deben ser 0, fueron ${regla!.puntos}`);
  assert.equal(regla!.origenEfectivo, 'no_evaluado');
  assert.match(regla!.motivo ?? '', /69-B/, 'motivo debe explicar la lista 69-B');
  assert.ok(!r.banderas.includes('LISTADO_69B'), 'la bandera LISTADO_69B no debe activarse');
  const factorPerfil = r.factores.find(f => f.factor === 'PERFIL');
  const puntos69B = factorPerfil!.reglas.filter(x => x.id.startsWith('F2-PER-0') && x.id !== 'F2-PER-03').reduce((a, x) => a + x.puntos, 0);
  assert.equal(puntos69B, 0, 'ninguna regla 69-B aporta puntos con lista vencida');
});

test('(a-bis) sin ingesta (lista69BDisponible=false, en69B undefined) → no_evaluado sin puntos', () => {
  const r = evaluate(señalesBase({ lista69BDisponible: false }), DEFAULT_WEIGHTS);
  const regla = r.factores.flatMap(f => f.reglas).find(x => x.id === 'F2-PER-01')!;
  assert.equal(regla.puntos, 0);
  assert.equal(regla.origenEfectivo, 'no_evaluado');
});

test('(b) lista VIGENTE + RFC DEFINITIVO → 22 puntos, bandera, verificado (intacto)', () => {
  const r = evaluate(
    señalesBase({ en69B: { situacion: 'DEFINITIVO', listaAl: '2026-08-01' }, lista69BDisponible: true }),
    DEFAULT_WEIGHTS,
  );
  const regla = r.factores.flatMap(f => f.reglas).find(x => x.id === 'F2-PER-01')!;
  assert.equal(regla.puntos, 22);
  assert.equal(regla.origenEfectivo, 'verificado');
  assert.equal(regla.motivo, undefined);
  assert.ok(r.banderas.includes('LISTADO_69B'));
});

test('(b-bis) lista VIGENTE + RFC limpio → 0 puntos pero VERIFICADO (evaluado, no "no_evaluado")', () => {
  const r = evaluate(señalesBase({ en69B: null, lista69BDisponible: true }), DEFAULT_WEIGHTS);
  const regla = r.factores.flatMap(f => f.reglas).find(x => x.id === 'F2-PER-01')!;
  assert.equal(regla.puntos, 0);
  assert.equal(regla.origenEfectivo, 'verificado');
});

console.log('\nIngesta 69-B: prevalece la situación más reciente');

test('(c) DEFINITIVO seguido de SENTENCIA_FAVORABLE → prevalece la sentencia', () => {
  const out = dedupPorRfc([
    { rfc: 'XYZ010101XY1', razonSocial: 'X SA', situacion: 'DEFINITIVO' },
    { rfc: 'XYZ010101XY1', razonSocial: 'X SA', situacion: 'SENTENCIA_FAVORABLE' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.situacion, 'SENTENCIA_FAVORABLE');
});

test('(c-bis) PRESUNTO seguido de DESVIRTUADO → prevalece desvirtuado (en cualquier orden de filas)', () => {
  for (const filas of [
    [{ rfc: 'AAA010101AA1', razonSocial: 'A', situacion: 'PRESUNTO' }, { rfc: 'AAA010101AA1', razonSocial: 'A', situacion: 'DESVIRTUADO' }],
    [{ rfc: 'AAA010101AA1', razonSocial: 'A', situacion: 'DESVIRTUADO' }, { rfc: 'AAA010101AA1', razonSocial: 'A', situacion: 'PRESUNTO' }],
  ]) {
    const out = dedupPorRfc(filas);
    assert.equal(out[0]!.situacion, 'DESVIRTUADO');
  }
});

test('(c-ter) PRESUNTO que avanza a DEFINITIVO → prevalece definitivo (el proceso avanzó en contra)', () => {
  const out = dedupPorRfc([
    { rfc: 'BBB010101BB1', razonSocial: 'B', situacion: 'PRESUNTO' },
    { rfc: 'BBB010101BB1', razonSocial: 'B', situacion: 'DEFINITIVO' },
  ]);
  assert.equal(out[0]!.situacion, 'DEFINITIVO');
});

console.log(`\n${passed} passed, 0 failed\n`);
