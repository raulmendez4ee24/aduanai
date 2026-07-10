/**
 * Tests del cotizador.
 *
 * Ejecutar:  npx tsx src/tests/quoter.test.ts
 *
 * Caso del evaluador (regresión $321 MXN):
 *   - Valor aduanero: 25,000 USD
 *   - Tipo de cambio: 17.49
 *   - Fracción: 7318.15.99 (IGI 5%)
 *   - Total esperado: $536,628.18 MXN
 */

import { strict as assert } from 'node:assert';
import {
  computeQuoteAmounts,
  getPreferentialRates,
  requireQuotableFraction,
  resolveCuotaCompensatoria,
} from '../services/quoter';
import type { AntidumpingMatch } from '../services/compliance-lookup';

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

// ──────────────────────────────────────────────────────────────────────────
// Cuotas compensatorias por rateType — fix CRITICAL del bug RES-29/2024
// que trataba $X USD/kg como X% sobre valor en aduana y casi causa demanda.
// ──────────────────────────────────────────────────────────────────────────

console.log('\n▸ Cuotas compensatorias — branching por rateType (helper)');

function mkAd(
  rateType: AntidumpingMatch['rateType'],
  rate: number,
  rateUnit = '%',
): AntidumpingMatch {
  return {
    rate, rateType, rateUnit,
    resolutionType: 'final',
    resolutionNumber: 'TEST-001',
    expedienteUPCI: null,
    productDesc: null,
    type: 'final',
    decree: null,
    dofUrl: null,
    country: 'China',
    countryNormalized: 'CN',
    publishDate: null,
    effectiveDate: null,
    expiryDate: null,
    notes: null,
  };
}

test('rateType=percentage: cvPct=rate, cvAbsoluteMXN=0', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('percentage', 25, '%'),
    effectiveRate: 17,
  });
  assert.equal(r.cvPct, 25);
  assert.equal(r.cvAbsoluteMXN, 0);
  assert.equal(r.cvNeedsWeight, false);
});

test('REGRESIÓN bug: rateType=specific_USD_kg con $2.07 NO se aplica como 2.07%', () => {
  // Caso del incidente: weightKg=1500, rate=$2.07/kg, TC=17 → $52,785 MXN
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_kg', 2.07, 'USD/kg'),
    weightKg: 1500,
    effectiveRate: 17,
  });
  assert.equal(r.cvPct, 0, 'cvPct DEBE ser 0 — el rate 2.07 USD/kg NO es 2.07%');
  assert.equal(r.cvAbsoluteMXN, 52785.00, 'cvAbsoluteMXN = 1500 × 2.07 × 17 = 52,785');
  assert.equal(r.cvNeedsWeight, false);
});

test('specific_USD_kg sin weightKg y unit no es kg → needsWeight=true (bloqueante)', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_kg', 2.07, 'USD/kg'),
    quantity: 500,
    unit: 'piezas',
    effectiveRate: 17,
  });
  assert.equal(r.cvAbsoluteMXN, 0);
  assert.equal(r.cvNeedsWeight, true,
    'Sin peso explícito y unidad ≠ kg, NO debe calcular un monto inventado');
});

test('specific_USD_kg sin weightKg pero unit=kg usa quantity como fallback', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_kg', 2.07, 'USD/kg'),
    quantity: 1500,
    unit: 'kg',
    effectiveRate: 17,
  });
  assert.equal(r.cvAbsoluteMXN, 52785.00);
  assert.equal(r.cvNeedsWeight, false);
});

test('weightKg=0 NO produce cv=0 silencioso — bloquea con needsWeight=true', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_kg', 2.07, 'USD/kg'),
    weightKg: 0,
    effectiveRate: 17,
  });
  assert.equal(r.cvAbsoluteMXN, 0);
  assert.equal(r.cvNeedsWeight, true);
});

test('specific_USD_unit con quantity=200, rate=$5.50/unit, TC 17 → $18,700 MXN', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_unit', 5.50, 'USD/unit'),
    quantity: 200,
    effectiveRate: 17,
  });
  assert.equal(r.cvPct, 0);
  assert.equal(r.cvAbsoluteMXN, 18700.00);
  assert.equal(r.cvNeedsWeight, false);
});

test('specific_USD_unit sin quantity → needsWeight=true', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_unit', 5.50, 'USD/unit'),
    effectiveRate: 17,
  });
  assert.equal(r.cvAbsoluteMXN, 0);
  assert.equal(r.cvNeedsWeight, true);
});

test('antidumping=null → todo cero, sin warnings (operación limpia)', () => {
  const r = resolveCuotaCompensatoria({
    antidumping: null,
    effectiveRate: 17,
  });
  assert.equal(r.cvPct, 0);
  assert.equal(r.cvAbsoluteMXN, 0);
  assert.equal(r.cvNeedsWeight, false);
  assert.equal(r.cvCalculationLabel, null);
});

console.log('\n▸ Integración cuota específica → computeQuoteAmounts');

test('countervailingAbsoluteMXN se incorpora al preIVABase (Art. 27 LIVA)', () => {
  // valueMXN=100,000; IGI 0%; DTA 0.8% = 800; cvAbsolute=52,785
  // preIVA = 100,000 + 0 + 800 + 52,785 = 153,585
  // IVA 16% = 24,573.60
  const r = computeQuoteAmounts({
    valueUSD: 10000,
    exchangeRate: 10,
    rates: { igiPct: 0, countervailingAbsoluteMXN: 52785 },
  });
  assert.equal(r.countervailingDuty, 52785.00);
  assert.equal(r.preIVABase, 153585.00);
  assert.equal(r.iva, 24573.60);
});

test('countervailingAbsoluteMXN gana sobre countervailingPct si ambos vienen', () => {
  const r = computeQuoteAmounts({
    valueUSD: 10000,
    exchangeRate: 10,
    rates: { igiPct: 0, countervailingPct: 99, countervailingAbsoluteMXN: 12345 },
  });
  assert.equal(r.countervailingDuty, 12345.00,
    'cvAbsoluteMXN debe prevalecer — protege contra pasarse ambos por error');
});

test('End-to-end del incidente: $25,000 USD + 1500 kg + $2.07 USD/kg + TC 17', () => {
  // Bug original aplicaba: valueMXN=425,000 × 2.07% = $8,797.50 (off por 6×)
  // Fix correcto: cvAbsoluteMXN = 1500 × 2.07 × 17 = $52,785
  const cuota = resolveCuotaCompensatoria({
    antidumping: mkAd('specific_USD_kg', 2.07, 'USD/kg'),
    weightKg: 1500,
    effectiveRate: 17,
  });
  const r = computeQuoteAmounts({
    valueUSD: 25000,
    exchangeRate: 17,
    rates: {
      igiPct: 5,
      countervailingPct: cuota.cvPct,
      countervailingAbsoluteMXN: cuota.cvAbsoluteMXN,
    },
  });
  assert.equal(r.countervailingDuty, 52785.00);
  // valueMXN = 425,000; IGI 5% = 21,250; DTA 0.8% = 3,400; cv = 52,785
  // preIVA = 425,000 + 21,250 + 3,400 + 52,785 = 502,435
  // IVA 16% = 80,389.60; total = 502,435 + 80,389.60 = 582,824.60
  assert.equal(r.preIVABase, 502435.00);
  assert.equal(r.iva, 80389.60);
  assert.equal(r.totalLandedCost, 582824.60);
});

console.log('\n▸ Candados fail-closed — fracción y preferenciales');

test('Fracción inexistente rechaza la cotización con error explícito', () => {
  assert.throws(
    () => requireQuotableFraction(null),
    (err: unknown) => err instanceof Error
      && err.message === 'Fracción no encontrada, no se puede cotizar'
      && 'statusCode' in err
      && err.statusCode === 422,
  );
});

test('Fracción inactiva se trata como no encontrada', () => {
  assert.throws(
    () => requireQuotableFraction({ active: false, tariffNMF: 15 }),
    /Fracción no encontrada, no se puede cotizar/,
  );
});

test('Tasa NMF ausente rechaza en vez de inventar 15%', () => {
  assert.throws(
    () => requireQuotableFraction({ active: true, tariffNMF: null }),
    /Tasa NMF no disponible para la fracción, no se puede cotizar/,
  );
});

test('Override IGI explícito permite una fracción vigente sin NMF', () => {
  assert.doesNotThrow(() => requireQuotableFraction({ active: true, tariffNMF: null }, true));
});

test('Tratado sin tasa conserva NMF y expone aviso, no 0%', () => {
  const result = getPreferentialRates('US', 5, {
    tariffTMEC: null,
    tariffTLCUE: null,
    tariffCPTPP: null,
  });
  assert.equal(result?.[0]?.treaty, 'TMEC');
  assert.equal(result?.[0]?.igi, null);
  assert.equal(result?.[0]?.available, false);
  assert.equal(result?.[0]?.savings, 0);
  assert.match(result?.[0]?.note ?? '', /no disponible, se cotiza NMF 5%/);
});

test('Tasa preferencial literal 0% sí se conserva como dato disponible', () => {
  const result = getPreferentialRates('US', 5, {
    tariffTMEC: 0,
    tariffTLCUE: null,
    tariffCPTPP: null,
  });
  assert.equal(result?.[0]?.igi, 0);
  assert.equal(result?.[0]?.available, true);
  assert.equal(result?.[0]?.savings, 0.05);
});

test('Origen con substring engañoso no activa un tratado', () => {
  const result = getPreferentialRates('AUSTRIA', 5, {
    tariffTMEC: 0,
    tariffTLCUE: null,
    tariffCPTPP: null,
  });
  assert.equal(result, null);
});

console.log('\n═══════════════════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
