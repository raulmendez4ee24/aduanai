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

  const valueMXNRaw = valueUSD * exchangeRate;
  const igiRaw = valueMXNRaw * (igiPct / 100);
  const dtaRaw = valueMXNRaw * (dtaPct / 100);
  const cvRaw = valueMXNRaw * (cvPct / 100);
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

  // Compliance — cuota compensatoria + regulaciones aplicables al país
  const compliance = await lookupCompliance(fractionCode, origin);
  const cvPct = compliance.antidumping?.rate ?? 0;

  // Cálculo puro (incluye cuota compensatoria si aplica)
  const amounts = computeQuoteAmounts({
    valueUSD: customsValue,
    exchangeRate,
    rates: { igiPct: igiRate, iepsPct: iepsRate, countervailingPct: cvPct },
  });

  const totalWithDispatch = round2(amounts.totalLandedCost + PREVALIDATION_FEE_MXN);

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
      countervailingDuty: cvPct > 0
        ? { rate: cvPct, base: amounts.valueMXN, amount: amounts.countervailingDuty }
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
    alertas: compliance.alertas,
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
