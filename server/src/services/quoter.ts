import { prisma } from '../lib/prisma';
import { getExchangeRate } from './exchange-rate';

interface QuoteInput {
  fractionCode: string;
  customsValue: number;
  origin: string;
  incoterm: string;
  currency: string;
}

interface QuoteResult {
  fraction: string;
  customsValue: number;
  currency: string;
  origin: string;
  incoterm: string;
  exchangeRate: number;
  valueMXN: number;
  breakdown: {
    igi: { rate: number; amount: number };
    dta: { rate: number; amount: number };
    iva: { rate: number; amount: number };
    ieps: { rate: number; amount: number } | null;
    countervailingDuty: { rate: number; amount: number } | null;
    prevalidation: number;
  };
  totalTaxes: number;
  totalLandedCost: number;
  totalLandedCostUSD: number;
  preferential: {
    treaty: string;
    igi: number;
    savings: number;
  }[] | null;
}

export async function calculateQuote(input: QuoteInput): Promise<QuoteResult> {
  const { fractionCode, customsValue, origin, incoterm, currency } = input;

  // Buscar fracción en la DB
  const fraction = await prisma.fraction.findFirst({
    where: { code: fractionCode.replace(/\./g, '') },
  });

  // Tasas default si no encontramos la fracción
  const igiRate = fraction?.tariffNMF ?? 15;
  const iepsRate = fraction?.iepsRate ?? null;

  // Tipo de cambio real
  const currentRate = await getExchangeRate();
  const exchangeRate = currency === 'MXN' ? 1 : currentRate;
  const valueMXN = customsValue * exchangeRate;

  // Calcular impuestos
  const igi = valueMXN * (igiRate / 100);
  const dta = valueMXN * 0.008; // 0.8% DTA
  const baseIVA = valueMXN + igi + dta;
  const iva = baseIVA * 0.16; // 16% IVA
  const ieps = iepsRate ? baseIVA * (iepsRate / 100) : null;
  const prevalidation = 321; // Costo fijo de prevalidación en MXN

  const totalTaxes = igi + dta + iva + (ieps ?? 0) + prevalidation;
  const totalLandedCost = valueMXN + totalTaxes;

  // Preferencias arancelarias
  const preferential = getPreferentialRates(origin, igiRate);

  return {
    fraction: fractionCode,
    customsValue,
    currency,
    origin,
    incoterm,
    exchangeRate,
    valueMXN,
    breakdown: {
      igi: { rate: igiRate, amount: igi },
      dta: { rate: 0.8, amount: dta },
      iva: { rate: 16, amount: iva },
      ieps: iepsRate ? { rate: iepsRate, amount: ieps! } : null,
      countervailingDuty: null,
      prevalidation,
    },
    totalTaxes,
    totalLandedCost,
    totalLandedCostUSD: totalLandedCost / exchangeRate,
    preferential,
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
      const prefRate = 0; // Tasa preferencial (0% para la mayoría bajo tratado)
      const savings = (baseRate - prefRate) / 100;
      results.push({ treaty, igi: prefRate, savings });
    }
  }

  return results.length > 0 ? results : null;
}
