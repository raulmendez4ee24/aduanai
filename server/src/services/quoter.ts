import { prisma } from '../lib/prisma';
import { getExchangeRate } from './exchange-rate';
import { lookupCompliance, type AntidumpingMatch, type RegulationMatch } from './compliance-lookup';

// ──────────────────────────────────────────────────────────────────────────
// Pure quote calculation (testeable, sin DB ni red)
// ──────────────────────────────────────────────────────────────────────────

export interface QuoteRates {
  igiPct: number;             // % Impuesto General de Importación
  dtaPct?: number;            // % Derecho de Trámite Aduanero (default 0.8)
  ivaPct?: number;            // % IVA (default 16)
  iepsPct?: number;           // % IEPS si aplica
  countervailingPct?: number; // % Cuota compensatoria si aplica
  /** Override del cálculo de cuota compensatoria: si se pasa un monto
   * absoluto en MXN (típicamente para rateType specific_USD_kg o
   * specific_USD_unit ya convertido a MXN), se usa este valor en lugar
   * de countervailingPct. Forma parte de la base del IVA (Art. 27 LIVA). */
  countervailingAbsoluteMXN?: number;
}

export interface QuoteAmounts {
  valueUSD: number;
  exchangeRate: number;
  valueMXN: number;
  igi: number;
  dta: number;
  countervailingDuty: number;
  preIVABase: number;         // valueMXN + igi + dta + cuota comp (base para IEPS)
  ieps: number;
  baseIVA: number;            // preIVABase + IEPS  (Ley del IVA Art. 27 frac. I)
  iva: number;
  totalTaxes: number;         // suma de contribuciones (sin despacho)
  totalLandedCost: number;    // valueMXN + totalTaxes  ← match con cálculo a mano
}

/**
 * Redondea a 2 decimales (centavos) usando aritmética de enteros para
 * evitar artefactos de float (e.g. 25000 * 17.49 = 437249.99999999994).
 */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Cálculo puro del cotizador. Sin redondeos intermedios — cada
 * contribución se calcula con máxima precisión y SOLO se redondea
 * a 2 decimales al final, una sola vez por concepto.
 *
 * Fórmulas (Ley Aduanera + Ley del IVA Art. 27 fracc. I):
 *   valueMXN = valueUSD × tipo de cambio
 *   IGI      = valueMXN × igiPct
 *   DTA      = valueMXN × dtaPct
 *   cuotaC   = valueMXN × countervailingPct
 *   preIVA   = valueMXN + IGI + DTA + cuotaC
 *   IEPS     = preIVA × iepsPct
 *   baseIVA  = preIVA + IEPS
 *   IVA      = baseIVA × ivaPct
 *   total    = valueMXN + IGI + DTA + cuotaC + IEPS + IVA
 */
export function computeQuoteAmounts(args: {
  valueUSD: number;
  exchangeRate: number;       // 1 si la moneda es MXN
  rates: QuoteRates;
}): QuoteAmounts {
  const { valueUSD, exchangeRate } = args;
  const igiPct = args.rates.igiPct;
  const dtaPct = args.rates.dtaPct ?? 0.8;
  const ivaPct = args.rates.ivaPct ?? 16;
  const iepsPct = args.rates.iepsPct ?? 0;
  const cvPct = args.rates.countervailingPct ?? 0;
  const cvAbsolute = args.rates.countervailingAbsoluteMXN;

  const valueMXNRaw = valueUSD * exchangeRate;
  const igiRaw = valueMXNRaw * (igiPct / 100);
  const dtaRaw = valueMXNRaw * (dtaPct / 100);
  const cvRaw = cvAbsolute != null && cvAbsolute > 0
    ? cvAbsolute
    : valueMXNRaw * (cvPct / 100);
  const preIVARaw = valueMXNRaw + igiRaw + dtaRaw + cvRaw;
  const iepsRaw = preIVARaw * (iepsPct / 100);
  const baseIVARaw = preIVARaw + iepsRaw;
  const ivaRaw = baseIVARaw * (ivaPct / 100);

  const totalTaxesRaw = igiRaw + dtaRaw + cvRaw + iepsRaw + ivaRaw;
  const totalLandedCostRaw = valueMXNRaw + totalTaxesRaw;

  return {
    valueUSD,
    exchangeRate,
    valueMXN: round2(valueMXNRaw),
    igi: round2(igiRaw),
    dta: round2(dtaRaw),
    countervailingDuty: round2(cvRaw),
    preIVABase: round2(preIVARaw),
    ieps: round2(iepsRaw),
    baseIVA: round2(baseIVARaw),
    iva: round2(ivaRaw),
    totalTaxes: round2(totalTaxesRaw),
    totalLandedCost: round2(totalLandedCostRaw),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Resolución de cuota compensatoria por rateType — helper compartido
// ──────────────────────────────────────────────────────────────────────────

export interface ResolveCuotaInput {
  antidumping: AntidumpingMatch | null;
  /** Unidades declaradas — usado para specific_USD_unit y como fallback de
   * peso para specific_USD_kg cuando `unit` contiene "kg". */
  quantity?: number;
  /** Peso bruto en kg — preferido para specific_USD_kg. */
  weightKg?: number;
  /** Unidad declarada — habilita fallback kg ↔ quantity. */
  unit?: string;
  /** Tipo de cambio MXN/USD para convertir cuotas USD a MXN. */
  effectiveRate: number;
}

export interface ResolveCuotaResult {
  cvPct: number;
  cvAbsoluteMXN: number;
  cvCalculationLabel: string | null;
  /** Cuota específica con datos insuficientes — la cotización NO debe
   * declararse así, el caller debe surfacear una alerta bloqueante. */
  cvNeedsWeight: boolean;
}

/**
 * Bug fiscal histórico (RES-29/2024, $2.07 USD/kg): tratar el rate USD/kg
 * como porcentaje produce cuotas miles de veces menores a las reales y
 * expone a multa 130-150% Art. 178 LA. Este helper es la única fuente
 * de verdad para el branching — single-item y multi-partida pasan por él.
 */
export function resolveCuotaCompensatoria(input: ResolveCuotaInput): ResolveCuotaResult {
  const { antidumping: ad, quantity, weightKg, unit, effectiveRate } = input;

  if (!ad) {
    return { cvPct: 0, cvAbsoluteMXN: 0, cvCalculationLabel: null, cvNeedsWeight: false };
  }

  if (ad.rateType === 'percentage') {
    return {
      cvPct: ad.rate,
      cvAbsoluteMXN: 0,
      cvCalculationLabel: `${ad.rate}% sobre valor en aduana`,
      cvNeedsWeight: false,
    };
  }

  if (ad.rateType === 'specific_USD_kg') {
    const unitLooksLikeKg = !!unit && /kg|kilo/i.test(unit);
    const effectiveWeightKg = weightKg ?? (unitLooksLikeKg ? quantity : undefined);
    if (effectiveWeightKg != null && effectiveWeightKg > 0) {
      const cvUSD = effectiveWeightKg * ad.rate;
      return {
        cvPct: 0,
        cvAbsoluteMXN: round2(cvUSD * effectiveRate),
        cvCalculationLabel: `$${ad.rate} USD/kg × ${effectiveWeightKg} kg = $${cvUSD.toFixed(2)} USD`,
        cvNeedsWeight: false,
      };
    }
    return {
      cvPct: 0,
      cvAbsoluteMXN: 0,
      cvCalculationLabel: `$${ad.rate} USD/kg — declara weightKg para cálculo exacto`,
      cvNeedsWeight: true,
    };
  }

  if (ad.rateType === 'specific_USD_unit') {
    if (quantity != null && quantity > 0) {
      const cvUSD = quantity * ad.rate;
      return {
        cvPct: 0,
        cvAbsoluteMXN: round2(cvUSD * effectiveRate),
        cvCalculationLabel: `$${ad.rate} ${ad.rateUnit} × ${quantity} = $${cvUSD.toFixed(2)} USD`,
        cvNeedsWeight: false,
      };
    }
    return {
      cvPct: 0,
      cvAbsoluteMXN: 0,
      cvCalculationLabel: `$${ad.rate} ${ad.rateUnit} — declara quantity de unidades`,
      cvNeedsWeight: true,
    };
  }

  return { cvPct: 0, cvAbsoluteMXN: 0, cvCalculationLabel: null, cvNeedsWeight: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Wrapper async — orquesta DB (fracción) + servicio de tipo de cambio
// ──────────────────────────────────────────────────────────────────────────

interface QuoteInput {
  fractionCode: string;
  customsValue: number;
  origin: string;
  incoterm: string;
  currency: string;
  /** Override opcional para testing o para cotizar con un TC histórico */
  exchangeRate?: number;
  /** Override opcional de IGI cuando no se confía en la fracción de la DB */
  igiRateOverride?: number;
  /** Unidades declaradas — necesario si la fracción tiene cuota
   * compensatoria tipo specific_USD_unit o como fallback de peso para
   * specific_USD_kg cuando `unit` contiene "kg". */
  quantity?: number;
  /** Peso bruto en kg — necesario si la fracción tiene cuota
   * compensatoria tipo specific_USD_kg (ej. RES-29/2024 $2.07 USD/kg). */
  weightKg?: number;
  /** Unidad declarada (kg, piezas, litro…) — habilita fallback kg ↔ quantity. */
  unit?: string;
}

interface QuoteResult {
  fraction: string;
  customsValue: number;
  currency: string;
  origin: string;
  incoterm: string;
  exchangeRate: number;
  exchangeRateDate: string;
  valueMXN: number;
  breakdown: {
    igi: { rate: number; base: number; amount: number };
    dta: { rate: number; base: number; amount: number };
    countervailingDuty: { rate: number; base: number; amount: number } | null;
    ieps: { rate: number; base: number; amount: number } | null;
    iva: { rate: number; base: number; amount: number };
    preIVABase: number;
    prevalidation: number;       // costo de despacho aduanero (NO se incluye en total)
  };
  totalTaxes: number;            // contribuciones únicamente
  totalLandedCost: number;       // valueMXN + totalTaxes (match Ley Aduanera)
  totalWithDispatch: number;     // landed + despacho (referencia)
  totalLandedCostUSD: number;
  preferential: {
    treaty: string;
    igi: number;
    savings: number;
  }[] | null;
  // Compliance — cuotas compensatorias + regulaciones aplicables
  compensatorias: AntidumpingMatch | null;
  regulaciones: RegulationMatch[];
  alertas: string[];
}

const PREVALIDATION_FEE_MXN = 321;

export async function calculateQuote(input: QuoteInput): Promise<QuoteResult> {
  const { fractionCode, customsValue, origin, incoterm, currency } = input;

  // Buscar fracción en la DB
  const fraction = await prisma.fraction.findFirst({
    where: { code: fractionCode.replace(/\./g, '') },
  });

  // Tasas — fracción de la DB con fallback a 15% (NMF default)
  const igiRate = input.igiRateOverride ?? fraction?.tariffNMF ?? 15;
  const iepsRate = fraction?.iepsRate ?? 0;

  // Tipo de cambio
  const fetchedRate = await getExchangeRate();
  const exchangeRate = input.exchangeRate
    ?? (currency === 'MXN' ? 1 : fetchedRate);
  const exchangeRateDate = new Date().toISOString();

  // Compliance — cuota compensatoria + regulaciones aplicables al país.
  // lookupCompliance falla cerrado: si el DB no responde, lanza error en
  // lugar de devolver null silenciosamente. La ruta debe devolver 5xx.
  const compliance = await lookupCompliance(fractionCode, origin);

  // Branching por rateType — fix CRITICAL del bug que trataba $X USD/kg
  // como X% sobre valor en aduana. Helper compartido con quoter-multi.
  const cuota = resolveCuotaCompensatoria({
    antidumping: compliance.antidumping,
    quantity: input.quantity,
    weightKg: input.weightKg,
    unit: input.unit,
    effectiveRate: exchangeRate,
  });

  // Cálculo puro (incluye cuota compensatoria si aplica)
  const amounts = computeQuoteAmounts({
    valueUSD: customsValue,
    exchangeRate,
    rates: {
      igiPct: igiRate,
      iepsPct: iepsRate,
      countervailingPct: cuota.cvPct,
      countervailingAbsoluteMXN: cuota.cvAbsoluteMXN > 0 ? cuota.cvAbsoluteMXN : undefined,
    },
  });

  const totalWithDispatch = round2(amounts.totalLandedCost + PREVALIDATION_FEE_MXN);

  const alertas = [...compliance.alertas];
  if (cuota.cvNeedsWeight && compliance.antidumping) {
    const ad = compliance.antidumping;
    const dataLabel = ad.rateType === 'specific_USD_kg' ? 'weightKg (peso bruto en kg)' : 'quantity (unidades)';
    alertas.push(
      `🚨 CÁLCULO INCOMPLETO: cuota ${ad.rateType} aplicable (${cuota.cvCalculationLabel ?? ''}) — declara ${dataLabel} antes de presentar pedimento. Declarar con cuota=0 expone a multa 130-150% Art. 178 LA.`,
    );
  }

  return {
    fraction: fractionCode,
    customsValue,
    currency,
    origin,
    incoterm,
    exchangeRate,
    exchangeRateDate,
    valueMXN: amounts.valueMXN,
    breakdown: {
      igi: { rate: igiRate, base: amounts.valueMXN, amount: amounts.igi },
      dta: { rate: 0.8, base: amounts.valueMXN, amount: amounts.dta },
      countervailingDuty: amounts.countervailingDuty > 0
        ? { rate: compliance.antidumping?.rate ?? cuota.cvPct, base: amounts.valueMXN, amount: amounts.countervailingDuty }
        : null,
      ieps: iepsRate > 0
        ? { rate: iepsRate, base: amounts.preIVABase, amount: amounts.ieps }
        : null,
      iva: { rate: 16, base: amounts.baseIVA, amount: amounts.iva },
      preIVABase: amounts.preIVABase,
      prevalidation: PREVALIDATION_FEE_MXN,
    },
    totalTaxes: amounts.totalTaxes,
    totalLandedCost: amounts.totalLandedCost,
    totalWithDispatch,
    totalLandedCostUSD: round2(amounts.totalLandedCost / exchangeRate),
    preferential: getPreferentialRates(origin, igiRate),
    compensatorias: compliance.antidumping,
    regulaciones: compliance.regulations,
    alertas,
  };
}

function getPreferentialRates(origin: string, baseRate: number) {
  const treaties: Record<string, string[]> = {
    'TMEC': ['US', 'USA', 'ESTADOS UNIDOS', 'CA', 'CAN', 'CANADA', 'CANADÁ'],
    'TLCUE': ['DE', 'FR', 'IT', 'ES', 'ALEMANIA', 'FRANCIA', 'ITALIA', 'ESPAÑA'],
    'CPTPP': ['JP', 'JAPÓN', 'JAPON', 'AU', 'AUSTRALIA', 'VN', 'VIETNAM'],
  };

  const originUpper = origin.toUpperCase();
  const results: { treaty: string; igi: number; savings: number }[] = [];

  for (const [treaty, countries] of Object.entries(treaties)) {
    if (countries.some(c => originUpper.includes(c))) {
      const prefRate = 0;
      const savings = (baseRate - prefRate) / 100;
      results.push({ treaty, igi: prefRate, savings });
    }
  }

  return results.length > 0 ? results : null;
}
