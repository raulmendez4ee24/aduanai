/**
 * Tests del cotizador.
 *
 * Ejecutar:  npx tsx src/tests/quoter.test.ts
 *
 * Caso del evaluador (regresión $321 MXN):
 *   - Valor aduanero: 25,000 USD
 *   - Tipo de cambio: 17.49
 *   - Fracción: 7318.15.01 (IGI 5%)
 *   - Total esperado: $536,628.18 MXN
 */

import { strict as assert } from 'node:assert';
import { computeQuoteAmounts } from '../services/quoter';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════');
console.log('  Quoter — Tests de precisión decimal');
console.log('═══════════════════════════════════════════════\n');

console.log('▸ Caso del evaluador (regresión $321 MXN)');

test('Valor aduanero 25,000 USD × TC 17.49 = $437,250 MXN', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.valueMXN, 437250.00, `valueMXN=${r.valueMXN}`);
});

test('IGI 5% sobre $437,250 = $21,862.50', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.igi, 21862.50, `igi=${r.igi}`);
});

test('DTA 0.8% sobre $437,250 = $3,498.00', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.dta, 3498.00, `dta=${r.dta}`);
});

test('Base IVA = 437,250 + 21,862.50 + 3,498 = $462,610.50', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.baseIVA, 462610.50, `baseIVA=${r.baseIVA}`);
});

test('IVA 16% sobre $462,610.50 = $74,017.68', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.iva, 74017.68, `iva=${r.iva}`);
});

test('Total landed cost = $536,628.18 (cálculo del evaluador, EXACTO al peso)', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  assert.equal(r.totalLandedCost, 536628.18, `totalLandedCost=${r.totalLandedCost}  (esperado 536628.18)`);
});

console.log('\n▸ Casos adicionales');

test('Sin IEPS: baseIVA = preIVABase', () => {
  const r = computeQuoteAmounts({
    valueUSD: 10000,
    exchangeRate: 18.00,
    rates: { igiPct: 10 },
  });
  assert.equal(r.ieps, 0);
  assert.equal(r.baseIVA, r.preIVABase);
});

test('Con IEPS 8%: IEPS se calcula sobre preIVABase y entra a base de IVA', () => {
  // valueMXN = 100,000; IGI 5% = 5,000; DTA 0.8% = 800
  // preIVA = 105,800; IEPS 8% = 8,464; baseIVA = 114,264; IVA 16% = 18,282.24
  const r = computeQuoteAmounts({
    valueUSD: 10000,
    exchangeRate: 10.00,
    rates: { igiPct: 5, iepsPct: 8 },
  });
  assert.equal(r.preIVABase, 105800.00, `preIVABase=${r.preIVABase}`);
  assert.equal(r.ieps, 8464.00, `ieps=${r.ieps}`);
  assert.equal(r.baseIVA, 114264.00, `baseIVA=${r.baseIVA}`);
  assert.equal(r.iva, 18282.24, `iva=${r.iva}`);
});

test('Cuota compensatoria entra al preIVABase', () => {
  // valueMXN = 100,000; IGI 0% = 0; DTA 0.8% = 800; CV 25% = 25,000
  // preIVA = 125,800; baseIVA = 125,800; IVA 16% = 20,128
  const r = computeQuoteAmounts({
    valueUSD: 10000,
    exchangeRate: 10.00,
    rates: { igiPct: 0, countervailingPct: 25 },
  });
  assert.equal(r.countervailingDuty, 25000.00, `cv=${r.countervailingDuty}`);
  assert.equal(r.preIVABase, 125800.00, `preIVABase=${r.preIVABase}`);
  assert.equal(r.iva, 20128.00, `iva=${r.iva}`);
});

test('Moneda MXN: exchangeRate=1, valueMXN=valueUSD', () => {
  const r = computeQuoteAmounts({
    valueUSD: 50000,
    exchangeRate: 1,
    rates: { igiPct: 10 },
  });
  assert.equal(r.valueMXN, 50000.00);
});

test('No hay drift por flotantes acumulados (suma de partes = total)', () => {
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17.49,
    rates: { igiPct: 5 },
  });
  const sum = r.valueMXN + r.igi + r.dta + r.iva + r.ieps + r.countervailingDuty;
  assert.equal(Math.round(sum * 100) / 100, r.totalLandedCost,
    `suma=${sum.toFixed(2)} vs totalLandedCost=${r.totalLandedCost}`);
});

console.log('\n═══════════════════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
