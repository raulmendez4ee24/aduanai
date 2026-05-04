/**
 * Cotizador multi-partida.
 *
 * Cada partida calcula sus contribuciones independientemente (Anexo 22),
 * y el quote total suma valor + impuestos + costos de despacho aduanero.
 *
 * Reusa `computeQuoteAmounts` para preservar la matemática validada
 * por el evaluador.
 */

import { prisma } from '../lib/prisma';
import { getExchangeRate, getHistoricalRate, getMonthlyAverageRate } from './exchange-rate';
import { computeQuoteAmounts } from './quoter';
import { lookupCompliance } from './compliance-lookup';

export interface MultiQuoteItemInput {
  fractionCode: string;
  description?: string;
  countryOfOrigin: string;
  quantity: number;
  unit?: string;
  unitValueUSD: number;
  freightUSD?: number;
  insuranceUSD?: number;
  /** Override de IGI por partida (si no se confía en la fracción de la DB) */
  igiRateOverride?: number;
}

export interface DispatchCosts {
  honorariosAgente?: number;
  prevalidacion?: number;
  almacenaje?: number;
  estiba?: number;
  fleteInterno?: number;
  otrosGastos?: { label: string; amount: number }[];
}

export interface MultiQuoteInput {
  name?: string;
  client?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  currency?: string;
  /** "current" | "average30" | ISO date */
  exchangeRateMode?: 'current' | 'average30' | string;
  /** Override directo del TC */
  exchangeRate?: number;
  items: MultiQuoteItemInput[];
  dispatch?: DispatchCosts;
}

export interface ItemBreakdown {
  numeroPartida: number;
  fractionCode: string;
  description: string | null;
  countryOfOrigin: string;
  quantity: number;
  unit: string | null;
  unitValueUSD: number;
  totalValueUSD: number;
  freightUSD: number;
  insuranceUSD: number;
  customsValueUSD: number;
  customsValueMXN: number;
  igiRate: number;
  dtaRate: number;
  ivaRate: number;
  iepsRate: number;
  countervailingRate: number;
  igi: number;
  dta: number;
  ieps: number;
  countervailing: number;
  iva: number;
  totalDuties: number;
  totalCost: number;
  hasAntidumping: boolean;
  antidumpingDecree: string | null;
  alertas: string[];
}

export interface MultiQuoteResult {
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateMode: string;
  items: ItemBreakdown[];
  dispatch: {
    honorariosAgente: number;
    prevalidacion: number;
    almacenaje: number;
    estiba: number;
    fleteInterno: number;
    otrosGastos: { label: string; amount: number }[];
    total: number;
  };
  totals: {
    valueMXN: number;
    igi: number;
    dta: number;
    ieps: number;
    countervailing: number;
    iva: number;
    totalDuties: number;
    totalLandedCost: number;        // valor + impuestos (sin despacho)
    totalDispatch: number;
    totalAll: number;               // landed + despacho
  };
  alertas: string[];                // alertas globales (deduplicadas)
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

async function resolveExchangeRate(input: MultiQuoteInput): Promise<{ rate: number; date: Date; mode: string }> {
  if (input.exchangeRate != null) {
    return { rate: input.exchangeRate, date: new Date(), mode: 'override' };
  }
  const mode = input.exchangeRateMode ?? 'current';
  if (mode === 'average30') {
    return { rate: await getMonthlyAverageRate(), date: new Date(), mode: 'average30' };
  }
  // ISO date string
  if (mode !== 'current') {
    const d = new Date(mode);
    if (!isNaN(d.getTime())) {
      return { rate: await getHistoricalRate(d), date: d, mode: `historical(${mode})` };
    }
  }
  return { rate: await getExchangeRate(), date: new Date(), mode: 'current' };
}

export async function calculateMultiQuote(input: MultiQuoteInput): Promise<MultiQuoteResult> {
  if (!input.items || input.items.length === 0) {
    throw new Error('Se requiere al menos una partida');
  }

  const { rate: exchangeRate, date: exchangeRateDate, mode: exchangeRateMode } = await resolveExchangeRate(input);
  const currency = input.currency ?? 'USD';
  const isMXN = currency === 'MXN';
  const effectiveRate = isMXN ? 1 : exchangeRate;

  const fractionCodes = Array.from(new Set(input.items.map(i => i.fractionCode.replace(/\./g, ''))));
  const fractions = await prisma.fraction.findMany({
    where: { code: { in: fractionCodes } },
  });
  const fractionByCode = new Map(fractions.map(f => [f.code, f]));

  const itemsBreakdown: ItemBreakdown[] = [];
  const globalAlertas: string[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const cleanFrac = it.fractionCode.replace(/\./g, '');
    const fraction = fractionByCode.get(cleanFrac);

    const totalValueUSD = round2(it.quantity * it.unitValueUSD);
    const freightUSD = it.freightUSD ?? 0;
    const insuranceUSD = it.insuranceUSD ?? 0;
    const customsValueUSD = round2(totalValueUSD + freightUSD + insuranceUSD);

    const igiRate = it.igiRateOverride ?? fraction?.tariffNMF ?? 15;
    const iepsRate = fraction?.iepsRate ?? 0;

    const compliance = await lookupCompliance(it.fractionCode, it.countryOfOrigin);
    const cvRate = compliance.antidumping?.rate ?? 0;

    const amounts = computeQuoteAmounts({
      valueUSD: customsValueUSD,
      exchangeRate: effectiveRate,
      rates: {
        igiPct: igiRate,
        iepsPct: iepsRate,
        countervailingPct: cvRate,
      },
    });

    itemsBreakdown.push({
      numeroPartida: i + 1,
      fractionCode: it.fractionCode,
      description: it.description ?? fraction?.description ?? null,
      countryOfOrigin: it.countryOfOrigin,
      quantity: it.quantity,
      unit: it.unit ?? fraction?.unit ?? null,
      unitValueUSD: it.unitValueUSD,
      totalValueUSD,
      freightUSD,
      insuranceUSD,
      customsValueUSD,
      customsValueMXN: amounts.valueMXN,
      igiRate,
      dtaRate: 0.8,
      ivaRate: 16,
      iepsRate,
      countervailingRate: cvRate,
      igi: amounts.igi,
      dta: amounts.dta,
      ieps: amounts.ieps,
      countervailing: amounts.countervailingDuty,
      iva: amounts.iva,
      totalDuties: round2(amounts.totalTaxes),
      totalCost: amounts.totalLandedCost,
      hasAntidumping: cvRate > 0,
      antidumpingDecree: compliance.antidumping?.decree ?? null,
      alertas: compliance.alertas,
    });

    for (const a of compliance.alertas) {
      if (!globalAlertas.includes(a)) globalAlertas.push(a);
    }
  }

  const dispatch = {
    honorariosAgente: round2(input.dispatch?.honorariosAgente ?? 0),
    prevalidacion: round2(input.dispatch?.prevalidacion ?? 321),
    almacenaje: round2(input.dispatch?.almacenaje ?? 0),
    estiba: round2(input.dispatch?.estiba ?? 0),
    fleteInterno: round2(input.dispatch?.fleteInterno ?? 0),
    otrosGastos: input.dispatch?.otrosGastos ?? [],
    total: 0,
  };
  dispatch.total = round2(
    dispatch.honorariosAgente + dispatch.prevalidacion + dispatch.almacenaje +
    dispatch.estiba + dispatch.fleteInterno +
    dispatch.otrosGastos.reduce((s, g) => s + g.amount, 0),
  );

  const totals = {
    valueMXN: round2(itemsBreakdown.reduce((s, i) => s + i.customsValueMXN, 0)),
    igi: round2(itemsBreakdown.reduce((s, i) => s + i.igi, 0)),
    dta: round2(itemsBreakdown.reduce((s, i) => s + i.dta, 0)),
    ieps: round2(itemsBreakdown.reduce((s, i) => s + i.ieps, 0)),
    countervailing: round2(itemsBreakdown.reduce((s, i) => s + i.countervailing, 0)),
    iva: round2(itemsBreakdown.reduce((s, i) => s + i.iva, 0)),
    totalDuties: 0,
    totalLandedCost: round2(itemsBreakdown.reduce((s, i) => s + i.totalCost, 0)),
    totalDispatch: dispatch.total,
    totalAll: 0,
  };
  totals.totalDuties = round2(totals.igi + totals.dta + totals.ieps + totals.countervailing + totals.iva);
  totals.totalAll = round2(totals.totalLandedCost + totals.totalDispatch);

  return {
    exchangeRate,
    exchangeRateDate: exchangeRateDate.toISOString(),
    exchangeRateMode,
    items: itemsBreakdown,
    dispatch,
    totals,
    alertas: globalAlertas,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Escenarios "what if" — variaciones sobre un quote base
// ──────────────────────────────────────────────────────────────────────────

export interface ScenarioVariant {
  name: string;
  /** Multiplicadores aplicados al quote base */
  freightMultiplier?: number;          // ej 1.10 = +10% flete
  weightMultiplier?: number;           // ej 1.20 = +20% cantidad/peso
  exchangeRateOverride?: number;       // TC fijo para este escenario
  /** Cambio de país (hace que se evalúe otra cuota compensatoria) */
  countryOverride?: string;
}

export interface ScenarioComparison {
  base: MultiQuoteResult;
  scenarios: { name: string; result: MultiQuoteResult; deltaMXN: number; deltaPct: number }[];
}

export async function compareScenarios(base: MultiQuoteInput, variants: ScenarioVariant[]): Promise<ScenarioComparison> {
  const baseResult = await calculateMultiQuote(base);
  const scenarios: ScenarioComparison['scenarios'] = [];

  for (const v of variants) {
    const variantInput: MultiQuoteInput = {
      ...base,
      exchangeRate: v.exchangeRateOverride ?? base.exchangeRate,
      items: base.items.map(it => ({
        ...it,
        quantity: it.quantity * (v.weightMultiplier ?? 1),
        freightUSD: (it.freightUSD ?? 0) * (v.freightMultiplier ?? 1),
        countryOfOrigin: v.countryOverride ?? it.countryOfOrigin,
      })),
    };
    const r = await calculateMultiQuote(variantInput);
    const delta = r.totals.totalAll - baseResult.totals.totalAll;
    scenarios.push({
      name: v.name,
      result: r,
      deltaMXN: round2(delta),
      deltaPct: baseResult.totals.totalAll > 0
        ? Math.round((delta / baseResult.totals.totalAll) * 1000) / 10
        : 0,
    });
  }

  return { base: baseResult, scenarios };
}
