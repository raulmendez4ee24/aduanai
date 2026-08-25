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

console.log('\nIngesta 69-B: prevalece la situación con fecha más reciente');

const f = (rfc: string, situacion: string, fecha?: string) => ({ rfc, razonSocial: 'X', situacion, fecha: fecha ? new Date(fecha) : null });

test('(c) DEFINITIVO 2018 + SENTENCIA_FAVORABLE 2019 → prevalece la sentencia (por fecha)', () => {
  const out = dedupPorRfc([f('XYZ010101XY1', 'DEFINITIVO', '2018-09-28'), f('XYZ010101XY1', 'SENTENCIA_FAVORABLE', '2019-03-05')]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.situacion, 'SENTENCIA_FAVORABLE');
});

test('(c-bis) PRESUNTO NUEVO posterior a sentencia favorable vieja → prevalece el presunto (cronología real)', () => {
  const out = dedupPorRfc([f('NVO010101NV1', 'SENTENCIA_FAVORABLE', '2019-03-05'), f('NVO010101NV1', 'PRESUNTO', '2025-11-10')]);
  assert.equal(out[0]!.situacion, 'PRESUNTO');
});

test('(c-ter) desvirtuado posterior a presunto → prevalece desvirtuado (por fecha, cualquier orden de filas)', () => {
  for (const filas of [
    [f('AAA010101AA1', 'PRESUNTO', '2024-01-15'), f('AAA010101AA1', 'DESVIRTUADO', '2024-06-20')],
    [f('AAA010101AA1', 'DESVIRTUADO', '2024-06-20'), f('AAA010101AA1', 'PRESUNTO', '2024-01-15')],
  ]) {
    assert.equal(dedupPorRfc(filas)[0]!.situacion, 'DESVIRTUADO');
  }
});

test('(c-4) SIN fechas parseables → fallback por etapa del proceso (sentencia > definitivo > desvirtuado... nunca eclipsa la favorable)', () => {
  const out = dedupPorRfc([f('BBB010101BB1', 'DEFINITIVO'), f('BBB010101BB1', 'SENTENCIA_FAVORABLE')]);
  assert.equal(out[0]!.situacion, 'SENTENCIA_FAVORABLE');
});

console.log(`\n${passed} passed, 0 failed\n`);
