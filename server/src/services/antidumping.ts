/**
 * Servicio de cuotas compensatorias antidumping — versión enriquecida.
 *
 * Soporta 3 tipos de cuota:
 *   - percentage          : aplicada sobre valor en aduana (USD)
 *   - specific_USD_kg     : aplicada sobre peso en kg
 *   - specific_USD_unit   : aplicada sobre número de piezas/pares
 *
 * Devuelve cálculo monetario explícito para integrar en cotizaciones y
 * pre-validador, y marca severidad por monto absoluto + proximidad de expiración.
 */

import { prisma } from '../lib/prisma';
import { normalizeCountry } from './compliance-lookup';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

export interface AntidumpingCheckInput {
  fractionCode: string;
  countryOfOrigin: string;
  valueUSD?: number;
  weightKg?: number;
  units?: number;
}

export interface AntidumpingCheckResult {
  duty: {
    id: string;
    resolutionType: string;
    resolutionNumber: string | null;
    expedienteUPCI: string | null;
    fractionCode: string;
    countryOfOrigin: string;
    productDesc: string | null;
    rateType: string;
    rate: number;
    rateUnit: string;
    status: string;
    investigationType: string | null;
    publishDateDOF: string | null;
    effectiveDate: string | null;
    expiryDate: string | null;
    dofUrl: string | null;
    notes: string | null;
  };
  calculatedAmountUSD: number | null;
  calculation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  expiringSoon: boolean;
  daysToExpiry: number | null;
  appliesToOperation: boolean;
  /** Cómo se hizo el match contra el corpus de cuotas:
   *  - exact: fracción 8 dígitos exacta
   *  - subheading: 6 dígitos (warning: verificar cobertura)
   *  - heading: 4 dígitos (warning fuerte)
   */
  matchType: 'exact' | 'subheading' | 'heading';
  /** Fracción que coincidió en el corpus (puede diferir del input cuando
   * matchType !== exact). */
  matchedFraction: string;
}

export async function checkAntidumpingDuty(input: AntidumpingCheckInput): Promise<AntidumpingCheckResult[]> {
  const cleanFraction = input.fractionCode.replace(/[^0-9]/g, '');
  const country = normalizeCountry(input.countryOfOrigin);
  const now = new Date();

  const baseWhere = {
    countryOfOrigin: country,
    status: 'vigente',
    active: true,
    OR: [
      { effectiveDate: null },
      { effectiveDate: { lte: now } },
    ],
    AND: [
      { OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
    ],
  };

  // 1) Exact match
  let duties = await prisma.antidumpingDuty.findMany({
    where: { ...baseWhere, fractionCode: cleanFraction },
    orderBy: { publishDateDOF: 'desc' },
  });
  let matchType: 'exact' | 'subheading' | 'heading' = 'exact';

  // 2) Fallback subpartida (6 dígitos) si no hay exact
  if (duties.length === 0 && cleanFraction.length >= 6) {
    duties = await prisma.antidumpingDuty.findMany({
      where: { ...baseWhere, fractionCode: { startsWith: cleanFraction.slice(0, 6) } },
      orderBy: { publishDateDOF: 'desc' },
    });
    if (duties.length > 0) matchType = 'subheading';
  }

  // 3) Fallback partida (4 dígitos) si tampoco
  if (duties.length === 0 && cleanFraction.length >= 4) {
    duties = await prisma.antidumpingDuty.findMany({
      where: { ...baseWhere, fractionCode: { startsWith: cleanFraction.slice(0, 4) } },
      orderBy: { publishDateDOF: 'desc' },
    });
    if (duties.length > 0) matchType = 'heading';
  }

  return duties.map(d => {
    let calculatedAmountUSD: number | null = null;
    let calculation = '';
    let appliesToOperation = false;

    if (d.rateType === 'percentage') {
      if (input.valueUSD != null) {
        calculatedAmountUSD = input.valueUSD * (d.rate / 100);
        calculation = `${d.rate}% × $${input.valueUSD.toLocaleString('en-US')} USD = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = `${d.rate}% sobre valor en aduana`;
      }
    } else if (d.rateType === 'specific_USD_kg') {
      if (input.weightKg != null) {
        calculatedAmountUSD = input.weightKg * d.rate;
        calculation = `${d.rate} USD/kg × ${input.weightKg.toLocaleString('en-US')} kg = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = `${d.rate} USD/kg`;
      }
    } else if (d.rateType === 'specific_USD_unit') {
      if (input.units != null) {
        calculatedAmountUSD = input.units * d.rate;
        calculation = `${d.rate} USD/unidad × ${input.units.toLocaleString('en-US')} unidades = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = `${d.rate} ${d.rateUnit}`;
      }
    }

    const daysToExpiry = d.expiryDate ? daysBetween(now, d.expiryDate) : null;
    const expiringSoon = daysToExpiry != null && daysToExpiry > 0 && daysToExpiry < 90;

    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    if (calculatedAmountUSD != null) {
      if (calculatedAmountUSD > 10000) severity = 'critical';
      else if (calculatedAmountUSD > 1000) severity = 'high';
      else if (calculatedAmountUSD > 100) severity = 'medium';
      else severity = 'low';
    } else if (d.rateType === 'percentage' && d.rate > 50) {
      severity = 'high';
    }

    return {
      duty: {
        id: d.id,
        resolutionType: d.resolutionType,
        resolutionNumber: d.resolutionNumber,
        expedienteUPCI: d.expedienteUPCI,
        fractionCode: d.fractionCode,
        countryOfOrigin: d.countryOfOrigin,
        productDesc: d.productDesc,
        rateType: d.rateType,
        rate: d.rate,
        rateUnit: d.rateUnit,
        status: d.status,
        investigationType: d.investigationType,
        publishDateDOF: d.publishDateDOF?.toISOString() ?? null,
        effectiveDate: d.effectiveDate?.toISOString() ?? null,
        expiryDate: d.expiryDate?.toISOString() ?? null,
        dofUrl: d.dofUrl,
        notes: d.notes,
      },
      calculatedAmountUSD,
      calculation,
      severity,
      expiringSoon,
      daysToExpiry,
      appliesToOperation,
      matchType,
      matchedFraction: d.fractionCode,
    };
  });
}

export interface ExposureReport {
  tenantId: string;
  totalImports: number;
  totalExposureUSD: number;
  potentialMultaUSD: number;
  byResolution: {
    resolutionNumber: string | null;
    fractionCode: string;
    countryOfOrigin: string;
    productDesc: string | null;
    importsCount: number;
    exposureUSD: number;
  }[];
}

/** Reporte de exposición acumulada del tenant a cuotas no declaradas */
export async function calculateExposure(tenantId: string): Promise<ExposureReport> {
  const since = new Date(Date.now() - 365 * DAY_MS);
  const imports = await prisma.temporaryImport.findMany({
    where: { tenantId, entryDate: { gte: since } },
    select: { fractionCode: true, originCountry: true, customsValue: true, valueMXN: true, quantity: true, unit: true },
    take: 1000,
  });

  // Agrupa por fracción + país
  const groups = new Map<string, {
    fractionCode: string; countryOfOrigin: string;
    count: number; totalValueUSD: number; totalQuantity: number; unit: string | null;
  }>();
  for (const imp of imports) {
    if (!imp.originCountry) continue;
    const country = normalizeCountry(imp.originCountry);
    const key = `${imp.fractionCode}|${country}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.totalValueUSD += imp.customsValue;
      g.totalQuantity += imp.quantity;
    } else {
      groups.set(key, {
        fractionCode: imp.fractionCode,
        countryOfOrigin: country,
        count: 1,
        totalValueUSD: imp.customsValue,
        totalQuantity: imp.quantity,
        unit: imp.unit,
      });
    }
  }

  const byResolution: ExposureReport['byResolution'] = [];
  let totalExposureUSD = 0;

  for (const grp of groups.values()) {
    const duties = await prisma.antidumpingDuty.findMany({
      where: {
        fractionCode: grp.fractionCode,
        countryOfOrigin: grp.countryOfOrigin,
        status: 'vigente', active: true,
      },
    });
    for (const d of duties) {
      let exposurePerOp = 0;
      if (d.rateType === 'percentage') {
        exposurePerOp = (grp.totalValueUSD / grp.count) * (d.rate / 100);
      } else if (d.rateType === 'specific_USD_kg') {
        exposurePerOp = (grp.totalQuantity / grp.count) * d.rate;
      } else if (d.rateType === 'specific_USD_unit') {
        exposurePerOp = (grp.totalQuantity / grp.count) * d.rate;
      }
      const exposureUSD = exposurePerOp * grp.count;
      totalExposureUSD += exposureUSD;
      byResolution.push({
        resolutionNumber: d.resolutionNumber,
        fractionCode: d.fractionCode,
        countryOfOrigin: d.countryOfOrigin,
        productDesc: d.productDesc,
        importsCount: grp.count,
        exposureUSD,
      });
    }
  }

  // Multa potencial: Art. 178 LA — 130-150% de contribuciones omitidas
  const potentialMultaUSD = totalExposureUSD * 1.4;

  return {
    tenantId,
    totalImports: imports.length,
    totalExposureUSD,
    potentialMultaUSD,
    byResolution: byResolution.sort((a, b) => b.exposureUSD - a.exposureUSD),
  };
}
