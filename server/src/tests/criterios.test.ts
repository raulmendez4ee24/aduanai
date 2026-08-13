/**
 * Criterios normativos visibles en producto — el panel "regulación en vivo"
 * DEBE leer los mismos objetos que consume el motor (vigencias.ts).
 * Ejecutar: npm run test:criterios
 */
import { strict as assert } from 'node:assert';
import { listaCriterios } from '../services/risk-scorer/criterios';
import { PRORROGA_E2 } from '../services/risk-scorer/vigencias';
import { RULES_VERSION } from '../services/risk-scorer/rules';

const r = listaCriterios();
assert.equal(r.rulesVersion, RULES_VERSION);

const mve = r.criterios.find(c => c.id === 'PRORROGA_MVE_E2');
assert.ok(mve, 'Falta el criterio PRORROGA_MVE_E2');
assert.equal(mve.vigenciaHasta, PRORROGA_E2.prorrogaHasta);
assert.equal(mve.estado, PRORROGA_E2.estado);
assert.equal(mve.dofFecha, PRORROGA_E2.dofFecha);
assert.equal(mve.urlOficial, PRORROGA_E2.urlOficial);
assert.equal(mve.fechaCotejo, PRORROGA_E2.fechaCotejo);
assert.ok(mve.detalle.includes(PRORROGA_E2.prorrogaHasta), 'El detalle debe citar la fecha de la vigencia');
console.log('  ✓ criterios espeja vigencias.ts (fuente única) — OK');
