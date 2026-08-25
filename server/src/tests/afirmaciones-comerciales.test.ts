/**
 * Guard anti-reincidencia de afirmaciones comerciales (misión honestidad,
 * 24-ago-2026). Corre como GATE en el Dockerfile: si una afirmación prohibida
 * (radiografía §11) reaparece en una superficie de cara al usuario fuera de
 * la lista blanca (que exige artefacto), el build FALLA.
 *
 * Ejecutar:  npx tsx src/tests/afirmaciones-comerciales.test.ts
 */
import { strict as assert } from 'node:assert';
import { barrerAfirmaciones, listarArchivos, LISTA_BLANCA, PATRONES_PROHIBIDOS } from '../lib/afirmaciones-guard';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nGuard de afirmaciones comerciales (§11)');

test(`el barrido cubre las superficies de usuario (piso contra scan mal configurado)`, () => {
  const files = listarArchivos();
  assert.ok(files.length > 80, `solo ${files.length} archivos — ¿cambió una raíz de SCAN_ROOTS?`);
  assert.ok(files.some(f => f.includes('client/src/pages')), 'faltan páginas del cliente');
  assert.ok(files.some(f => f.includes('server/src/services')), 'faltan services del servidor');
});

test('toda entrada de la lista blanca cita un artefacto no vacío', () => {
  for (const e of LISTA_BLANCA) {
    assert.ok(e.artefacto && e.artefacto.length > 20, `${e.file}::${e.patronId} sin artefacto`);
    assert.ok(PATRONES_PROHIBIDOS.some(p => p.id === e.patronId), `${e.patronId} no es un patrón conocido`);
  }
});

test('cero afirmaciones prohibidas fuera de la lista blanca', () => {
  const hallazgos = barrerAfirmaciones();
  assert.equal(
    hallazgos.length, 0,
    '\n' + hallazgos.map(h => `  ${h.file}:${h.linea} [${h.patronId}] "${h.fragmento}"`).join('\n') +
    '\n  → corrige el texto al lenguaje de la §11, o agrega excepción CON artefacto en afirmaciones-guard.ts',
  );
});

console.log(`\n${passed} passed, 0 failed\n`);
