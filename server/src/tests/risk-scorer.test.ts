/**
 * RISK SCORER — tests deterministas del motor (sin BD, sin red, sin LLM).
 * Ejecutar:  npx tsx src/tests/risk-scorer.test.ts
 */
import { evaluate, calcularBanda } from '../services/risk-scorer/engine';
import { RISK_RULES, DEFAULT_WEIGHTS, RULES_VERSION } from '../services/risk-scorer/rules';
import { SHIELD_ITEMS } from '../services/risk-scorer/shield';
import type { Signals } from '../services/risk-scorer/types';

let ok = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { ok++; } else { fail++; console.error(`  ❌ ${msg}`); }
}

const base = (over: Partial<Signals> = {}): Signals => ({
  tipoSujeto: 'agente',
  operacion: {},
  declarado: {},
  verificado: {},
  ...over,
});

/** Todo declarado en verde + sin señales verificadas de riesgo. */
const todoBien: Signals = base({
  operacion: { valorUnitario: 100 },
  declarado: {
    mveTransmitida: true, expedienteKyc: true, expediente162VII: true,
    controlInterno81A: true, encargoConferido: true, padronImportadoresVigente: true,
    evidenciaNoms: true, incrementablesConSoporte: true, pagoConSoporteBancario: true,
    proveedorLocalizable: true, certOrigen9Elementos: true,
    expediente59V: { a: true, b: true, c: true, d: true, e: true, f: true, g: true, h: true },
  },
  verificado: { fraccionValida: true, sectoresRequeridos: [], nomsRequeridas: [] },
});

// ── 1. Estructura del set de reglas ──
assert(RISK_RULES.length === 26, `26 reglas (hay ${RISK_RULES.length})`);
assert(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0) === 100, 'pesos default suman 100');
assert(RISK_RULES.every(r => r.fundamento.url.startsWith('http') && r.fundamento.fechaCotejo >= '2026-07-02'), 'toda regla lleva URL + fecha de cotejo');
assert(SHIELD_ITEMS.length === 16, `16 ítems de escudo: 8×59-V + KYC + 162-VII + MVE + 81-A + origen + encargo + 2 agencia (hay ${SHIELD_ITEMS.length})`);
assert(SHIELD_ITEMS.every(i => i.fundamento.url.startsWith('http')), 'todo ítem del escudo lleva URL');

// ── 2. Operación limpia ──
{
  const r = evaluate(todoBien, DEFAULT_WEIGHTS);
  assert(r.exposicion === 0, `limpia: exposición 0 (dio ${r.exposicion})`);
  assert(r.escudoPct === 100, `limpia: escudo 100 (dio ${r.escudoPct})`);
  assert(r.banda === 'VERDE', `limpia: VERDE (dio ${r.banda})`);
  assert(r.rulesVersion === RULES_VERSION, 'versión de reglas presente');
  // ítems de agencia NO aplican a agente
  assert(r.checklist.filter(c => !c.aplicable).every(c => c.id.startsWith('ESC-235') || c.id === 'ESC-ORIGEN'), 'solo agencia/origen inaplicables para agente');
}

// ── 3. Sin responder nada = riesgo declarativo + escudo 0 ──
{
  const r = evaluate(base(), DEFAULT_WEIGHTS);
  assert(r.exposicion > 20, `vacía: exposición >20 por opacidad (dio ${r.exposicion})`);
  assert(r.escudoPct === 0, `vacía: escudo 0 (dio ${r.escudoPct})`);
  assert(r.banda !== 'VERDE', `vacía: nunca VERDE (dio ${r.banda})`);
}

// ── 4. 69-B definitivo = bandera BLOQUEANTE → fila alta de la matriz ──
{
  const s = base({ verificado: { en69B: { situacion: 'DEFINITIVO', listaAl: '2026-07-01' }, lista69BDisponible: true } });
  const r = evaluate(s, DEFAULT_WEIGHTS);
  assert(r.banderas.includes('LISTADO_69B'), '69-B definitivo: bandera presente');
  assert(['NARANJA', 'ROJO', 'ROJO_CRITICO'].includes(r.banda), `69-B: banda elevada (dio ${r.banda})`);
  const f2 = r.factores.find(f => f.factor === 'PERFIL')!;
  assert(f2.puntos === DEFAULT_WEIGHTS.PERFIL, `69-B: PERFIL saturado a ${DEFAULT_WEIGHTS.PERFIL} (dio ${f2.puntos})`);
}

// ── 5. Saturación por peso: muchas reglas de un factor no exceden su peso ──
{
  const s = base({
    declarado: { proveedorLocalizable: false }, // + MVE/incrementables/pago sin responder
    operacion: {},
  });
  const r = evaluate(s, DEFAULT_WEIGHTS);
  const f1 = r.factores.find(f => f.factor === 'VALOR')!;
  const bruto = f1.reglas.reduce((a, x) => a + x.puntos, 0);
  assert(bruto > DEFAULT_WEIGHTS.VALOR, `VALOR bruto ${bruto} > peso (setup correcto)`);
  assert(f1.puntos === DEFAULT_WEIGHTS.VALOR, `VALOR saturado al peso (dio ${f1.puntos})`);
}

// ── 6. NOMs sin evidencia = bandera EMBARGO ──
{
  const s = base({ verificado: { nomsRequeridas: ['NOM-050-SCFI-2004'] } });
  const r = evaluate(s, DEFAULT_WEIGHTS);
  assert(r.banderas.includes('EMBARGO'), 'NOMs sin evidencia: bandera EMBARGO');
}

// ── 7. Cuota activa: expone + activa el ítem de escudo LCE 66 ──
{
  const s = base({ verificado: { cuotaActiva: { tasa: '25 %', pais: 'CN' } } });
  const r = evaluate(s, DEFAULT_WEIGHTS);
  const f3 = r.factores.find(f => f.factor === 'CUOTAS')!;
  assert(f3.puntos >= 8, `cuota activa: ≥8 pts en CUOTAS (dio ${f3.puntos})`);
  const origen = r.checklist.find(c => c.id === 'ESC-ORIGEN')!;
  assert(origen.aplicable, 'cuota activa: ítem LCE 66 se vuelve aplicable');
}

// ── 8. Agencia: ítems 235-F/235-J entran al denominador ──
{
  const agente = evaluate(todoBien, DEFAULT_WEIGHTS);
  const agencia = evaluate({ ...todoBien, tipoSujeto: 'agencia' }, DEFAULT_WEIGHTS);
  assert(agencia.escudoPct < 100, `agencia sin 235-F/J: escudo <100 (dio ${agencia.escudoPct})`);
  const conAgencia = evaluate({ ...todoBien, tipoSujeto: 'agencia', declarado: { ...todoBien.declarado, constancia32D: true, mveEspejoAgencia: true } }, DEFAULT_WEIGHTS);
  assert(conAgencia.escudoPct === 100, `agencia completa: escudo 100 (dio ${conAgencia.escudoPct})`);
  assert(agente.escudoPct === 100, 'agente no paga los ítems de agencia');
}

// ── 9. Matriz de bandas completa (todas las celdas) ──
{
  const casos: [number, number, string[], string][] = [
    [10, 90, [], 'VERDE'], [10, 60, [], 'VERDE'], [10, 40, [], 'AMARILLO'],
    [45, 90, [], 'AMARILLO'], [45, 60, [], 'NARANJA'], [45, 30, [], 'ROJO'],
    [70, 90, [], 'NARANJA'], [70, 60, [], 'ROJO'], [70, 30, [], 'ROJO_CRITICO'],
    [10, 90, ['LISTADO_69B'], 'NARANJA'], [10, 30, ['LISTADO_69B'], 'ROJO_CRITICO'],
    [40, 55, ['EMBARGO'], 'ROJO'],
  ];
  for (const [e, esc, b, esperado] of casos) {
    const got = calcularBanda(e, esc, b);
    assert(got === esperado, `banda(${e},${esc},[${b}]) = ${esperado} (dio ${got})`);
  }
}

// ── 10. Determinismo: misma entrada → mismo resultado ──
{
  const a = JSON.stringify(evaluate(todoBien, DEFAULT_WEIGHTS));
  const b = JSON.stringify(evaluate(todoBien, DEFAULT_WEIGHTS));
  assert(a === b, 'determinista: dos corridas idénticas');
}

// ── 11. Pesos configurables cambian la exposición ──
{
  const s = base({ verificado: { en69B: { situacion: 'PRESUNTO', listaAl: '2026-07-01' }, lista69BDisponible: true } });
  // PRESUNTO (10) + KYC sin responder (8) = 18 bruto, bajo el peso 22
  const conDefault = evaluate(s, DEFAULT_WEIGHTS).factores.find(f => f.factor === 'PERFIL')!.puntos;
  const pesosAlt = { ...DEFAULT_WEIGHTS, PERFIL: 5, VALOR: 41 };
  const conAlt = evaluate(s, pesosAlt).factores.find(f => f.factor === 'PERFIL')!.puntos;
  assert(conDefault === 18 && conAlt === 5, `pesos configurables saturan distinto (${conDefault}/${conAlt})`);
}

console.log(`\nRISK SCORER TESTS: ${ok} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
