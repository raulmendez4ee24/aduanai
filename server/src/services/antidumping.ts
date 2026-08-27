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
import { formatCuota } from '../lib/cuota-format';

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
    /** Fase 0: tasas por exportador/productor [{ empresa, tasa, rateUnit }] (null = sin lista cargada). */
    exportadorTasas: ExportadorTasa[] | null;
    specificProducer: string | null;
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

export interface ExportadorTasa { empresa: string; tasa: number; rateUnit?: string }

/** Nombre de empresa normalizado para cruce: mayúsculas, sin acentos, sin
 *  puntuación ni sufijos societarios (S.A. DE C.V., LTD, CO., INC…). */
export function normalizarEmpresa(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:'"()\-\/]/g, ' ')
    .replace(/\b(S\s*A\s*(DE)?\s*C\s*V|S\s*DE\s*R\s*L|SA|SAB|SRL|LTD|LIMITED|CO|CORP|CORPORATION|INC|LLC|GMBH|AG|BV|NV|PTE|PTY|CIA|COMPANY|GROUP|GRUPO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TasaResuelta {
  tasa: number;
  rateUnit: string;
  empresa: string | null;
  /** exportador = tasa específica de la empresa; general = hay lista pero la
   *  empresa no está (o no se dio nombre); general_sin_lista = la resolución
   *  no tiene tasas por empresa cargadas. */
  origen: 'exportador' | 'general' | 'general_sin_lista';
}

/** Elige la tasa por empresa cuando la resolución la tiene y el pedimento
 *  trae exportador; si no, la general — y lo dice. Match por nombre
 *  normalizado (igualdad o contención en ambos sentidos). */
export function resolverTasaPorExportador(
  duty: { rate: number; rateUnit: string; exportadorTasas: ExportadorTasa[] | null; specificProducer: string | null },
  exportadorNombre?: string | null,
): TasaResuelta {
  const lista = Array.isArray(duty.exportadorTasas) ? duty.exportadorTasas.filter(e => e && typeof e.empresa === 'string' && typeof e.tasa === 'number') : [];
  if (lista.length === 0 && !duty.specificProducer) {
    return { tasa: duty.rate, rateUnit: duty.rateUnit, empresa: null, origen: 'general_sin_lista' };
  }
  const nombre = exportadorNombre ? normalizarEmpresa(exportadorNombre) : '';
  if (nombre.length >= 3) {
    const hit = lista.find(e => {
      const n = normalizarEmpresa(e.empresa);
      return n.length >= 3 && (n === nombre || n.includes(nombre) || nombre.includes(n));
    });
    if (hit) return { tasa: hit.tasa, rateUnit: hit.rateUnit ?? duty.rateUnit, empresa: hit.empresa, origen: 'exportador' };
  }
  return { tasa: duty.rate, rateUnit: duty.rateUnit, empresa: null, origen: 'general' };
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

  // SOLO match EXACTO de fracción + país. Nunca por prefijo: heredar la cuota
  // de una fracción hermana mostraría una medida que no aplica = inventar cuota.
  const duties = await prisma.antidumpingDuty.findMany({
    where: { ...baseWhere, fractionCode: cleanFraction },
    orderBy: { publishDateDOF: 'desc' },
  });
  const matchType: 'exact' | 'subheading' | 'heading' = 'exact';

  return duties.map(d => {
    let calculatedAmountUSD: number | null = null;
    let calculation = '';
    let appliesToOperation = false;

    const rateLabel = formatCuota(d.rateType, d.rate, d.rateUnit);
    if (d.rateType === 'percentage') {
      if (input.valueUSD != null) {
        calculatedAmountUSD = input.valueUSD * (d.rate / 100);
        calculation = `${rateLabel} × $${input.valueUSD.toLocaleString('en-US')} USD = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = `${rateLabel} sobre valor en aduana`;
      }
    } else if (d.rateType === 'specific_USD_kg') {
      if (input.weightKg != null) {
        calculatedAmountUSD = input.weightKg * d.rate;
        calculation = `${rateLabel} × ${input.weightKg.toLocaleString('en-US')} kg = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = rateLabel;
      }
    } else if (d.rateType === 'specific_USD_unit') {
      if (input.units != null) {
        calculatedAmountUSD = input.units * d.rate;
        calculation = `${rateLabel} × ${input.units.toLocaleString('en-US')} unidades = $${calculatedAmountUSD.toFixed(2)} USD`;
        appliesToOperation = true;
      } else {
        calculation = rateLabel;
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
        exportadorTasas: Array.isArray(d.exportadorTasas) ? (d.exportadorTasas as unknown as ExportadorTasa[]) : null,
        specificProducer: d.specificProducer,
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
