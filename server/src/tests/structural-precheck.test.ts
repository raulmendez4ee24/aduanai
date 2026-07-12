/**
 * Tests del pre-check estructural material/tipo (Etapa 3) — puro, sin DB.
 *   npx tsx src/tests/structural-precheck.test.ts
 */
import { strict as assert } from 'node:assert';
import { computeStructuralFacts } from '../lib/structural-precheck';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

const cand = (code: string, description: string) => ({ code, codeFormatted: code, description });

test('acero: inoxidable CUMPLE "de acero inoxidable" y NO CUMPLE "sin alear"', () => {
  const r = computeStructuralFacts('Tornillo de acero inoxidable', [
    cand('A', 'Tornillos de acero inoxidable.'),
    cand('B', 'De acero sin alear.'),
  ]);
  assert.equal(r.verdicts.find(v => v.code === 'A')?.verdict, 'CUMPLE');
  assert.equal(r.verdicts.find(v => v.code === 'B')?.verdict, 'NO_CUMPLE');
});

test('acero: al carbono NO CUMPLE "de acero inoxidable"', () => {
  const r = computeStructuralFacts('Tornillo hexagonal de acero al carbono', [cand('A', 'De acero inoxidable.')]);
  assert.equal(r.verdicts[0]?.verdict, 'NO_CUMPLE');
});

test('fibra: algodón CUMPLE "de algodón" y NO CUMPLE "de fibras sintéticas"', () => {
  const r = computeStructuralFacts('Camiseta de algodón para hombre', [
    cand('A', 'De algodón.'),
    cand('B', 'De fibras sintéticas.'),
  ]);
  assert.equal(r.verdicts.find(v => v.code === 'A' && v.axis === 'fibra')?.verdict, 'CUMPLE');
  assert.equal(r.verdicts.find(v => v.code === 'B' && v.axis === 'fibra')?.verdict, 'NO_CUMPLE');
});

test('fibra: poliéster CUMPLE "de fibras sintéticas" (subsunción)', () => {
  const r = computeStructuralFacts('Vestido de poliéster para mujer', [cand('A', 'De fibras sintéticas.')]);
  assert.equal(r.verdicts.find(v => v.axis === 'fibra')?.verdict, 'CUMPLE');
});

test('mezcla de fibras (algodón + poliéster) → sin veredicto en el eje fibra', () => {
  const r = computeStructuralFacts('Playera 60% algodón 40% poliéster', [cand('A', 'De algodón.')]);
  assert.equal(r.verdicts.filter(v => v.axis === 'fibra').length, 0);
});

test('tejido: "de punto" NO CUMPLE candidata "excepto de punto" (negación)', () => {
  const r = computeStructuralFacts('Blusa de algodón, tejido de punto', [cand('A', 'Camisas de algodón, excepto de punto.')]);
  const tv = r.verdicts.find(v => v.axis === 'tejido');
  assert.equal(tv?.verdict, 'NO_CUMPLE');
  assert.equal(tv?.catalogValue, 'plano');
});

test('género: para hombre NO CUMPLE "para mujeres o niñas" y CUMPLE "para hombres o niños"', () => {
  const r = computeStructuralFacts('Pantalón de lana para hombre', [
    cand('A', 'Pantalones de lana, para mujeres o niñas.'),
    cand('B', 'Pantalones de lana, para hombres o niños.'),
  ]);
  assert.equal(r.verdicts.find(v => v.code === 'A' && v.axis === 'genero')?.verdict, 'NO_CUMPLE');
  assert.equal(r.verdicts.find(v => v.code === 'B' && v.axis === 'genero')?.verdict, 'CUMPLE');
});

test('tubo: "sin costura" NO CUMPLE candidata "Soldados…"', () => {
  const r = computeStructuralFacts('Tubo de acero sin costura para conducción', [cand('A', 'Soldados longitudinalmente con arco sumergido.')]);
  assert.equal(r.verdicts.find(v => v.axis === 'tubo')?.verdict, 'NO_CUMPLE');
});

test('cuero: piel genuina CUMPLE "cuero natural"', () => {
  const r = computeStructuralFacts('Zapato de vestir de piel genuina', [cand('A', 'Con la parte superior de cuero natural.')]);
  assert.equal(r.verdicts.find(v => v.axis === 'cuero')?.verdict, 'CUMPLE');
});

test('producto sin declaraciones estructurales → bloque null', () => {
  const r = computeStructuralFacts('Mouse inalámbrico óptico', [cand('A', 'De acero inoxidable.')]);
  assert.equal(r.block, null);
});

test('candidata sin criterio textual en el eje → sin veredicto para ella', () => {
  const r = computeStructuralFacts('Tornillo de acero inoxidable', [cand('A', 'Los demás.')]);
  assert.equal(r.verdicts.length, 0);
});

test('bloque refuerza la regla simétrica', () => {
  const r = computeStructuralFacts('Tornillo de acero inoxidable', [cand('A', 'De acero inoxidable.')]);
  assert.ok(r.block!.includes('Regla simétrica'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
