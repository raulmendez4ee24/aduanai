/**
 * Paridad Fase 4.1/4.2 — catálogos oficiales del Anexo 22 RGCE 2026.
 *
 * Ejecutar:  npx tsx src/tests/anexo22.test.ts
 *
 * Cotejo contra DOF 15-ene-2026 (Apéndices 1, 2 y 16), extraído 2026-07-02.
 * Determinista, sin BD ni LLM.
 */
import { strict as assert } from 'node:assert';
import { ADUANAS, LEGACY_CUSTOMS_ALIASES, normalizeCustomsCode, REGIMENES, CLAVES_PEDIMENTO } from '../lib/anexo22';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n     ${e instanceof Error ? e.message : e}`); }
}

console.log('\n== Anexo 22 — fuente única (Fase 4.1/4.2) ==');

test('clave 16 = Manzanillo (el bug del audit: ZLO decía "Zaragoza Coahuila")', () => {
  assert.equal(ADUANAS.find(a => a.clave === '16')?.denominacion, 'Manzanillo, Colima');
});

test('NINGUNA aduana etiquetada "Zaragoza" (Zaragoza real = sección de Cd. Juárez, no aduana)', () => {
  assert.equal(ADUANAS.some(a => /zaragoza/i.test(a.denominacion) && !/coahuila de zaragoza/i.test(a.denominacion)), false);
});

test('cotejo puntual vs Apéndice 1: 43=Veracruz, 40=Tijuana, 24=Nuevo Laredo, 51=Lázaro Cárdenas, 47=AICM', () => {
  const by = Object.fromEntries(ADUANAS.map(a => [a.clave, a.denominacion]));
  assert.match(by['43'], /^Veracruz/);
  assert.match(by['40'], /^Tijuana/);
  assert.match(by['24'], /^Nuevo Laredo/);
  assert.match(by['51'], /^Lázaro Cárdenas/);
  assert.match(by['47'], /Aeropuerto Internacional de la Ciudad de México/);
});

test('50 aduanas sección 0 del Apéndice 1 (conteo del extracto DOF 15-ene-2026)', () => {
  assert.equal(ADUANAS.length, 50);
  assert.equal(new Set(ADUANAS.map(a => a.clave)).size, 50); // claves únicas
});

test('alias legado: ZLO normaliza a 16 (Manzanillo), no a Zaragoza', () => {
  assert.equal(normalizeCustomsCode('ZLO'), '16');
  assert.equal(normalizeCustomsCode('zlo'), '16');
  assert.equal(normalizeCustomsCode('MAN'), '16');
  assert.equal(normalizeCustomsCode('16'), '16');
  assert.equal(Object.keys(LEGACY_CUSTOMS_ALIASES).length, 10); // los 10 códigos viejos de la UI
});

test('Apéndice 16: los 10 regímenes oficiales, sin inventados (IMM/EXT no existen)', () => {
  const claves = REGIMENES.map(r => r.clave).sort();
  assert.deepEqual(claves, ['DFI', 'ETE', 'ETR', 'EXD', 'IMD', 'ITE', 'ITR', 'RFE', 'RFS', 'TRA'].sort());
  assert.equal(claves.includes('IMM' as never), false);
  assert.equal(claves.includes('EXT' as never), false);
});

test('Apéndice 2: A4 es DEPÓSITO FISCAL (no "temporal IMMEX"); IN/AF/RT son las claves IMMEX', () => {
  const by = Object.fromEntries(CLAVES_PEDIMENTO.map(c => [c.clave, c]));
  assert.equal(by['A4'].regimen, 'DFI');
  assert.match(by['A4'].descripcion, /depósito fiscal/i);
  assert.equal(by['IN'].regimen, 'ITE');
  assert.equal(by['AF'].regimen, 'ITE');
  assert.match(by['R1'].descripcion, /Rectificación/);
  assert.match(by['A3'].descripcion, /Regularización/);
  // Todo régimen referenciado existe en Apéndice 16
  const regClaves = new Set(REGIMENES.map(r => r.clave));
  for (const c of CLAVES_PEDIMENTO) if (c.regimen) assert.ok(regClaves.has(c.regimen), `${c.clave}→${c.regimen}`);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
