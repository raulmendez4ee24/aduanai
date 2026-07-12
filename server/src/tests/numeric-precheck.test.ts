/**
 * Tests del pre-check numérico (Etapa 1) — puro, sin DB ni IA.
 *   npx tsx src/tests/numeric-precheck.test.ts
 */
import { strict as assert } from 'node:assert';
import { computeNumericFacts, extractProductMagnitudes } from '../lib/numeric-precheck';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

const cand = (code: string, description: string) => ({ code, codeFormatted: code, description });

// ── Diseño base ──

test('umbral simple mm: espesor 4 mm NO CUMPLE "inferior a 0.5 mm"', () => {
  const r = computeNumericFacts('Placa de acero de espesor 4 mm', [cand('72101204', 'De espesor inferior a 0.5 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'NO_CUMPLE');
  assert.ok(r.block!.includes('NO CUMPLE'));
});

test('rango compuesto: 20 mm cumple "superior a 16 mm pero inferior o igual a 35 mm"', () => {
  const r = computeNumericFacts('Película de anchura 20 mm', [cand('37025401', 'De anchura superior a 16 mm pero inferior o igual a 35 mm.')]);
  const v = r.verdicts.filter(x => x.code === '37025401');
  assert.equal(v.length, 2);
  assert.ok(v.every(x => x.verdict === 'CUMPLE'));
});

test('ton→kg: peso 3 toneladas = 3,000 kg CUMPLE "≤ 7,000 kg"', () => {
  const r = computeNumericFacts('Camión de peso total con carga de 3 toneladas', [cand('87042199', 'De peso total con carga máxima inferior o igual a 7,000 kg.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
  assert.ok(r.verdicts[0]!.fact.includes('3,000'));
});

test('falla-cerrado: capacidad (carga útil) NO se empareja con peso total', () => {
  const r = computeNumericFacts('Camión con capacidad de carga de 3 toneladas', [cand('87042199', 'De peso total con carga máxima inferior o igual a 7,000 kg.')]);
  assert.equal(r.verdicts.length, 0); // carga útil ≠ peso bruto: sin veredicto es lo correcto
});

test('pulgadas decimales: diámetro 0.5 pulgadas = 12.7 mm NO CUMPLE "inferior a 6.4 mm"', () => {
  const r = computeNumericFacts('Tubo de diámetro 0.5 pulgadas', [cand('73181504', 'Con diámetro inferior a 6.4 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'NO_CUMPLE');
});

test('AWG→mm: cable AWG 12 (2.05 mm) CUMPLE "diámetro inferior o igual a 2.6 mm"', () => {
  const r = computeNumericFacts('Cable de cobre AWG 12', [cand('85444901', 'Con diámetro inferior o igual a 2.6 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
});

test('banda de guarda: 10 HP = 7.457 kW vs umbral 7.46 kW → sin veredicto', () => {
  const r = computeNumericFacts('Motor de 10 HP', [cand('85011099', 'De potencia inferior o igual a 7.46 kW.')]);
  assert.equal(r.verdicts.length, 0);
});

test('atributo ambiguo entre candidatas: "3 mm" suelto → sin veredicto', () => {
  const r = computeNumericFacts('Placa metálica de 3 mm', [
    cand('A', 'De espesor inferior a 5 mm.'),
    cand('B', 'De anchura superior a 600 mm.'),
  ]);
  assert.equal(r.verdicts.length, 0);
});

test('umbral no soportado (grados GL) → sin veredicto', () => {
  const r = computeNumericFacts('Brandy con graduación de 40 grados', [cand('22082002', 'Cuya graduación alcohólica sea superior o igual a 37.5 grados centesimales Gay-Lussac.')]);
  assert.equal(r.verdicts.length, 0);
});

test('miles con coma: peso 8,000 kg CUMPLE "superior a 7,000 kg"', () => {
  const r = computeNumericFacts('Bobina de peso 8,000 kg', [cand('X', 'De peso superior a 7,000 kg.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
});

test('%-en-peso con sujeto pareado: 1% de grasa CUMPLE "contenido de grasa ≤ 1%"', () => {
  const r = computeNumericFacts('Leche con 1% de grasa', [cand('04011002', 'Con un contenido de grasa inferior o igual al 1%.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE'); // igualdad exacta en ≤ resuelve
});

test('%-en-peso sin sujeto pareado → sin veredicto', () => {
  const r = computeNumericFacts('Prenda con 60% algodon', [cand('17023001', 'Con un contenido de fructosa inferior al 20%.')]);
  assert.equal(r.verdicts.length, 0);
});

test('producto sin magnitudes → bloque null (prompt idéntico)', () => {
  const r = computeNumericFacts('Camiseta de algodón para hombre', [cand('61091001', 'De algodón.')]);
  assert.equal(r.block, null);
});

test('igualdad exacta en ≤: capacidad 2 litros CUMPLE "inferior o igual a 2 l"', () => {
  const r = computeNumericFacts('Vino en recipiente con capacidad de 2 litros', [cand('22042104', 'En recipientes con capacidad inferior o igual a 2 l.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
});

// ── Adiciones mandatadas (tornillería / designación métrica) ──

test('M8x25 con contexto tornillo: diámetro 8 mm NO CUMPLE "inferior a 6.4 mm"', () => {
  const r = computeNumericFacts('Tornillo hexagonal M8x25 acero al carbono', [cand('73181504', 'Con diámetro inferior a 6.4 mm.')]);
  const diam = r.verdicts.filter(v => v.constraintRaw.includes('6.4'));
  assert.equal(diam.length, 1);
  assert.equal(diam[0]!.verdict, 'NO_CUMPLE');
});

test('M10x50: extrae diámetro 10 mm y longitud 50 mm', () => {
  const mags = extractProductMagnitudes('Tornillo inoxidable M10x50');
  const d = mags.find(m => m.attribute === 'diametro');
  const l = mags.find(m => m.attribute === 'longitud');
  assert.equal(d?.value, 10);
  assert.equal(l?.value, 50);
});

test('Tuerca M12: extrae diámetro nominal 12 mm', () => {
  const mags = extractProductMagnitudes('Tuerca hexagonal M12 galvanizada');
  assert.equal(mags.find(m => m.attribute === 'diametro')?.value, 12);
});

test('M8 SIN contexto de sujetador → no se extrae designación', () => {
  const mags = extractProductMagnitudes('Pieza de repuesto M8 para maquinaria');
  assert.equal(mags.length, 0);
});

// Comportamiento documentado del caso 1/4" (mandato: verificar y documentar):
// 1/4" = 6.35 mm exactos; margen relativo vs 6.4 mm = 0.78% > banda de guarda
// (0.5%) → SÍ se emite veredicto y es CUMPLE (6.35 < 6.4 estrictamente). El
// catálogo usa 6.4 mm justamente como equivalente métrico redondeado de 1/4",
// así que el veredicto coincide con la intención de la nomenclatura.
test('tornillo de 1/4" → 6.35 mm, fuera de banda de guarda, CUMPLE "< 6.4 mm"', () => {
  const r = computeNumericFacts('Tornillo de 1/4" de acero', [cand('73181504', 'Con diámetro inferior a 6.4 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
  assert.ok(r.verdicts[0]!.fact.includes('6.35'));
});

test('4mm × 30mm CON contexto tornillo → diámetro 4 CUMPLE y longitud emparejable', () => {
  const r = computeNumericFacts('Tornillo de 4mm × 30mm', [cand('73181504', 'Con diámetro inferior a 6.4 mm.')]);
  const diam = r.verdicts.filter(v => v.verdict === 'CUMPLE' && v.fact.includes('4 mm'));
  assert.equal(diam.length, 1);
});

test('4mm × 30mm SIN contexto de sujetador → sin veredicto', () => {
  const r = computeNumericFacts('Pieza de 4mm × 30mm', [cand('73181504', 'Con diámetro inferior a 6.4 mm.')]);
  assert.equal(r.verdicts.length, 0);
});

test('sinónimos de atributo: "grosor 4 mm" empareja con "espesor inferior a 0.5 mm"', () => {
  const r = computeNumericFacts('Lámina de grosor 4 mm', [cand('72101204', 'De espesor inferior a 0.5 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'NO_CUMPLE');
});

test('calibre de lámina con contexto: calibre 22 = 0.759 mm CUMPLE "inferior a 0.9 mm"', () => {
  const r = computeNumericFacts('Lámina de acero calibre 22', [cand('72101299', 'De espesor inferior a 0.9 mm.')]);
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0]!.verdict, 'CUMPLE');
});

test('calibre SIN contexto de lámina → no se extrae', () => {
  const mags = extractProductMagnitudes('Producto calibre 22');
  assert.equal(mags.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
