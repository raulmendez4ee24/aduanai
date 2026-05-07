/**
 * Validación de precio declarado vs precio estimado SAT (Art. 84-A LA).
 *
 * Reglas:
 *   declarado / estimado < 0.80     → CRITICAL (requiere garantía)
 *   declarado / estimado < 0.95     → WARNING
 *   declarado / estimado ≥ 0.95     → OK
 *
 * Si requiere garantía, se calcula el monto aproximado:
 *   Diferencia en valor aduanero × (1 + igi% + iva% × (1 + igi%))
 *   = contribuciones diferenciales que correspondería pagar al precio estimado.
 */

import { prisma } from '../lib/prisma';
import { normalizeCountry } from './compliance-lookup';

export type PriceCheckSeverity = 'critical' | 'warning' | 'ok' | 'no_data';

export interface EstimatedPriceMatch {
  fractionCode: string;
  countryOfOrigin: string | null;
  estimatedValue: number;
  unit: string;
  decree: string | null;
  publishDate: string;
  effectiveDate: string;
  source: string;
  notes: string | null;
}

export interface PriceCheckResult {
  hasEstimatedPrice: boolean;
  estimated: EstimatedPriceMatch | null;
  declaredUnitValueUSD: number | null;
  ratio: number | null;            // declarado / estimado
  deltaPct: number | null;         // (estimado - declarado) / estimado en %
  severity: PriceCheckSeverity;
  message: string | null;
  guaranteeMXN: number | null;     // monto estimado de garantía si aplica
  action: string | null;
  disclaimer: string | null;
}

interface CheckPriceInput {
  fractionCode: string;
  countryOfOrigin?: string;
  /** Valor unitario declarado en USD (factura) */
  declaredUnitValueUSD: number;
  /** Cantidad — usado para calcular monto de garantía */
  quantity?: number;
  /** Tasa IGI aplicable a la fracción (en %) — para calcular contribuciones */
  igiRate?: number;
  /** Tipo de cambio aplicable */
  exchangeRate?: number;
}

const IVA_RATE = 16;
const DTA_RATE = 0.8;

export async function lookupEstimatedPrice(fractionCode: string, country?: string): Promise<EstimatedPriceMatch | null> {
  const cleanFraction = fractionCode.replace(/[^0-9]/g, '');
  if (cleanFraction.length !== 8) return null;
  const norm = country ? normalizeCountry(country) : null;

  // 1) Match exacto fracción + país
  if (norm) {
    const exact = await prisma.estimatedPrice.findFirst({
      where: { fractionCode: cleanFraction, countryOfOrigin: norm, active: true },
      orderBy: { effectiveDate: 'desc' },
    });
    if (exact) return formatMatch(exact);
  }

  // 2) Match solo por fracción (cualquier país)
  const generic = await prisma.estimatedPrice.findFirst({
    where: { fractionCode: cleanFraction, countryOfOrigin: null, active: true },
    orderBy: { effectiveDate: 'desc' },
  });
  if (generic) return formatMatch(generic);

  // 3) Cualquier match para esa fracción (último recurso, distinto país)
  const any = await prisma.estimatedPrice.findFirst({
    where: { fractionCode: cleanFraction, active: true },
    orderBy: { effectiveDate: 'desc' },
  });
  return any ? formatMatch(any) : null;
}

function formatMatch(ep: { fractionCode: string; countryOfOrigin: string | null; estimatedValue: number; unit: string; decree: string | null; publishDate: Date; effectiveDate: Date; source: string; notes: string | null }): EstimatedPriceMatch {
  return {
    fractionCode: ep.fractionCode,
    countryOfOrigin: ep.countryOfOrigin,
    estimatedValue: ep.estimatedValue,
    unit: ep.unit,
    decree: ep.decree,
    publishDate: ep.publishDate.toISOString(),
    effectiveDate: ep.effectiveDate.toISOString(),
    source: ep.source,
    notes: ep.notes,
  };
}

export async function validateDeclaredPrice(input: CheckPriceInput): Promise<PriceCheckResult> {
  const estimated = await lookupEstimatedPrice(input.fractionCode, input.countryOfOrigin);

  if (!estimated) {
    return {
      hasEstimatedPrice: false,
      estimated: null,
      declaredUnitValueUSD: input.declaredUnitValueUSD,
      ratio: null,
      deltaPct: null,
      severity: 'no_data',
      message: 'Sin precio estimado SAT registrado para esta fracción/país.',
      guaranteeMXN: null,
      action: null,
      disclaimer: null,
    };
  }

  const declared = input.declaredUnitValueUSD;
  if (declared <= 0) {
    return {
      hasEstimatedPrice: true,
      estimated,
      declaredUnitValueUSD: declared,
      ratio: 0,
      deltaPct: 100,
      severity: 'critical',
      message: 'Valor declarado es cero o negativo.',
      guaranteeMXN: null,
      action: 'Corrige el valor unitario declarado.',
      disclaimer: estimated.source === 'internal'
        ? 'Precio de referencia interno (no DOF) — usar como guía, verificar última publicación oficial.'
        : null,
    };
  }

  const ratio = declared / estimated.estimatedValue;
  const deltaPct = Math.round((1 - ratio) * 1000) / 10; // (estimado - declarado) / estimado en %

  let severity: PriceCheckSeverity;
  let message: string;
  let action: string | null = null;

  if (ratio < 0.80) {
    severity = 'critical';
    message = `🚨 Valor unitario declarado ($${declared.toFixed(2)} ${estimated.unit}) está ${deltaPct.toFixed(1)}% debajo del precio estimado SAT ($${estimated.estimatedValue.toFixed(2)} ${estimated.unit}). Requiere constituir garantía en cuenta aduanera (Art. 84-A Ley Aduanera). Riesgo de glosa por subvaluación.`;
    action = 'Constituir garantía en cuenta aduanera por la diferencia de contribuciones.';
  } else if (ratio < 0.95) {
    severity = 'warning';
    message = `Valor declarado ($${declared.toFixed(2)} ${estimated.unit}) está ${deltaPct.toFixed(1)}% debajo del precio estimado SAT ($${estimated.estimatedValue.toFixed(2)} ${estimated.unit}). Documentar precio comercial con factura, contrato de compraventa, etc.`;
    action = 'Tener documentación de respaldo del precio comercial.';
  } else {
    severity = 'ok';
    message = `Valor declarado dentro de rango aceptado vs precio estimado SAT (${(ratio * 100).toFixed(0)}% del estimado).`;
  }

  // Cálculo de garantía estimada
  let guaranteeMXN: number | null = null;
  if (severity === 'critical' && input.quantity && input.exchangeRate) {
    const diffPerUnitUSD = estimated.estimatedValue - declared;       // USD adicional por unidad
    const diffTotalUSD = diffPerUnitUSD * input.quantity;
    const diffMXN = diffTotalUSD * input.exchangeRate;
    const igi = input.igiRate ?? 0;
    // Contribuciones diferenciales sobre la diferencia de valor:
    //   IGI sobre diff
    //   DTA sobre diff
    //   IVA sobre (diff + IGI + DTA)
    const igiAmt = diffMXN * (igi / 100);
    const dtaAmt = diffMXN * (DTA_RATE / 100);
    const baseIVA = diffMXN + igiAmt + dtaAmt;
    const ivaAmt = baseIVA * (IVA_RATE / 100);
    guaranteeMXN = Math.round((igiAmt + dtaAmt + ivaAmt) * 100) / 100;
  }

  const disclaimer = estimated.source === 'internal'
    ? 'Precio de referencia interno (no DOF) — usar como guía, verificar última publicación oficial.'
    : null;

  return {
    hasEstimatedPrice: true,
    estimated,
    declaredUnitValueUSD: declared,
    ratio: Math.round(ratio * 1000) / 1000,
    deltaPct,
    severity,
    message,
    guaranteeMXN,
    action,
    disclaimer,
  };
}
