/**
 * RADAR DE PEDIMENTOS — Fase A (Raúl, 21-ago-2026). Garantías de contrato:
 *  1. El límite del lote es constante nombrada y configurable (RADAR_MAX_PARTIDAS).
 *  2. Ningún factor declarativo sin respuesta puede verse como "cumplido": con
 *     `declarado = {}` el motor puntúa (noConfirmado) y emite origenEfectivo
 *     'declarado' → la UI lo etiqueta "DECLARADO POR USUARIO" (misma cadena que
 *     /risk-scorer, componente compartido). Los únicos declarativos con 0 puntos
 *     son los exentos por vigencia (F1-VAL-02 dentro de la prórroga MVE) o los
 *     que dependen de una señal verificada ausente.
 *  3. El radar evalúa con fechaEvaluacion = hoy (igual que /api/risk/assess).
 * Ejecutar: npx tsx src/tests/radar-fase-a.test.ts
 */
import { strict as assert } from 'node:assert';
import { maxPartidasLote, DEFAULT_MAX_PARTIDAS_LOTE, reglasActivasDe } from '../routes/pedimento-reader';
import { evaluate } from '../services/risk-scorer/engine';
import { DEFAULT_WEIGHTS, RISK_RULES } from '../services/risk-scorer/rules';
import { e2Exigible } from '../services/risk-scorer/vigencias';
import type { Signals } from '../services/risk-scorer/types';

let ok = 0;
function check(cond: boolean, msg: string) { assert.ok(cond, msg); ok++; console.log(`  ✓ ${msg}`); }

async function main() {
  // 1. Límite configurable
  delete process.env.RADAR_MAX_PARTIDAS;
  check(maxPartidasLote() === DEFAULT_MAX_PARTIDAS_LOTE && DEFAULT_MAX_PARTIDAS_LOTE === 200, 'sin env → 200 (constante nombrada)');
  process.env.RADAR_MAX_PARTIDAS = '1';
  check(maxPartidasLote() === 1, 'RADAR_MAX_PARTIDAS=1 → 1');
  for (const malo of ['0', '-5', 'abc', '2.5', '']) {
    process.env.RADAR_MAX_PARTIDAS = malo;
    check(maxPartidasLote() === 200, `RADAR_MAX_PARTIDAS="${malo}" inválido → cae al default`);
  }
  delete process.env.RADAR_MAX_PARTIDAS;

  // 2. Sin declaraciones → los declarativos puntúan y llegan como 'declarado'
  const hoy = new Date().toISOString().slice(0, 10);
  const signals: Signals = {
    tipoSujeto: 'agente', fechaEvaluacion: hoy,
    operacion: { fraccion: '84715001', nico: '01', valorUnitario: 25000, paisOrigen: 'US' },
    declarado: {},
    verificado: { fraccionValida: true, nicoExiste: true },
  };
  const r = evaluate(signals, DEFAULT_WEIGHTS);
  const activas = reglasActivasDe(r.factores);
  check(activas.length > 0, `con declarado={} hay ${activas.length} reglas que puntúan`);
  check(activas.every(a => a.puntos > 0), 'reglasActivas solo contiene reglas con puntos > 0 (nada "cumplido" se cuela)');
  const declarativasActivas = activas.filter(a => a.origenEfectivo === 'declarado');
  check(declarativasActivas.length > 0, `${declarativasActivas.length} declarativas sin respuesta puntúan con origenEfectivo='declarado'`);
  check(activas.every(a => ['verificado', 'declarado', 'mixto', 'no_evaluado'].includes(a.origenEfectivo)), 'origenEfectivo siempre es uno de los 4 estados del motor (sin tercer término)');

  // Toda regla puramente declarativa que NO puntúa debe tener una razón explícita.
  const declarativasCero = RISK_RULES.filter(rule => rule.origenSenal === 'declarado' && !activas.some(a => a.id === rule.id));
  const exentasPorVigencia = new Set(['F1-VAL-02']);
  const razonOk = declarativasCero.every(rule => (exentasPorVigencia.has(rule.id) ? !e2Exigible(hoy) : rule.evaluar(signals) === 0));
  check(razonOk, `declarativas con 0 puntos (${declarativasCero.map(x => x.id).join(', ') || 'ninguna'}) = exentas por vigencia o no aplicables a estas señales — nunca "cumplidas" por omisión`);

  // 3. fechaEvaluacion = hoy: dentro de la prórroga MVE no puntúa; sin fecha, sí (fail-safe)
  if (!e2Exigible(hoy)) {
    check(!activas.some(a => a.id === 'F1-VAL-02'), 'con fechaEvaluacion=hoy (prórroga vigente) F1-VAL-02 no puntúa — coherente con "Criterios actualizados"');
    const sinFecha = reglasActivasDe(evaluate({ ...signals, fechaEvaluacion: undefined }, DEFAULT_WEIGHTS).factores);
    check(sinFecha.some(a => a.id === 'F1-VAL-02' && a.origenEfectivo === 'declarado'), 'sin fecha el motor hace fail-safe y F1-VAL-02 sí puntúa (por eso el radar la pasa)');
  }

  console.log(`\n${ok} pruebas pasaron`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
